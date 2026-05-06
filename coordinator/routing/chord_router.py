"""
Chord-Inspired DHT Router — Overflow Multi-Hop Routing
========================================================
When the allocation engine determines all candidate nodes are overloaded,
this router uses a Chord-inspired finger table to forward requests
to the next suitable node via multi-hop routing.

Finger table: finger[k] = first node with ID ≥ (n + 2^k) mod 2^m
Max hops: ceil(log2(N)) + 2
Loop detection: hop counter
Fallback: least-connections if max hops exceeded.
"""

import logging
import math
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("coordinator.routing.chord_router")


class ChordRouter:
    """Chord-inspired overflow router with finger tables.

    Each node has a finger table pointing to nodes at exponentially
    increasing distances around the ring. When a primary allocation
    fails (all overloaded), the router walks the finger table to find
    an acceptable node.
    """

    def __init__(
        self,
        max_hops: int = 4,
        overflow_threshold: float = 0.85,
    ):
        """
        Args:
            max_hops: Maximum routing hops before fallback.
            overflow_threshold: Score threshold above which a node is "overloaded".
        """
        self.max_hops = max_hops
        self.overflow_threshold = overflow_threshold

        # Node ID assignments: node_name -> integer ID
        self._node_ids: Dict[str, int] = {}
        # Reverse: ID -> node_name
        self._id_to_node: Dict[int, str] = {}
        # Finger tables: node_name -> list of (finger_id, node_name)
        self._finger_tables: Dict[str, List[Tuple[int, str]]] = {}
        # Ring size (2^m)
        self._ring_size: int = 0
        self._m: int = 0

    def build_finger_tables(self, node_names: List[str]):
        """Build finger tables for all nodes.

        Assigns integer IDs to nodes, then computes finger entries.
        finger[k] = first node with ID ≥ (n + 2^k) mod 2^m

        Args:
            node_names: List of all active node names.
        """
        n = len(node_names)
        if n == 0:
            return

        # Determine ring size: smallest power of 2 >= number of nodes
        self._m = max(math.ceil(math.log2(n)), 1) if n > 1 else 1
        self._ring_size = 2 ** self._m

        # Assign sequential IDs
        sorted_names = sorted(node_names)
        self._node_ids = {name: i for i, name in enumerate(sorted_names)}
        self._id_to_node = {i: name for name, i in self._node_ids.items()}

        # Build finger tables
        self._finger_tables = {}
        for name in sorted_names:
            node_id = self._node_ids[name]
            fingers = []
            for k in range(self._m):
                target_id = (node_id + 2 ** k) % self._ring_size
                # Find the first node with ID >= target_id (clockwise)
                successor = self._find_successor(target_id, sorted_names)
                if successor and successor != name:  # Skip self-references
                    fingers.append((target_id, successor))
            self._finger_tables[name] = fingers

        # Update max hops based on cluster size
        self.max_hops = math.ceil(math.log2(n)) + 2 if n > 1 else 2

        logger.info(
            f"Finger tables built for {n} nodes "
            f"(m={self._m}, ring_size={self._ring_size}, max_hops={self.max_hops})"
        )
        for name, fingers in self._finger_tables.items():
            finger_nodes = [f[1] for f in fingers]
            logger.debug(f"  {name} (ID={self._node_ids[name]}): fingers={finger_nodes}")

    def _find_successor(self, target_id: int, sorted_names: List[str]) -> Optional[str]:
        """Find the first node with ID >= target_id (wrapping around)."""
        for name in sorted_names:
            if self._node_ids[name] >= target_id:
                return name
        # Wrap around to first node
        return sorted_names[0] if sorted_names else None

    def route(
        self,
        overloaded_node: str,
        node_scores: Dict[str, float],
    ) -> Tuple[Optional[str], int, str]:
        """Route a request away from an overloaded node via finger table.

        Walks the finger table of the overloaded node, checking each finger
        node's score. The first node with score < threshold accepts the request.

        Args:
            overloaded_node: The primary node that was overloaded.
            node_scores: Dict of node_name -> current allocation score.

        Returns:
            Tuple of (target_node, hops_taken, routing_method).
            routing_method is "chord_router" or "least_connections_fallback".
        """
        if overloaded_node not in self._finger_tables:
            # No finger table — direct fallback
            return self._fallback_least_loaded(node_scores), 1, "least_connections_fallback"

        fingers = self._finger_tables[overloaded_node]
        visited = {overloaded_node}
        current_node = overloaded_node
        hops = 0

        for target_id, finger_node in fingers:
            hops += 1

            # Loop detection
            if finger_node in visited:
                continue
            visited.add(finger_node)

            # Check if this finger node can accept
            score = node_scores.get(finger_node, 1.0)
            if score < self.overflow_threshold:
                logger.info(
                    f"Chord routed: {overloaded_node} → {finger_node} "
                    f"({hops} hops, score={score:.3f})"
                )
                return finger_node, hops, "chord_router"

            # Hop limit check
            if hops >= self.max_hops:
                logger.warning(
                    f"Max hops ({self.max_hops}) exceeded. "
                    f"Falling back to least-connections."
                )
                break

        # Fallback: least-connections (node with lowest score)
        target = self._fallback_least_loaded(node_scores)
        return target, hops, "least_connections_fallback"

    def _fallback_least_loaded(self, node_scores: Dict[str, float]) -> Optional[str]:
        """Fallback: return the node with the lowest score."""
        if not node_scores:
            return None
        return min(node_scores, key=node_scores.get)

    def get_finger_table(self, node_name: str) -> List[Tuple[int, str]]:
        """Get the finger table for a specific node."""
        return self._finger_tables.get(node_name, [])

    def get_all_finger_tables(self) -> Dict[str, List[Tuple[int, str]]]:
        """Get all finger tables."""
        return dict(self._finger_tables)

    def refresh(self, node_names: List[str]):
        """Rebuild finger tables (e.g., after node join/leave)."""
        self.build_finger_tables(node_names)
