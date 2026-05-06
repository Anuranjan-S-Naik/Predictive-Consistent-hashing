# Architecture Decisions Record

## Overview
This document records all finalized architecture decisions for the Predictive Adaptive
Request Allocation Framework. Every downstream phase references this document as the
single source of truth for system configuration.

**Status:** FROZEN — changes require team review and downstream impact assessment.

---

## 1. Cluster Topology

### 1.1 Node Configuration

| Node | Name | Capacity Score | CPU Cores (sim) | Memory (sim) | gRPC Port |
|------|------|---------------|-----------------|-------------|-----------|
| S1 | `node_s1` | 100 | 4 | 8 GB | 50051 |
| S2 | `node_s2` | 70 | 2 | 4 GB | 50052 |
| S3 | `node_s3` | 150 | 8 | 16 GB | 50053 |
| S4 | `node_s4` | 90 | 3 | 6 GB | 50054 |

**Rationale:** Heterogeneous capacities test whether the allocation engine correctly
favors higher-capacity nodes. S3 has 2.14× the capacity of S2, creating a meaningful
spread for load variance measurement.

### 1.2 Network Architecture

```
Traffic Generator ──HTTP POST──► Coordinator (FastAPI :8000)
                                      │
                                      ├──gRPC──► Node S1 (:50051)
                                      ├──gRPC──► Node S2 (:50052)
                                      ├──gRPC──► Node S3 (:50053)
                                      └──gRPC──► Node S4 (:50054)
                                      │
                                      ├──► Redis (:6379)
                                      ├──► PostgreSQL (:5432)
                                      ├──► InfluxDB (:8086)
                                      └──► Prometheus (:9090) ──► Grafana (:3000)
```

### 1.3 Communication Protocol Boundaries

| Boundary | Protocol | Rationale |
|----------|----------|-----------|
| Traffic Generator → Coordinator | HTTP/REST | Simple, debuggable, standard load-gen tooling compatible |
| Coordinator → Node (dispatch) | gRPC | Low-latency binary RPC; persistent channels with keep-alive |
| Node → Coordinator (completion) | gRPC | Same persistent channel; bidirectional streaming possible |
| Coordinator → Redis | Redis protocol | Sub-ms reads; native sorted set for ring |
| Coordinator → PostgreSQL | SQLAlchemy async | Batched writes; Alembic migrations |
| Coordinator → InfluxDB | InfluxDB line protocol | Batch writes every 10s |
| Prometheus → All services | HTTP scrape | Pull-based; /metrics endpoint on each service |

---

## 2. Hash Ring Design

### 2.1 Hash Function
- **Algorithm:** MurmurHash3 (128-bit)
- **Library:** `mmh3` Python binding
- **Hash space:** 0 to 2^128 - 1 (mapped to ring position)
- **Rationale:** Fastest non-cryptographic hash with excellent uniformity; no collision resistance needed (not security-relevant)

### 2.2 Virtual Node (Vnode) Configuration
- **Base vnode count:** 150 vnodes per node (before capacity scaling)
- **Initial distribution formula:**
  ```
  vnode_count(node) = base_count × (capacity_score / avg_capacity_score)
  ```
- **Example initial distribution:**
  - S1 (cap=100): 150 × (100/102.5) ≈ 146 vnodes
  - S2 (cap=70):  150 × (70/102.5)  ≈ 102 vnodes
  - S3 (cap=150): 150 × (150/102.5) ≈ 220 vnodes
  - S4 (cap=90):  150 × (90/102.5)  ≈ 132 vnodes
  - **Total:** ~600 vnodes across 4 nodes
- **Minimum vnodes per active node:** 10 (prevents starvation)
- **Ring storage:** Redis sorted set `ring:vnodes` (score=hash_position, member=node_id)

### 2.3 Ring Update Strategy
- Ring snapshot cached in coordinator memory (Python dict)
- Cache refreshed every 100ms from Redis
- Atomic ring updates via Redis MULTI/EXEC transactions
- On node removal: all vnodes for that node deleted; ring automatically adjusts

---

## 3. Dynamic Allocation Algorithm (DAA)

