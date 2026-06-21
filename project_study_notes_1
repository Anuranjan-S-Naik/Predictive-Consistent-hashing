# 📖 Project Study Notes — Predictive Adaptive Request Allocation Framework

## 🎯 What Is This Project?

An **AI-driven distributed request management system** that:
1. **Classifies** incoming requests by resource weight (Light / Medium / Heavy) using XGBoost
2. **Forecasts** short-term traffic bursts using a GRU neural network
3. **Dynamically routes** each request to the optimal server node via a predictive consistent hash ring
4. All done **proactively** — before overload conditions arise

> [!IMPORTANT]
> This is a **research simulation framework**, not a SaaS product. No frontend UI needed — Grafana is the observability layer. No auth/payments/mobile.

---

## 🏗️ Architecture at a Glance

```
Traffic Generator → Coordinator (FastAPI + ML + Hash Ring + DAA) → Server Nodes (S1-S4, WFQ Scheduler)
                                                                          ↓
                                                              Prometheus / InfluxDB / Feedback Engine
```

- **Single-machine simulation** mimicking a distributed cluster
- Each node = independent Python process/thread
- Central **coordinator** hosts: ML engines, DAA, hash ring, allocation engine
- Communication: **gRPC** between coordinator ↔ nodes

---

## 📦 The 10 Core Modules

| # | Module | Key Technology | Purpose |
|---|--------|---------------|---------|
| 1 | Request Intake & Feature Extraction | FastAPI, Redis | Extract 8-dim feature vector from raw HTTP requests |
| 2 | ML Classification Engine | XGBoost, scikit-learn | Label requests: Light / Medium / Heavy (<1ms inference) |
| 3 | Traffic Flow Forecaster | PyTorch GRU (2-layer, 64 hidden) | Predict heavy requests in next 10s; runs every 5s |
| 4 | Predictive Consistent Hash Ring + DAA | MurmurHash3 (mmh3), Redis | Dynamic virtual node placement; adjusts vnodes every 10s |
| 5 | Dynamic Allocation Engine | Custom scoring | Score = α·CPU + β·Queue + γ·Latency + δ·PredictedLoad |
| 6 | Chord-Inspired DHT Router | Finger tables | Overflow routing; max hops = ceil(log2(N))+2 |
| 7 | WFQ Scheduler (per node) | asyncio queues | Weighted Fair Queuing: Light=3, Medium=2, Heavy=1 |
| 8 | Feedback & Self-Optimization | Prometheus, InfluxDB | 60s cycle: metrics → vnode adjustment → drift detection |
| 9 | Simulation / Traffic Generator | asyncio + aiohttp | 4 patterns: Uniform, Bursty, Flash Crowd, Random |
| 10 | Evaluation Baselines | Python | Round-Robin, Least-Connections, Static Consistent Hashing |

---

## 🔑 Key Formulas & Thresholds

### Allocation Score
```
Score(node) = α·(cpu_load) + β·(queue_length/max_queue) + γ·(latency_ema) + δ·(predicted_incoming_load)
α=0.35, β=0.30, γ=0.20, δ=0.15
```

### DAA Vnode Count
```
vnode_count(node) ∝ available_cpu_capacity × (1 / (1 + queue_depth)) × (burst_damping if burst_imminent)
- Increase when: CPU < 50% AND queue < 20%
- Decrease when: CPU > 80% OR queue > threshold
- Min 10 vnodes per active node
```

### Chord Finger Table
```
finger[k] = first node with ID ≥ (n + 2^k) mod 2^m, k=0..log2(N)
```

---

## 💾 Data Stores

| Store | Purpose | Key Data |
|-------|---------|----------|
| **Redis** | Live metrics cache, ring state | `ring:vnodes` (sorted set), `metrics:{node_id}`, `forecast:latest` |
| **InfluxDB** | Time-series metrics for forecaster | `request_rate`, `node_metrics`, `traffic_forecast` |
| **PostgreSQL** | Request logs, experiments, feedback | Tables: `nodes`, `requests`, `predictions`, `experiments`, `feedback_events` |

---

## 📋 The 8-Phase Execution Plan (35+ Tasks)

### Phase 1 — PLANNING
| Task | What | Critical? |
|------|------|-----------|
| P1-T1 | Define simulation scenarios & metrics (YAML specs) | Parallel |
| P1-T2 | Finalize architecture & config schema | ⚠ CRITICAL — everything derives from this |
| P1-T3 | Define gRPC proto contracts | ⚠ CRITICAL — interface contract |
| P1-T4 | Define PostgreSQL schema & Alembic migrations | Parallel |

### Phase 2 — PROJECT SETUP & INFRASTRUCTURE
| Task | What | Depends On |
|------|------|------------|
| P2-T1 | Create repo structure & Docker Compose | ⚠ CRITICAL | 
| P2-T2 | Configure Prometheus + Grafana dashboards | P2-T1 |
| P2-T3 | Configure Redis + InfluxDB + PostgreSQL | P2-T1, P1-T4 |
| P2-T4 | Bootstrap FastAPI coordinator skeleton | P2-T1, P1-T3 |
| P2-T5 | Bootstrap node process skeleton | P2-T1, P1-T3 |

