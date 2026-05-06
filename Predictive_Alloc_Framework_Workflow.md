
**PREDICTIVE ADAPTIVE REQUEST ALLOCATION FRAMEWORK**

*For Distributed Systems Using AI-Driven Flow Classification*

*and Dynamic Consistent Routing*

Complete End-to-End Project Workflow & Architecture


# **1. PROJECT OVERVIEW**

## **1.1 Project Objective**
Design and implement an intelligent, proactive distributed request management system that classifies incoming requests by resource weight, forecasts short-term traffic patterns, and dynamically routes each request to the most suitable server node — before overload conditions arise.

## **1.2 Core Problem Being Solved**

|**Problem Area**|**Symptom**|**Impact**|
| :- | :- | :- |
|Static load balancing|All requests treated equally|Hotspots & idle nodes|
|Reactive behaviour|Action taken after overload|Latency spikes, cascades|
|Uniform hashing|Fixed virtual node distribution|Inefficient capacity use|
|Centralized routing|Full network table per node|Coordination bottleneck|
|No traffic prediction|No burst anticipation|Queue saturation surprises|

## **1.3 Target Users**
- Distributed system researchers implementing and evaluating scheduling algorithms
- Backend engineers building simulation environments for load balancing strategies
- System architects validating proactive vs. reactive request routing designs

## **1.4 Main Modules**

|**Module**|**Role**|
| :- | :- |
|Request Intake & Feature Extraction|Captures requests, extracts classification features|
|ML Request Classification Engine|Labels each request as Light / Medium / Heavy|
|Traffic Flow Forecaster|Predicts burst patterns in next N seconds|
|Predictive Consistent Hash Ring|Dynamic virtual node placement on the hash ring|
|Adaptive Virtual Node Allocator (DAA)|Scales vnode count per node based on live metrics|
|Dynamic Allocation Engine|Scores nodes and selects optimal assignment|
|Chord-Inspired DHT Router|Multi-hop finger-table routing for overflow|
|Request Execution Scheduler|Weighted-fair queuing inside each node|
|Feedback & Self-Optimization Layer|Collects runtime metrics, triggers re-adaptation|
|Simulation Environment|Generates heterogeneous request traffic for evaluation|

## **1.5 Expected Outcomes**
- Measurable reduction in p95 / p99 latency under burst conditions vs. round-robin, least-connections, and static consistent hashing baselines
- Higher throughput per node with lower load variance across the server fleet
- Self-adapting system that improves allocation quality over time through feedback
- A reproducible simulation framework for future distributed scheduling research


# **2. COMPLETE SYSTEM WORKFLOW**

## **2.1 Request Lifecycle — Step-by-Step Execution Order**

|**Step**|**Stage**|**Component**|**Action**|
| :- | :- | :- | :- |
|1|Intake|Request Intake Layer|HTTP/TCP request arrives; raw features extracted (payload size, endpoint, method, source ID, timestamp, burst frequency)|
|2|Feature Engineering|Feature Pipeline|Normalization, categorical encoding, sliding-window aggregation, queue depth snapshot|
|3|Classification|ML Engine (XGBoost)|Request labelled: Light / Medium / Heavy (or CPU/Memory/IO-bound)|
|4|Forecasting|LSTM/GRU Forecaster|Short-term prediction: how many Heavy requests in next 10 s?|
|5|Hash Computation|Predictive Hash Ring|MurmurHash3 applied to request ID → position on ring|
|6|Vnode Lookup|DAA Allocator|Locate virtual node(s) covering hash position|
|7|Node Scoring|Allocation Engine|Score = α·CPU + β·Queue + γ·Latency + δ·Predicted Load → pick min-score node|
|8|Routing Decision|Chord DHT Router|If winning node is overloaded, forward via finger table (multi-hop) to next candidate|
|9|Execution|Node Scheduler|Request enters Weighted Fair Queue; processed at node|
|10|Metrics Capture|Feedback Layer|CPU%, mem%, queue depth, latency, throughput written to InfluxDB/Prometheus|
|11|Self-Adaptation|Optimization Loop|Vnode counts adjusted; ML models retrained on accumulated data; finger tables refreshed|

## **2.2 Data Flow**
Raw Request → [Feature Vector] → Classifier → Class Label + Confidence

Class Label + Recent Traffic History → Forecaster → Predicted Heavy Load (next N s)

Predicted Load + Node Metrics → DAA → Updated Vnode Map → Updated Hash Ring

Incoming Request Hash → Ring Lookup → Candidate Node → Score Check → Route/Forward

Execution Result → Metrics Store → Feedback Engine → Model Retraining / Vnode Adjustment

## **2.3 Backend Processing Flow**
1. FastAPI gateway receives request; middleware timestamps and extracts raw features
1. Feature pipeline normalizes and windowed-aggregates features into a fixed-length vector
1. XGBoost model predicts request class in <1 ms; result attached to request metadata
1. DAA module reads live Prometheus metrics, recomputes vnode weights, updates ring
1. MurmurHash3 maps request to ring position; allocation engine selects target node
1. If target node load score exceeds threshold, Chord router performs finger-table hop
1. Selected node dequeues request via WFQ scheduler; executes; emits completion event
1. Prometheus scrapes node exporters every 5 s; InfluxDB persists time-series history
1. Feedback engine runs every 60 s: adjusts vnode distribution, optionally retrains classifier

