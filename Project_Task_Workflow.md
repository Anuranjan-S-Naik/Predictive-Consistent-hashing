
**PROJECT TASK WORKFLOW**

*Predictive Adaptive Request Allocation Framework*

Step-by-Step Execution Checklist for the Development Team

**⚠ BLOCKER  =  task must finish before next phase can begin**

*PARALLEL YES  =  can run simultaneously with other tasks in the same phase*



|**PHASE 1**  — PLANNING|
| :- |

Goal: Lock down all design decisions before a single line of code is written. Outputs feed every downstream phase.

|**P1-T1  Define Simulation Scenarios & Evaluation Metrics**||||
| :- | :- | :- | :- |
|**What to do**|Write a YAML spec for every traffic scenario (Uniform, Bursty, Flash Crowd, Random). Define exact target metrics: p50/p95/p99 latency, throughput (req/s), load variance (stddev across nodes), failure rate. Agree on SLO thresholds that trigger alerts in the feedback loop.|||
|**Who handles**|**Lead Engineer / Researcher**|**Depends on**|None|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**scenarios/uniform.yaml, bursty.yaml, flash\_crowd.yaml, random.yaml + metrics\_spec.md**|

|**P1-T2  Finalize System Architecture & Config Schema**||||
| :- | :- | :- | :- |
|**What to do**|Confirm node count (4 heterogeneous nodes: capacity 100/70/150/90), gRPC vs REST boundaries, Redis key schema, DAA formula weights (α=0.35, β=0.30, γ=0.20, δ=0.15), vnode base count (150), feedback interval (60 s). Output a single config.yaml that all services read.|||
|**Who handles**|**Lead Engineer**|**Depends on**|None|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**architecture\_decisions.md + config.yaml template**|

|**P1-T3  Define gRPC Proto Contracts**||||
| :- | :- | :- | :- |
|**What to do**|Write coordinator.proto with three RPCs: RouteRequest(RequestMsg), ReportCompletion(CompletionMsg), GetNodeMetrics(NodeIdMsg). Define all message fields. Generate Python stubs. This contract is the interface contract between coordinator and all nodes.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P1-T2|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**coordinator.proto + generated \_pb2.py / \_pb2\_grpc.py stubs**|

|**P1-T4  Define PostgreSQL Schema & Alembic Migrations**||||
| :- | :- | :- | :- |
|**What to do**|Write CREATE TABLE scripts for: nodes, requests, predictions, experiments, feedback\_events. Define all indexes (arrival\_ts, predicted\_class, node\_assigned). Create Alembic migration files. Review and freeze schema — changes after Phase 3 are costly.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P1-T2|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**db/migrations/0001\_initial.py + schema.sql**|



**✅  Phase 1 done when: config.yaml agreed, proto stubs generated, DB schema frozen, scenario YAMLs written.**



|**PHASE 2**  — PROJECT SETUP & INFRASTRUCTURE|
| :- |

Goal: Entire infrastructure running locally via Docker Compose before any business logic is written.

|**P2-T1  Create Repository Structure & Docker Compose**||||
| :- | :- | :- | :- |
|**What to do**|Initialize Git repo. Create folder structure: coordinator/, node/, traffic\_generator/, evaluation/, models/, infra/, tests/. Write docker-compose.yml with all services: coordinator, node\_s1–s4, redis, postgres, influxdb, prometheus, grafana. Add .env.example with all required variables.|||
|**Who handles**|**DevOps / Backend Engineer**|**Depends on**|P1-T2|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Runnable docker-compose.yml; all containers start without errors**|

|**P2-T2  Configure Prometheus + Grafana Dashboards**||||
| :- | :- | :- | :- |
|**What to do**|Write prometheus.yml with scrape targets for coordinator:9090 and each node's /metrics. Import or build four Grafana dashboards: (1) Node Load Overview, (2) Request Flow & Class Distribution, (3) Latency p50/p95/p99 per class, (4) Forecaster Prediction vs Actual. This runs in parallel with P2-T3.|||
|**Who handles**|**DevOps Engineer**|**Depends on**|P2-T1|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Grafana live with 4 dashboard templates; Prometheus scraping all targets**|

