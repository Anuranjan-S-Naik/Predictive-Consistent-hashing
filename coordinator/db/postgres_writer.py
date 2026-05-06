"""
PostgreSQL Async Batch Writer
===============================
Buffers request/prediction inserts and commits them in batches to avoid
per-request INSERT latency backpressure on the coordinator's hot path.

Batch strategy: flush on whichever triggers first:
  - buffer reaches batch_size (default: 1000)
  - time since last flush exceeds batch_interval_sec (default: 1s)

Validated for 500+ RPS bursty traffic (P4-T1).
"""

import asyncio
import logging
import time
from dataclasses import dataclass, field, asdict
from typing import Dict, List, Optional

logger = logging.getLogger("coordinator.db.postgres_writer")

# Batch configuration defaults (overridden by config.yaml)
DEFAULT_BATCH_SIZE = 1000
DEFAULT_BATCH_INTERVAL_SEC = 1.0


@dataclass
class RequestRecord:
    """A request log entry for the 'requests' table."""
    request_id: str
    endpoint_path: str = "/api/status"
    method: str = "GET"
    payload_bytes: int = 0
    source_id: str = ""
    endpoint_id: int = 0
    burst_frequency: float = 0.0
    avg_latency_ema: float = 0.0
    queue_depth_at_arrival: int = 0
    hour_of_day: int = 0
    is_burst: bool = False
    experiment_id: str = ""


@dataclass
class PredictionRecord:
    """A prediction/routing log entry for the 'predictions' table."""
    request_id_str: str
    predicted_class: str = "Medium"
    confidence: float = 0.0
    inference_ms: float = 0.0
    node_assigned: str = ""
    routing_hops: int = 1
    assigned_by: str = "allocation_engine"
    allocation_score: float = 0.0
    execution_ms: float = 0.0
    queue_wait_ms: float = 0.0
    total_latency_ms: float = 0.0
    success: bool = True
    error_message: str = ""
    ground_truth_class: str = ""
    experiment_id: str = ""


