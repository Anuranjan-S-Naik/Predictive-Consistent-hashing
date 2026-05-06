"""
Request Executor — Simulated Execution Engine
================================================
Consumes requests from the WFQ scheduler and simulates execution
with class-dependent latency:
  - Light:  40–60 ms   (API calls)
  - Medium: 150–250 ms (DB queries)
  - Heavy:  800–1200 ms (ML inference)

Emits completion events with timing metrics.
"""

import asyncio
import logging
import random
import time
from dataclasses import dataclass
from typing import Callable, Dict, Optional

from node.scheduler import QueuedRequest

logger = logging.getLogger("node.executor")


@dataclass
class ExecutionResult:
    """Result of executing a request."""
    request_id: str
    request_class: str
    node_id: str
    execution_time_ms: float
    queue_wait_time_ms: float
    total_time_ms: float
    success: bool
    error_message: str = ""
    completion_timestamp_ms: int = 0


# Default execution time ranges (ms) per class
DEFAULT_EXEC_TIMES = {
    "Light": (40, 60),
    "Medium": (150, 250),
    "Heavy": (800, 1200),
}


class RequestExecutor:
    """Simulates request execution with class-dependent latency.

    Pulls requests from the WFQ scheduler's output queue, sleeps for
    the simulated execution time, and emits completion results.
    """

    def __init__(
        self,
        node_id: str,
        exec_times: Optional[Dict] = None,
        on_completion: Optional[Callable] = None,
    ):
        """
        Args:
            node_id: Name of this node (e.g., 'node_s1').
            exec_times: Override execution time ranges per class.
            on_completion: Callback invoked with ExecutionResult on completion.
        """
        self.node_id = node_id
        self.exec_times = exec_times or DEFAULT_EXEC_TIMES
        self.on_completion = on_completion

        # Metrics
        self.total_executed = 0
        self.total_failed = 0
        self._running = False
        self._active_count = 0

    async def execute_request(self, request: QueuedRequest) -> ExecutionResult:
        """Execute a single request with simulated latency.

        Args:
            request: The dequeued request from the scheduler.

        Returns:
            ExecutionResult with timing metrics.
        """
        self._active_count += 1
        queue_wait_ms = (time.time() - request.enqueued_at) * 1000

        cls = request.request_class
        min_ms, max_ms = self.exec_times.get(cls, (100, 300))
        exec_ms = random.uniform(min_ms, max_ms)

        try:
            # Simulate execution time
            await asyncio.sleep(exec_ms / 1000.0)

            result = ExecutionResult(
                request_id=request.request_id,
                request_class=cls,
                node_id=self.node_id,
                execution_time_ms=exec_ms,
                queue_wait_time_ms=queue_wait_ms,
                total_time_ms=queue_wait_ms + exec_ms,
                success=True,
                completion_timestamp_ms=int(time.time() * 1000),
            )
            self.total_executed += 1

        except Exception as e:
            result = ExecutionResult(
                request_id=request.request_id,
                request_class=cls,
                node_id=self.node_id,
                execution_time_ms=0,
                queue_wait_time_ms=queue_wait_ms,
                total_time_ms=queue_wait_ms,
                success=False,
                error_message=str(e),
                completion_timestamp_ms=int(time.time() * 1000),
            )
            self.total_failed += 1

        finally:
            self._active_count -= 1

        # Invoke completion callback (e.g., to send gRPC ReportCompletion)
        if self.on_completion:
            try:
                await self.on_completion(result)
            except Exception as e:
                logger.error(f"Completion callback failed: {e}")

        return result

    async def run(self, scheduler):
        """Main executor loop — consume requests from scheduler and execute.

        Args:
            scheduler: WFQScheduler instance to consume from.
        """
        self._running = True
        logger.info(f"Executor started on {self.node_id}")

        while self._running:
            try:
                request = await asyncio.wait_for(
                    scheduler.get_next_request(), timeout=1.0
                )
                # Execute in a separate task for concurrency
                asyncio.create_task(self.execute_request(request))
            except asyncio.TimeoutError:
                continue
            except Exception as e:
                logger.error(f"Executor error: {e}")
                await asyncio.sleep(0.1)

    def stop(self):
        """Stop the executor loop."""
        self._running = False

    @property
    def active_count(self) -> int:
        """Number of currently executing requests."""
        return self._active_count

    def get_stats(self) -> Dict:
        """Get executor statistics."""
        return {
            "total_executed": self.total_executed,
            "total_failed": self.total_failed,
            "active_count": self._active_count,
        }