## **2.4 AI / ML Workflow**
### **Offline Training (Initial)**
- Collect labelled request traces from simulation (feature vectors + ground-truth class)
- Train XGBoost classifier; tune hyperparameters via cross-validation
- Train LSTM/GRU forecaster on historical traffic time-series
- Serialize models → joblib / PyTorch checkpoint files
### **Online Inference (Runtime)**
- XGBoost: sub-millisecond per-request prediction (scikit-learn pipeline)
- LSTM/GRU: rolling window inference every 5–10 s for burst forecast
### **Feedback Retraining (OPTIONAL — Future Improvement)**
- Accumulated request logs used for periodic offline retraining (nightly or on drift signal)
- Model swapped atomically without downtime

## **2.5 Error Handling Workflow**

|**Error Condition**|**Detection**|**Recovery Action**|
| :- | :- | :- |
|Node unreachable|Health-check ping timeout|Remove from ring; redistribute its vnodes to remaining nodes|
|Classifier inference failure|Exception catch in pipeline|Fall back to Medium class (safe default)|
|Forecaster inference failure|Exception catch|Use last valid forecast; log warning|
|All candidate nodes overloaded|Score threshold exceeded on all|Queue request at least-loaded node with priority flag|
|Finger-table loop detected|Hop count > log2(N)+2|Drop to direct least-connections fallback|
|Metrics scrape failure|Prometheus timeout|Retain last known metrics; flag node as stale|


# **3. ARCHITECTURE DESIGN**

## **3.1 High-Level Architecture**
The system is structured as a single-machine simulation that mimics a distributed cluster. Each simulated server node runs as an independent Python process (or thread). A central coordinator process hosts the ML engines, DAA, and hash ring. Communication between coordinator and nodes uses gRPC.

┌─────────────────────────────────────────────────────────────────────┐

│                        Traffic Generator                           │

│           (Light / Medium / Heavy — Uniform / Bursty)             │

└───────────────────────────┬─────────────────────────────────────────┘

`                            `│ HTTP/gRPC

┌───────────────────────────▼─────────────────────────────────────────┐

│                    Coordinator Process                              │

│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │

│  │ Feature Pipe │  │ XGBoost Clf  │  │  LSTM/GRU Forecaster     │  │

│  └──────┬───────┘  └──────┬───────┘  └────────────┬─────────────┘  │

│         └──────────────────┴──────────────────────┘                │

│                            ▼                                        │

│  ┌──────────────────────────────────────────────────────────────┐  │

│  │   DAA + Predictive Consistent Hash Ring (MurmurHash3)        │  │

│  └───────────────────────────┬──────────────────────────────────┘  │

│                              ▼                                      │

│  ┌──────────────────────────────────────────────────────────────┐  │

│  │   Dynamic Allocation Engine  +  Chord DHT Router             │  │

│  └──────┬──────────────┬──────────────┬──────────────┬──────────┘  │

└─────────┼──────────────┼──────────────┼──────────────┼─────────────┘

`          `│              │              │              │

`    `┌─────▼────┐   ┌─────▼────┐   ┌────▼─────┐  ┌────▼─────┐

`    `│  Node S1 │   │  Node S2 │   │  Node S3 │  │  Node S4 │

`    `│ cap=100  │   │ cap=70   │   │ cap=150  │  │ cap=90   │

`    `│  WFQ     │   │  WFQ     │   │   WFQ    │  │  WFQ     │

`    `└─────┬────┘   └─────┬────┘   └────┬─────┘  └────┬─────┘

`          `└──────────────┴──────────────┴──────────────┘

`                              `│

`                    `┌─────────▼──────────┐

`                    `│  Prometheus/InfluxDB│

`                    `│  Feedback Engine   │

`                    `└────────────────────┘

## **3.2 Component Interaction Summary**

|**From**|**To**|**Protocol**|**Data Exchanged**|
| :- | :- | :- | :- |
|Traffic Generator|Coordinator|gRPC/HTTP|Raw request (payload, endpoint, method, timestamp)|
|Coordinator|Node (via DAA)|gRPC|Routed request + class label|
|Node|Coordinator|gRPC|Completion ACK + execution time|
|Node|Prometheus Exporter|HTTP scrape|CPU%, queue depth, latency histogram|
|Prometheus|Feedback Engine|Python client|Scraped metrics batch|
|Feedback Engine|DAA|In-process call|Updated vnode weights|
|InfluxDB|(offline analysis)|Read API|Historical time-series for model retraining|

## **3.3 Database Architecture**

|**Store**|**Type**|**Purpose**|**Key Data**|
| :- | :- | :- | :- |
|Redis|In-memory KV|Live node metrics cache (sub-second reads)|node\_id → {cpu, queue, latency, vnode\_count}|
|InfluxDB|Time-series DB|Long-term metrics history for forecaster|request\_rate, latency\_p95, cpu\_per\_node (tagged)|
|PostgreSQL|Relational|Request logs, classification results, experiment runs|requests, predictions, experiments, nodes tables|
|In-memory dict|Python dict|Hash ring vnode map (runtime only)|hash\_position → node\_id|

## **3.4 Scalability Considerations**
- Simulation initially runs on a single machine; designed so nodes can migrate to separate processes or containers with only gRPC address changes
- Hash ring and vnode map stored in Redis enables coordinator failover without ring loss
- Finger table size O(log N) ensures routing overhead grows sub-linearly with node count

***[SCALING PHASE]***

- Containerize each node with Docker; orchestrate with Docker Compose for multi-machine tests
- Replace in-process gRPC with Kafka topics for fully asynchronous node communication


# **4. MODULE BREAKDOWN**

## **Module 1 — Request Intake & Feature Extraction**