|**P2-T3  Configure Redis + InfluxDB + PostgreSQL**||||
| :- | :- | :- | :- |
|**What to do**|Verify Redis AOF persistence on. Create InfluxDB bucket 'metrics' with 30-day retention and 'forecast' bucket with 7-day retention. Run Alembic migration to create PostgreSQL tables. Seed nodes table with S1–S4 capacity scores.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P2-T1, P1-T4|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**All three datastores accessible; nodes table has 4 rows**|

|**P2-T4  Bootstrap FastAPI Coordinator Skeleton**||||
| :- | :- | :- | :- |
|**What to do**|Create main.py with FastAPI app. Add POST /api/v1/request stub (returns 501 for now). Add GET /api/v1/nodes and GET /api/v1/ring stubs. Add Prometheus middleware for request count and latency. Add X-API-Key auth middleware. gRPC channel pool (one channel per node, keep-alive on).|||
|**Who handles**|**Backend Engineer**|**Depends on**|P2-T1, P1-T3|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**FastAPI starts; /docs accessible; /metrics returns Prometheus data**|

|**P2-T5  Bootstrap Node Process Skeleton**||||
| :- | :- | :- | :- |
|**What to do**|Create node/main.py: gRPC server that accepts RouteRequest (just logs and returns OK). Add /metrics Prometheus exporter endpoint: cpu\_pct (simulated), queue\_depth, requests\_processed. Each node reads its capacity\_score from config. All 4 nodes start in Docker Compose.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P2-T1, P1-T3|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**4 node containers running; coordinator can ping each via gRPC; Prometheus sees node metrics**|



**✅  Phase 2 done when: docker compose up starts all services error-free; Grafana shows live (empty) dashboards; gRPC ping from coordinator to all nodes succeeds.**



|**PHASE 3**  — BACKEND CORE DEVELOPMENT|
| :- |

Goal: Build all non-ML logic — static baseline modes, hash ring, allocation engine, WFQ scheduler, Chord router, traffic generator. This gives a fully working (non-predictive) system that generates the training data for Phase 5.

|**P3-T1  Implement Static Consistent Hash Ring (Baseline)**||||
| :- | :- | :- | :- |
|**What to do**|coordinator/routing/hash\_ring.py: implement MurmurHash3 (mmh3 library) ring with fixed vnode distribution proportional to node capacity\_score. Methods: add\_node(), remove\_node(), get\_node(request\_hash). Store ring snapshot in Redis sorted set ring:vnodes. Also implement Round-Robin and Least-Connections as alternative coordinator modes (evaluation/baselines/).|||
|**Who handles**|**Backend Engineer**|**Depends on**|P2-T3, P2-T4|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Static ring working; all 3 baseline modes route requests to correct nodes**|

|**P3-T2  Implement WFQ Scheduler inside Each Node**||||
| :- | :- | :- | :- |
|**What to do**|node/scheduler.py: three asyncio.PriorityQueue instances (Light=weight 3, Medium=weight 2, Heavy=weight 1). Scheduler loop picks from non-empty queues using token-based WFQ. node/executor.py: simulates execution time (Light ~50 ms, Medium ~200 ms, Heavy ~1 s via asyncio.sleep). Emits gRPC ReportCompletion with execution\_ms.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P2-T5|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Node correctly serves Light requests 3× more frequently than Heavy under equal arrival rate (verifiable in unit test)**|

|**P3-T3  Implement Traffic Generator**||||
| :- | :- | :- | :- |
|**What to do**|traffic\_generator/generator.py: async aiohttp client that reads a scenario YAML and fires requests at the coordinator's POST /api/v1/request. Implement four patterns: Uniform (constant RPS), Bursty (Poisson spikes), Flash Crowd (sudden 10× surge for 10 s), Random (mixed). Configurable: RPS, duration, mix of Light/Medium/Heavy ratios.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P2-T4|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Generator fires requests at specified RPS; coordinator logs show all three request classes arriving**|

