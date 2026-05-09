"""
Predictive Adaptive Request Allocation Framework — Coordinator
==============================================================
FastAPI application entrypoint.

Responsibilities:
  - HTTP endpoints: /api/v1/request, /api/v1/nodes, /api/v1/ring, /api/v1/forecast
  - Prometheus metrics middleware
  - X-API-Key authentication middleware
  - gRPC channel pool to all server nodes
  - Phase 3: Full request pipeline (feature extraction → classification → routing)
  - Health check endpoint
"""

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Dict, Optional

# Phase 3 pipeline imports
from coordinator.routing.hash_ring import ConsistentHashRing
from coordinator.routing.allocation_engine import AllocationEngine
from coordinator.routing.chord_router import ChordRouter
from coordinator.intake.feature_pipeline import FeaturePipeline
from coordinator.intake.router import RequestRouter

# Phase 4 datastore imports
from coordinator.db.postgres_writer import PostgresBatchWriter, RequestRecord, PredictionRecord
from coordinator.db.redis_cache import RedisRingCache, RedisMetricsCache
from coordinator.db.influxdb_client import InfluxDBClient

# DAA + Feedback imports
from coordinator.routing.daa import DynamicAdaptiveAllocator
from coordinator.feedback.optimizer import FeedbackOptimizer

# Phase 5: ML imports
from coordinator.ml.classifier import RequestClassifier
from coordinator.ml.forecaster import TrafficForecaster

import grpc
import yaml
from fastapi import FastAPI, Request, Response, HTTPException, Security, Depends
from fastapi.security import APIKeyHeader
from prometheus_client import (
    Counter,
    Histogram,
    Gauge,
    Info,
    generate_latest,
    CONTENT_TYPE_LATEST,
)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
CONFIG_PATH = os.getenv("CONFIG_PATH", "config.yaml")
API_KEY = os.getenv("API_KEY", "dev-api-key-change-me")
ADMIN_API_KEY = os.getenv("ADMIN_API_KEY", "dev-admin-key-change-me")
COORDINATOR_HOST = os.getenv("COORDINATOR_HOST", "0.0.0.0")
COORDINATOR_PORT = int(os.getenv("COORDINATOR_PORT", "8000"))

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)
logger = logging.getLogger("coordinator")


def load_config(path: str) -> dict:
    """Load the master YAML config file."""
    try:
        with open(path, "r") as f:
            return yaml.safe_load(f)
    except FileNotFoundError:
        logger.warning(f"Config file not found at {path}, using defaults")
        return {}


# ---------------------------------------------------------------------------
# Prometheus Metrics
# ---------------------------------------------------------------------------

