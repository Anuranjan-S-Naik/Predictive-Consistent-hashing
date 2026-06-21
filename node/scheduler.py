"""
Weighted Fair Queuing (WFQ) Scheduler
=======================================
Implements token-based WFQ with three priority queues:
  - Light  (weight=3): served 3× per cycle
  - Medium (weight=2): served 2× per cycle
  - Heavy  (weight=1): served 1× per cycle

The scheduler dequeues from non-empty queues according to weights
in round-robin fashion, ensuring fair service proportional to weight.
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Optional, Dict

logger = logging.getLogger("node.scheduler")


@dataclass
class QueuedRequest:
    """A request waiting in the WFQ scheduler."""
    request_id: str
    request_class: str          # "Light", "Medium", "Heavy"
    enqueued_at: float = field(default_factory=time.time)
    payload: dict = field(default_factory=dict)


class WFQScheduler:
    """Weighted Fair Queuing scheduler with three class-specific queues.

    Token-based scheduling: per cycle, dequeue up to 3 Light, 2 Medium, 1 Heavy
    from non-empty queues. This ensures Light requests are served 3× more
    frequently than Heavy under equal arrival rates.
    """

    def __init__(
        self,
        max_depth_light: int = 200,
        max_depth_medium: int = 150,
        max_depth_heavy: int = 100,
        weight_light: int = 3,
        weight_medium: int = 2,
        weight_heavy: int = 1,
    ):
        self.max_depths = {
            "Light": max_depth_light,
            "Medium": max_depth_medium,
            "Heavy": max_depth_heavy,
        }
        self.weights = {
            "Light": weight_light,
            "Medium": weight_medium,
            "Heavy": weight_heavy,
        }

        # Async queues for each class
        self._queues: Dict[str, asyncio.Queue] = {
            "Light": asyncio.Queue(maxsize=max_depth_light),
            "Medium": asyncio.Queue(maxsize=max_depth_medium),
            "Heavy": asyncio.Queue(maxsize=max_depth_heavy),
        }

        # Output queue for executor to consume
        self._output_queue: asyncio.Queue = asyncio.Queue()

        # Metrics
        self.total_enqueued = 0
        self.total_rejected = 0
        self.total_dequeued = 0
        self._running = False

    async def enqueue(self, request: QueuedRequest) -> bool:
        """Enqueue a request into the appropriate class queue.

        Args:
            request: The request to enqueue.

        Returns:
            True if enqueued, False if queue is full (503 rejection).
        """
        cls = request.request_class
        if cls not in self._queues:
            cls = "Medium"  # Default fallback

        queue = self._queues[cls]
        if queue.full():
            self.total_rejected += 1
            logger.warning(
                f"Queue full for class {cls}: rejecting {request.request_id} "
                f"(depth={queue.qsize()}/{self.max_depths[cls]})"
            )
            return False

        await queue.put(request)
        self.total_enqueued += 1
        return True

    async def _schedule_cycle(self):
        """Execute one WFQ scheduling cycle.

        Dequeues up to weight[class] items from each non-empty queue
        and puts them into the output queue for the executor.
        """
        for cls in ["Light", "Medium", "Heavy"]:
            queue = self._queues[cls]
            weight = self.weights[cls]

            for _ in range(weight):
                if queue.empty():
                    break
                try:
                    request = queue.get_nowait()
                    await self._output_queue.put(request)
                    self.total_dequeued += 1
                except asyncio.QueueEmpty:
                    break

    async def run(self):
        """Main scheduler loop — continuously dequeues using WFQ weights."""
        self._running = True
        logger.info(
            f"WFQ Scheduler started (weights: L={self.weights['Light']}, "
            f"M={self.weights['Medium']}, H={self.weights['Heavy']})"
        )

        while self._running:
            # Check if any queue has items
            has_work = any(not q.empty() for q in self._queues.values())

            if has_work:
                await self._schedule_cycle()
            else:
                # No work — brief sleep to avoid busy-waiting
                await asyncio.sleep(0.001)

    async def get_next_request(self) -> QueuedRequest:
        """Get the next request from the output queue (blocking).

        Used by the executor to consume scheduled requests.
        """
        return await self._output_queue.get()

    def stop(self):
        """Stop the scheduler loop."""
        self._running = False

    def reset(self):
        """Reset the queues and counters."""
        self.total_enqueued = 0
        self.total_rejected = 0
        self.total_dequeued = 0
        for cls in self._queues:
            self._queues[cls] = asyncio.Queue(maxsize=self.max_depths[cls])
        self._output_queue = asyncio.Queue()

    def get_queue_depths(self) -> Dict[str, int]:
        """Get current queue depths for all classes."""
        return {cls: q.qsize() for cls, q in self._queues.items()}

    @property
    def total_depth(self) -> int:
        """Total items across all queues."""
        return sum(q.qsize() for q in self._queues.values())

    def get_stats(self) -> Dict:
        """Get scheduler statistics."""
        return {
            "total_enqueued": self.total_enqueued,
            "total_dequeued": self.total_dequeued,
            "total_rejected": self.total_rejected,
            "queue_depths": self.get_queue_depths(),
            "total_depth": self.total_depth,
        }