|**P3-T4  Implement Request Intake & Feature Extraction Pipeline**||||
| :- | :- | :- | :- |
|**What to do**|coordinator/intake/feature\_pipeline.py: extract 8 features from each raw request: [payload\_bytes, cpu\_estimate, endpoint\_id, requests\_last\_5s, avg\_latency\_ema, queue\_depth, hour\_of\_day, is\_burst]. Use Redis window counters for requests\_last\_5s (5-s TTL). Use exponential moving average for latency. Normalize all features. Output: fixed-length numpy array.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P3-T1|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Feature vector produced for every request; shape=(8,); values normalized 0–1**|

|**P3-T5  Wire Allocation Engine (Score-Based, No ML Yet)**||||
| :- | :- | :- | :- |
|**What to do**|coordinator/routing/allocation\_engine.py: implement Score(node) = α·cpu + β·queue + γ·latency + δ·predicted\_load (use 0 for predicted\_load until Phase 5). Read live metrics from Redis metrics:{node\_id}. Select min-score node. Plug into POST /api/v1/request flow: intake → feature extraction → static hash lookup → score → route via gRPC.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P3-T4, P3-T1|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**End-to-end request routing works with score-based allocation; latency logged to PostgreSQL**|

|**P3-T6  Implement Chord Finger Table & Multi-Hop Router**||||
| :- | :- | :- | :- |
|**What to do**|coordinator/routing/chord\_router.py: build finger table for each node: finger[k] = first node with ID ≥ (n + 2^k) mod 2^m, k=0..log2(N). When allocation engine finds all candidate nodes overloaded (score > threshold), invoke chord\_router.route(request\_hash, overloaded\_node). Max hops = ceil(log2(4))+2=4. Loop detection via hop counter. Fallback: least-connections if max hops exceeded.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P3-T5|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Overflow requests correctly hop to least-loaded node; no routing loops in unit test with all nodes near-overloaded**|

|**P3-T7  Run Baseline Benchmark & Collect Training Data**||||
| :- | :- | :- | :- |
|**What to do**|Start docker compose. Run all 4 scenario YAMLs using each of the 3 baseline modes (Round-Robin, Least-Connections, Static Consistent Hashing). Record p50/p95/p99 latency, throughput, load variance in the experiments table. Simultaneously collect labelled request logs (feature vector + ground-truth execution\_ms → derive class label) into PostgreSQL for ML training in Phase 5.|||
|**Who handles**|**Lead Engineer**|**Depends on**|P3-T3, P3-T5|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Baseline benchmark numbers; labelled dataset of ≥50,000 requests in PostgreSQL; training CSV exported**|



**✅  Phase 3 done when: end-to-end request flow works; 3 baseline modes produce benchmark results; training dataset exported to CSV.**



**FRONTEND DEVELOPMENT**

*Not applicable to this project. This is a distributed systems research framework. All observability is served via Grafana (configured in Phase 2). No user-facing web UI is required.*



|**PHASE 4**  — DATABASE SETUP & VALIDATION|
| :- |

Goal: Validate all datastores under simulated load. Fix schema, index gaps, or write-path bottlenecks before ML is added.

|**P4-T1  Validate PostgreSQL Write Performance**||||
| :- | :- | :- | :- |
|**What to do**|Run bursty scenario at 500 RPS for 2 minutes. Check if synchronous per-request inserts create latency backpressure. If p99 insert time >5 ms: switch to buffered batch commit (buffer 1000 requests OR 1-second window, whichever comes first) using an asyncio queue in the coordinator. Verify no data loss on coordinator restart.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P3-T7|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Batch insert confirmed working; PostgreSQL write latency not affecting request latency**|

|**P4-T2  Validate Redis Ring & Metrics Under Load**||||
| :- | :- | :- | :- |
|**What to do**|Run 1000 RPS uniform scenario. Measure Redis read latency for ring:vnodes (sorted set ZRANGEBYSCORE) and metrics:{node\_id} (HGETALL). If any read >2 ms: add in-process ring snapshot (Python dict) refreshed every 100 ms from Redis. This eliminates Redis as a hot path for per-request ring lookups.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P3-T7|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Ring reads <1 ms under 1000 RPS; confirmed via coordinator latency breakdown log**|