|**Attribute**|**Detail**|
| :- | :- |
|Purpose|Capture incoming requests and transform raw HTTP/TCP data into a fixed-length numeric feature vector for the ML pipeline|
|Inputs|Raw HTTP request: URL, method, headers, body size, source IP, arrival timestamp|
|Outputs|Feature vector: [payload\_size, cpu\_estimate, endpoint\_id, requests\_last\_5s, avg\_latency, queue\_depth, hour\_of\_day, is\_burst]|
|Internal Logic|Sliding-window counter (5 s) for burst frequency; endpoint → integer ID via lookup table; payload size buckets; exponential moving average for latency|
|Dependencies|Python FastAPI (request parsing), Redis (window counters), Prometheus client (queue\_depth read)|
|Edge Cases|Malformed / oversized payload → default 'heavy' flag; unknown endpoint → generic ID 0|
|Failure Handling|If Redis unavailable, use in-memory fallback counters; log warning|
|APIs Involved|POST /intake (internal coordinator endpoint)|
|DB Tables|requests(id, arrival\_ts, endpoint\_id, payload\_bytes, class\_label, node\_assigned)|

## **Module 2 — ML Request Classification Engine**

|**Attribute**|**Detail**|
| :- | :- |
|Purpose|Predict the resource weight class of each incoming request before allocation|
|Inputs|Feature vector (8 dimensions) from Module 1|
|Outputs|Class label: Light | Medium | Heavy + confidence score|
|Internal Logic|XGBoost gradient-boosted tree ensemble trained offline on simulated labelled traces; inference via scikit-learn pipeline wrapper (normalize → predict)|
|Model Choice Rationale|XGBoost: fast (<1 ms) inference, handles mixed feature types, high accuracy on tabular system data, low memory footprint|
|Dependencies|scikit-learn, xgboost, joblib (model serialization)|
|Edge Cases|Low-confidence prediction (<0.55) → assign Medium as safe default|
|Failure Handling|Exception in inference → fall back to Medium; log error; increment error counter in Prometheus|
|DB Tables|predictions(request\_id, predicted\_class, confidence, inference\_ms)|

## **Module 3 — Traffic Flow Forecaster**

|**Attribute**|**Detail**|
| :- | :- |
|Purpose|Predict future heavy-request arrival rate in the next 10 s to allow proactive vnode adjustment before burst hits|
|Inputs|Rolling 60-point time-series: (heavy\_request\_count\_per\_second) from InfluxDB|
|Outputs|Scalar: predicted\_heavy\_count\_next\_10s; flag: burst\_imminent (boolean)|
|Internal Logic|GRU model (2 layers, 64 hidden units) trained on historical traffic traces; inference every 5 s via background thread; output fed directly to DAA module|
|Model Choice Rationale|GRU preferred over LSTM for lower latency with comparable accuracy; Prophet used as fallback for trend-only scenarios without burst patterns|
|Dependencies|PyTorch (GRU), InfluxDB Python client, Prophet (OPTIONAL fallback)|
|Edge Cases|Insufficient history (<60 points on startup) → use exponential moving average as warm-up estimate|
|Failure Handling|Inference exception → retain last valid forecast; mark stale after 30 s; DAA uses conservative vnode distribution|
|DB Tables|InfluxDB measurement: traffic\_forecast (predicted\_heavy, burst\_flag, forecast\_ts)|

## **Module 4 — Predictive Consistent Hash Ring + DAA**

|**Attribute**|**Detail**|
| :- | :- |
|Purpose|Map requests to server nodes via a dynamically weighted consistent hash ring; adjust virtual node counts in real time|
|Inputs|Node capacity scores, live Prometheus metrics, forecaster output (burst\_imminent)|
|Outputs|Updated ring (hash\_position → node\_id map); vnode\_count per node|
|DAA Formula|vnode\_count(node) ∝ available\_cpu\_capacity × (1 / (1 + queue\_depth)) × (1 if not burst\_target else 0.7)|
|Hash Function|MurmurHash3 (128-bit, via mmh3 Python library) for speed and uniform distribution|
|Increase Vnodes When|CPU < 50%, queue < 20%, latency < SLO threshold|
|Decrease Vnodes When|CPU > 80% OR queue > threshold OR latency > SLO|
|Dependencies|mmh3 (MurmurHash3), Redis (ring persistence), Prometheus client|
|Edge Cases|Single node remaining → assign all traffic with overload flag; trigger alert|
|Failure Handling|Ring update failure → retain previous ring; log critical; retry in 5 s|
|DB Tables|Redis key: ring:vnodes → sorted set of (hash\_position, node\_id)|

## **Module 5 — Dynamic Allocation Engine**

|**Attribute**|**Detail**|
| :- | :- |
|Purpose|Select the single best target node for each classified request using a multi-factor scoring function|
|Inputs|Candidate node list from ring lookup, live metrics for each candidate, request class label|
|Outputs|Selected node\_id|
|Score Formula|Score(node) = α·(cpu\_load) + β·(queue\_length/max\_queue) + γ·(latency\_ema) + δ·(predicted\_incoming\_load)|
|Weights|α=0.35, β=0.30, γ=0.20, δ=0.15 (tuned empirically; stored in config)|
|Selection Rule|Minimum Score node wins; if all scores exceed threshold → trigger Chord router|
|Dependencies|Module 4 (ring), Module 3 (forecast), Redis (live metrics)|
|Edge Cases|Tie score → prefer node with lowest physical ID for determinism|
|Failure Handling|Metrics read timeout → use cached values with age penalty added to score|

## **Module 6 — Chord-Inspired DHT Router**

