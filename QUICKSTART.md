# PCH Framework — Quick Start Guide

## Prerequisites

- **Docker Desktop** — running and healthy
- **Node.js 18+** — for the frontend
- **Python 3.10+** — for ML model training (optional)

---

## Backend (Coordinator + Infrastructure)

All backend services run inside Docker containers via `docker compose`.

### Start Everything

```powershell
# From the project root directory
cd "Predictive-Consistent-hashing"

# Start all services (coordinator, redis, postgres, influxdb, prometheus, nodes)
docker compose -f infra/docker-compose.yml up -d
```

Wait ~10 seconds for health checks. Verify:

```powershell
docker compose -f infra/docker-compose.yml ps
```

All containers should show `Healthy` or `Running`.

### Stop Everything

```powershell
docker compose -f infra/docker-compose.yml down
```

To also remove stored data (volumes):

```powershell
docker compose -f infra/docker-compose.yml down -v
```

### Rebuild After Code Changes

```powershell
# Rebuild only the coordinator (picks up Python code changes)
docker compose -f infra/docker-compose.yml build coordinator
docker compose -f infra/docker-compose.yml up -d coordinator
```

### View Logs

```powershell
# All services
docker compose -f infra/docker-compose.yml logs -f

# Just the coordinator
docker logs paf_coordinator -f --tail 50
```

### Key URLs (Backend)

| Service       | URL                          |
|---------------|------------------------------|
| Coordinator API | http://localhost:8000      |
| API Docs (Swagger) | http://localhost:8000/docs |
| Prometheus    | http://localhost:9090         |

---

## Frontend (Dashboard)

The frontend is a Next.js app that runs separately.

### Start

```powershell
cd frontend
npx next dev -p 3001
```

Dashboard available at: **http://localhost:3001**

### Stop

Press `Ctrl+C` in the terminal where the frontend is running.

### Key URLs (Frontend)

| Page          | URL                          |
|---------------|------------------------------|
| Dashboard     | http://localhost:3001         |
| Nodes         | http://localhost:3001/nodes   |
| Routing       | http://localhost:3001/routing |
| Simulation    | http://localhost:3001/simulation |
| Settings      | http://localhost:3001/settings |

---

## Typical Workflow

```
1. Start backend:     docker compose -f infra/docker-compose.yml up -d
2. Wait for healthy:  docker compose -f infra/docker-compose.yml ps
3. Start frontend:    cd frontend && npx next dev -p 3001
4. Open browser:      http://localhost:3001
5. (work...)
6. Stop frontend:     Ctrl+C
7. Stop backend:      docker compose -f infra/docker-compose.yml down
```

---

## ML Models (Optional — Already Trained)

Models are pre-trained in `models/`. To retrain:

```powershell
# From project root
pip install xgboost scikit-learn joblib numpy torch

# Train classifier (takes ~30 seconds)
python -m coordinator.ml.train_classifier

# Train forecaster (takes ~20 minutes on CPU)
python -m coordinator.ml.train_forecaster
```

After retraining, restart the coordinator to load the new models:

```powershell
docker compose -f infra/docker-compose.yml restart coordinator
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Dashboard says "Demo" | Backend not running. Start Docker containers first. |
| Coordinator unhealthy | Check logs: `docker logs paf_coordinator --tail 30` |
| Port 3001 in use | Kill existing process or use a different port: `npx next dev -p 3002` |
| Port 8000 in use | `docker compose -f infra/docker-compose.yml down` then start again |
| Models not loading | Check `models/` directory has `classifier_v1.joblib` and `forecaster_v1.pt` |
