"""
Baseline Load Balancing — Round Robin
======================================
Simple round-robin allocation: cycles through nodes sequentially,
ignoring capacity, load, or request class. Used as evaluation baseline.
"""

import logging
from typing import List, Optional

logger = logging.getLogger("evaluation.baselines.round_robin")


class RoundRobinAllocator:
    """Allocates requests to nodes in sequential round-robin order."""

    def __init__(self):
        self._nodes: List[str] = []
        self._index: int = 0

    def set_nodes(self, node_names: List[str]):
        """Set the list of available nodes."""
        self._nodes = list(node_names)
        self._index = 0
        logger.info(f"RoundRobin initialized with {len(self._nodes)} nodes")

    def get_node(self, key: str = "") -> Optional[str]:
        """Get next node in round-robin order. Key is ignored."""
        if not self._nodes:
            return None
        node = self._nodes[self._index % len(self._nodes)]
        self._index += 1
        return node

    def remove_node(self, node_name: str):
        """Remove a node from the rotation."""
        if node_name in self._nodes:
            self._nodes.remove(node_name)
            self._index = self._index % max(len(self._nodes), 1)

    def add_node(self, node_name: str, **kwargs):
        """Add a node to the rotation."""
        if node_name not in self._nodes:
            self._nodes.append(node_name)