|**Attribute**|**Detail**|
| :- | :- |
|Purpose|Handle overflow routing when the primary allocated node is overloaded; route via finger table without centralized full-network knowledge|
|Inputs|Overloaded node ID, request hash, current finger table|
|Outputs|Next-hop node ID (accepted or further forwarded)|
|Finger Table Structure|Each node n stores finger[k] = first node with ID ≥ (n + 2^k) mod 2^m, k=0..log2(N)|
|Routing Logic|Check finger[k] nodes in order; first node with score < threshold accepts; max hops = ceil(log2(N)) + 2|
|Dependencies|Module 5 (scoring), gRPC (node-to-node hop messages)|
|Edge Cases|Circular loop detection via hop counter; exceeding max hops → fallback to least-connections|
|Failure Handling|Unreachable finger node → skip to next finger entry; update finger table entry as dead|

## **Module 7 — Request Execution Scheduler (per Node)**

|**Attribute**|**Detail**|
| :- | :- |
|Purpose|Prioritize and execute accepted requests within a node in a fair, class-aware manner|
|Inputs|Incoming requests with class labels; queue state|
|Outputs|Executed requests; completion events with timing metrics|
|Algorithm|Weighted Fair Queuing (WFQ): Light=weight 3, Medium=weight 2, Heavy=weight 1|
|Implementation|Three priority queues per node; scheduler picks from non-empty queue according to weights in round-robin fashion|
|Dependencies|Python asyncio queues or threading.Queue; class label from Module 2|
|Edge Cases|Queue full: reject with 503, increment rejection counter; adjust vnode in DAA feedback|
|Failure Handling|Node crash → coordinator detects via health-check miss; removes node from ring|

## **Module 8 — Feedback & Self-Optimization Layer**

|**Attribute**|**Detail**|
| :- | :- |
|Purpose|Continuously collect runtime metrics and drive adaptive improvements to vnode distribution, routing, and (optionally) model weights|
|Inputs|Prometheus metrics (CPU, queue, latency, throughput, failure\_rate) scraped every 5 s|
|Outputs|Adjusted vnode weights (fed to Module 4); retraining trigger signals; updated finger tables|
|Feedback Cycle|Every 60 s: read last 60 s of metrics from InfluxDB; compute per-node load variance; invoke DAA recalculation; if drift detected → schedule model retrain|
|Drift Detection|Simple threshold: if classifier accuracy on last N predictions drops below 0.80 → flag for retraining|
|Dependencies|Prometheus Python client, InfluxDB client, Module 4 (DAA), Module 2 (retraining)|
|Failure Handling|Metrics unavailable → skip cycle; log; use cached vnode distribution|
|DB Tables|PostgreSQL: feedback\_events(ts, action\_type, trigger\_metric, old\_value, new\_value)|

## **Module 9 — Simulation Environment & Traffic Generator**

|**Attribute**|**Detail**|
| :- | :- |
|Purpose|Generate realistic heterogeneous request traffic for system evaluation; replace real users in research/testing context|
|Request Types|Light (GET API calls, ~50 ms execution), Medium (DB queries, ~200 ms), Heavy (ML inference, ~1 s)|
|Traffic Patterns|Uniform (baseline), Bursty (Poisson spikes), Flash Crowd (sudden 10× surge), Random (mixed)|
|Outputs|Stream of requests at configurable RPS to the coordinator intake endpoint|
|Implementation|Python script using asyncio + aiohttp; configurable via YAML scenario file|
|Evaluation Metrics Captured|Latency (p50, p95, p99), throughput (req/s), load variance (stddev across nodes), resource utilization (avg CPU%), failure rate|
|Comparison Baselines|Round Robin, Least Connections, Static Consistent Hashing (all implemented as alternative coordinator modes)|


# **5. TECH STACK RECOMMENDATION**

|**Category**|**Technology**|**Justification**|
| :- | :- | :- |
|Coordinator Backend|Python 3.11 + FastAPI|Async request handling; ecosystem fit with ML libraries; fast dev cycle|
|Node Backend|Python 3.11 + asyncio|Lightweight per-node process; WFQ via asyncio queues|
|Node Communication|gRPC (grpcio)|Low-latency binary RPC; ideal for tight coordinator↔node loops|
|ML Classification|XGBoost + scikit-learn|Best tabular performance, sub-ms inference; joblib serialization|
|Traffic Forecasting|PyTorch (GRU model)|Flexible sequence model; easy to swap with LSTM/TFT later|
|Hash Function|mmh3 (MurmurHash3)|Fastest Python binding; excellent uniformity; no crypto overhead|
|In-Memory State|Redis 7|Sub-ms ring/metrics reads; atomic operations for vnode updates|
|Time-Series Metrics|InfluxDB 2.x|Native time-series compression; Flux query for forecaster input|
|Relational Logs|PostgreSQL 15|Durable request/experiment logs; SQLAlchemy ORM|
|Metrics Collection|Prometheus + node\_exporter|Industry standard; easy Grafana integration|
|Visualization|Grafana|Real-time dashboards for latency, throughput, load distribution|
|Containerization|Docker + Docker Compose|Reproducible environment; isolates each simulated node|
|Traffic Generator|Python asyncio + aiohttp|High-concurrency load generation without external tools|
|Experiment Config|YAML + Pydantic|Type-safe scenario definitions; easy parameter sweeps|
|Testing|pytest + pytest-asyncio|Unit and integration tests; hypothesis for property testing|

*Note: No frontend UI required — system is a research/simulation framework. Grafana serves as the observability UI. No payment, notifications, or mobile app components needed.*


# **6. DEVELOPMENT ROADMAP**

## **Phase 1 — Simulation Skeleton & Baseline (MVP)**

