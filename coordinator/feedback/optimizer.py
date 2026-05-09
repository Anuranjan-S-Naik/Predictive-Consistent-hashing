"""
Feedback Optimizer — Self-Optimization Loop (Non-ML Parts)
============================================================
Background asyncio task (60s interval) that monitors system health:

  1. Load variance: stddev of CPU% across nodes → triggers DAA if > threshold
  2. Alert generation: node CPU > 90% for > 30s → alert event
  3. Drift detection placeholder: logs stub when no classifier is loaded

Configuration (config.yaml → feedback:):
  interval_sec, variance_threshold, drift_accuracy_threshold, drift_window_size
"""

import asyncio
import logging
import statistics
import time
from collections import deque
from dataclasses import dataclass, asdict
from typing import Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from coordinator.routing.daa import DynamicAdaptiveAllocator
    from coordinator.routing.allocation_engine import AllocationEngine

logger = logging.getLogger("coordinator.feedback.optimizer")

DEFAULT_INTERVAL_SEC = 60
DEFAULT_VARIANCE_THRESHOLD = 20.0
DEFAULT_CPU_ALERT_THRESHOLD = 90
DEFAULT_CPU_ALERT_DURATION_SEC = 30
DEFAULT_HISTORY_SIZE = 30


@dataclass
class FeedbackAction:
    """A single action taken by the feedback loop."""
    timestamp: float
    action_type: str       # "daa_trigger" | "cpu_alert" | "variance_warning" | "drift_stub"
    trigger_metric: str
    trigger_value: float
    threshold_value: float
    node_id: str = ""
    details: str = ""


class FeedbackOptimizer:
    """Background task: monitor system health and trigger corrective actions.

    Reads node metrics from AllocationEngine, computes load variance,
    detects sustained CPU alerts, and triggers DAA when needed.
    """

    def __init__(self, allocation_engine, daa=None, config=None):
        self.allocation_engine = allocation_engine
        self.daa = daa
        cfg = (config or {}).get("feedback", {})
        self.interval_sec = cfg.get("interval_sec", DEFAULT_INTERVAL_SEC)
        self.variance_threshold = cfg.get("variance_threshold", DEFAULT_VARIANCE_THRESHOLD)

        mon_cfg = (config or {}).get("monitoring", {}).get("alerting", {})
        self.cpu_alert_threshold = mon_cfg.get("node_cpu_alert_threshold", DEFAULT_CPU_ALERT_THRESHOLD)
        self.cpu_alert_duration = mon_cfg.get("node_cpu_alert_duration_sec", DEFAULT_CPU_ALERT_DURATION_SEC)

        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._run_count = 0
        self._last_run_time = 0.0
        self._last_variance = 0.0
        self._actions: deque = deque(maxlen=100)
        self._history: deque = deque(maxlen=DEFAULT_HISTORY_SIZE)

        # Track sustained CPU alerts: node_name → first_seen_time
        self._cpu_alert_start: Dict[str, float] = {}
        self._active_alerts: List[Dict] = []

    async def start(self):
        """Start the feedback optimizer background loop."""
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info(
            f"FeedbackOptimizer started: interval={self.interval_sec}s, "
            f"variance_threshold={self.variance_threshold}, "
            f"cpu_alert={self.cpu_alert_threshold}%>{self.cpu_alert_duration}s"
        )

    async def stop(self):
        """Stop the feedback optimizer."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info(f"FeedbackOptimizer stopped after {self._run_count} checks")

    async def _run_loop(self):
        """Background loop: run health checks at each interval."""
        while self._running:
            try:
                await self._check()
            except Exception as e:
                logger.error(f"Feedback check error: {e}", exc_info=True)
            await asyncio.sleep(self.interval_sec)

    async def _check(self):
        """Perform one feedback cycle."""
        self._run_count += 1
        self._last_run_time = time.time()
        now = self._last_run_time

        # Gather CPU metrics from all nodes
        all_metrics = self.allocation_engine.get_all_metrics()
        if not all_metrics:
            return

        cpu_values = []
        for name, metrics in all_metrics.items():
            cpu_pct = metrics.get("cpu_pct", 0.0)
            cpu_values.append(cpu_pct)

            # --- Sustained CPU alert detection ---
            if cpu_pct > self.cpu_alert_threshold:
                if name not in self._cpu_alert_start:
                    self._cpu_alert_start[name] = now
                elif (now - self._cpu_alert_start[name]) >= self.cpu_alert_duration:
                    action = FeedbackAction(
                        timestamp=now, action_type="cpu_alert",
                        trigger_metric="cpu_pct", trigger_value=round(cpu_pct, 1),
                        threshold_value=self.cpu_alert_threshold,
                        node_id=name,
                        details=f"CPU>{self.cpu_alert_threshold}% for >{self.cpu_alert_duration}s",
                    )
                    self._actions.append(action)
                    self._active_alerts.append({
                        "node_id": name, "cpu_pct": round(cpu_pct, 1),
                        "duration_sec": round(now - self._cpu_alert_start[name]),
                        "timestamp": now,
                    })
                    logger.warning(
                        f"CPU ALERT: {name} at {cpu_pct:.1f}% for "
                        f"{now - self._cpu_alert_start[name]:.0f}s"
                    )
                    # Reset to avoid spamming
                    self._cpu_alert_start[name] = now
            else:
                self._cpu_alert_start.pop(name, None)

        # --- Load variance check ---
        if len(cpu_values) > 1:
            variance = statistics.stdev(cpu_values)
            self._last_variance = round(variance, 2)

            if variance > self.variance_threshold:
                action = FeedbackAction(
                    timestamp=now, action_type="daa_trigger",
                    trigger_metric="load_variance_stddev",
                    trigger_value=round(variance, 2),
                    threshold_value=self.variance_threshold,
                    details="Load imbalance detected, triggering immediate DAA",
                )
                self._actions.append(action)
                logger.warning(
                    f"Load variance {variance:.1f} > threshold {self.variance_threshold} → triggering DAA"
                )
                if self.daa:
                    self.daa.trigger_immediate(reason=f"variance={variance:.1f}")

        # --- Drift detection stub ---
        action = FeedbackAction(
            timestamp=now, action_type="drift_stub",
            trigger_metric="classifier_accuracy",
            trigger_value=0.0, threshold_value=0.0,
            details="Drift detection disabled — no classifier loaded (Phase 5)",
        )
        self._actions.append(action)

        # Record check history
        self._history.append({
            "run": self._run_count, "timestamp": now,
            "variance": self._last_variance,
            "node_count": len(all_metrics),
            "alerts_active": len(self._active_alerts),
        })

        # Trim old alerts (keep last 50)
        if len(self._active_alerts) > 50:
            self._active_alerts = self._active_alerts[-50:]

    def get_status(self) -> Dict:
        """Get current feedback optimizer status for API endpoint."""
        return {
            "running": self._running,
            "interval_sec": self.interval_sec,
            "total_checks": self._run_count,
            "last_check_time": self._last_run_time,
            "last_variance": self._last_variance,
            "variance_threshold": self.variance_threshold,
            "cpu_alert_threshold": self.cpu_alert_threshold,
            "cpu_alert_duration_sec": self.cpu_alert_duration,
            "active_alerts": self._active_alerts[-10:],
            "recent_actions": [asdict(a) for a in list(self._actions)[-10:]],
            "check_history": list(self._history)[-10:],
        }
