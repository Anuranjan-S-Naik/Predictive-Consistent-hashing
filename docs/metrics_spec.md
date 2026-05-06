# Evaluation Metrics Specification

## Overview
This document defines all metrics used to evaluate the Predictive Adaptive Request
Allocation Framework against baseline load-balancing strategies. These metrics are
collected during every benchmark run and stored in the `experiments` table (PostgreSQL)
and InfluxDB time-series measurements.

---

## 1. Primary Evaluation Metrics

### 1.1 Latency Metrics
Measured end-to-end: from request arrival at coordinator to completion ACK from node.

| Metric | Unit | How Collected | Granularity |
|--------|------|--------------|-------------|
| `latency_p50_ms` | milliseconds | Histogram percentile from Prometheus | Per-experiment |
| `latency_p95_ms` | milliseconds | Histogram percentile from Prometheus | Per-experiment |
| `latency_p99_ms` | milliseconds | Histogram percentile from Prometheus | Per-experiment |
| `latency_per_class_p95_ms` | milliseconds | Histogram by class label tag | Per-class per-experiment |

**What "latency" includes:**
- Feature extraction time
- ML classification inference time
- Ring lookup + allocation scoring time
- gRPC dispatch to node
- Queue wait time at node
- Simulated execution time at node
- gRPC completion ACK back to coordinator

**What "latency" excludes:**
- Network latency to traffic generator (localhost, negligible)
- PostgreSQL logging write time (async, off critical path)

### 1.2 Throughput Metrics

| Metric | Unit | How Collected | Granularity |
|--------|------|--------------|-------------|
| `throughput_rps` | requests/second | Counter rate over experiment duration | Per-experiment |
| `throughput_per_class_rps` | requests/second | Counter rate by class label tag | Per-class per-experiment |
| `effective_throughput_pct` | percentage | (completed / submitted) × 100 | Per-experiment |

### 1.3 Load Distribution Metrics

| Metric | Unit | How Collected | Granularity |
|--------|------|--------------|-------------|
| `load_variance_stddev` | CPU% stddev | stddev(cpu_pct) across all nodes, sampled every 5s | Per-experiment |
| `load_imbalance_ratio` | ratio | max(cpu_pct) / min(cpu_pct) across nodes | Per-experiment |
| `avg_cpu_utilization_pct` | percentage | Mean CPU% across all nodes | Per-experiment |
| `per_node_request_count` | count | Requests routed to each node | Per-node per-experiment |

### 1.4 Failure & Rejection Metrics

| Metric | Unit | How Collected | Granularity |
|--------|------|--------------|-------------|
| `failure_rate_pct` | percentage | (rejected + timed_out) / total × 100 | Per-experiment |
| `rejection_count_503` | count | HTTP 503 queue-full rejections | Per-experiment |
| `timeout_count` | count | Requests exceeding 30s hard timeout | Per-experiment |

---

## 2. ML-Specific Metrics

### 2.1 Classifier Metrics

| Metric | Unit | Target | How Collected |
|--------|------|--------|--------------|
| `classifier_accuracy` | percentage | ≥88% overall | Compared against ground-truth execution_ms |
| `classifier_accuracy_light` | percentage | ≥90% | Per-class accuracy |
| `classifier_accuracy_medium` | percentage | ≥80% | Per-class accuracy |
| `classifier_accuracy_heavy` | percentage | ≥90% | Per-class accuracy |
| `classifier_inference_ms` | milliseconds | <1ms per request | Timed in coordinator pipeline |
| `classifier_confidence_avg` | 0.0–1.0 | >0.70 | Mean prediction confidence |
| `classifier_fallback_rate` | percentage | <10% | Rate of low-confidence → Medium fallback |

### 2.2 Forecaster Metrics

| Metric | Unit | Target | How Collected |
|--------|------|--------|--------------|
| `forecaster_mae` | count | Within 15% of actual | abs(predicted - actual) on heavy count |
| `burst_detection_accuracy_pct` | percentage | ≥80% | Correctly predicted burst_imminent before actual burst |
| `burst_detection_lead_time_sec` | seconds | ≥5s | Time between forecast alert and actual burst start |
| `forecaster_inference_ms` | milliseconds | <50ms | GRU inference latency per cycle |
| `forecast_staleness_sec` | seconds | <15s | Age of latest forecast in Redis |

---

## 3. System / Routing Metrics

| Metric | Unit | How Collected | Granularity |
|--------|------|--------------|-------------|
| `avg_routing_hops` | count | Mean hops per request (1 = direct, >1 = Chord forwarded) | Per-experiment |
| `chord_overflow_rate_pct` | percentage | Requests requiring Chord multi-hop | Per-experiment |
| `chord_fallback_rate_pct` | percentage | Requests falling back to least-connections | Per-experiment |
| `vnode_adjustment_count` | count | Number of DAA vnode recalculations | Per-experiment |
| `vnode_adaptation_lag_ms` | milliseconds | Time from metric change to ring update | Per-event |
| `feedback_cycle_count` | count | Number of 60s feedback loops executed | Per-experiment |
| `avg_queue_depth` | count | Mean queue depth across all nodes | Per-experiment |
| `peak_queue_depth` | count | Maximum queue depth observed | Per-experiment |

---

## 4. SLO Thresholds

These thresholds trigger alerts in Prometheus Alertmanager and are logged as
`feedback_events` in PostgreSQL when exceeded.

| Metric | Uniform SLO | Bursty SLO | Flash Crowd SLO | Random SLO |
|--------|------------|------------|-----------------|------------|
| `latency_p99_ms` | ≤500 | ≤1500 | ≤5000 | ≤2000 |
| `failure_rate_pct` | ≤1.0% | ≤3.0% | ≤10.0% | ≤5.0% |
| `load_variance_stddev` | ≤15.0 | ≤25.0 | ≤35.0 | ≤30.0 |
| `node_cpu_pct` (any single) | ≤90% sustained >30s | ≤90% sustained >30s | ≤95% sustained >30s | ≤90% sustained >30s |

---

## 5. Comparison Baselines

Every benchmark run executes the scenario against **4 allocation modes**:

| Mode | Description | Expected Weakness |
|------|-------------|-------------------|
| `round_robin` | Cycle through nodes sequentially | Ignores node capacity and load |
| `least_connections` | Route to node with fewest active requests | Reactive; no prediction |
| `static_consistent_hash` | MurmurHash3 ring with fixed vnode distribution | No adaptation to load changes |
| `predictive_framework` | Full system: XGBoost + GRU + DAA + Chord | (This is the system under test) |

**Total benchmark matrix:** 4 scenarios × 4 modes = **16 experiment runs**

---

## 6. Ground-Truth Class Labeling

During Phase 3 baseline runs, ground-truth class labels are derived from actual
execution time to create the ML training dataset:

| Execution Time | Ground-Truth Label |
|----------------|-------------------|
| < 100 ms | Light |
| 100–500 ms | Medium |
| > 500 ms | Heavy |

---

## 7. Result Storage

| Store | What | Retention |
|-------|------|-----------|
| PostgreSQL `experiments` table | Summary per experiment run (JSON results_summary) | Permanent |
| PostgreSQL `predictions` table | Per-request: predicted_class, confidence, execution_ms | Permanent |
| InfluxDB `request_rate` | Per-second request counters by class and node | 30 days |
| InfluxDB `node_metrics` | Per-node CPU, queue, latency time-series | 30 days |
| Grafana dashboards | Visual comparison panels | Persistent config |
| `results_summary.csv` | Exported flat file for paper/report tables | Git-tracked |
