# Model Information — Predictive-Consistent-Hashing

> Generated: 2026-06-22 00:47:39

---

## 1. `classifier_v1.joblib` — XGBoost Request Classifier

### Overview

| Property | Value |
|---|---|
| Architecture | scikit-learn `Pipeline` → `StandardScaler` → `XGBClassifier` |
| Task | 3-class request classification: **Light / Medium / Heavy** |
| Features | 8-dimensional normalised feature vector |
| Training samples | 50 000 (synthetic, `seed=42`) |
| File size | 679.1 KB |
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
| Light  | exec_ms < 100 | 3,000 | 30.0% |
| Medium | 100 ≤ exec_ms ≤ 500 | 4,000 | 40.0% |
| Heavy  | exec_ms > 500 | 3,000 | 30.0% |

---

### Accuracy & Classification Scores

| Metric | Value |
|---|---|
| **Accuracy** | **0.9999 (99.99%)** |
| Balanced Accuracy | 0.9999 (99.99%) |
| F1 Score (macro) | 0.9999 |
| F1 Score (weighted) | 0.9999 |
| Precision (macro) | 0.9999 |
| Recall (macro) | 0.9999 |
| Matthews Corr. Coef. (MCC) | 0.9998 |
| Cohen's Kappa | 0.9998 |
| Log Loss | 0.0004 |
| ROC-AUC (OvR, macro) | 1.0000 |
| ROC-AUC (OvO, macro) | 1.0000 |

### Per-Class Scores

| Class | Precision | Recall | F1 |
|---|---|---|---|
| Light  | 1.0000 | 0.9997 | 0.9998 |
| Medium | 0.9998 | 1.0000 | 0.9999 |
| Heavy  | 1.0000 | 1.0000 | 1.0000 |

### 5-Fold Cross-Validation

| Metric | Mean | Std Dev |
|---|---|---|
| Accuracy | 0.9994 | ± 0.0005 |
| F1 (macro) | 0.9994 | ± 0.0005 |

### Confusion Matrix (rows = actual, cols = predicted)

|  | Pred Light | Pred Medium | Pred Heavy |
|---|---|---|---|
| **Actual Light** | 2999 | 1 | 0 |
| **Actual Medium** | 0 | 4000 | 0 |
| **Actual Heavy** | 0 | 0 | 3000 |

### Full Classification Report

```
              precision    recall  f1-score   support

       Light     1.0000    0.9997    0.9998      3000
      Medium     0.9998    1.0000    0.9999      4000
       Heavy     1.0000    1.0000    1.0000      3000

    accuracy                         0.9999     10000
   macro avg     0.9999    0.9999    0.9999     10000
weighted avg     0.9999    0.9999    0.9999     10000

```

### Inference Performance

| Metric | Value |
|---|---|
| Total inference time (n=10 000) | 43.61 ms |
| Per-sample latency | 4.361 µs |

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
| Total inference time (n=7186) | 1686.32 ms |
| Per-window latency | 234.667 µs |

---

## Summary

| Model | File | Task | Key Metric | Score |
|---|---|---|---|---|
| XGBoost Classifier | `classifier_v1.joblib` | 3-class request routing | Accuracy | **99.99%** |
| XGBoost Classifier | `classifier_v1.joblib` | 3-class request routing | F1 (macro) | **0.9999** |
| XGBoost Classifier | `classifier_v1.joblib` | 3-class request routing | ROC-AUC (OvR) | **1.0000** |
| GRU Forecaster | `forecaster_v1.pt` | Traffic count regression | MAE | **0.2328 req/s** |
| GRU Forecaster | `forecaster_v1.pt` | Traffic count regression | R² | **0.9593** |
| GRU Forecaster | `forecaster_v1.pt` | Burst detection | Accuracy | **99.92%** |
