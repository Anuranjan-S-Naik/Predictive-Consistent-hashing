"""
Dynamic Adaptive Allocation (DAA) — Virtual Node Adjustment Engine
====================================================================
Background asyncio task that recalculates virtual node counts every
configurable interval (default: 10s) based on live node metrics.

Algorithm:
  For each node n:
    cpu_factor = interpolate(cpu_pct, thresholds)
    queue_factor = interpolate(queue_depth_pct, thresholds)
    burst_factor = 0.7 if burst_imminent else 1.0
    new_vnodes = clamp(base × cpu_factor × queue_factor × burst_factor,
                       min=vnode_min_count, max=base×2)

Config keys (config.yaml → daa:):
  interval_sec, thresholds.cpu_increase_below, thresholds.cpu_decrease_above,
  thresholds.queue_increase_below, thresholds.queue_decrease_above,
  burst_damping_factor
"""

import asyncio
import logging
import time
from collections import deque
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from coordinator.routing.hash_ring import ConsistentHashRing
    from coordinator.routing.allocation_engine import AllocationEngine

logger = logging.getLogger("coordinator.routing.daa")

DEFAULT_INTERVAL_SEC = 10
DEFAULT_CPU_INCREASE_BELOW = 50
DEFAULT_CPU_DECREASE_ABOVE = 80
DEFAULT_QUEUE_INCREASE_BELOW = 20
DEFAULT_QUEUE_DECREASE_ABOVE = 80
DEFAULT_BURST_DAMPING = 0.7
DEFAULT_VNODE_MIN = 10
DEFAULT_HISTORY_SIZE = 20


@dataclass
class NodeAdjustment:
    """Record of a single node's vnode adjustment."""
    node_name: str
    old_vnodes: int
    new_vnodes: int
    cpu_pct: float
    queue_depth_pct: float
    cpu_factor: float
    queue_factor: float
    burst_damping: float
    reason: str


@dataclass
class DAARunRecord:
    """Record of a complete DAA recalculation cycle."""
    timestamp: float
    run_id: int
    duration_ms: float
    adjustments: List[Dict] = field(default_factory=list)
    total_vnodes_before: int = 0
    total_vnodes_after: int = 0
    burst_imminent: bool = False
    triggered_by: str = "interval"