|**P4-T3  Validate InfluxDB Time-Series Writes & Reads**||||
| :- | :- | :- | :- |
|**What to do**|Confirm Prometheus→InfluxDB metrics pipeline is writing node\_metrics and request\_rate measurements correctly. Run a Flux query to verify 60 rolling data points are available (needed by the GRU forecaster in Phase 5). Check batch write buffer size is 10 s to avoid excessive write pressure.|||
|**Who handles**|**DevOps Engineer**|**Depends on**|P2-T2, P2-T3|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**InfluxDB shows ≥60 data points per metric per node; batch writes confirmed in logs**|



**✅  Phase 4 done when: all three datastores validated under load; no datastore is a latency bottleneck; 60 InfluxDB points available per node for forecaster.**



|**PHASE 5**  — AI / ML INTEGRATION|
| :- |

Goal: Add the two ML components — XGBoost classifier and GRU forecaster — into the live allocation path. Then activate the DAA for dynamic vnode adjustment.

|**P5-T1  Train XGBoost Request Classifier**||||
| :- | :- | :- | :- |
|**What to do**|Load the labelled CSV from P3-T7. Derive class label from execution\_ms: Light <100 ms, Medium 100–500 ms, Heavy >500 ms. Train XGBoost via scikit-learn pipeline (StandardScaler → XGBClassifier). 5-fold cross-validation. Target: accuracy >90% for Light/Heavy, >80% for Medium. Save as models/classifier\_v1.joblib. Log confusion matrix.|||
|**Who handles**|**ML Engineer**|**Depends on**|P3-T7|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**models/classifier\_v1.joblib; classification report printed; held-out test accuracy ≥88%**|

|**P5-T2  Train GRU Traffic Forecaster**||||
| :- | :- | :- | :- |
|**What to do**|Extract time-series from InfluxDB: heavy\_request\_count\_per\_second for the full baseline run. Prepare sliding windows of 60 points → predict next-10-s heavy count. Train 2-layer GRU (64 hidden, PyTorch). Validate on 20% holdout. Target: MAE within 15% of actual. Save as models/forecaster\_v1.pt.|||
|**Who handles**|**ML Engineer**|**Depends on**|P4-T3|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**models/forecaster\_v1.pt; validation MAE printed; burst detection works on held-out bursty scenario**|

|**P5-T3  Integrate XGBoost Classifier into Coordinator**||||
| :- | :- | :- | :- |
|**What to do**|coordinator/ml/classifier.py: load joblib model at startup. Wrap in classify(feature\_vector) → (class\_label, confidence). If confidence <0.55 → return Medium. Call classify() inside POST /api/v1/request after feature extraction. Write predicted\_class and confidence to predictions table. Verify inference <1 ms per request.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P5-T1, P3-T4|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Every request tagged with class label in real time; Grafana 'Class Distribution' panel shows 3 bars**|

|**P5-T4  Integrate GRU Forecaster as Background Thread**||||
| :- | :- | :- | :- |
|**What to do**|coordinator/ml/forecaster.py: load PyTorch model. Background thread runs every 5 s: queries InfluxDB for last 60 heavy-request-count points, runs GRU inference, writes result to Redis key forecast:latest (TTL 15 s). burst\_imminent = True if predicted > 1.5× current\_avg. If Redis write fails: retain last valid forecast.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P5-T2, P4-T3|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**forecast:latest in Redis updated every 5 s; Grafana 'Forecaster' panel shows predicted vs actual**|

|**P5-T5  Implement DAA — Dynamic Vnode Adjustment**||||
| :- | :- | :- | :- |
|**What to do**|coordinator/routing/daa.py: every 10 s, read metrics:{node\_id} for all nodes from Redis. Apply formula: vnode\_count(node) ∝ available\_cpu\_capacity × (1/(1+queue\_depth)) × (burst\_damping if burst\_imminent). Increase when cpu<50% AND queue<20%. Decrease when cpu>80% OR queue>threshold. Atomically update ring:vnodes in Redis. Min 10 vnodes per active node.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P5-T3, P5-T4|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Vnode counts change dynamically; Grafana 'Node Load Overview' shows vnode bars rising/falling with load**|

