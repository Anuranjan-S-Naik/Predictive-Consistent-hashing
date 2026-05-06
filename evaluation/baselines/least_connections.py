"""
Baseline Load Balancing — Least Connections
=============================================
Routes each request to the node with the fewest active (in-flight) requests.
Reactive strategy — no prediction. Used as evaluation baseline.
"""

import logging
from typing import Dict, List, Optional

logger = logging.getLogger("evaluation.baselines.least_connections")


class LeastConnectionsAllocator:
    """Allocates requests to the node with fewest active connections."""

    def __init__(self):
        self._connections: Dict[str, int] = {}

    def set_nodes(self, node_names: List[str]):
        """Set the list of available nodes."""
        self._connections = {name: 0 for name in node_names}
        logger.info(f"LeastConnections initialized with {len(self._connections)} nodes")

    def get_node(self, key: str = "") -> Optional[str]:
        """Get node with fewest active connections. Key is ignored."""
        if not self._connections:
            return None
        return min(self._connections, key=self._connections.get)

    def on_request_start(self, node_name: str):
        """Increment connection count when a request is dispatched."""
        if node_name in self._connections:
            self._connections[node_name] += 1

    def on_request_complete(self, node_name: str):
        """Decrement connection count when a request completes."""
        if node_name in self._connections:
            self._connections[node_name] = max(0, self._connections[node_name] - 1)

    def remove_node(self, node_name: str):
        """Remove a node."""
        self._connections.pop(node_name, None)

    def add_node(self, node_name: str, **kwargs):
        """Add a node."""
        if node_name not in self._connections:
            self._connections[node_name] = 0

    def get_snapshot(self) -> Dict[str, int]:
        """Get current connection counts."""
        return dict(self._connections)