|**Item**|**Detail**|
| :- | :- |
|Goal|Working end-to-end pipeline with static load balancing; establishes evaluation baseline|
|Features|Traffic Generator (uniform + bursty patterns); Heterogeneous Node Pool (4 nodes, different capacities); Static Consistent Hashing coordinator; Round-Robin and Least-Connections baseline modes; Basic Prometheus metrics + Grafana dashboard; PostgreSQL request logs|
|Deliverables|Runnable Docker Compose stack; baseline benchmark results (latency, throughput, load variance)|
|Complexity|Low-Medium|
|Duration (Estimate)|2–3 weeks|
|Dependencies|Docker, Redis, PostgreSQL, InfluxDB containers up; gRPC stubs generated|

## **Phase 2 — ML Classification Integration**

|**Item**|**Detail**|
| :- | :- |
|Goal|Add real-time XGBoost request classification into the allocation path|
|Features|Feature extraction pipeline; Offline training data generation from Phase 1 logs; XGBoost model training + serialization; Live inference in coordinator (<1 ms target); Class-aware WFQ scheduler in each node; Class-breakdown metrics in Grafana|
|Deliverables|Trained model artifact; benchmark showing class-aware routing improvement over baseline|
|Complexity|Medium|
|Duration (Estimate)|2 weeks|
|Dependencies|Phase 1 complete; labelled training data from simulation logs|

## **Phase 3 — Traffic Forecasting + DAA + Chord Router**

|**Item**|**Detail**|
| :- | :- |
|Goal|Enable proactive behaviour: predict bursts, adapt hash ring, route overflow intelligently|
|Features|GRU forecaster (offline training + live inference); DAA vnode adjustment logic (formula implementation); Predictive Consistent Hash Ring replacing static ring; Chord-inspired finger table routing for overflow; Multi-hop routing with loop detection; Feedback engine (60 s cycle: metrics → vnode update)|
|Deliverables|Full predictive pipeline; benchmark vs Phase 2 (latency improvement under burst scenarios)|
|Complexity|High|
|Duration (Estimate)|3–4 weeks|
|Dependencies|Phase 2 complete; InfluxDB populated with Phase 1–2 traffic history for forecaster training|

## **Phase 4 — Evaluation, Tuning & Documentation (Scaling Phase)**

|**Item**|**Detail**|
| :- | :- |
|Goal|Comprehensive evaluation against all baselines; parameter tuning; research writeup support|
|Features|Flash Crowd and Random traffic scenario tests; Systematic weight tuning (α,β,γ,δ) for allocation score; Latency p50/p95/p99 comparison tables and Grafana panels; Scalability test with 8 and 16 simulated nodes|
|Deliverables|Final benchmark report; tuned config file; reproducible experiment runner script|
|Complexity|Medium|
|Duration (Estimate)|2 weeks|
|Dependencies|Phase 3 complete|

***[OPTIONAL — Future Improvements]***

- Online/continuous model retraining with drift detection
- Reinforcement learning for adaptive weight tuning (α,β,γ,δ)
- Energy-aware allocation (factor in node power consumption)
- Kubernetes orchestration for true multi-machine distributed test


# **7. DATABASE DESIGN**

## **7.1 PostgreSQL — Relational Tables**
### **Table: nodes**

|**Column**|**Type**|**Index**|**Description**|
| :- | :- | :- | :- |
|id|SERIAL PK|PK|Surrogate key|
|node\_name|VARCHAR(32)|UNIQUE|e.g. S1, S2|
|capacity\_score|INT|—|CPU+Mem+IO composite (e.g. 100, 70, 150)|
|ip\_address|VARCHAR(64)|—|gRPC address of simulated node|
|is\_active|BOOLEAN|IDX|Whether node is in the ring|

### **Table: requests**

|**Column**|**Type**|**Index**|**Description**|
| :- | :- | :- | :- |
|id|BIGSERIAL PK|PK|Surrogate key|
|arrival\_ts|TIMESTAMPTZ|IDX|When request hit the coordinator|
|endpoint\_id|SMALLINT|IDX|Encoded endpoint category|
|payload\_bytes|INT|—|Request body size|
|method|VARCHAR(8)|—|GET/POST/etc|
|burst\_frequency|FLOAT|—|Requests/sec at arrival window|
|avg\_latency\_ema|FLOAT|—|EMA latency at intake time|

### **Table: predictions**

|**Column**|**Type**|**Index**|**Description**|
| :- | :- | :- | :- |
|id|BIGSERIAL PK|PK|Surrogate key|
|request\_id|BIGINT FK→requests|IDX|FK to requests table|
|predicted\_class|VARCHAR(8)|IDX|Light / Medium / Heavy|
|confidence|FLOAT|—|Model confidence score 0..1|
|inference\_ms|FLOAT|—|Time taken for XGBoost inference|
|node\_assigned|VARCHAR(32)|IDX|Which node accepted the request|
|completion\_ts|TIMESTAMPTZ|—|When execution finished|
|execution\_ms|FLOAT|—|Actual execution time at node|

### **Table: experiments**

|**Column**|**Type**|**Index**|**Description**|
| :- | :- | :- | :- |
|id|SERIAL PK|PK|Surrogate key|
|name|VARCHAR(128)|UNIQUE|Experiment label (e.g. burst\_test\_v3)|
|scenario|JSONB|—|Full scenario config (pattern, RPS, duration)|
|started\_at|TIMESTAMPTZ|—|Experiment start time|
|ended\_at|TIMESTAMPTZ|—|Experiment end time|
|results\_summary|JSONB|—|p50/p95/p99 latency, throughput, load\_variance|

### **Table: feedback\_events**

|**Column**|**Type**|**Description**|
| :- | :- | :- |
|id|BIGSERIAL PK|Surrogate key|
|ts|TIMESTAMPTZ|When feedback cycle ran|
|action\_type|VARCHAR(32)|vnode\_adjustment | model\_retrain | finger\_refresh|
|trigger\_metric|VARCHAR(64)|Metric that triggered the action|
|old\_value|FLOAT|Previous value|
|new\_value|FLOAT|New value after adjustment|