class DynamicAdaptiveAllocator:
    """Background task: dynamically adjust virtual node counts.

    Reads node metrics from the AllocationEngine's in-memory store and
    adjusts the ConsistentHashRing's vnode distribution to shift traffic
    away from overloaded nodes and toward underutilized ones.
    """

    def __init__(self, hash_ring, allocation_engine, config=None):
        self.hash_ring = hash_ring
        self.allocation_engine = allocation_engine
        cfg = (config or {}).get("daa", {})
        self.interval_sec = cfg.get("interval_sec", DEFAULT_INTERVAL_SEC)
        thr = cfg.get("thresholds", {})
        self.cpu_increase_below = thr.get("cpu_increase_below", DEFAULT_CPU_INCREASE_BELOW)
        self.cpu_decrease_above = thr.get("cpu_decrease_above", DEFAULT_CPU_DECREASE_ABOVE)
        self.queue_increase_below = thr.get("queue_increase_below", DEFAULT_QUEUE_INCREASE_BELOW)
        self.queue_decrease_above = thr.get("queue_decrease_above", DEFAULT_QUEUE_DECREASE_ABOVE)
        self.burst_damping_factor = cfg.get("burst_damping_factor", DEFAULT_BURST_DAMPING)
        hr_cfg = (config or {}).get("hash_ring", {})
        self.vnode_base_count = hr_cfg.get("vnode_base_count", 150)
        self.vnode_min_count = hr_cfg.get("vnode_min_count", DEFAULT_VNODE_MIN)

        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._burst_imminent = False
        self._run_count = 0
        self._last_run_time = 0.0
        self._last_run_duration_ms = 0.0
        self._history: deque = deque(maxlen=DEFAULT_HISTORY_SIZE)
        self._pending_trigger: Optional[str] = None

    async def start(self):
        """Start the DAA background loop."""
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info(
            f"DAA started: interval={self.interval_sec}s, "
            f"cpu=[{self.cpu_increase_below},{self.cpu_decrease_above}], "
            f"queue=[{self.queue_increase_below},{self.queue_decrease_above}], "
            f"burst_damping={self.burst_damping_factor}"
        )

    async def stop(self):
        """Stop the DAA background loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info(f"DAA stopped after {self._run_count} runs")

    def set_burst_imminent(self, imminent: bool):
        """Called by GRU forecaster when a burst is predicted."""
        if imminent != self._burst_imminent:
            logger.info(f"DAA burst_imminent: {self._burst_imminent} → {imminent}")
            self._burst_imminent = imminent

    def trigger_immediate(self, reason: str = "feedback"):
        """Request an immediate DAA recalculation."""
        self._pending_trigger = reason
        logger.info(f"DAA immediate recalculation requested: {reason}")

    async def _run_loop(self):
        """Background loop: recalculate vnodes at each interval."""
        while self._running:
            try:
                trigger = self._pending_trigger or "interval"
                self._pending_trigger = None
                await self._recalculate(triggered_by=trigger)
            except Exception as e:
                logger.error(f"DAA recalculation error: {e}", exc_info=True)
            await asyncio.sleep(self.interval_sec)

    async def _recalculate(self, triggered_by: str = "interval"):
        """Perform one DAA recalculation cycle across all nodes."""
        start = time.perf_counter()
        self._run_count += 1

        node_names = list(self.hash_ring.nodes.keys()) if hasattr(self.hash_ring, 'nodes') else []
        if not node_names:
            return

        adjustments = []
        total_before = 0
        total_after = 0

        for name in node_names:
            metrics = self.allocation_engine.get_node_metrics(name)
            cpu_pct = metrics.get("cpu_pct", 50.0)
            queue_depth = metrics.get("queue_depth", 0)
            queue_max = metrics.get("queue_max", 450)
            queue_pct = (queue_depth / max(queue_max, 1)) * 100

            old_vnodes = self.hash_ring.get_node_vnode_count(name)
            base = self._get_base_vnodes(name)
            total_before += old_vnodes

            cpu_f = self._cpu_factor(cpu_pct)
            queue_f = self._queue_factor(queue_pct)
            burst_f = self.burst_damping_factor if self._burst_imminent else 1.0

            raw = base * cpu_f * queue_f * burst_f
            new_vnodes = max(self.vnode_min_count, min(int(round(raw)), base * 2))

            reasons = []
            if cpu_pct < self.cpu_increase_below:
                reasons.append(f"cpu_low({cpu_pct:.0f}%)")
            elif cpu_pct > self.cpu_decrease_above:
                reasons.append(f"cpu_high({cpu_pct:.0f}%)")
            if queue_pct < self.queue_increase_below:
                reasons.append(f"queue_low({queue_pct:.0f}%)")
            elif queue_pct > self.queue_decrease_above:
                reasons.append(f"queue_high({queue_pct:.0f}%)")
            if self._burst_imminent:
                reasons.append("burst_damping")

            adj = NodeAdjustment(
                node_name=name, old_vnodes=old_vnodes, new_vnodes=new_vnodes,
                cpu_pct=round(cpu_pct, 1), queue_depth_pct=round(queue_pct, 1),
                cpu_factor=round(cpu_f, 3), queue_factor=round(queue_f, 3),
                burst_damping=round(burst_f, 2),
                reason=", ".join(reasons) if reasons else "stable",
            )
            adjustments.append(adj)

            if new_vnodes != old_vnodes:
                self.hash_ring.update_node_vnodes(name, new_vnodes)
                logger.info(
                    f"DAA {name}: {old_vnodes}→{new_vnodes} vnodes "
                    f"(cpu={cpu_pct:.0f}% q={queue_pct:.0f}% f=[{cpu_f:.2f},{queue_f:.2f},{burst_f:.2f}])"
                )
            total_after += new_vnodes

        duration_ms = (time.perf_counter() - start) * 1000
        self._last_run_time = time.time()
        self._last_run_duration_ms = duration_ms

        record = DAARunRecord(
            timestamp=self._last_run_time, run_id=self._run_count,
            duration_ms=round(duration_ms, 2),
            adjustments=[asdict(a) for a in adjustments],
            total_vnodes_before=total_before, total_vnodes_after=total_after,
            burst_imminent=self._burst_imminent, triggered_by=triggered_by,
        )
        self._history.append(record)

        if total_before != total_after:
            logger.info(f"DAA #{self._run_count}: vnodes {total_before}→{total_after} ({duration_ms:.1f}ms)")

    def _cpu_factor(self, cpu_pct: float) -> float:
        if cpu_pct < self.cpu_increase_below:
            return 1.0 + 0.3 * (1.0 - cpu_pct / self.cpu_increase_below)
        elif cpu_pct > self.cpu_decrease_above:
            overshoot = (cpu_pct - self.cpu_decrease_above) / (100 - self.cpu_decrease_above)
            return max(0.5, 1.0 - 0.5 * overshoot)
        return 1.0

    def _queue_factor(self, queue_pct: float) -> float:
        if queue_pct < self.queue_increase_below:
            return 1.0 + 0.2 * (1.0 - queue_pct / max(self.queue_increase_below, 1))
        elif queue_pct > self.queue_decrease_above:
            overshoot = (queue_pct - self.queue_decrease_above) / max(100 - self.queue_decrease_above, 1)
            return max(0.6, 1.0 - 0.4 * overshoot)
        return 1.0

    def _get_base_vnodes(self, node_name: str) -> int:
        if hasattr(self.hash_ring, 'nodes') and node_name in self.hash_ring.nodes:
            info = self.hash_ring.nodes[node_name]
            if isinstance(info, dict):
                return info.get("base_vnodes", self.vnode_base_count)
        return self.vnode_base_count

    def get_status(self) -> Dict:
        """Get current DAA status for API endpoint."""
        last = self._history[-1] if self._history else None
        return {
            "running": self._running,
            "interval_sec": self.interval_sec,
            "total_runs": self._run_count,
            "last_run_time": self._last_run_time,
            "last_run_duration_ms": round(self._last_run_duration_ms, 2),
            "burst_imminent": self._burst_imminent,
            "thresholds": {
                "cpu_increase_below": self.cpu_increase_below,
                "cpu_decrease_above": self.cpu_decrease_above,
                "queue_increase_below": self.queue_increase_below,
                "queue_decrease_above": self.queue_decrease_above,
                "burst_damping_factor": self.burst_damping_factor,
            },
            "last_adjustments": last.adjustments if last else [],
            "last_total_vnodes": last.total_vnodes_after if last else 0,
            "history": [
                {"run_id": r.run_id, "timestamp": r.timestamp,
                 "total_vnodes_before": r.total_vnodes_before,
                 "total_vnodes_after": r.total_vnodes_after,
                 "triggered_by": r.triggered_by, "duration_ms": r.duration_ms}
                for r in self._history
            ],
        }
