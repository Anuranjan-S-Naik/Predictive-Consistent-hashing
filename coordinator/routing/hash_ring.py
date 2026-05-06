"""
Static Consistent Hash Ring — MurmurHash3
==========================================
Implements a consistent hash ring with virtual nodes (vnodes) distributed
proportionally to each node's capacity_score. Uses MurmurHash3 (128-bit)
for fast, uniform hash distribution.

Methods: add_node(), remove_node(), get_node(), get_ring_snapshot()
Storage: Redis sorted set 'ring:vnodes' + in-memory dict cache.
"""

import bisect
import hashlib
import logging
import time
from typing import Dict, List, Optional, Tuple

try:
    import mmh3
    HAS_MMH3 = True
except ImportError:
    HAS_MMH3 = False

logger = logging.getLogger("coordinator.routing.hash_ring")


def murmurhash3(key: str) -> int:
    """Compute MurmurHash3 128-bit hash and return as a single integer.

    Falls back to MD5-based hash if mmh3 is not installed.
    """
    if HAS_MMH3:
        h = mmh3.hash128(key, signed=False)
        return h
    else:
        # Fallback: use MD5 for uniform distribution (not as fast but correct)
        md5 = hashlib.md5(key.encode("utf-8")).hexdigest()
        return int(md5, 16)


