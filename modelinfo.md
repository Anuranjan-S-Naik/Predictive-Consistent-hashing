# Model Information — Predictive-Consistent-Hashing

> Generated: 2026-06-21 19:37:24

---

## 1. `classifier_v1.joblib` — XGBoost Request Classifier

### Overview

| Property | Value |
|---|---|
| Architecture | scikit-learn `Pipeline` → `StandardScaler` → `XGBClassifier` |
| Task | 3-class request classification: **Light / Medium / Heavy** |
| Features | 8-dimensional normalised feature vector |
| Training samples | 50 000 (synthetic, `seed=42`) |
| File size | 1762.2 KB |
| Evaluation set | 10,000 samples (`seed=999`, held-out) |

**Feature vector:**

| Idx | Feature | Description |
|---|---|---|
| 0 | `payload_bytes_norm` | Normalised request payload size |
| 1 | `cpu_estimate` | CPU complexity estimate |
| 2 | `endpoint_id_norm` | Endpoint type (5 discrete values) |
| 3 | `requests_last_5s` | Request rate in last 5 s |
| 4 | `avg_latency_ema` | Exponential moving avg of latency |
| 5 | `queue_depth` | Current queue depth |
| 6 | `hour_of_day` | Normalised hour (0–1) |
| 7 | `is_burst` | Binary burst flag |

**Label thresholds:**

| Class | Condition | Count | Share |
|---|---|---|---|
| Light  | exec_ms < 100 | 2 | 0.0% |
| Medium | 100 ≤ exec_ms ≤ 500 | 2,369 | 23.7% |
| Heavy  | exec_ms > 500 | 7,629 | 76.3% |

---

### Accuracy & Classification Scores

| Metric | Value |
|---|---|
| **Accuracy** | **0.9610 (96.10%)** |
| Balanced Accuracy | 0.6289 (62.89%) |
| F1 Score (macro) | 0.6305 |
| F1 Score (weighted) | 0.9608 |
| Precision (macro) | 0.6323 |
| Recall (macro) | 0.6289 |
| Matthews Corr. Coef. (MCC) | 0.8916 |
| Cohen's Kappa | 0.8915 |
| Log Loss | 0.0888 |
| ROC-AUC (OvR, macro) | 0.9956 |
| ROC-AUC (OvO, macro) | 0.9455 |

### Per-Class Scores

| Class | Precision | Recall | F1 |
|---|---|---|---|
| Light  | 0.0000 | 0.0000 | 0.0000 |
| Medium | 0.9249 | 0.9092 | 0.9170 |
| Heavy  | 0.9720 | 0.9773 | 0.9746 |

### 5-Fold Cross-Validation

| Metric | Mean | Std Dev |
|---|---|---|
| Accuracy | 0.9586 | ± 0.0043 |
| F1 (macro) | 0.8179 | ± 0.1580 |

### Confusion Matrix (rows = actual, cols = predicted)

|  | Pred Light | Pred Medium | Pred Heavy |
|---|---|---|---|
| **Actual Light** | 0 | 2 | 0 |
| **Actual Medium** | 0 | 2154 | 215 |
| **Actual Heavy** | 0 | 173 | 7456 |

### Full Classification Report

```
              precision    recall  f1-score   support

       Light     0.0000    0.0000    0.0000         2
      Medium     0.9249    0.9092    0.9170      2369
       Heavy     0.9720    0.9773    0.9746      7629

    accuracy                         0.9610     10000
   macro avg     0.6323    0.6289    0.6305     10000
weighted avg     0.9606    0.9610    0.9608     10000

```

### Inference Performance

| Metric | Value |
|---|---|
| Total inference time (n=10 000) | 53.85 ms |
| Per-sample latency | 5.385 µs |

---

## 2. `forecaster_v1.pt` — GRU Traffic Forecaster

### Overview

| Property | Value |
|---|---|
| Architecture | 2-layer GRU (64 hidden units) + FC head |
| Task | Regression — predict next-10-second heavy request count |
| Input | 60-point sliding window (1 feature: heavy reqs/s) |
| Parameters | 39,937 |
| File size | 160.8 KB |
| Training data | 10 h synthetic time-series (`seed=42`) |
| Evaluation set | 7,186 windows (`seed=777`, held-out) |

**Series statistics (training):**

| Stat | Value |
|---|---|
| Series mean | 4.5390 heavy reqs/s |
| Series std dev | 1.7189 |
| Series range (eval) | [0.00, 14.64] heavy reqs/s |

---

### Regression Scores

| Metric | Value |
|---|---|
| **MAE** | **0.2328 heavy reqs/s** |
| **RMSE** | **0.2914 heavy reqs/s** |
| **R²** | **0.9593** |
| MSE | 0.0849 |
| MAPE | 5.83% |
| MAE as % of mean | 5.18% |

### Burst Detection Performance

Burst = next-10 s avg > 1.5× trailing-10 s avg (operational threshold)

| Metric | Value |
|---|---|
| Burst rate (actual) | 0.08% |
| **Burst Detection Accuracy** | **0.9992 (99.92%)** |
| Burst Detection F1 | 0.0000 |

### Inference Performance

| Metric | Value |
|---|---|
| Total inference time (n=7186) | 2970.79 ms |
| Per-window latency | 413.413 µs |

---

## Summary

| Model | File | Task | Key Metric | Score |
|---|---|---|---|---|
| XGBoost Classifier | `classifier_v1.joblib` | 3-class request routing | Accuracy | **96.10%** |
| XGBoost Classifier | `classifier_v1.joblib` | 3-class request routing | F1 (macro) | **0.6305** |
| XGBoost Classifier | `classifier_v1.joblib` | 3-class request routing | ROC-AUC (OvR) | **0.9956** |
| GRU Forecaster | `forecaster_v1.pt` | Traffic count regression | MAE | **0.2328 req/s** |
| GRU Forecaster | `forecaster_v1.pt` | Traffic count regression | R² | **0.9593** |
| GRU Forecaster | `forecaster_v1.pt` | Burst detection | Accuracy | **99.92%** |
