"""
PAF Simulated Server Node — Main Entry Point
==============================================
Each node runs as an independent process with:
  - A gRPC server accepting RouteRequest RPCs from the coordinator
  - An HTTP server exposing /metrics for Prometheus and /health for Docker
  - WFQ scheduler with 3 priority queues (Light:3, Medium:2, Heavy:1)
  - Request executor with class-dependent simulated latency
  - Load-driven CPU simulation

Phase 3: Full WFQ scheduler + executor integrated.
"""

import asyncio
import logging
import os
import signal
import time
from concurrent import futures

import grpc
import yaml
from coordinator.grpc import coordinator_pb2, coordinator_pb2_grpc
from prometheus_client import (
    Counter,
    Gauge,
    Histogram,
    generate_latest,
    CONTENT_TYPE_LATEST,
)

# ---------------------------------------------------------------------------
# Configuration from environment
# ---------------------------------------------------------------------------

NODE_NAME = os.getenv("NODE_NAME", "node_s1")
NODE_GRPC_PORT = int(os.getenv("NODE_GRPC_PORT", "50051"))
NODE_METRICS_PORT = int(os.getenv("NODE_METRICS_PORT", "9100"))
CAPACITY_SCORE = int(os.getenv("CAPACITY_SCORE", "100"))
CPU_CORES = int(os.getenv("CPU_CORES", "4"))
MEMORY_GB = int(os.getenv("MEMORY_GB", "8"))
CONFIG_PATH = os.getenv("CONFIG_PATH", "config.yaml")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format=f"%(asctime)s | {NODE_NAME} | %(levelname)s | %(message)s",
)
logger = logging.getLogger(f"node.{NODE_NAME}")

# ---------------------------------------------------------------------------
# Prometheus Metrics (exposed via /metrics HTTP endpoint)
# ---------------------------------------------------------------------------

NODE_CPU = Gauge(
    "paf_node_cpu_percent",
    "Simulated CPU utilization percentage",
    ["node"],
)
NODE_MEMORY = Gauge(
    "paf_node_memory_percent",
    "Simulated memory utilization percentage",
    ["node"],
)
NODE_QUEUE_LIGHT = Gauge(
    "paf_node_queue_depth_light",
    "Light queue depth",
    ["node"],
)
NODE_QUEUE_MEDIUM = Gauge(
    "paf_node_queue_depth_medium",
    "Medium queue depth",
    ["node"],
)
NODE_QUEUE_HEAVY = Gauge(
    "paf_node_queue_depth_heavy",
    "Heavy queue depth",
    ["node"],
)
NODE_QUEUE_TOTAL = Gauge(
    "paf_node_queue_depth_total",
    "Total queue depth across all classes",
    ["node"],
)
NODE_REQUESTS_PROCESSED = Counter(
    "paf_node_requests_processed_total",
    "Total requests processed by this node",
    ["node", "class"],
)
NODE_REQUESTS_REJECTED = Counter(
    "paf_node_requests_rejected_total",
    "Total requests rejected (queue full)",
    ["node"],
)
NODE_LATENCY = Histogram(
    "paf_node_execution_latency_ms",
    "Request execution latency in ms",
    ["node", "class"],
    buckets=[10, 25, 50, 100, 200, 500, 1000, 2000, 5000],
)
NODE_VNODE_COUNT = Gauge(
    "paf_node_vnode_count",
    "Current virtual node count assigned to this node",
    ["node"],
)
NODE_THROUGHPUT = Gauge(
    "paf_node_throughput_rps",
    "Requests per second (rolling window)",
    ["node"],
)
NODE_UPTIME = Gauge(
    "paf_node_uptime_seconds",
    "Node uptime in seconds",
    ["node"],
)

# Initialize all gauges with defaults
NODE_CPU.labels(node=NODE_NAME).set(0)
NODE_MEMORY.labels(node=NODE_NAME).set(0)
NODE_QUEUE_LIGHT.labels(node=NODE_NAME).set(0)
NODE_QUEUE_MEDIUM.labels(node=NODE_NAME).set(0)
NODE_QUEUE_HEAVY.labels(node=NODE_NAME).set(0)
NODE_QUEUE_TOTAL.labels(node=NODE_NAME).set(0)
NODE_VNODE_COUNT.labels(node=NODE_NAME).set(0)
NODE_THROUGHPUT.labels(node=NODE_NAME).set(0)
NODE_UPTIME.labels(node=NODE_NAME).set(0)