## **7.2 Redis — Key Structure**

|**Key Pattern**|**Type**|**TTL**|**Content**|
| :- | :- | :- | :- |
|ring:vnodes|Sorted Set|No expiry|score=hash\_position, member=node\_id|
|metrics:{node\_id}|Hash|10 s|cpu\_pct, queue\_depth, latency\_ema, vnode\_count|
|forecast:latest|String|15 s|JSON: {predicted\_heavy, burst\_imminent, ts}|
|window:heavy:{ts\_bucket}|Counter|60 s|Count of heavy requests in that 5-s bucket|

## **7.3 InfluxDB — Measurements**

|**Measurement**|**Tags**|**Fields**|**Retention**|
| :- | :- | :- | :- |
|request\_rate|node, class|count\_per\_sec|30 days|
|node\_metrics|node|cpu\_pct, queue\_depth, latency\_p95, throughput|30 days|
|traffic\_forecast|—|predicted\_heavy, burst\_flag|7 days|
|allocation\_scores|node|score\_value|7 days|


# **8. API DESIGN**

## **8.1 Coordinator REST/gRPC Endpoints**

|**Method**|**Path / RPC**|**Auth**|**Purpose**|
| :- | :- | :- | :- |
|POST|POST /api/v1/request|API key header|Submit a new request for classification and routing|
|GET|GET /api/v1/nodes|Internal only|List all nodes with current metrics and vnode counts|
|GET|GET /api/v1/ring|Internal only|Return current hash ring snapshot|
|GET|GET /api/v1/forecast|Internal only|Return latest forecaster output|
|POST|POST /api/v1/admin/retrain|Admin API key|Trigger manual model retraining|
|GET|GET /api/v1/metrics|Prometheus scrape|Prometheus-format metrics for the coordinator|
|gRPC|RouteRequest(RequestMsg)|Internal|Coordinator→Node request dispatch|
|gRPC|ReportCompletion(CompletionMsg)|Internal|Node→Coordinator completion ACK|
|gRPC|GetNodeMetrics(NodeIdMsg)|Internal|Coordinator→Node live metrics pull|

## **8.2 Request / Response Examples**
### **POST /api/v1/request**
// Request Body

{

`  `"endpoint": "/api/search",

`  `"method": "POST",

`  `"payload\_bytes": 4096,

`  `"source\_id": "user\_42",

`  `"timestamp": "2025-06-01T10:00:00.123Z"

}

// Response 200 OK

{

`  `"request\_id": "req\_00083921",

`  `"predicted\_class": "Medium",

`  `"confidence": 0.87,

`  `"assigned\_node": "S3",

`  `"routing\_hops": 1,

`  `"queued\_at\_ms": 1.2

}

## **8.3 Authentication Strategy**
- Internal coordinator↔node gRPC: mutual TLS (mTLS) with self-signed certs in Docker Compose; no external auth needed
- External request intake (POST /api/v1/request from Traffic Generator): static API key in X-API-Key header; validated by FastAPI middleware
- Admin endpoints: separate API key with elevated privileges; rate-limited to 10 req/min

*Note: No user accounts, sessions, or JWTs required — this is a research simulation system, not a multi-tenant SaaS.*

## **8.4 Rate Limiting**
- Traffic Generator → Coordinator: no hard rate limit (coordinator capacity is the test subject)
- Admin endpoints: 10 requests/minute per IP via SlowAPI middleware


# **9. DEVOPS & DEPLOYMENT**

## **9.1 Docker Compose Architecture**
services:

`  `coordinator:        # FastAPI + ML engines + DAA + Hash Ring

`  `node\_s1:            # Simulated server node, capacity=100

`  `node\_s2:            # Simulated server node, capacity=70

`  `node\_s3:            # Simulated server node, capacity=150

`  `node\_s4:            # Simulated server node, capacity=90

`  `redis:              # Ring state + live metrics cache

`  `postgres:           # Request logs + experiments

`  `influxdb:           # Time-series metrics

`  `prometheus:         # Metrics scraper

`  `grafana:            # Dashboards

`  `traffic\_generator:  # Scenario-based request injector (starts after all ready)

## **9.2 Environment Setup**

|**Variable**|**Default**|**Description**|
| :- | :- | :- |
|COORDINATOR\_PORT|8000|FastAPI listening port|
|REDIS\_URL|redis://redis:6379/0|Redis connection string|
|POSTGRES\_DSN|postgresql://...|PostgreSQL connection string|
|INFLUXDB\_URL|http://influxdb:8086|InfluxDB endpoint|
|INFLUX\_TOKEN|(set in .env)|InfluxDB auth token|
|PROMETHEUS\_PORT|9090|Prometheus scrape port|
|MODEL\_PATH|/app/models/|Directory for serialized ML models|
|SCENARIO\_FILE|/app/scenarios/default.yaml|Traffic generator scenario config|
|FEEDBACK\_INTERVAL\_SEC|60|Feedback loop execution interval|
|VNODE\_BASE\_COUNT|150|Base virtual nodes per node before capacity scaling|

## **9.3 Monitoring Stack**
- Prometheus scrapes all services every 5 s via static targets in prometheus.yml
- Grafana dashboards: (a) Node Load Overview — CPU%, queue depth, vnode count per node; (b) Request Flow — class distribution, routing hops, allocation score trend; (c) Latency Panel — p50/p95/p99 per class; (d) Forecaster — predicted vs actual heavy request rate
- Alerts: Prometheus alertmanager rule if any node CPU > 90% for > 30 s → log warning