class ConsistentHashRing:
    """Consistent hash ring with virtual nodes.

    Each physical node is mapped to multiple virtual nodes (vnodes) on the ring.
    The number of vnodes is proportional to the node's capacity_score.

    Attributes:
        vnode_base_count: Base number of vnodes per node before capacity scaling.
        vnode_min_count: Minimum vnodes per active node.
        ring: Sorted list of (hash_position, node_name) tuples.
        node_vnodes: Dict mapping node_name -> list of hash positions.
    """

    def __init__(self, vnode_base_count: int = 150, vnode_min_count: int = 10):
        self.vnode_base_count = vnode_base_count
        self.vnode_min_count = vnode_min_count

        # Sorted ring: list of hash positions
        self._positions: List[int] = []
        # Map: hash_position -> node_name
        self._position_to_node: Dict[int, str] = {}
        # Map: node_name -> list of hash positions
        self._node_vnodes: Dict[str, List[int]] = {}
        # Map: node_name -> capacity_score
        self._node_capacities: Dict[str, int] = {}
        # Average capacity (for scaling formula)
        self._avg_capacity: float = 100.0
        # Last update timestamp
        self._last_updated: float = time.time()

    def _compute_vnode_count(self, capacity_score: int) -> int:
        """Compute the number of vnodes for a node based on capacity.

        Formula: vnode_count = base_count × (capacity_score / avg_capacity)
        Minimum: vnode_min_count
        """
        if self._avg_capacity <= 0:
            return self.vnode_base_count

        count = int(self.vnode_base_count * (capacity_score / self._avg_capacity))
        return max(count, self.vnode_min_count)

    def _recalculate_avg_capacity(self):
        """Recalculate average capacity across all active nodes."""
        if self._node_capacities:
            self._avg_capacity = sum(self._node_capacities.values()) / len(self._node_capacities)
        else:
            self._avg_capacity = 100.0

    def add_node(self, node_name: str, capacity_score: int) -> int:
        """Add a node to the ring with vnodes proportional to its capacity.

        Args:
            node_name: Unique node identifier (e.g., 'node_s1').
            capacity_score: Node's capacity score (e.g., 100).

        Returns:
            Number of vnodes created for this node.
        """
        # Remove existing vnodes if node is being re-added
        if node_name in self._node_vnodes:
            self.remove_node(node_name)

        self._node_capacities[node_name] = capacity_score
        self._recalculate_avg_capacity()

        vnode_count = self._compute_vnode_count(capacity_score)
        vnodes = []

        for i in range(vnode_count):
            # Create a unique key for each vnode
            vnode_key = f"{node_name}:vnode:{i}"
            position = murmurhash3(vnode_key)

            # Handle collisions (extremely rare with 128-bit hash)
            while position in self._position_to_node:
                position = murmurhash3(f"{vnode_key}:collision:{position}")

            self._position_to_node[position] = node_name
            vnodes.append(position)
            bisect.insort(self._positions, position)

        self._node_vnodes[node_name] = vnodes
        self._last_updated = time.time()

        logger.info(
            f"Added {node_name} to ring: {vnode_count} vnodes "
            f"(capacity={capacity_score}, total_vnodes={len(self._positions)})"
        )
        return vnode_count

    def remove_node(self, node_name: str) -> bool:
        """Remove a node and all its vnodes from the ring.

        Args:
            node_name: Node to remove.

        Returns:
            True if node was found and removed, False otherwise.
        """
        if node_name not in self._node_vnodes:
            logger.warning(f"Node {node_name} not found in ring")
            return False

        # Remove all vnodes for this node
        for position in self._node_vnodes[node_name]:
            self._position_to_node.pop(position, None)
            idx = bisect.bisect_left(self._positions, position)
            if idx < len(self._positions) and self._positions[idx] == position:
                self._positions.pop(idx)

        removed_count = len(self._node_vnodes[node_name])
        del self._node_vnodes[node_name]
        self._node_capacities.pop(node_name, None)
        self._recalculate_avg_capacity()
        self._last_updated = time.time()

        logger.info(
            f"Removed {node_name} from ring: {removed_count} vnodes removed "
            f"(total_vnodes={len(self._positions)})"
        )
        return True

    def get_node(self, key: str) -> Optional[str]:
        """Find the node responsible for a given key.

        Uses clockwise lookup: hash the key, find the first vnode position
        >= the hash on the ring. Wraps around if past the last position.

        Args:
            key: The request key to hash (e.g., request_id).

        Returns:
            Node name, or None if ring is empty.
        """
        if not self._positions:
            return None

        hash_val = murmurhash3(key)
        idx = bisect.bisect_left(self._positions, hash_val)

        # Wrap around to first position if past end
        if idx >= len(self._positions):
            idx = 0

        position = self._positions[idx]
        return self._position_to_node.get(position)

    def get_candidates(self, key: str, count: int = 3) -> List[str]:
        """Get multiple candidate nodes for a key (for overflow routing).

        Returns up to `count` distinct nodes by walking clockwise on the ring.

        Args:
            key: The request key to hash.
            count: Maximum number of distinct candidates.

        Returns:
            List of distinct node names in ring order.
        """
        if not self._positions:
            return []

        hash_val = murmurhash3(key)
        idx = bisect.bisect_left(self._positions, hash_val)

        candidates = []
        seen = set()
        total = len(self._positions)

        for i in range(total):
            pos_idx = (idx + i) % total
            position = self._positions[pos_idx]
            node = self._position_to_node.get(position)

            if node and node not in seen:
                candidates.append(node)
                seen.add(node)
                if len(candidates) >= count:
                    break

        return candidates

    def get_ring_snapshot(self) -> Dict:
        """Get a snapshot of the current ring state.

        Returns:
            Dict with ring metadata and per-node vnode counts.
        """
        return {
            "total_vnodes": len(self._positions),
            "total_nodes": len(self._node_vnodes),
            "nodes": {
                name: {
                    "vnode_count": len(vnodes),
                    "capacity_score": self._node_capacities.get(name, 0),
                }
                for name, vnodes in self._node_vnodes.items()
            },
            "avg_capacity": self._avg_capacity,
            "last_updated": self._last_updated,
        }

    def get_vnode_count(self, node_name: str) -> int:
        """Get the current vnode count for a node."""
        return len(self._node_vnodes.get(node_name, []))

    def get_all_nodes(self) -> List[str]:
        """Get list of all node names in the ring."""
        return list(self._node_vnodes.keys())

    @property
    def is_empty(self) -> bool:
        return len(self._positions) == 0

    @property
    def total_vnodes(self) -> int:
        return len(self._positions)

    def __repr__(self) -> str:
        return (
            f"ConsistentHashRing(nodes={len(self._node_vnodes)}, "
            f"vnodes={len(self._positions)}, base={self.vnode_base_count})"
        )