class PostgresBatchWriter:
    """Async buffered batch writer for PostgreSQL.

    Eliminates per-request INSERT latency from the coordinator's hot path.
    Buffers records in asyncio queues and flushes in batches.

    Attributes:
        batch_size: Max buffer size before forced flush.
        batch_interval_sec: Max time before forced flush.
        db_pool: asyncpg connection pool (or None for simulation mode).
    """

    def __init__(
        self,
        db_pool=None,
        batch_size: int = DEFAULT_BATCH_SIZE,
        batch_interval_sec: float = DEFAULT_BATCH_INTERVAL_SEC,
    ):
        self.db_pool = db_pool
        self.batch_size = batch_size
        self.batch_interval_sec = batch_interval_sec

        # Separate buffers for each table
        self._request_buffer: List[RequestRecord] = []
        self._prediction_buffer: List[PredictionRecord] = []
        self._lock = asyncio.Lock()

        # Metrics
        self.total_requests_buffered = 0
        self.total_predictions_buffered = 0
        self.total_flushes = 0
        self.total_rows_written = 0
        self.last_flush_time = time.time()
        self.last_flush_duration_ms = 0.0
        self.flush_errors = 0

        self._running = False
        self._flush_task: Optional[asyncio.Task] = None

    async def start(self):
        """Start the background flush loop."""
        self._running = True
        self._flush_task = asyncio.create_task(self._flush_loop())
        logger.info(
            f"PostgresBatchWriter started: batch_size={self.batch_size}, "
            f"interval={self.batch_interval_sec}s"
        )

    async def stop(self):
        """Stop the flush loop and flush remaining records."""
        self._running = False
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        # Final flush
        await self._flush()
        logger.info(
            f"PostgresBatchWriter stopped: total_flushes={self.total_flushes}, "
            f"total_rows={self.total_rows_written}"
        )

    async def buffer_request(self, record: RequestRecord):
        """Add a request record to the buffer (non-blocking)."""
        async with self._lock:
            self._request_buffer.append(record)
            self.total_requests_buffered += 1

            # Trigger immediate flush if buffer full
            if len(self._request_buffer) >= self.batch_size:
                await self._flush_requests()

    async def buffer_prediction(self, record: PredictionRecord):
        """Add a prediction record to the buffer (non-blocking)."""
        async with self._lock:
            self._prediction_buffer.append(record)
            self.total_predictions_buffered += 1

            if len(self._prediction_buffer) >= self.batch_size:
                await self._flush_predictions()

    async def _flush_loop(self):
        """Background loop: flush on interval if buffer has data."""
        while self._running:
            await asyncio.sleep(self.batch_interval_sec)
            await self._flush()

    async def _flush(self):
        """Flush all buffers."""
        async with self._lock:
            await self._flush_requests()
            await self._flush_predictions()

    async def _flush_requests(self):
        """Flush the requests buffer to PostgreSQL."""
        if not self._request_buffer:
            return

        batch = self._request_buffer[:]
        self._request_buffer.clear()
        start = time.perf_counter()

        try:
            if self.db_pool:
                await self._batch_insert_requests(batch)
            else:
                # Simulation mode: log instead of writing
                logger.debug(f"[SIMULATED] Flushed {len(batch)} request records")

            self.total_rows_written += len(batch)
            self.total_flushes += 1
            self.last_flush_time = time.time()
            self.last_flush_duration_ms = (time.perf_counter() - start) * 1000

            if len(batch) >= 100:
                logger.info(
                    f"Flushed {len(batch)} requests to PostgreSQL "
                    f"({self.last_flush_duration_ms:.1f}ms)"
                )

        except Exception as e:
            self.flush_errors += 1
            logger.error(f"Failed to flush {len(batch)} requests: {e}")
            # Re-buffer failed records (at-least-once semantics)
            self._request_buffer.extend(batch)

    async def _flush_predictions(self):
        """Flush the predictions buffer to PostgreSQL."""
        if not self._prediction_buffer:
            return

        batch = self._prediction_buffer[:]
        self._prediction_buffer.clear()
        start = time.perf_counter()

        try:
            if self.db_pool:
                await self._batch_insert_predictions(batch)
            else:
                logger.debug(f"[SIMULATED] Flushed {len(batch)} prediction records")

            self.total_rows_written += len(batch)
            self.total_flushes += 1
            self.last_flush_time = time.time()
            self.last_flush_duration_ms = (time.perf_counter() - start) * 1000

        except Exception as e:
            self.flush_errors += 1
            logger.error(f"Failed to flush {len(batch)} predictions: {e}")
            self._prediction_buffer.extend(batch)

    async def _batch_insert_requests(self, batch: List[RequestRecord]):
        """Execute batch INSERT INTO requests using asyncpg executemany."""
        query = """
            INSERT INTO requests (
                request_id, endpoint_path, method, payload_bytes, source_id,
                endpoint_id, burst_frequency, avg_latency_ema,
                queue_depth_at_arrival, hour_of_day, is_burst, experiment_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (request_id) DO NOTHING
        """
        records = [
            (
                r.request_id, r.endpoint_path, r.method, r.payload_bytes,
                r.source_id, r.endpoint_id, r.burst_frequency,
                r.avg_latency_ema, r.queue_depth_at_arrival, r.hour_of_day,
                r.is_burst, r.experiment_id,
            )
            for r in batch
        ]
        async with self.db_pool.acquire() as conn:
            await conn.executemany(query, records)

    async def _batch_insert_predictions(self, batch: List[PredictionRecord]):
        """Execute batch INSERT INTO predictions using asyncpg executemany."""
        query = """
            INSERT INTO predictions (
                request_id, request_id_str, predicted_class, confidence,
                inference_ms, node_assigned, routing_hops, assigned_by,
                allocation_score, execution_ms, queue_wait_ms,
                total_latency_ms, success, error_message,
                ground_truth_class, experiment_id
            ) VALUES (
                (SELECT id FROM requests WHERE request_id = $1),
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
            )
        """
        records = [
            (
                p.request_id_str, p.predicted_class, p.confidence,
                p.inference_ms, p.node_assigned, p.routing_hops,
                p.assigned_by, p.allocation_score, p.execution_ms,
                p.queue_wait_ms, p.total_latency_ms, p.success,
                p.error_message, p.ground_truth_class, p.experiment_id,
            )
            for p in batch
        ]
        async with self.db_pool.acquire() as conn:
            await conn.executemany(query, records)

    def get_stats(self) -> Dict:
        """Get writer statistics for monitoring."""
        return {
            "total_requests_buffered": self.total_requests_buffered,
            "total_predictions_buffered": self.total_predictions_buffered,
            "total_flushes": self.total_flushes,
            "total_rows_written": self.total_rows_written,
            "current_request_buffer_size": len(self._request_buffer),
            "current_prediction_buffer_size": len(self._prediction_buffer),
            "last_flush_duration_ms": round(self.last_flush_duration_ms, 2),
            "flush_errors": self.flush_errors,
            "batch_size": self.batch_size,
            "batch_interval_sec": self.batch_interval_sec,
        }
