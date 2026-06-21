"""
Baseline Routing Algorithms
============================
Three baseline algorithms for comparison against the Predictive Adaptive system.

Each baseline implements the same interface as AllocationEngine:
  - select_node(candidates, **kwargs) -> (node_name, score, is_overloaded)
  - update_node_metrics(node_name, metrics)
  - compute_score(node_name, predicted_load)
  - get_all_scores(predicted_loads)
  - get_node_metrics(node_name)
  - get_all_metrics()
  - remove_node(node_name)

Baselines:
  1. RoundRobinBalancer:          Cycles through nodes in order. No ML. No load awareness.
  2. LeastConnectionsBalancer:    Routes to node with fewest active requests.
  3. StaticHashBalancer:          Uses consistent hash ring with fixed vnodes (no DAA).

These are used with the ROUTING_MODE environment variable to run fair A/B comparisons
under the same traffic scenario and cluster topology.
"""

import logging
import time
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("coordinator.routing.baselines")


class RoundRobinBalancer:
    """Simple round-robin routing across all nodes.

    No ML classification. No load awareness. No metric inspection.
    Each request goes to the next node in a fixed cycle.

    Comparison purpose:
        This is the simplest possible load balancer. If your predictive
        system doesn't beat this, the ML adds no value.
    """

    def __init__(self, node_names: List[str]):
        """
        Args:
            node_names: Ordered list of node names in the cluster.
        """
        self._nodes = list(node_names)
        self._counter = 0
        self._node_metrics: Dict[str, Dict] = {}
        logger.info(
            f"RoundRobinBalancer initialized with {len(self._nodes)} nodes: {self._nodes}"
        )

    def update_node_metrics(self, node_name: str, metrics: Dict):
        """Accept metrics (ignored for routing, stored for reporting)."""
        metrics["_updated_at"] = time.time()
        self._node_metrics[node_name] = metrics

    def select_node(
        self,
        candidates: List[str],
        predicted_loads: Optional[Dict[str, float]] = None,
    ) -> Tuple[Optional[str], float, bool]:
        """Select the next node in round-robin order.

        Args:
            candidates: Ignored — we cycle through ALL nodes in fixed order.
            predicted_loads: Ignored.

        Returns:
            (selected_node, score=0.5, is_overloaded=False)
        """
        if not self._nodes:
            return None, 1.0, True

        node = self._nodes[self._counter % len(self._nodes)]
        self._counter += 1
        return node, 0.5, False

    def compute_score(self, node_name: str, predicted_load: float = 0.0) -> float:
        """Return a flat 0.5 score (round-robin has no scoring)."""
        return 0.5

    def get_all_scores(self, predicted_loads: Optional[Dict[str, float]] = None) -> Dict[str, float]:
        """Return uniform scores for all nodes."""
        return {node: 0.5 for node in self._nodes}

    def get_node_metrics(self, node_name: str) -> Dict:
        """Get cached metrics for a node."""
        return dict(self._node_metrics.get(node_name, {}))

    def get_all_metrics(self) -> Dict[str, Dict]:
        """Get cached metrics for all nodes."""
        return {name: dict(m) for name, m in self._node_metrics.items()}

    def remove_node(self, node_name: str):
        """Remove a node from the pool."""
        if node_name in self._nodes:
            self._nodes.remove(node_name)
        self._node_metrics.pop(node_name, None)