# ---------------------------------------------------------------------------
# Node State
# ---------------------------------------------------------------------------


class NodeState:
    """Tracks the runtime state of the simulated node."""

    def __init__(self, name: str, capacity: int, cpu_cores: int, memory_gb: int):
        self.name = name
        self.capacity_score = capacity
        self.cpu_cores = cpu_cores
        self.memory_gb = memory_gb
        self.start_time = time.time()

        # Simulated metrics (will be driven by actual load in Phase 3)
        self.cpu_pct: float = 5.0   # Idle CPU
        self.memory_pct: float = 10.0
        self.queue_depth_light: int = 0
        self.queue_depth_medium: int = 0
        self.queue_depth_heavy: int = 0
        self.latency_ema_ms: float = 0.0
        self.throughput_rps: float = 0.0
        self.vnode_count: int = 0
        self.total_processed: int = 0
        self.total_rejected: int = 0
        self.is_healthy: bool = True

    def reset(self):
        """Reset all runtime state metrics."""
        self.cpu_pct = 5.0
        self.memory_pct = 10.0
        self.queue_depth_light = 0
        self.queue_depth_medium = 0
        self.queue_depth_heavy = 0
        self.latency_ema_ms = 0.0
        self.throughput_rps = 0.0
        self.total_processed = 0
        self.total_rejected = 0
        self.is_healthy = True
        self.start_time = time.time()

    @property
    def queue_depth_total(self) -> int:
        return self.queue_depth_light + self.queue_depth_medium + self.queue_depth_heavy

    @property
    def uptime_sec(self) -> int:
        return int(time.time() - self.start_time)

    def update_prometheus_metrics(self):
        """Push current state to Prometheus gauges."""
        NODE_CPU.labels(node=self.name).set(self.cpu_pct)
        NODE_MEMORY.labels(node=self.name).set(self.memory_pct)
        NODE_QUEUE_LIGHT.labels(node=self.name).set(self.queue_depth_light)
        NODE_QUEUE_MEDIUM.labels(node=self.name).set(self.queue_depth_medium)
        NODE_QUEUE_HEAVY.labels(node=self.name).set(self.queue_depth_heavy)
        NODE_QUEUE_TOTAL.labels(node=self.name).set(self.queue_depth_total)
        NODE_VNODE_COUNT.labels(node=self.name).set(self.vnode_count)
        NODE_THROUGHPUT.labels(node=self.name).set(self.throughput_rps)
        NODE_UPTIME.labels(node=self.name).set(self.uptime_sec)

    def to_dict(self) -> dict:
        """Serialize node state for gRPC responses."""
        return {
            "node_id": self.name,
            "cpu_pct": self.cpu_pct,
            "memory_pct": self.memory_pct,
            "queue_depth_light": self.queue_depth_light,
            "queue_depth_medium": self.queue_depth_medium,
            "queue_depth_heavy": self.queue_depth_heavy,
            "queue_depth_total": self.queue_depth_total,
            "latency_ema_ms": self.latency_ema_ms,
            "throughput_rps": self.throughput_rps,
            "capacity_score": self.capacity_score,
            "vnode_count": self.vnode_count,
            "total_requests_processed": self.total_processed,
            "total_requests_rejected": self.total_rejected,
            "timestamp_ms": int(time.time() * 1000),
            "is_healthy": self.is_healthy,
            "uptime_sec": self.uptime_sec,
        }


# Global node state
node_state = NodeState(NODE_NAME, CAPACITY_SCORE, CPU_CORES, MEMORY_GB)

# Phase 3: WFQ scheduler and executor
from node.scheduler import WFQScheduler, QueuedRequest
from node.executor import RequestExecutor

scheduler = WFQScheduler()
executor: RequestExecutor = None  # Initialized in main()

# ---------------------------------------------------------------------------
# gRPC Service Implementation (Phase 3: WFQ integrated)
# ---------------------------------------------------------------------------


