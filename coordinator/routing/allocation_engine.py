"""
Dynamic Allocation Engine — Score-Based Node Selection
========================================================
Scores candidate nodes using a multi-factor weighted formula:

  Score(node) = α·cpu_load + β·(queue/max_queue) + γ·latency_ema + δ·predicted_load

Weights: α=0.35, β=0.30, γ=0.20, δ=0.15 (configurable).
Selection: minimum-score node wins.
Overflow: if all scores > threshold (0.85) → invoke Chord router.
"""

import logging
import time
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("coordinator.routing.allocation_engine")

# Default scoring weights
DEFAULT_WEIGHTS = {
    "alpha_cpu": 0.35,
    "beta_queue": 0.30,
    "gamma_latency": 0.20,
    "delta_forecast": 0.15,
}


class AllocationEngine:
    """Multi-factor scoring engine for node selection.

    Reads live metrics for candidate nodes, computes a weighted score,
    and selects the node with the lowest score. If all nodes exceed the
    overflow threshold, signals the Chord router for overflow handling.
    """

    def __init__(self, config: Optional[dict] = None):
        cfg = config or {}
        alloc = cfg.get("allocation", {})
        weights = alloc.get("weights", DEFAULT_WEIGHTS)

        self.alpha = weights.get("alpha_cpu", 0.35)
        self.beta = weights.get("beta_queue", 0.30)
        self.gamma = weights.get("gamma_latency", 0.20)
        self.delta = weights.get("delta_forecast", 0.15)
        self.overflow_threshold = alloc.get("overflow_threshold", 0.85)
        self.staleness_penalty = alloc.get("staleness_penalty_per_sec", 0.1)

        # Cached node metrics: node_name -> metrics dict
        self._node_metrics: Dict[str, Dict] = {}

        logger.info(
            f"AllocationEngine initialized: α={self.alpha}, β={self.beta}, "
            f"γ={self.gamma}, δ={self.delta}, overflow={self.overflow_threshold}"
        )

    def update_node_metrics(self, node_name: str, metrics: Dict):
        """Update cached metrics for a node.

        Args:
            node_name: Node identifier.
            metrics: Dict with keys: cpu_pct, queue_depth, queue_max,
                     latency_ema_ms, latency_max_ms, predicted_load, timestamp.
        """
        metrics["_updated_at"] = time.time()
        self._node_metrics[node_name] = metrics

    def compute_score(self, node_name: str, predicted_load: float = 0.0) -> float:
        """Compute the allocation score for a single node.

        Args:
            node_name: Node to score.
            predicted_load: Forecaster's predicted incoming load (0.0 until Phase 5).

        Returns:
            Score in [0, 1+] where lower is better.
        """
        metrics = self._node_metrics.get(node_name)
        if metrics is None:
            return 1.0  # No data → worst score

        # Normalize CPU to [0, 1]
        cpu_norm = min(metrics.get("cpu_pct", 50.0) / 100.0, 1.0)

        # Normalize queue depth to [0, 1]
        queue_depth = metrics.get("queue_depth", 0)
        queue_max = metrics.get("queue_max", 450)  # Sum of all class max depths
        queue_norm = min(queue_depth / max(queue_max, 1), 1.0)

        # Normalize latency EMA to [0, 1]
        latency_ms = metrics.get("latency_ema_ms", 0.0)
        latency_max = metrics.get("latency_max_ms", 5000.0)
        latency_norm = min(latency_ms / max(latency_max, 1), 1.0)

        # Predicted load (0 until Phase 5 GRU integration)
        load_norm = min(predicted_load, 1.0)

        # Staleness penalty: if metrics are old, add penalty
        age = time.time() - metrics.get("_updated_at", time.time())
        staleness = min(age * self.staleness_penalty, 0.5) if age > 10 else 0.0

        score = (
            self.alpha * cpu_norm
            + self.beta * queue_norm
            + self.gamma * latency_norm
            + self.delta * load_norm
            + staleness
        )

        return score

    def select_node(
        self,
        candidates: List[str],
        predicted_loads: Optional[Dict[str, float]] = None,
    ) -> Tuple[Optional[str], float, bool]:
        """Select the best node from candidates based on scores.

        Args:
            candidates: List of candidate node names (from hash ring lookup).
            predicted_loads: Optional dict of node_name -> predicted_load (Phase 5).

        Returns:
            Tuple of (selected_node, score, is_overloaded).
            is_overloaded=True means all candidates exceed overflow_threshold.
        """
        if not candidates:
            return None, 1.0, True

        predicted_loads = predicted_loads or {}

        scores = {}
        for node in candidates:
            pred = predicted_loads.get(node, 0.0)
            scores[node] = self.compute_score(node, pred)

        # Select minimum-score node
        best_node = min(scores, key=scores.get)
        best_score = scores[best_node]

        # Check overflow: all candidates above threshold
        all_overloaded = all(s > self.overflow_threshold for s in scores.values())

        if all_overloaded:
            logger.warning(
                f"All candidates overloaded (scores: {scores}). "
                f"Triggering Chord overflow routing."
            )

        return best_node, best_score, all_overloaded

    def get_all_scores(self, predicted_loads: Optional[Dict[str, float]] = None) -> Dict[str, float]:
        """Compute scores for all known nodes."""
        predicted_loads = predicted_loads or {}
        return {
            node: self.compute_score(node, predicted_loads.get(node, 0.0))
            for node in self._node_metrics
        }

    def remove_node(self, node_name: str):
        """Remove a node from the metrics cache."""
        self._node_metrics.pop(node_name, None)

    def get_node_metrics(self, node_name: str) -> Dict:
        """Get cached metrics for a single node.

        Used by the DAA module for vnode adjustment decisions.

        Returns:
            Metrics dict, or empty dict if node unknown.
        """
        return dict(self._node_metrics.get(node_name, {}))

    def get_all_metrics(self) -> Dict[str, Dict]:
        """Get cached metrics for all known nodes.

        Used by the feedback optimizer for load variance calculation.

        Returns:
            Dict of node_name -> metrics dict.
        """
        return {name: dict(m) for name, m in self._node_metrics.items()}