class LeastConnectionsBalancer:
    """Routes each request to the node with the fewest active connections.

    Uses live queue_depth from node metrics as a proxy for active connections.
    No ML classification. No predictive load. Pure reactive balancing.

    Comparison purpose:
        This is a standard production algorithm (used by Nginx, HAProxy, AWS ALB).
        Your system should beat this to justify the ML complexity.
    """

    def __init__(self, node_names: List[str]):
        self._nodes = list(node_names)
        self._node_metrics: Dict[str, Dict] = {}
        logger.info(
            f"LeastConnectionsBalancer initialized with {len(self._nodes)} nodes"
        )

    def update_node_metrics(self, node_name: str, metrics: Dict):
        """Update cached metrics for a node."""
        metrics["_updated_at"] = time.time()
        self._node_metrics[node_name] = metrics

    def select_node(
        self,
        candidates: List[str],
        predicted_loads: Optional[Dict[str, float]] = None,
    ) -> Tuple[Optional[str], float, bool]:
        """Select the node with the lowest queue depth (fewest active connections).

        Args:
            candidates: Candidate node names. Falls back to all nodes if empty.
            predicted_loads: Ignored.

        Returns:
            (selected_node, score, is_overloaded=False)
        """
        pool = candidates if candidates else self._nodes
        if not pool:
            return None, 1.0, True

        best_node = None
        best_depth = float("inf")

        for node in pool:
            metrics = self._node_metrics.get(node, {})
            depth = metrics.get("queue_depth", 0)
            if depth < best_depth:
                best_depth = depth
                best_node = node

        if best_node is None:
            best_node = pool[0]

        # Normalize score to [0, 1] for comparison
        queue_max = 450
        score = min(best_depth / queue_max, 1.0)

        return best_node, score, False

    def compute_score(self, node_name: str, predicted_load: float = 0.0) -> float:
        """Compute score based only on queue depth."""
        metrics = self._node_metrics.get(node_name, {})
        depth = metrics.get("queue_depth", 0)
        return min(depth / 450, 1.0)

    def get_all_scores(self, predicted_loads: Optional[Dict[str, float]] = None) -> Dict[str, float]:
        """Compute scores for all nodes."""
        return {node: self.compute_score(node) for node in self._nodes}

    def get_node_metrics(self, node_name: str) -> Dict:
        return dict(self._node_metrics.get(node_name, {}))

    def get_all_metrics(self) -> Dict[str, Dict]:
        return {name: dict(m) for name, m in self._node_metrics.items()}

    def remove_node(self, node_name: str):
        if node_name in self._nodes:
            self._nodes.remove(node_name)
        self._node_metrics.pop(node_name, None)


class StaticHashBalancer:
    """Consistent hash ring with fixed virtual node counts (no DAA).

    Uses the same MurmurHash3 ring as the predictive system, but
    vnode counts are set at startup and NEVER adjusted at runtime.
    No ML classification. No burst prediction. No dynamic rebalancing.

    Comparison purpose:
        This is what Cassandra, DynamoDB, and standard consistent hashing do.
        Your system's DAA dynamic vnode adjustment should beat this.
    """

    def __init__(self, hash_ring):
        """
        Args:
            hash_ring: A ConsistentHashRing instance with nodes already added.
                       The vnode counts will be frozen and never changed.
        """
        self._ring = hash_ring
        self._frozen_vnodes: Dict[str, int] = {}
        self._node_metrics: Dict[str, Dict] = {}

        # Freeze the current vnode distribution
        if hasattr(hash_ring, 'nodes'):
            for name in hash_ring.nodes:
                count = hash_ring.get_vnode_count(name)
                self._frozen_vnodes[name] = count

        logger.info(
            f"StaticHashBalancer initialized: frozen vnodes = {self._frozen_vnodes}"
        )

    def update_node_metrics(self, node_name: str, metrics: Dict):
        """Accept metrics (used for reporting but NOT for routing decisions)."""
        metrics["_updated_at"] = time.time()
        self._node_metrics[node_name] = metrics

    def select_node(
        self,
        candidates: List[str],
        predicted_loads: Optional[Dict[str, float]] = None,
    ) -> Tuple[Optional[str], float, bool]:
        """Select from candidates using static hash position only.

        The first candidate from the ring lookup is always selected.
        No scoring. No load awareness. Pure hash determinism.

        Args:
            candidates: Candidate node names from the hash ring lookup.
            predicted_loads: Ignored.

        Returns:
            (selected_node, score=0.5, is_overloaded=False)
        """
        if not candidates:
            return None, 1.0, True

        # Always pick the first candidate (primary ring position)
        return candidates[0], 0.5, False

    def compute_score(self, node_name: str, predicted_load: float = 0.0) -> float:
        return 0.5

    def get_all_scores(self, predicted_loads: Optional[Dict[str, float]] = None) -> Dict[str, float]:
        return {node: 0.5 for node in self._frozen_vnodes}

    def get_node_metrics(self, node_name: str) -> Dict:
        return dict(self._node_metrics.get(node_name, {}))

    def get_all_metrics(self) -> Dict[str, Dict]:
        return {name: dict(m) for name, m in self._node_metrics.items()}

    def remove_node(self, node_name: str):
        self._frozen_vnodes.pop(node_name, None)
        self._node_metrics.pop(node_name, None)