class NodeServicer(coordinator_pb2_grpc.CoordinatorNodeServiceServicer):
    """gRPC service implementation for the simulated node."""

    async def RouteRequest(self, request, context):
        """Accept a request from the coordinator and enqueue into WFQ."""
        request_id = request.request_id

        # Map enum values to scheduler class names. Keep string handling as a
        # defensive bridge for older coordinators using the manual stubs.
        class_map = {1: "Light", 2: "Medium", 3: "Heavy"}
        raw_class = request.request_class
        request_class = raw_class if raw_class in {"Light", "Medium", "Heavy"} else class_map.get(raw_class, "Medium")

        payload = dict(getattr(request, "__dict__", {}))

        # Create queued request and enqueue
        queued = QueuedRequest(
            request_id=request_id,
            request_class=request_class,
            payload=payload,
        )
        accepted = await scheduler.enqueue(queued)

        if accepted:
            depths = scheduler.get_queue_depths()
            node_state.queue_depth_light = depths.get("Light", 0)
            node_state.queue_depth_medium = depths.get("Medium", 0)
            node_state.queue_depth_heavy = depths.get("Heavy", 0)
        else:
            node_state.total_rejected += 1
            NODE_REQUESTS_REJECTED.labels(node=NODE_NAME).inc()

        return coordinator_pb2.RouteRequestResponse(
            accepted=accepted,
            node_id=NODE_NAME,
            current_queue_depth=scheduler.total_depth,
            rejection_reason="" if accepted else "queue_full"
        )

    async def GetNodeMetrics(self, request, context):
        """Return current node metrics."""
        return coordinator_pb2.NodeMetricsResponse(
            node_id=node_state.name,
            cpu_pct=node_state.cpu_pct,
            memory_pct=node_state.memory_pct,
            queue_depth_light=node_state.queue_depth_light,
            queue_depth_medium=node_state.queue_depth_medium,
            queue_depth_heavy=node_state.queue_depth_heavy,
            queue_depth_total=node_state.queue_depth_total,
            latency_ema_ms=node_state.latency_ema_ms,
            throughput_rps=node_state.throughput_rps,
            capacity_score=node_state.capacity_score,
            vnode_count=node_state.vnode_count,
            total_requests_processed=node_state.total_processed,
            total_requests_rejected=node_state.total_rejected,
            timestamp_ms=int(time.time() * 1000),
            is_healthy=node_state.is_healthy,
            uptime_sec=node_state.uptime_sec,
        )

    async def HealthCheck(self, request, context):
        """Respond to health check."""
        return coordinator_pb2.HealthCheckResponse(
            status="healthy" if node_state.is_healthy else "unhealthy",
            node_id=NODE_NAME,
            uptime_sec=node_state.uptime_sec,
            timestamp_ms=int(time.time() * 1000)
        )

async def serve_grpc(port: int):
    """Start the gRPC server."""
    server = grpc.aio.server()
    coordinator_pb2_grpc.add_CoordinatorNodeServiceServicer_to_server(NodeServicer(), server)
    server.add_insecure_port(f"[::]:{port}")
    await server.start()
    logger.info(f"gRPC server started on port {port}")
    await server.wait_for_termination()


# ---------------------------------------------------------------------------
# HTTP Server for /metrics and /health (using built-in asyncio)
# ---------------------------------------------------------------------------


async def handle_http_request(reader, writer):
    """Minimal HTTP server for Prometheus /metrics and Docker /health."""
    try:
        request_line = await asyncio.wait_for(reader.readline(), timeout=5)
        request_str = request_line.decode("utf-8", errors="replace").strip()

        # Read remaining headers (discard)
        while True:
            line = await asyncio.wait_for(reader.readline(), timeout=5)
            if line == b"\r\n" or line == b"\n" or line == b"":
                break

        # Route request
        if "GET /metrics" in request_str:
            node_state.update_prometheus_metrics()
            body = generate_latest()
            content_type = CONTENT_TYPE_LATEST
            status = "200 OK"
        elif "GET /health" in request_str:
            body = (
                f'{{"status":"healthy","node":"{NODE_NAME}",'
                f'"uptime":{node_state.uptime_sec},'
                f'"capacity":{CAPACITY_SCORE}}}'
            ).encode("utf-8")
            content_type = "application/json"
            status = "200 OK"
        elif "GET /reset" in request_str or "POST /reset" in request_str:
            node_state.reset()
            scheduler.reset()
            global recent_completions
            recent_completions.clear()
            body = b'{"status":"reset"}'
            content_type = "application/json"
            status = "200 OK"
        else:
            body = b"Not Found"
            content_type = "text/plain"
            status = "404 Not Found"

        response = (
            f"HTTP/1.1 {status}\r\n"
            f"Content-Type: {content_type}\r\n"
            f"Content-Length: {len(body)}\r\n"
            f"Connection: close\r\n"
            f"\r\n"
        ).encode("utf-8") + body

        writer.write(response)
        await writer.drain()
    except Exception as e:
        logger.debug(f"HTTP handler error: {e}")
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass


async def start_http_server(port: int):
    """Start the HTTP server for metrics and health."""
    server = await asyncio.start_server(handle_http_request, "0.0.0.0", port)
    logger.info(f"HTTP metrics server started on port {port}")
    async with server:
        await server.serve_forever()


# ---------------------------------------------------------------------------
# Metrics Update Background Task
# ---------------------------------------------------------------------------


# Global list for throughput calculation
recent_completions = []

async def metrics_update_loop():
    """Periodically update Prometheus metrics and simulated CPU (every 1 second)."""
    EMA_ALPHA = 0.3
    global recent_completions

    while True:
        # Update queue depths from scheduler
        depths = scheduler.get_queue_depths()
        node_state.queue_depth_light = depths.get("Light", 0)
        node_state.queue_depth_medium = depths.get("Medium", 0)
        node_state.queue_depth_heavy = depths.get("Heavy", 0)

        # Simulated CPU: proportional to active executor tasks + queue depth
        active = executor.active_count if executor else 0
        total_q = scheduler.total_depth
        max_concurrent = CPU_CORES * 2  # Max concurrent tasks per core
        load_ratio = (active + total_q * 0.1) / max(max_concurrent, 1)
        target_cpu = min(5.0 + load_ratio * 90.0, 98.0)  # 5% idle, up to 98%
        node_state.cpu_pct = EMA_ALPHA * target_cpu + (1 - EMA_ALPHA) * node_state.cpu_pct

        # Simulated memory: slow-growing with request count
        node_state.memory_pct = min(10.0 + node_state.total_processed * 0.001, 80.0)

        # Throughput: completions per second
        now = time.time()
        recent_completions = [t for t in recent_completions if t > now - 10]
        node_state.throughput_rps = len(recent_completions) / 10.0

        node_state.update_prometheus_metrics()
        await asyncio.sleep(1)


async def on_request_completed(result):
    """Callback from executor when a request completes."""
    node_state.total_processed += 1
    
    # Add to recent completions for throughput_rps
    global recent_completions
    recent_completions.append(time.time())
    
    NODE_REQUESTS_PROCESSED.labels(
        node=NODE_NAME, **{"class": result.request_class}
    ).inc()
    NODE_LATENCY.labels(
        node=NODE_NAME, **{"class": result.request_class}
    ).observe(result.execution_time_ms)

    # Update latency EMA
    EMA_ALPHA = 0.3
    node_state.latency_ema_ms = (
        EMA_ALPHA * result.total_time_ms
        + (1 - EMA_ALPHA) * node_state.latency_ema_ms
    )


# ---------------------------------------------------------------------------
# Main Entry Point
# ---------------------------------------------------------------------------


async def main():
    """Start the node: WFQ scheduler + executor + HTTP metrics server."""
    global executor

    logger.info("=" * 60)
    logger.info(f"PAF Node {NODE_NAME} starting up...")
    logger.info(f"  Capacity Score: {CAPACITY_SCORE}")
    logger.info(f"  CPU Cores: {CPU_CORES}")
    logger.info(f"  Memory: {MEMORY_GB} GB")
    logger.info(f"  gRPC Port: {NODE_GRPC_PORT}")
    logger.info(f"  Metrics Port: {NODE_METRICS_PORT}")
    logger.info(f"  WFQ Weights: L=3, M=2, H=1")
    logger.info("=" * 60)

    # Initialize executor with completion callback
    executor = RequestExecutor(
        node_id=NODE_NAME,
        on_completion=on_request_completed,
    )

    # Start all concurrent tasks
    await asyncio.gather(
        start_http_server(NODE_METRICS_PORT),
        serve_grpc(NODE_GRPC_PORT),
        scheduler.run(),
        executor.run(scheduler),
        metrics_update_loop(),
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info(f"Node {NODE_NAME} shutting down...")
        scheduler.stop()
        if executor:
            executor.stop()