## **9.4 Backup & Recovery**
- PostgreSQL: pg\_dump to volume every 24 h; retain 7 daily backups
- InfluxDB: built-in backup task via Flux; export to local volume
- Model artifacts: versioned in /app/models/ with timestamp suffix; previous version retained for rollback

## **9.5 Rollback Strategy**
- Model rollback: set MODEL\_PATH env var to previous timestamp directory; restart coordinator
- Config rollback: git revert scenario YAML or Docker Compose env file; docker compose up -d
- Database migration rollback: Alembic downgrade command for PostgreSQL schema changes


# **10. SECURITY & PERFORMANCE**

## **10.1 Security Risks & Mitigations**

|**Risk**|**Likelihood**|**Mitigation**|
| :- | :- | :- |
|ML model poisoning via crafted requests|Low (closed simulation)|Input validation; payload size cap; feature clamping|
|Unauthorized admin API access|Medium|Separate admin API key; rate limiting; mTLS on gRPC|
|Redis ring corruption|Low|Redis AOF persistence; atomic MULTI/EXEC for ring updates|
|Prometheus metrics exposure|Low|Bind Prometheus to internal Docker network only|
|Log data leakage|Low|PostgreSQL user has minimal privilege; no sensitive data in logs|

## **10.2 Performance Bottlenecks & Optimizations**

|**Bottleneck**|**Root Cause**|**Optimization**|
| :- | :- | :- |
|XGBoost inference latency spike|GIL contention under high RPS|Run inference in ProcessPoolExecutor; batch requests if <5 ms window|
|Redis ring read on every request|Network RTT per allocation|Cache ring snapshot in coordinator memory; refresh every 100 ms|
|GRU forecaster blocking main thread|PyTorch inference not async|Run forecaster in dedicated background thread; update shared state atomically|
|PostgreSQL insert contention|Synchronous per-request write|Buffer inserts in-memory; batch commit every 1000 requests or 1 s|
|InfluxDB write pressure|High-frequency metric ingestion|Use line protocol batch writes; buffer 10 s of data before flush|
|gRPC per-request overhead|Connection setup cost|Persistent gRPC channels per node (keep-alive enabled)|


# **11. TESTING STRATEGY**

## **11.1 Unit Tests (pytest)**

|**Module**|**What to Test**|**Tool**|
| :- | :- | :- |
|Feature Pipeline|Feature vector shape, normalization bounds, EMA correctness|pytest + hypothesis|
|XGBoost Classifier|Known feature vector → correct class; low-confidence → Medium fallback|pytest + fixtures|
|MurmurHash3 Ring|Uniform distribution of 10K hashes; vnode count scaling formula|pytest|
|DAA Vnode Adjustment|CPU threshold triggers; burst flag reduces vnodes by 30%|pytest|
|Allocation Score Formula|Correct weighted sum; minimum-score node selected|pytest|
|Chord Finger Table|Correct finger entries for N=8, N=16; loop detection fires at hop limit|pytest|
|WFQ Scheduler|Light requests served 3× more often than Heavy under equal arrival rate|pytest + asyncio|

## **11.2 Integration Tests**
- End-to-end: Traffic Generator → Coordinator → Node → Completion logged in PostgreSQL
- Ring consistency: after node removal, all requests still reach valid nodes (no orphan hashes)
- Feedback cycle: after injecting high CPU metrics into Redis, verify DAA reduces vnodes within 60 s
- Chord routing: manually overload primary node → verify request reaches secondary via finger table

## **11.3 Load Tests**
- Scenario A (Baseline): 500 RPS uniform mix → measure p99 latency and node load variance
- Scenario B (Burst): 200 RPS baseline + 5× spike for 10 s → measure forecaster response and vnode adaptation speed
- Scenario C (Flash Crowd): sudden 10× uniform surge → measure rejection rate and recovery time
- Tool: locust or custom asyncio generator; results exported to InfluxDB for Grafana comparison panels

## **11.4 ML Model Tests**
- Classification accuracy on held-out test set: target > 90% for Light/Heavy; > 80% for Medium
- Inference latency: 1000 inferences in <1 s on coordinator hardware
- Forecaster MAE: predicted heavy count within 15% of actual on held-out traffic traces
- Concept drift check: re-run classifier on Phase 2 data after Phase 3 changes; accuracy should not drop


# **12. FINAL OUTPUT FORMATS**

## **12.1 Complete Workflow Diagram (Text)**
TRAFFIC GENERATOR

`     `│

`     `│  (HTTP POST /api/v1/request)

`     `▼

┌─────────────────────────────────────────────┐

│              COORDINATOR                    │

│                                             │

│  1. Feature Extraction Pipeline             │

│       [payload, endpoint, burst\_freq ...]   │

│                  │                          │

│  2. XGBoost Classifier                      │

│       → class: Light | Medium | Heavy       │

│                  │                          │

│  3. GRU Forecaster (background, 5s)         │

│       → burst\_imminent? predicted\_heavy\_N   │

│                  │                          │

│  4. DAA + Predictive Hash Ring              │

│       → vnode map updated                   │

│       → MurmurHash3(request) → position     │

│                  │                          │

│  5. Allocation Engine                       │

│       Score = α·CPU + β·Queue +             │

│              γ·Latency + δ·ForecastLoad     │

│       → min-score node selected             │

│                  │                          │

│  6. Chord DHT Router (if overloaded)        │

│       → finger-table hop to next node       │

└─────────────────────┬───────────────────────┘

`                      `│  gRPC RouteRequest

`          `┌───────────┴────────────┐

`          `│                        │

`    `┌─────▼─────┐          ┌───────▼──────┐

`    `│  Node S1  │  ...     │   Node S4    │