### Phase 3 — BACKEND CORE DEVELOPMENT (MVP = end of this phase)
| Task | What | Depends On |
|------|------|------------|
| P3-T1 | Static consistent hash ring (baseline) | ⚠ CRITICAL |
| P3-T2 | WFQ scheduler inside each node | P2-T5 |
| P3-T3 | Traffic generator (4 patterns) | P2-T4 |
| P3-T4 | Request intake & feature extraction pipeline | P3-T1 |
| P3-T5 | Allocation engine (score-based, no ML) | P3-T4, P3-T1 |
| P3-T6 | Chord finger table & multi-hop router | P3-T5 |
| P3-T7 | Baseline benchmark & collect training data | ⚠ CRITICAL — ML needs this |

### Phase 4 — DATABASE VALIDATION
| Task | What |
|------|------|
| P4-T1 | Validate PostgreSQL write performance at 500 RPS |
| P4-T2 | Validate Redis ring & metrics reads under load |
| P4-T3 | Validate InfluxDB time-series pipeline |

### Phase 5 — AI/ML INTEGRATION
| Task | What | Critical? |
|------|------|-----------|
| P5-T1 | Train XGBoost classifier (target >88% accuracy) | Parallel |
| P5-T2 | Train GRU forecaster (MAE within 15%) | Parallel |
| P5-T3 | Integrate classifier into coordinator (<1ms) | Needs P5-T1 |
| P5-T4 | Integrate forecaster as background thread | Needs P5-T2 |
| P5-T5 | DAA — dynamic vnode adjustment | ⚠ CRITICAL — core innovation |
| P5-T6 | Activate δ·PredictedLoad in allocation score | Needs P5-T5 |
| P5-T7 | Feedback self-optimization loop (60s cycle) | Deferrable |

### Phase 6 — TESTING
| Task | What |
|------|------|
| P6-T1 | Unit tests (pytest, >80% coverage) |
| P6-T2 | Integration tests (4 scenarios) |
| P6-T3 | ML model quality tests |
| P6-T4 | Load tests: 4 scenarios × 4 modes = 16 runs | ⚠ CRITICAL |

### Phase 7 — DEPLOYMENT (Research Environment)
| Task | What |
|------|------|
| P7-T1 | Finalize Docker Compose with resource limits |
| P7-T2 | Experiment runner & reproducibility script |
| P7-T3 | Model versioning & rollback procedure |

### Phase 8 — POST-LAUNCH (Optional/Future)
| Task | What |
|------|------|
| P8-T1 | Online model retraining pipeline |
| P8-T2 | Scale to 8/16 nodes |
| P8-T3 | RL for weight tuning (α/β/γ/δ) |

---

## 📂 Target Folder Structure

```
predictive-alloc-framework/
├── coordinator/          # FastAPI + ML + routing logic
│   ├── main.py
│   ├── intake/           # Feature pipeline
│   ├── ml/               # Classifier + forecaster + training scripts
│   ├── routing/          # Hash ring, DAA, allocation engine, Chord router
│   ├── feedback/         # Optimization loop
│   └── grpc/             # Proto + generated stubs
├── node/                 # Per-node process (gRPC server + WFQ + executor)
├── traffic_generator/    # Async request injector + scenario YAMLs
├── evaluation/           # Baselines + benchmark runner
├── models/               # Serialized ML models
├── infra/                # Docker Compose, Prometheus, Grafana configs
├── db/                   # Alembic migrations
├── tests/                # unit/ integration/ load/
├── .env.example
├── requirements.txt
└── README.md
```

---

## ⏱️ Timeline (10 Weeks)

| Week | Focus |
|------|-------|
| 1 | Docker Compose + node pool + gRPC stubs |
| 2 | Static hash ring + baselines + traffic generator |
| 3 | Feature pipeline + XGBoost training + inference |
| 4 | WFQ scheduler + class-aware routing |
| 5 | GRU forecaster training + background inference |
| 6 | DAA vnode adjustment + predictive hash ring |
| 7 | Chord finger table + multi-hop routing |
| 8 | Feedback engine + 60s optimization cycle |
| 9 | Full evaluation — all scenarios vs all baselines |
| 10 | Tuning, edge-cases, documentation, final report |

---

## 🚨 7 Critical Path Tasks

1. **P1-T2** — Architecture & Config Schema (everything derives from this)
2. **P1-T3** — gRPC Proto Contracts (coordinator↔node interface)
3. **P2-T1** — Docker Compose (nothing runs without infra)
4. **P3-T1** — Static Hash Ring (baseline + training data generation)
5. **P3-T7** — Baseline Benchmark + Training Data (ML can't train without this)
6. **P5-T5** — DAA Vnode Adjustment (core project innovation)
7. **P6-T4** — 16-Run Load Benchmark (primary research evidence)

---

## 🛡️ Error Handling Strategy

| Failure | Recovery |
|---------|----------|
| Node unreachable | Remove from ring; redistribute vnodes |
| Classifier fails | Fall back to Medium class |
| Forecaster fails | Use last valid forecast; mark stale after 30s |
| All nodes overloaded | Queue at least-loaded with priority flag |
| Finger-table loop | Drop to direct least-connections fallback |
| Metrics scrape failure | Retain last known; flag as stale |

---

*Both documents fully studied and synthesized. Ready to begin implementation.*