### 3.1 DAA Vnode Adjustment Formula
```
vnode_count(node) ∝ available_cpu_capacity × (1 / (1 + queue_depth)) × burst_damping

where:
  available_cpu_capacity = capacity_score × (1 - cpu_pct/100)
  burst_damping = 0.7 if (burst_imminent AND node is current burst_target) else 1.0
```

### 3.2 Adjustment Triggers

| Condition | Action |
|-----------|--------|
| CPU < 50% AND queue < 20% of max | Increase vnodes (node has spare capacity) |
| CPU > 80% OR queue > 80% of max | Decrease vnodes (node is overloaded) |
| CPU > 90% sustained > 30s | Alert; aggressive vnode reduction |
| Node unreachable (health-check fail) | Remove all vnodes; redistribute |

### 3.3 DAA Execution Interval
- **Normal:** Every 10 seconds
- **Triggered by feedback loop:** Immediately when load variance exceeds threshold

---

## 4. Allocation Scoring

### 4.1 Score Formula
```
Score(node) = α × cpu_load + β × (queue_length / max_queue) + γ × latency_ema + δ × predicted_incoming_load
```

### 4.2 Weight Configuration

| Weight | Symbol | Value | Rationale |
|--------|--------|-------|-----------|
| CPU weight | α | 0.35 | CPU is the primary capacity indicator |
| Queue weight | β | 0.30 | Queue depth is the strongest overload signal |
| Latency weight | γ | 0.20 | Latency EMA captures recent responsiveness |
| Forecast weight | δ | 0.15 | Prediction is informative but less reliable than observed metrics |

### 4.3 Selection Rules
- **Primary:** Select node with minimum score
- **Tie-breaking:** Prefer node with lowest physical ID (deterministic)
- **Overflow:** If all candidate scores exceed threshold (0.85) → invoke Chord DHT router
- **Metrics staleness:** If cached metrics are older than 10s, add age_penalty = 0.1 × age_seconds to score

---

## 5. Chord DHT Router

### 5.1 Finger Table Configuration
- **Table size:** ceil(log2(N)) entries per node = ceil(log2(4)) = 2 entries
- **Entry formula:** finger[k] = first node with ID ≥ (n + 2^k) mod 2^m
- **Max hops:** ceil(log2(N)) + 2 = 4 hops maximum
- **Loop detection:** Hop counter incremented on each forward; exceeding max_hops → fallback

### 5.2 Fallback Strategy
- If max hops exceeded: direct assignment to least-connections node (guaranteed termination)
- If finger node unreachable: skip to next finger entry; mark dead node in table

---

## 6. Weighted Fair Queuing (WFQ) Scheduler

### 6.1 Queue Configuration

| Queue | Class | Weight | Max Queue Depth | Simulated Execution Time |
|-------|-------|--------|-----------------|-------------------------|
| High | Light | 3 | 200 | ~50 ms (40–60 ms uniform) |
| Medium | Medium | 2 | 150 | ~200 ms (150–250 ms uniform) |
| Low | Heavy | 1 | 100 | ~1000 ms (800–1200 ms uniform) |

### 6.2 Scheduling Algorithm
- Token-based round-robin across queues respecting weights
- Per cycle: serve 3 Light, 2 Medium, 1 Heavy (from non-empty queues)
- Queue full → reject with 503; increment rejection counter; trigger DAA feedback

---

## 7. Feedback & Self-Optimization

### 7.1 Feedback Loop Configuration
- **Execution interval:** Every 60 seconds
- **Data source:** Last 60s of metrics from InfluxDB
- **Actions:**
  - Compute per-node load variance
  - If variance > threshold → trigger immediate DAA recalculation
  - If classifier accuracy on last 1000 predictions < 80% → log drift warning
  - Write all actions to `feedback_events` PostgreSQL table

### 7.2 Drift Detection
- **Method:** Compare predicted_class against ground-truth (derived from actual execution_ms)
- **Threshold:** Accuracy < 80% over rolling 1000-request window
- **Action:** Log warning; write to feedback_events; (optional future: trigger retrain)

---

## 8. Feature Vector Specification

The ML classifier receives an 8-dimensional normalized feature vector:

| Index | Feature | Source | Normalization |
|-------|---------|--------|--------------|
| 0 | `payload_bytes` | HTTP request body length | Min-max to [0, 1] with max=131072 |
| 1 | `cpu_estimate` | Heuristic from endpoint + payload | Min-max to [0, 1] |
| 2 | `endpoint_id` | Lookup table: endpoint path → integer | Integer encoding (0–4) |
| 3 | `requests_last_5s` | Redis sliding window counter | Min-max to [0, 1] with max=200 |
| 4 | `avg_latency_ema` | Exponential moving average (α=0.3) | Min-max to [0, 1] with max=5000ms |
| 5 | `queue_depth` | Prometheus: current coordinator queue | Min-max to [0, 1] with max=500 |
| 6 | `hour_of_day` | Arrival timestamp hour | Divided by 24 |
| 7 | `is_burst` | True if requests_last_5s > 2× moving average | Binary: 0 or 1 |

---

## 9. Redis Key Schema

| Key Pattern | Redis Type | TTL | Content | Updated By |
|-------------|-----------|-----|---------|-----------|
| `ring:vnodes` | Sorted Set | No expiry | score=hash_position, member=node_id | DAA (every 10s) |
| `metrics:{node_id}` | Hash | 10s | cpu_pct, queue_depth, latency_ema, vnode_count | Prometheus scraper |
| `forecast:latest` | String | 15s | JSON: {predicted_heavy, burst_imminent, ts} | GRU forecaster (every 5s) |
| `window:heavy:{ts_bucket}` | Counter | 60s | Count of heavy requests in 5s bucket | Feature pipeline |
| `window:total:{ts_bucket}` | Counter | 60s | Count of all requests in 5s bucket | Feature pipeline |
| `ring:snapshot_version` | String | No expiry | Monotonic counter for cache invalidation | DAA |

---

## 10. Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COORDINATOR_HOST` | `0.0.0.0` | Coordinator bind address |
| `COORDINATOR_PORT` | `8000` | FastAPI HTTP port |
| `COORDINATOR_GRPC_PORT` | `50050` | Coordinator gRPC listen port |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection string |
| `POSTGRES_DSN` | `postgresql+asyncpg://paf:paf_secret@postgres:5432/paf_db` | PostgreSQL async DSN |
| `INFLUXDB_URL` | `http://influxdb:8086` | InfluxDB endpoint |
| `INFLUXDB_TOKEN` | (set in .env) | InfluxDB authentication token |
| `INFLUXDB_ORG` | `paf` | InfluxDB organization |
| `INFLUXDB_BUCKET_METRICS` | `metrics` | InfluxDB metrics bucket |
| `INFLUXDB_BUCKET_FORECAST` | `forecast` | InfluxDB forecast bucket |
| `PROMETHEUS_PORT` | `9090` | Prometheus scrape port |
| `GRAFANA_PORT` | `3000` | Grafana UI port |
| `MODEL_PATH` | `/app/models/` | Directory for serialized ML models |
| `SCENARIO_FILE` | `/app/scenarios/default.yaml` | Active traffic scenario |
| `FEEDBACK_INTERVAL_SEC` | `60` | Feedback loop execution interval |
| `DAA_INTERVAL_SEC` | `10` | DAA vnode recalculation interval |
| `FORECASTER_INTERVAL_SEC` | `5` | GRU forecaster inference interval |
| `VNODE_BASE_COUNT` | `150` | Base virtual nodes per node |
| `VNODE_MIN_COUNT` | `10` | Minimum vnodes per active node |
| `ALLOCATION_OVERFLOW_THRESHOLD` | `0.85` | Score threshold to trigger Chord routing |
| `MAX_CHORD_HOPS` | `4` | Maximum Chord routing hops before fallback |
| `API_KEY` | (set in .env) | Traffic generator API key |
| `ADMIN_API_KEY` | (set in .env) | Admin endpoint API key |
| `LOG_LEVEL` | `INFO` | Python logging level |
| `BATCH_INSERT_SIZE` | `1000` | PostgreSQL batch insert buffer size |
| `BATCH_INSERT_INTERVAL_SEC` | `1` | PostgreSQL batch flush interval |
