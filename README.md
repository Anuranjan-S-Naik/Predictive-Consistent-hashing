# Predictive Adaptive Request Allocation Framework

An AI-driven distributed request management system that classifies incoming
requests by resource weight, forecasts traffic patterns, and dynamically routes
each request to the optimal server node using a predictive consistent hash ring.

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env with your preferred passwords/tokens

# 2. Start all infrastructure
cd infra
docker compose up --build -d

# 3. Verify services are running
docker compose ps

# 4. Access dashboards
# FastAPI Swagger:  http://localhost:8000/docs
# Grafana:          http://localhost:3000  (admin/admin)
# Prometheus:       http://localhost:9090

# 5. Run traffic generator (on-demand)
docker compose --profile generate up traffic_generator
```

## Architecture

```
Traffic Generator ──HTTP──► Coordinator (FastAPI :8000)
                                │
                                ├──gRPC──► Node S1 (:50051, cap=100)
                                ├──gRPC──► Node S2 (:50052, cap=70)
                                ├──gRPC──► Node S3 (:50053, cap=150)
                                └──gRPC──► Node S4 (:50054, cap=90)
                                │
                                ├──► Redis (:6379)
                                ├──► PostgreSQL (:5432)
                                ├──► InfluxDB (:8086)
                                └──► Prometheus (:9090) ──► Grafana (:3000)
```

## Project Structure

```
├── coordinator/          # FastAPI + ML engines + routing logic
│   ├── main.py           # Application entrypoint
│   ├── intake/           # Feature extraction pipeline
│   ├── ml/               # XGBoost classifier + GRU forecaster
│   ├── routing/          # Hash ring, DAA, allocation engine, Chord router
│   ├── feedback/         # Self-optimization loop
│   └── grpc/             # Proto definition + generated stubs
├── node/                 # Simulated server node (gRPC + WFQ scheduler)
├── traffic_generator/    # Async request injector
├── evaluation/           # Baseline implementations + benchmark runner
├── models/               # Serialized ML model artifacts
├── scenarios/            # YAML traffic scenario definitions
├── infra/                # Docker Compose, Prometheus, Grafana configs
├── db/                   # PostgreSQL schema + Alembic migrations
├── tests/                # Unit, integration, and load tests
├── docs/                 # Architecture decisions, metrics spec
├── config.yaml           # Master configuration (all services read this)
└── requirements.txt      # Python dependencies
```

## Configuration

All services read `config.yaml`. Key parameters:

| Parameter | Value | Description |
|-----------|-------|-------------|
| Nodes | 4 (S1=100, S2=70, S3=150, S4=90) | Heterogeneous capacity cluster |
| Allocation Weights | α=0.35, β=0.30, γ=0.20, δ=0.15 | Score = α·CPU + β·Queue + γ·Latency + δ·Forecast |
| Base Vnodes | 150 per node | Before capacity scaling |
| DAA Interval | 10s | Vnode recalculation frequency |
| Feedback Interval | 60s | Self-optimization loop |
| Forecaster Interval | 5s | GRU inference frequency |

## Development Phases

- [x] **Phase 1** — Planning (scenarios, architecture, proto, schema)
- [x] **Phase 2** — Infrastructure setup (Docker Compose, Prometheus, Grafana)
- [ ] **Phase 3** — Backend core (hash ring, WFQ, traffic gen, allocation engine)
- [ ] **Phase 4** — Database validation under load
- [ ] **Phase 5** — ML integration (XGBoost + GRU + DAA)
- [ ] **Phase 6** — Testing (unit, integration, load benchmarks)
- [ ] **Phase 7** — Deployment & reproducibility
- [ ] **Phase 8** — Post-launch improvements (optional)

## License

Research project — not for production deployment.
