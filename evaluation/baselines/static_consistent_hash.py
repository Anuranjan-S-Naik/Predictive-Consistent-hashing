"""
Baseline Load Balancing — Static Consistent Hash
==================================================
Consistent hashing with fixed vnode distribution (no dynamic adjustment).
Uses the same ConsistentHashRing but vnodes never change after init.
Used as evaluation baseline to show the value of DAA.
"""

import logging
from typing import Optional
from coordinator.routing.hash_ring import ConsistentHashRing

logger = logging.getLogger("evaluation.baselines.static_consistent_hash")


class StaticConsistentHashAllocator:
    """Allocates requests via consistent hashing with fixed vnodes."""

    def __init__(self, vnode_base_count: int = 150):
        self.ring = ConsistentHashRing(vnode_base_count=vnode_base_count)

    def set_nodes(self, nodes: list):
        """Initialize ring with nodes. nodes = list of (name, capacity) tuples."""
        for name, capacity in nodes:
            self.ring.add_node(name, capacity)
        logger.info(
            f"StaticConsistentHash initialized: {self.ring.total_vnodes} vnodes "
            f"across {len(nodes)} nodes"
        )

    def get_node(self, key: str) -> Optional[str]:
        """Get node for a key via consistent hash lookup."""
        return self.ring.get_node(key)

    def remove_node(self, node_name: str):
        """Remove a node from the ring."""
        self.ring.remove_node(node_name)

    def add_node(self, node_name: str, capacity_score: int = 100):
        """Add a node to the ring."""
        self.ring.add_node(node_name, capacity_score)