REQUEST_COUNT = Counter(
    "paf_coordinator_requests_total",
    "Total requests received by coordinator",
    ["method", "endpoint", "status"],
)
REQUEST_LATENCY = Histogram(
    "paf_request_latency_ms",
    "Request latency in milliseconds",
    ["method", "endpoint"],
    buckets=[5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
)
REQUESTS_CLASSIFIED = Counter(
    "paf_requests_classified_total",
    "Requests classified by ML engine",
    ["class"],
)
CLASSIFIER_CONFIDENCE = Gauge(
    "paf_classifier_confidence_avg",
    "Average classifier confidence (rolling)",
)
CLASSIFIER_FALLBACK = Counter(
    "paf_classifier_fallback_total",
    "Requests falling back to Medium due to low confidence",
)
CHORD_OVERFLOW = Counter(
    "paf_chord_overflow_total",
    "Requests requiring Chord multi-hop routing",
)
ROUTING_HOPS = Histogram(
    "paf_routing_hops",
    "Number of routing hops per request",
    buckets=[1, 2, 3, 4, 5],
)
ACTIVE_NODES = Gauge(
    "paf_active_nodes",
    "Number of active nodes in the cluster",
)
COORDINATOR_INFO = Info(
    "paf_coordinator",
    "Coordinator build information",
)

# ---------------------------------------------------------------------------
# gRPC Channel Pool
# ---------------------------------------------------------------------------


class GrpcChannelPool:
    """Maintains persistent gRPC channels to all server nodes."""

    def __init__(self):
        self.channels: Dict[str, grpc.aio.Channel] = {}
        self.node_configs: list = []

    async def initialize(self, nodes: list):
        """Create persistent gRPC channels for all configured nodes.

        Args:
            nodes: List of node config dicts with 'name' and 'grpc_address'.
        """
        self.node_configs = nodes
        for node in nodes:
            name = node["name"]
            address = node["grpc_address"]
            options = [
                ("grpc.keepalive_time_ms", 10000),
                ("grpc.keepalive_timeout_ms", 5000),
                ("grpc.keepalive_permit_without_calls", True),
                ("grpc.http2.max_pings_without_data", 0),
            ]
            channel = grpc.aio.insecure_channel(address, options=options)
            self.channels[name] = channel
            logger.info(f"gRPC channel created: {name} → {address}")

        ACTIVE_NODES.set(len(self.channels))

    async def close(self):
        """Close all gRPC channels."""
        for name, channel in self.channels.items():
            await channel.close()
            logger.info(f"gRPC channel closed: {name}")
        self.channels.clear()

    def get_channel(self, node_name: str) -> Optional[grpc.aio.Channel]:
        """Get the gRPC channel for a specific node."""
        return self.channels.get(node_name)

    def get_all_channels(self) -> Dict[str, grpc.aio.Channel]:
        """Get all active gRPC channels."""
        return self.channels


# ---------------------------------------------------------------------------
# Application State
# ---------------------------------------------------------------------------

grpc_pool = GrpcChannelPool()
app_config: dict = {}

# Phase 3 pipeline components (initialized at startup)
hash_ring = ConsistentHashRing()
allocation_engine = AllocationEngine()
chord_router = ChordRouter()
feature_pipeline = FeaturePipeline()
request_router: Optional[RequestRouter] = None

# Phase 4 datastore clients (initialized at startup)
postgres_writer: Optional[PostgresBatchWriter] = None
redis_ring_cache: Optional[RedisRingCache] = None
redis_metrics_cache: Optional[RedisMetricsCache] = None
influxdb_client: Optional[InfluxDBClient] = None

# DAA + Feedback (initialized at startup)
daa_engine: Optional[DynamicAdaptiveAllocator] = None
feedback_optimizer: Optional[FeedbackOptimizer] = None

# Phase 5: ML components (initialized at startup)
ml_classifier: Optional[RequestClassifier] = None
ml_forecaster: Optional[TrafficForecaster] = None

# ---------------------------------------------------------------------------
# Lifespan (startup / shutdown)
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: initialize resources on startup, cleanup on shutdown."""
    global app_config, hash_ring, allocation_engine, chord_router, feature_pipeline, request_router
    global postgres_writer, redis_ring_cache, redis_metrics_cache, influxdb_client
    global daa_engine, feedback_optimizer
    global ml_classifier, ml_forecaster

    # --- Startup ---
    logger.info("=" * 60)
    logger.info("PAF Coordinator starting up...")
    logger.info("=" * 60)

    # Load config
    app_config = load_config(CONFIG_PATH)
    COORDINATOR_INFO.info({
        "version": "0.1.0",
        "config_path": CONFIG_PATH,
    })

    # Initialize gRPC channel pool
    nodes = app_config.get("cluster", {}).get("nodes", [])
    if nodes:
        await grpc_pool.initialize(nodes)
    else:
        logger.warning("No nodes configured in config.yaml")

    # --- Phase 3: Initialize pipeline components ---
    hr_cfg = app_config.get("hash_ring", {})
    hash_ring = ConsistentHashRing(
        vnode_base_count=hr_cfg.get("vnode_base_count", 150),
        vnode_min_count=hr_cfg.get("vnode_min_count", 10),
    )
    for node in nodes:
        hash_ring.add_node(node["name"], node.get("capacity_score", 100))
    logger.info(f"Hash ring initialized: {hash_ring}")

    allocation_engine = AllocationEngine(config=app_config)
    # Seed initial metrics for each node
    for node in nodes:
        allocation_engine.update_node_metrics(node["name"], {
            "cpu_pct": 5.0, "queue_depth": 0, "queue_max": 450,
            "latency_ema_ms": 0.0, "latency_max_ms": 5000.0,
            "predicted_load": 0.0,
        })

    chord_cfg = app_config.get("chord", {})
    chord_router = ChordRouter(
        max_hops=chord_cfg.get("max_hops", 4),
        overflow_threshold=app_config.get("allocation", {}).get("overflow_threshold", 0.85),
    )
    chord_router.build_finger_tables([n["name"] for n in nodes])

    feature_pipeline = FeaturePipeline(config=app_config)

    # --- Phase 5: Initialize ML components ---
    ml_classifier = RequestClassifier(config=app_config)
    classifier_ok = ml_classifier.load()
    if classifier_ok:
        logger.info("Phase 5: XGBoost classifier loaded successfully")
    else:
        logger.warning("Phase 5: Classifier not available, using heuristic fallback")

    request_router = RequestRouter(
        hash_ring=hash_ring,
        allocation_engine=allocation_engine,
        chord_router=chord_router,
        feature_pipeline=feature_pipeline,
        classifier=ml_classifier,
    )
    logger.info("Phase 3+5 pipeline initialized: FeaturePipeline → Classifier → AllocationEngine → ChordRouter")

    # --- Phase 4: Initialize datastore clients ---
    ds_cfg = app_config.get("datastores", {})

    # PostgreSQL batch writer
    pg_cfg = ds_cfg.get("postgresql", {})
    postgres_writer = PostgresBatchWriter(
        db_pool=None,  # Real pool initialized when asyncpg connects
        batch_size=pg_cfg.get("batch_size", 1000),
        batch_interval_sec=pg_cfg.get("batch_interval_sec", 1.0),
    )
    await postgres_writer.start()

    # Redis ring and metrics caches
    redis_ring_cache = RedisRingCache(redis_client=None)
    redis_metrics_cache = RedisMetricsCache(
        redis_client=None,
        metrics_prefix=ds_cfg.get("redis", {}).get("metrics_key_prefix", "metrics:"),
        metrics_ttl_sec=ds_cfg.get("redis", {}).get("metrics_ttl_sec", 10),
    )
    redis_metrics_cache.set_node_names([n["name"] for n in nodes])
    await redis_ring_cache.start()
    await redis_metrics_cache.start()

    # InfluxDB time-series client
    influx_cfg = ds_cfg.get("influxdb", {})
    influxdb_client = InfluxDBClient(
        url=influx_cfg.get("url", "http://influxdb:8086"),
        org=influx_cfg.get("org", "paf"),
        bucket_metrics=influx_cfg.get("bucket_metrics", "metrics"),
        bucket_forecast=influx_cfg.get("bucket_forecast", "forecast"),
        batch_interval_sec=influx_cfg.get("batch_write_interval_sec", 10),
    )
    await influxdb_client.connect()
    await influxdb_client.start()

    logger.info("Phase 4 datastores initialized: PostgreSQL batch writer, Redis caches, InfluxDB")

    # --- DAA + Feedback: Initialize ---
    daa_engine = DynamicAdaptiveAllocator(
        hash_ring=hash_ring,
        allocation_engine=allocation_engine,
        config=app_config,
    )
    await daa_engine.start()

    feedback_optimizer = FeedbackOptimizer(
        allocation_engine=allocation_engine,
        daa=daa_engine,
        config=app_config,
    )
    await feedback_optimizer.start()

    logger.info("DAA + Feedback optimizer initialized")

    # --- Phase 5: Initialize forecaster (after DAA so it can notify it) ---
    ml_forecaster = TrafficForecaster(
        config=app_config,
        daa_engine=daa_engine,
        redis_client=redis_ring_cache,
        influxdb_client=influxdb_client,
    )
    forecaster_ok = ml_forecaster.load()
    if forecaster_ok:
        logger.info("Phase 5: GRU forecaster loaded successfully")
    else:
        logger.warning("Phase 5: Forecaster not available, using EMA fallback")
    await ml_forecaster.start()

    # Wire forecaster into the request router
    request_router.forecaster = ml_forecaster

    logger.info("Phase 5 ML pipeline fully initialized")
    logger.info(f"Coordinator ready on {COORDINATOR_HOST}:{COORDINATOR_PORT}")

    yield  # Application is running

    # --- Shutdown ---
    logger.info("Coordinator shutting down...")
    if ml_forecaster:
        await ml_forecaster.stop()
    if daa_engine:
        await daa_engine.stop()
    if feedback_optimizer:
        await feedback_optimizer.stop()
    if postgres_writer:
        await postgres_writer.stop()
    if redis_ring_cache:
        await redis_ring_cache.stop()
    if redis_metrics_cache:
        await redis_metrics_cache.stop()
    if influxdb_client:
        await influxdb_client.stop()
    await grpc_pool.close()
    logger.info("Shutdown complete.")


# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------

app = FastAPI(
    title="PAF Coordinator",
    description="Predictive Adaptive Request Allocation Framework — Coordinator API",
    version="0.1.0",
    lifespan=lifespan,
)

# ---------------------------------------------------------------------------
# CORS Middleware — allow frontend to reach the API
# ---------------------------------------------------------------------------

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Authentication Middleware
# ---------------------------------------------------------------------------

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)):
    """Validate X-API-Key header for external endpoints."""
    if api_key is None or api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return api_key


async def verify_admin_key(api_key: str = Security(api_key_header)):
    """Validate admin API key for privileged endpoints."""
    if api_key is None or api_key != ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin API key")
    return api_key


# ---------------------------------------------------------------------------
# Prometheus Metrics Middleware
# ---------------------------------------------------------------------------


@app.middleware("http")
async def prometheus_middleware(request: Request, call_next):
    """Track request count and latency for Prometheus scraping."""
    start = time.perf_counter()
    response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000

    # Skip metrics endpoint itself to avoid recursion
    path = request.url.path
    if path != "/metrics":
        REQUEST_COUNT.labels(
            method=request.method,
            endpoint=path,
            status=response.status_code,
        ).inc()
        REQUEST_LATENCY.labels(
            method=request.method,
            endpoint=path,
        ).observe(duration_ms)

    return response


# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------


@app.get("/health", tags=["system"])
async def health_check():
    """Health check endpoint for Docker health checks and load balancers."""
    return {
        "status": "healthy",
        "service": "coordinator",
        "timestamp": time.time(),
        "active_nodes": len(grpc_pool.channels),
    }


# ---------------------------------------------------------------------------
# Prometheus Metrics Endpoint
# ---------------------------------------------------------------------------


@app.get("/metrics", tags=["system"], include_in_schema=False)
async def metrics():
    """Prometheus metrics scrape endpoint."""
    return Response(
        content=generate_latest(),
        media_type=CONTENT_TYPE_LATEST,
    )


# ---------------------------------------------------------------------------
# API Endpoints — Phase 3 Live Pipeline
# ---------------------------------------------------------------------------


@app.post("/api/v1/request", tags=["requests"])
async def submit_request(request: Request, _key: str = Depends(verify_api_key)):
    """Submit a new request for classification and routing.

    Phase 3+4: Full pipeline with async datastore logging.
    """
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    if request_router is None:
        raise HTTPException(status_code=503, detail="Pipeline not initialized")

    result = await request_router.route_request(body)

    # Update Prometheus metrics
    predicted_class = result.get("predicted_class", "Medium")
    REQUESTS_CLASSIFIED.labels(**{"class": predicted_class}).inc()
    CLASSIFIER_CONFIDENCE.set(result.get("confidence", 0.0))
    ROUTING_HOPS.observe(result.get("routing_hops", 1))

    if result.get("routing_method") == "chord_router":
        CHORD_OVERFLOW.inc()

    # Phase 4: Async buffer to PostgreSQL (non-blocking)
    if postgres_writer:
        await postgres_writer.buffer_request(RequestRecord(
            request_id=result.get("request_id", ""),
            endpoint_path=body.get("endpoint", "/api/status"),
            method=body.get("method", "GET"),
            payload_bytes=body.get("payload_bytes", 0),
            source_id=body.get("source_id", ""),
        ))
        await postgres_writer.buffer_prediction(PredictionRecord(
            request_id_str=result.get("request_id", ""),
            predicted_class=predicted_class,
            confidence=result.get("confidence", 0.0),
            node_assigned=result.get("assigned_node", ""),
            routing_hops=result.get("routing_hops", 1),
            assigned_by=result.get("routing_method", "allocation_engine"),
            allocation_score=result.get("allocation_score", 0.0),
        ))

    return result


@app.get("/api/v1/datastores", tags=["system"])
async def datastore_health():
    """Return health and stats for all Phase 4 datastores."""
    return {
        "postgres_writer": postgres_writer.get_stats() if postgres_writer else None,
        "redis_ring_cache": redis_ring_cache.get_stats() if redis_ring_cache else None,
        "redis_metrics_cache": redis_metrics_cache.get_stats() if redis_metrics_cache else None,
        "influxdb_client": influxdb_client.get_stats() if influxdb_client else None,
    }


@app.get("/api/v1/nodes", tags=["cluster"])
async def list_nodes():
    """List all nodes with current metrics and vnode counts.

    Returns node configuration and gRPC channel status.
    """
    nodes = app_config.get("cluster", {}).get("nodes", [])
    node_list = []
    for node in nodes:
        name = node["name"]
        channel = grpc_pool.get_channel(name)
        node_list.append({
            "name": name,
            "capacity_score": node.get("capacity_score"),
            "grpc_address": node.get("grpc_address"),
            "grpc_connected": channel is not None,
            "cpu_cores": node.get("cpu_cores"),
            "memory_gb": node.get("memory_gb"),
        })
    return {"nodes": node_list, "total": len(node_list)}


@app.get("/api/v1/ring", tags=["cluster"])
async def get_ring():
    """Return current hash ring snapshot with per-node vnode counts."""
    return hash_ring.get_ring_snapshot()


@app.get("/api/v1/forecast", tags=["ml"])
async def get_forecast():
    """Return latest forecaster output.

    **Phase 2 stub** — returns empty forecast.
    Will be populated in Phase 5 after GRU forecaster integration.
    """
    return {
        "status": "stub",
        "message": "Forecaster not yet initialized (Phase 5)",
        "predicted_heavy_count": None,
        "burst_imminent": False,
        "forecast_age_sec": None,
    }


@app.get("/api/v1/daa", tags=["system"])
async def get_daa_status():
    """Return current DAA (Dynamic Adaptive Allocation) status.

    Shows vnode adjustment history, per-node factors, and burst state.
    """
    if daa_engine:
        return daa_engine.get_status()
    return {"running": False, "message": "DAA not initialized"}


@app.get("/api/v1/allocation", tags=["system"])
async def get_allocation_status():
    """Return live allocation engine weights, per-node scores, and class stats."""
    weights = {
        "alpha_cpu": allocation_engine.alpha,
        "beta_queue": allocation_engine.beta,
        "gamma_latency": allocation_engine.gamma,
        "delta_forecast": allocation_engine.delta,
        "overflow_threshold": allocation_engine.overflow_threshold,
    }
    scores = allocation_engine.get_all_scores()
    node_metrics = allocation_engine.get_all_metrics()

    # Read request class counts from Prometheus counters
    class_counts = {}
    try:
        for cls in ["Light", "Medium", "Heavy"]:
            sample = REQUESTS_CLASSIFIED.labels(**{"class": cls})
            class_counts[cls] = sample._value.get()
    except Exception:
        class_counts = {"Light": 0, "Medium": 0, "Heavy": 0}

    total_classified = sum(class_counts.values()) or 1
    class_distribution = {
        cls: round((count / total_classified) * 100, 1)
        for cls, count in class_counts.items()
    }

    return {
        "weights": weights,
        "scores": {k: round(v, 4) for k, v in scores.items()},
        "node_metrics": node_metrics,
        "class_counts": class_counts,
        "class_distribution": class_distribution,
    }



@app.get("/api/v1/feedback", tags=["system"])
async def get_feedback_status():
    """Return feedback optimizer status.

    Shows load variance, CPU alerts, and recent corrective actions.
    """
    if feedback_optimizer:
        return feedback_optimizer.get_status()
    return {"running": False, "message": "Feedback optimizer not initialized"}


@app.get("/api/v1/forecast", tags=["ml"])
async def get_forecast_status():
    """Return live traffic forecaster status.

    Shows model info, last prediction, burst state, and window fill.
    """
    if ml_forecaster:
        return ml_forecaster.get_status()
    return {"running": False, "message": "Forecaster not initialized"}


@app.get("/api/v1/classifier", tags=["ml"])
async def get_classifier_status():
    """Return ML classifier status.

    Shows model info, prediction counts, inference latency, and fallback rate.
    """
    if ml_classifier:
        return ml_classifier.get_stats()
    return {"loaded": False, "message": "Classifier not initialized"}



@app.get("/api/v1/nodes/{node_id}", tags=["cluster"])
async def get_node_detail(node_id: str):
    """Get detailed metrics for a specific node."""
    nodes = app_config.get("cluster", {}).get("nodes", [])
    node_cfg = next((n for n in nodes if n["name"] == node_id), None)
    if not node_cfg:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")

    metrics = allocation_engine.get_node_metrics(node_id)
    score = allocation_engine.compute_score(node_id)
    vnode_count = hash_ring.get_vnode_count(node_id)

    return {
        "node_id": node_id,
        "capacity_score": node_cfg.get("capacity_score"),
        "cpu_cores": node_cfg.get("cpu_cores"),
        "memory_gb": node_cfg.get("memory_gb"),
        "grpc_address": node_cfg.get("grpc_address"),
        "grpc_connected": grpc_pool.get_channel(node_id) is not None,
        "vnode_count": vnode_count,
        "allocation_score": round(score, 4),
        "metrics": metrics,
    }


@app.post("/api/v1/admin/retrain", tags=["admin"], status_code=501)
async def trigger_retrain(_key: str = Depends(verify_admin_key)):
    """Trigger manual model retraining.

    **Phase 2 stub** — returns 501 Not Implemented.
    Will be implemented in Phase 5+.
    """
    return {
        "status": "not_implemented",
        "message": "Model retraining not yet implemented (Phase 5+)",
    }


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=COORDINATOR_HOST,
        port=COORDINATOR_PORT,
        log_level=LOG_LEVEL.lower(),
        reload=False,
    )