`    `│  WFQ Sched│          │   WFQ Sched  │

`    `│  Execute  │          │   Execute    │

`    `└─────┬─────┘          └───────┬──────┘

`          `└───────────┬────────────┘

`                      `│  gRPC ReportCompletion

`                      `▼

`        `┌─────────────────────────┐

`        `│   Prometheus / InfluxDB │

`        `│   Feedback Engine (60s) │

`        `│   → adjust vnodes       │

`        `│   → retrain if drift    │

`        `└─────────────────────────┘

## **12.2 Priority Matrix**

|**Feature**|**Priority**|**Phase**|**Complexity**|
| :- | :- | :- | :- |
|Traffic Generator + Node Pool + Baseline LB|Critical|1|Low|
|Prometheus + InfluxDB + Grafana|Critical|1|Low|
|XGBoost Classification Engine|Critical|2|Medium|
|WFQ Scheduler per Node|Critical|2|Medium|
|GRU Traffic Forecaster|High|3|High|
|DAA Vnode Adjustment|High|3|High|
|Predictive Consistent Hash Ring|High|3|Medium|
|Chord Finger Table Router|High|3|High|
|Feedback Self-Optimization Loop|Medium|3|Medium|
|Comprehensive Evaluation Suite|Medium|4|Low|
|Online Model Retraining|Low|Future|High|
|Reinforcement Learning Routing|Low|Future|Very High|

## **12.3 Risk Matrix**

|**Risk**|**Probability**|**Impact**|**Mitigation**|
| :- | :- | :- | :- |
|GRU forecaster insufficient accuracy|Medium|High|Fallback to ARIMA/Prophet; tune window size; increase training data|
|Chord routing loops in small cluster|Low|Medium|Hop counter + fallback to least-connections guaranteed|
|Redis becomes bottleneck at >5K RPS|Low|High|In-memory ring snapshot with 100 ms refresh; Redis cluster if needed|
|XGBoost model overfit to simulation patterns|Medium|Medium|Cross-validation; test on out-of-distribution traffic patterns|
|PostgreSQL insert lag skews latency metrics|Medium|Low|Async batch inserts; separate measurement from execution|
|Docker Compose resource contention on single machine|Medium|Medium|Assign CPU/memory limits per container; use Linux cgroups|

## **12.4 Suggested Folder Structure**
predictive-alloc-framework/

├── coordinator/

│   ├── main.py                  # FastAPI app entrypoint

│   ├── intake/

│   │   ├── router.py            # /api/v1/request endpoint

│   │   └── feature\_pipeline.py  # Feature extraction

│   ├── ml/

│   │   ├── classifier.py        # XGBoost inference wrapper

│   │   ├── forecaster.py        # GRU inference + background thread

│   │   └── train/

│   │       ├── train\_classifier.py

│   │       └── train\_forecaster.py

│   ├── routing/

│   │   ├── hash\_ring.py         # MurmurHash3 ring + vnode map

│   │   ├── daa.py               # Dynamic vnode allocation

│   │   ├── allocation\_engine.py # Scoring + node selection

│   │   └── chord\_router.py      # Finger table + multi-hop routing

│   ├── feedback/

│   │   └── optimizer.py         # 60 s feedback cycle

│   └── grpc/

│       ├── coordinator.proto

│       └── coordinator\_pb2\*.py  # Generated stubs

├── node/

│   ├── main.py                  # Node process entrypoint (gRPC server)

│   ├── scheduler.py             # WFQ async scheduler

│   ├── executor.py              # Simulated request execution

│   └── metrics\_exporter.py      # Prometheus node exporter

├── traffic\_generator/

│   ├── generator.py             # Async request injector

│   └── scenarios/

│       ├── uniform.yaml

│       ├── bursty.yaml

│       ├── flash\_crowd.yaml

│       └── random.yaml

├── evaluation/

│   ├── baselines/

│   │   ├── round\_robin.py

│   │   ├── least\_connections.py

│   │   └── static\_consistent\_hash.py

│   └── benchmark\_runner.py

├── models/

│   ├── classifier\_v1.joblib

│   └── forecaster\_v1.pt

├── infra/

│   ├── docker-compose.yml

│   ├── prometheus/

│   │   └── prometheus.yml

│   └── grafana/

│       └── dashboards/

├── db/

│   └── migrations/              # Alembic migration files

├── tests/

│   ├── unit/

│   ├── integration/

│   └── load/

├── .env.example

├── requirements.txt

└── README.md

## **12.5 Development Execution Plan**

|**Week**|**Focus**|**Key Deliverable**|
| :- | :- | :- |
|1|Docker Compose infra + simulated node pool + gRPC stubs|All services running; nodes accept dummy requests|
|2|Static hash ring + baseline LB modes + Traffic Generator|Round-robin, LCS, static hashing working; first benchmark|
|3|Feature pipeline + XGBoost training + inference integration|Classification live; class-breakdown visible in Grafana|
|4|WFQ scheduler + class-aware routing in coordinator|Measurable latency reduction vs baseline for heavy workloads|
|5|GRU forecaster training + background inference thread|Burst prediction output available every 5 s|
|6|DAA vnode adjustment + predictive hash ring|Ring adapts dynamically; load variance decreases under burst|
|7|Chord finger table construction + multi-hop routing|Overflow correctly routed; no routing loops observed|
|8|Feedback engine + 60 s optimization cycle|System self-adapts; vnode counts change automatically|
|9|Full evaluation — all scenarios vs all baselines|Latency / throughput / variance comparison tables|
|10|Tuning, edge-case fixes, documentation, final report|Reproducible benchmarks; clean codebase; README complete|

*— End of Document —*