|**P5-T6  Activate δ·Predicted Load in Allocation Score**||||
| :- | :- | :- | :- |
|**What to do**|Update allocation\_engine.py: replace the placeholder 0 for δ·predicted\_load with the actual forecast value (heavy request rate projected at target node based on its vnode share × predicted\_heavy\_total). Re-run bursty scenario. Compare p99 latency and load variance against Phase 3 baseline.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P5-T5|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Full predictive allocation active; initial comparison shows p99 improvement visible in Grafana**|

|**P5-T7  Implement Feedback Self-Optimization Loop**||||
| :- | :- | :- | :- |
|**What to do**|coordinator/feedback/optimizer.py: asyncio background task runs every 60 s. Reads last 60 s of metrics from InfluxDB. Computes load variance across nodes. If variance > threshold → trigger DAA recalculation immediately (don't wait for 10-s cycle). If classifier accuracy on last 1000 predictions <80% → log drift warning and write to feedback\_events table.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P5-T5, P4-T3|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Feedback events logged in PostgreSQL; DAA responds to load spikes within 60 s; observable in Grafana**|



**✅  Phase 5 done when: classifier tags every request in <1 ms; forecaster updates every 5 s; DAA adjusts vnodes every 10 s; feedback loop runs every 60 s; full predictive pipeline is live.**



|**PHASE 6**  — TESTING|
| :- |

Goal: Validate correctness, performance, and ML quality before final evaluation. Fix bugs found here — not during evaluation runs.

|**P6-T1  Write & Run Unit Tests**||||
| :- | :- | :- | :- |
|**What to do**|pytest tests/unit/: (1) Feature pipeline — shape=(8,), EMA correctness, normalization bounds. (2) Hash ring — 10K hashes uniformly distributed, vnode scaling formula. (3) DAA — CPU threshold triggers reduce vnodes by correct amount. (4) Allocation score — weighted sum formula is correct, min-score node selected. (5) Chord finger table — correct entries for N=4; loop detection fires at hop limit. (6) WFQ scheduler — Light served 3× more than Heavy over 1000 cycles.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P5-T6 (all modules implemented)|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**pytest passes with 0 failures; coverage >80% on routing/ and ml/ modules**|

|**P6-T2  Write & Run Integration Tests**||||
| :- | :- | :- | :- |
|**What to do**|tests/integration/: (1) End-to-end: request → coordinator → node → PostgreSQL row exists with correct node\_assigned. (2) Ring consistency: remove node S2 → all subsequent requests reach remaining nodes (no orphan hashes). (3) Feedback: inject high CPU into Redis metrics:S1 → verify DAA reduces S1 vnode count within 10 s. (4) Chord: manually set S1 score above threshold → verify request reaches S3 via finger hop.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P6-T1|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**All 4 integration tests pass; Chord routing verifiably multi-hops in test**|

|**P6-T3  ML Model Quality Tests**||||
| :- | :- | :- | :- |
|**What to do**|tests/unit/test\_ml.py: (1) Classifier on held-out test set: accuracy ≥88%; confusion matrix shows Light/Heavy rarely confused. (2) Inference latency: 1000 inferences in <1 s. (3) Forecaster MAE on held-out bursty trace within 15% of actual. (4) Low-confidence fallback: manually pass ambiguous vector → confirm Medium returned.|||
|**Who handles**|**ML Engineer**|**Depends on**|P5-T1, P5-T2|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**ML quality report printed; all 4 checks pass; latency ≤0.001 s per inference confirmed**|

|**P6-T4  Load Tests — All Scenarios vs All Baselines**||||
| :- | :- | :- | :- |
|**What to do**|tests/load/benchmark\_runner.py: run each of 4 scenario YAMLs × 4 modes (Round-Robin, LCS, Static Hashing, Predictive Framework) = 16 experiment runs. Each run: 5 minutes. Record p50/p95/p99 latency, throughput, load\_variance\_stddev, failure\_rate in experiments table. This is the primary evaluation data for the research paper/report.|||
|**Who handles**|**Lead Engineer**|**Depends on**|P6-T2, P6-T3|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**16 rows in experiments table; comparison tables showing predictive framework wins on p99 and load\_variance**|



**✅  Phase 6 done when: 0 unit test failures; all 4 integration tests pass; 16 benchmark runs complete; final comparison table ready.**



|**PHASE 7**  — DEPLOYMENT (Research Environment)|
| :- |

Note: This is a research simulation system. 'Deployment' means making the environment fully reproducible and shareable — not a public cloud launch.

|**P7-T1  Finalize Docker Compose & .env Configuration**||||
| :- | :- | :- | :- |
|**What to do**|Assign Docker resource limits (CPU/mem) to each container to prevent host contention: coordinator 2 CPU/4 GB, each node 0.5 CPU/1 GB, redis 0.5 CPU/512 MB, postgres 1 CPU/2 GB, influxdb 1 CPU/2 GB. Write .env.example with all required variables and safe defaults. Confirm docker compose up --build starts all services in correct order (healthcheck-based).|||
|**Who handles**|**DevOps Engineer**|**Depends on**|P6-T4|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**docker compose up starts error-free on a clean machine in <3 minutes**|

|**P7-T2  Write Experiment Runner & Reproducibility Script**||||
| :- | :- | :- | :- |
|**What to do**|evaluation/benchmark\_runner.py: single CLI command runs the full 16-experiment evaluation, writes results to PostgreSQL and exports results\_summary.csv. Write Makefile targets: make setup, make train, make benchmark, make report. Confirm a teammate can reproduce results on a different machine by following README.md.|||
|**Who handles**|**Lead Engineer**|**Depends on**|P7-T1|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**make benchmark produces identical results\_summary.csv on two different machines**|

|**P7-T3  Model Versioning & Rollback Procedure**||||
| :- | :- | :- | :- |
|**What to do**|Store models with timestamp suffix: classifier\_v{date}.joblib, forecaster\_v{date}.pt. Document rollback procedure in README: set MODEL\_PATH env var to previous timestamp directory → docker compose restart coordinator. Add model metadata file models/registry.json with accuracy, training date, training data size per version.|||
|**Who handles**|**ML Engineer**|**Depends on**|P5-T1, P5-T2|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**models/registry.json present; rollback tested and confirmed working**|



**✅  Phase 7 done when: any team member can clone repo, run make setup && make benchmark, and reproduce the comparison results.**



|**PHASE 8**  — POST-LAUNCH IMPROVEMENTS|
| :- |

These tasks are explicitly deferred. Do not start until Phase 7 is complete and core results are validated.

|**P8-T1  Online Model Retraining Pipeline**||||
| :- | :- | :- | :- |
|**What to do**|Build a nightly retraining script: query PostgreSQL for new labelled requests since last training run, retrain XGBoost if accuracy on new data <80%, atomically swap model file, update registry.json. Optionally retrain GRU forecaster on latest InfluxDB traffic data.|||
|**Who handles**|**ML Engineer**|**Depends on**|P7 complete|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Classifier auto-improves as simulation data accumulates**|

|**P8-T2  Scale to 8 or 16 Simulated Nodes**||||
| :- | :- | :- | :- |
|**What to do**|Add node\_s5–s8 (or up to s16) entries to docker-compose.yml and config.yaml. Verify Chord finger table regenerates correctly for log2(8) and log2(16). Re-run P6-T4 benchmark to confirm latency and load variance improvements hold at larger cluster sizes.|||
|**Who handles**|**Backend Engineer**|**Depends on**|P7 complete|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**Scalability benchmark showing O(log N) routing overhead confirmed**|

|**P8-T3  Reinforcement Learning for Weight Tuning**||||
| :- | :- | :- | :- |
|**What to do**|Replace hardcoded α/β/γ/δ weights with an RL agent (simple policy gradient or Q-learning) that observes load variance and p99 latency as reward signal and adjusts weights at each feedback cycle. This is research-level complexity — treat as a separate experiment track.|||
|**Who handles**|**ML Engineer / Researcher**|**Depends on**|P8-T1 complete|
|**Parallel?**|**YES — can run in parallel**|**Expected Output**|**RL agent converges to better weights than hand-tuned defaults on bursty scenario**|

*The following are explicitly out of scope for this project: payment systems, user auth/sessions, mobile apps, email notifications, multi-tenancy, Kubernetes (unless scaling phase demands it), external public APIs, admin dashboards beyond Grafana.*


# **FINAL SUMMARY**

## **Dependency Flow (Linear)**
- P1-T1 & P1-T2 (parallel)
- → P1-T3 & P1-T4 (parallel)
- → P2-T1
- → P2-T2 & P2-T3 & P2-T4 & P2-T5 (all parallel)
- → P3-T1
- → P3-T2 & P3-T3 (parallel with P3-T1 completion)
- → P3-T4
- → P3-T5
- → P3-T6 & P3-T7 (P3-T6 parallel with P3-T7 which needs P3-T3 + P3-T5)
- → P4-T1 & P4-T2 & P4-T3 (all parallel)
- → P5-T1 & P5-T2 (parallel, different data sources)
- → P5-T3 (needs P5-T1) & P5-T4 (needs P5-T2) — parallel
- **→ P5-T5 (needs P5-T3 + P5-T4)**
- → P5-T6 & P5-T7 (parallel)
- → P6-T1
- → P6-T2 & P6-T3 (parallel)
- **→ P6-T4**
- → P7-T1
- → P7-T2 & P7-T3 (parallel)
- → DONE — Phase 8 tasks are optional improvements

## **MVP-First Execution Plan**
**The MVP is a fully working request allocation system with static consistent hashing and score-based routing — no ML yet. This is achieved at the end of Phase 3.**

|**MVP Milestone**|**Phases Needed**|**Approx Time**|**What You Can Demonstrate**|
| :- | :- | :- | :- |
|Working simulation with baselines|1 → 2 → 3|Weeks 1–4|Request routing via Round-Robin, LCS, Static Hashing; latency benchmarks; Grafana dashboards live|
|ML Classification added|+ Phase 5 T1, T3|Week 5|Every request tagged with class; WFQ scheduler serving classes fairly; class-breakdown in Grafana|
|Forecasting + DAA active|+ Phase 5 T2,T4,T5,T6|Weeks 6–7|Proactive burst handling; vnode counts changing dynamically; p99 improving under bursty traffic|
|Full predictive system validated|+ Phase 6|Weeks 8–9|16-run benchmark table; predictive framework vs 3 baselines; all claims quantified|
|Reproducible & deployable|+ Phase 7|Week 10|Anyone can clone and reproduce results with single make command|

## **Critical Tasks (Must Complete First)**

|**Task**|**Why Critical**|
| :- | :- |
|P1-T2 — Architecture & Config Schema|All other tasks derive from this; changes here break everything downstream|
|P1-T3 — gRPC Proto Contracts|Coordinator↔Node interface contract; both sides built from these stubs|
|P2-T1 — Docker Compose|Nothing runs without infrastructure; all Phase 2–8 tasks depend on it|
|P3-T1 — Static Hash Ring|Baseline mode required to generate training data for ML models|
|P3-T7 — Baseline Benchmark + Training Data|ML models cannot be trained without this labelled dataset|
|P5-T5 — DAA Vnode Adjustment|Core innovation of the project; everything in Phase 5 converges here|
|P6-T4 — Load Benchmark (16 runs)|Primary research output; this is the evidence that the system works|

## **Tasks That Can Be Postponed**

|**Task**|**Why Safe to Defer**|**Defer To**|
| :- | :- | :- |
|P8-T1 — Online Retraining|Offline models are sufficient for research evaluation|Post Phase 7|
|P8-T2 — 8/16 Node Scaling|4 nodes prove the concept; scaling is additional validation|Post Phase 7|
|P8-T3 — RL Weight Tuning|Manual weights (α/β/γ/δ) are sufficient for the core thesis|Post Phase 7|
|P5-T7 — Feedback Drift Detection|Drift warning is informational only; DAA still works without it|Can ship in Phase 5 without this|
|P6-T3 — Forecaster MAE Test|Not blocking — forecaster works even if MAE test fails; it just informs tuning|After P6-T1 passes|

*— End of Task Workflow —*
