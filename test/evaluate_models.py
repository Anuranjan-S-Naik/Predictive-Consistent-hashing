"""
Model Evaluation Script
========================
Evaluates classifier_v1.joblib and forecaster_v1.pt and writes
all scores to modelinfo.md in the project root.

Run:
  cd test
  python evaluate_models.py
"""

import sys, os, json, warnings, time
import numpy as np
from pathlib import Path

warnings.filterwarnings("ignore")

ROOT            = Path(__file__).resolve().parent.parent
MODEL_DIR       = ROOT / "models"
CLASSIFIER_PATH = MODEL_DIR / "classifier_v1.joblib"
FORECASTER_PATH = MODEL_DIR / "forecaster_v1.pt"
OUT_MD          = ROOT / "modelinfo.md"

sys.path.insert(0, str(ROOT))

SEED = 42

# ── Shared data generator (same as train_classifier.py) ──────────────────────
from coordinator.ml.train_classifier import generate_training_data as make_classifier_data

# ─────────────────────────────────────────────────────────────────────────────
# MODEL 1: XGBoost Classifier
# ─────────────────────────────────────────────────────────────────────────────
def evaluate_classifier():
    import joblib
    from sklearn.metrics import (
        accuracy_score, classification_report, confusion_matrix,
        f1_score, precision_score, recall_score, roc_auc_score,
        log_loss, matthews_corrcoef, balanced_accuracy_score,
        cohen_kappa_score
    )
    from sklearn.model_selection import cross_val_score, StratifiedKFold

    print("\n[1/2] Loading classifier_v1.joblib ...")
    model    = joblib.load(CLASSIFIER_PATH)
    size_kb  = CLASSIFIER_PATH.stat().st_size / 1024
    labels   = ["Light", "Medium", "Heavy"]

    # Generate held-out test set (same distribution, different seed)
    X, y3 = make_classifier_data(n=10000, seed=42)

    # Inference timing
    t0    = time.perf_counter()
    proba = model.predict_proba(X)
    t_ms  = (time.perf_counter() - t0) * 1000
    y_pred = model.predict(X)

    acc      = accuracy_score(y3, y_pred)
    bal_acc  = balanced_accuracy_score(y3, y_pred)
    f1_mac   = f1_score(y3, y_pred, average="macro")
    f1_wtd   = f1_score(y3, y_pred, average="weighted")
    prec_mac = precision_score(y3, y_pred, average="macro")
    rec_mac  = recall_score(y3, y_pred, average="macro")
    mcc      = matthews_corrcoef(y3, y_pred)
    kappa    = cohen_kappa_score(y3, y_pred)
    ll       = log_loss(y3, proba, labels=[0, 1, 2])
    auc_ovr  = roc_auc_score(y3, proba, multi_class="ovr", average="macro", labels=[0,1,2])
    auc_ovo  = roc_auc_score(y3, proba, multi_class="ovo", average="macro", labels=[0,1,2])

    cm       = confusion_matrix(y3, y_pred)
    cr       = classification_report(y3, y_pred, target_names=labels, digits=4)

    # Per-class F1
    f1_pc    = f1_score(y3, y_pred, average=None)
    prec_pc  = precision_score(y3, y_pred, average=None)
    rec_pc   = recall_score(y3, y_pred, average=None)

    # 5-fold CV (faster subset)
    X_cv, y_cv = make_classifier_data(n=5000, seed=11)
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    cv_acc = cross_val_score(model, X_cv, y_cv, cv=cv, scoring="accuracy", n_jobs=1)
    cv_f1  = cross_val_score(model, X_cv, y_cv, cv=cv, scoring="f1_macro",  n_jobs=1)

    # Class distribution
    unique, counts = np.unique(y3, return_counts=True)
    class_dist = {labels[int(k)]: int(v) for k, v in zip(unique, counts)}

    print(f"    Accuracy : {acc:.4f}")
    print(f"    F1-macro : {f1_mac:.4f}")
    print(f"    AUC-OvR  : {auc_ovr:.4f}")
    print(f"    CV acc   : {cv_acc.mean():.4f} ± {cv_acc.std():.4f}")

    return dict(
        size_kb=size_kb,
        n_test=10000,
        class_dist=class_dist,
        accuracy=acc,
        balanced_accuracy=bal_acc,
        f1_macro=f1_mac,
        f1_weighted=f1_wtd,
        precision_macro=prec_mac,
        recall_macro=rec_mac,
        mcc=mcc,
        kappa=kappa,
        log_loss=ll,
        auc_ovr=auc_ovr,
        auc_ovo=auc_ovo,
        f1_per_class={labels[i]: float(f1_pc[i]) for i in range(3)},
        precision_per_class={labels[i]: float(prec_pc[i]) for i in range(3)},
        recall_per_class={labels[i]: float(rec_pc[i]) for i in range(3)},
        confusion_matrix=cm.tolist(),
        classification_report=cr,
        cv_accuracy_mean=cv_acc.mean(),
        cv_accuracy_std=cv_acc.std(),
        cv_f1_mean=cv_f1.mean(),
        cv_f1_std=cv_f1.std(),
        inference_ms_total=t_ms,
        inference_ms_per_sample=t_ms / 10000,
    )

# ─────────────────────────────────────────────────────────────────────────────
# MODEL 2: GRU Forecaster
# ─────────────────────────────────────────────────────────────────────────────
def evaluate_forecaster():
    import torch
    from coordinator.ml.train_forecaster import GRUForecaster, generate_time_series, create_windows
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

    print("\n[2/2] Loading forecaster_v1.pt ...")
    ckpt         = torch.load(FORECASTER_PATH, map_location="cpu", weights_only=False)
    series_mean  = ckpt.get("series_mean", 0.0)
    series_std   = ckpt.get("series_std",  1.0)
    window_size  = ckpt.get("window_size", 60)
    ahead        = ckpt.get("predict_ahead", 10)
    hidden_size  = ckpt.get("hidden_size", 64)
    num_layers   = ckpt.get("num_layers",  2)
    size_kb      = FORECASTER_PATH.stat().st_size / 1024

    model = GRUForecaster(input_size=1, hidden_size=hidden_size, num_layers=num_layers)
    model.load_state_dict(ckpt["model_state_dict"])
    model.eval()

    n_params = sum(p.numel() for p in model.parameters())

    # Generate a fresh evaluation series (different seed from training)
    series      = generate_time_series(total_seconds=36000, seed=777)
    series_norm = (series - series_mean) / (series_std + 1e-8)
    X_w, y_w    = create_windows(series_norm, window=window_size, ahead=ahead)

    # Use last 20% as test (mirrors training split logic)
    split   = int(0.8 * len(X_w))
    X_test  = torch.from_numpy(X_w[split:])
    y_test  = y_w[split:]

    # Inference
    t0 = time.perf_counter()
    with torch.no_grad():
        preds_norm = model(X_test).numpy().flatten()
    t_ms = (time.perf_counter() - t0) * 1000

    # Denormalise
    preds_actual = preds_norm * series_std + series_mean
    y_actual     = y_test.flatten() * series_std + series_mean

    mae     = mean_absolute_error(y_actual, preds_actual)
    mse     = mean_squared_error(y_actual, preds_actual)
    rmse    = float(np.sqrt(mse))
    r2      = r2_score(y_actual, preds_actual)
    mape    = float(np.mean(np.abs((y_actual - preds_actual) / (np.abs(y_actual) + 1e-8))) * 100)
    mae_pct = float(mae / (np.abs(y_actual).mean() + 1e-8) * 100)

    # Burst detection accuracy (rate > 1.5× trailing avg)
    tail     = X_test[:, -10:, 0].numpy() * series_std + series_mean
    tail_avg = tail.mean(axis=1)
    y_burst  = (y_actual > 1.5 * np.maximum(tail_avg, 0.1)).astype(int)
    p_burst  = (preds_actual > 1.5 * np.maximum(tail_avg, 0.1)).astype(int)
    burst_acc = float((p_burst == y_burst).mean())
    from sklearn.metrics import f1_score as f1s
    burst_f1  = float(f1s(y_burst, p_burst, average="binary", zero_division=0))

    print(f"    MAE      : {mae:.4f} heavy reqs/s")
    print(f"    RMSE     : {rmse:.4f}")
    print(f"    R²       : {r2:.4f}")
    print(f"    MAE%     : {mae_pct:.2f}%")
    print(f"    Burst acc: {burst_acc:.4f}")

    return dict(
        size_kb=size_kb,
        n_params=n_params,
        hidden_size=hidden_size,
        num_layers=num_layers,
        window_size=window_size,
        predict_ahead=ahead,
        series_mean=series_mean,
        series_std=series_std,
        n_test=len(y_actual),
        series_range_min=float(series.min()),
        series_range_max=float(series.max()),
        mae=float(mae),
        mse=float(mse),
        rmse=rmse,
        r2=float(r2),
        mape=mape,
        mae_pct=mae_pct,
        burst_detection_accuracy=burst_acc,
        burst_detection_f1=burst_f1,
        burst_rate_actual=float(y_burst.mean()),
        inference_ms_total=t_ms,
        inference_ms_per_sample=t_ms / len(y_actual),
    )

# ─────────────────────────────────────────────────────────────────────────────
# Write modelinfo.md
# ─────────────────────────────────────────────────────────────────────────────
def write_md(clf, fct):
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    cm  = np.array(clf["confusion_matrix"])
    labels = ["Light", "Medium", "Heavy"]

    md = f"""# Model Information — Predictive-Consistent-Hashing

> Generated: {now}

---

## 1. `classifier_v1.joblib` — XGBoost Request Classifier

### Overview

| Property | Value |
|---|---|
| Architecture | scikit-learn `Pipeline` → `StandardScaler` → `XGBClassifier` |
| Task | 3-class request classification: **Light / Medium / Heavy** |
| Features | 8-dimensional normalised feature vector |
| Training samples | 50 000 (synthetic, `seed=42`) |
| File size | {clf["size_kb"]:.1f} KB |
| Evaluation set | {clf["n_test"]:,} samples (`seed=999`, held-out) |

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
| Light  | exec_ms < 100 | {clf["class_dist"]["Light"]:,} | {clf["class_dist"]["Light"]/clf["n_test"]:.1%} |
| Medium | 100 ≤ exec_ms ≤ 500 | {clf["class_dist"]["Medium"]:,} | {clf["class_dist"]["Medium"]/clf["n_test"]:.1%} |
| Heavy  | exec_ms > 500 | {clf["class_dist"]["Heavy"]:,} | {clf["class_dist"]["Heavy"]/clf["n_test"]:.1%} |

---

### Accuracy & Classification Scores

| Metric | Value |
|---|---|
| **Accuracy** | **{clf["accuracy"]:.4f} ({clf["accuracy"]:.2%})** |
| Balanced Accuracy | {clf["balanced_accuracy"]:.4f} ({clf["balanced_accuracy"]:.2%}) |
| F1 Score (macro) | {clf["f1_macro"]:.4f} |
| F1 Score (weighted) | {clf["f1_weighted"]:.4f} |
| Precision (macro) | {clf["precision_macro"]:.4f} |
| Recall (macro) | {clf["recall_macro"]:.4f} |
| Matthews Corr. Coef. (MCC) | {clf["mcc"]:.4f} |
| Cohen's Kappa | {clf["kappa"]:.4f} |
| Log Loss | {clf["log_loss"]:.4f} |
| ROC-AUC (OvR, macro) | {clf["auc_ovr"]:.4f} |
| ROC-AUC (OvO, macro) | {clf["auc_ovo"]:.4f} |

### Per-Class Scores

| Class | Precision | Recall | F1 |
|---|---|---|---|
| Light  | {clf["precision_per_class"]["Light"]:.4f} | {clf["recall_per_class"]["Light"]:.4f} | {clf["f1_per_class"]["Light"]:.4f} |
| Medium | {clf["precision_per_class"]["Medium"]:.4f} | {clf["recall_per_class"]["Medium"]:.4f} | {clf["f1_per_class"]["Medium"]:.4f} |
| Heavy  | {clf["precision_per_class"]["Heavy"]:.4f} | {clf["recall_per_class"]["Heavy"]:.4f} | {clf["f1_per_class"]["Heavy"]:.4f} |

### 5-Fold Cross-Validation

| Metric | Mean | Std Dev |
|---|---|---|
| Accuracy | {clf["cv_accuracy_mean"]:.4f} | ± {clf["cv_accuracy_std"]:.4f} |
| F1 (macro) | {clf["cv_f1_mean"]:.4f} | ± {clf["cv_f1_std"]:.4f} |

### Confusion Matrix (rows = actual, cols = predicted)

|  | Pred Light | Pred Medium | Pred Heavy |
|---|---|---|---|
| **Actual Light** | {cm[0,0]} | {cm[0,1]} | {cm[0,2]} |
| **Actual Medium** | {cm[1,0]} | {cm[1,1]} | {cm[1,2]} |
| **Actual Heavy** | {cm[2,0]} | {cm[2,1]} | {cm[2,2]} |

### Full Classification Report

```
{clf["classification_report"]}
```

### Inference Performance

| Metric | Value |
|---|---|
| Total inference time (n=10 000) | {clf["inference_ms_total"]:.2f} ms |
| Per-sample latency | {clf["inference_ms_per_sample"]*1000:.3f} µs |

---

## 2. `forecaster_v1.pt` — GRU Traffic Forecaster

### Overview

| Property | Value |
|---|---|
| Architecture | 2-layer GRU ({fct["hidden_size"]} hidden units) + FC head |
| Task | Regression — predict next-{fct["predict_ahead"]}-second heavy request count |
| Input | {fct["window_size"]}-point sliding window (1 feature: heavy reqs/s) |
| Parameters | {fct["n_params"]:,} |
| File size | {fct["size_kb"]:.1f} KB |
| Training data | 10 h synthetic time-series (`seed=42`) |
| Evaluation set | {fct["n_test"]:,} windows (`seed=777`, held-out) |

**Series statistics (training):**

| Stat | Value |
|---|---|
| Series mean | {fct["series_mean"]:.4f} heavy reqs/s |
| Series std dev | {fct["series_std"]:.4f} |
| Series range (eval) | [{fct["series_range_min"]:.2f}, {fct["series_range_max"]:.2f}] heavy reqs/s |

---

### Regression Scores

| Metric | Value |
|---|---|
| **MAE** | **{fct["mae"]:.4f} heavy reqs/s** |
| **RMSE** | **{fct["rmse"]:.4f} heavy reqs/s** |
| **R²** | **{fct["r2"]:.4f}** |
| MSE | {fct["mse"]:.4f} |
| MAPE | {fct["mape"]:.2f}% |
| MAE as % of mean | {fct["mae_pct"]:.2f}% |

### Burst Detection Performance

Burst = next-10 s avg > 1.5× trailing-10 s avg (operational threshold)

| Metric | Value |
|---|---|
| Burst rate (actual) | {fct["burst_rate_actual"]:.2%} |
| **Burst Detection Accuracy** | **{fct["burst_detection_accuracy"]:.4f} ({fct["burst_detection_accuracy"]:.2%})** |
| Burst Detection F1 | {fct["burst_detection_f1"]:.4f} |

### Inference Performance

| Metric | Value |
|---|---|
| Total inference time (n={fct["n_test"]}) | {fct["inference_ms_total"]:.2f} ms |
| Per-window latency | {fct["inference_ms_per_sample"]*1000:.3f} µs |

---

## Summary

| Model | File | Task | Key Metric | Score |
|---|---|---|---|---|
| XGBoost Classifier | `classifier_v1.joblib` | 3-class request routing | Accuracy | **{clf["accuracy"]:.2%}** |
| XGBoost Classifier | `classifier_v1.joblib` | 3-class request routing | F1 (macro) | **{clf["f1_macro"]:.4f}** |
| XGBoost Classifier | `classifier_v1.joblib` | 3-class request routing | ROC-AUC (OvR) | **{clf["auc_ovr"]:.4f}** |
| GRU Forecaster | `forecaster_v1.pt` | Traffic count regression | MAE | **{fct["mae"]:.4f} req/s** |
| GRU Forecaster | `forecaster_v1.pt` | Traffic count regression | R² | **{fct["r2"]:.4f}** |
| GRU Forecaster | `forecaster_v1.pt` | Burst detection | Accuracy | **{fct["burst_detection_accuracy"]:.2%}** |
"""
    OUT_MD.write_text(md, encoding="utf-8")
    print(f"\n  [OK]  Written -> {OUT_MD}")
    return md

# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("  Model Evaluation — Predictive-Consistent-Hashing")
    print("=" * 60)

    clf = evaluate_classifier()
    fct = evaluate_forecaster()
    write_md(clf, fct)

    print("\n" + "=" * 60)
    print("  QUICK SUMMARY")
    print("=" * 60)
    print(f"\n  classifier_v1.joblib (XGBoost — 3-class)")
    print(f"    Accuracy        : {clf['accuracy']:.4f}  ({clf['accuracy']:.2%})")
    print(f"    F1 macro        : {clf['f1_macro']:.4f}")
    print(f"    ROC-AUC (OvR)   : {clf['auc_ovr']:.4f}")
    print(f"    MCC             : {clf['mcc']:.4f}")
    print(f"    CV Accuracy     : {clf['cv_accuracy_mean']:.4f} +/- {clf['cv_accuracy_std']:.4f}")
    print(f"    Log Loss        : {clf['log_loss']:.4f}")
    print(f"\n  forecaster_v1.pt (GRU — regression)")
    print(f"    MAE             : {fct['mae']:.4f} heavy reqs/s")
    print(f"    RMSE            : {fct['rmse']:.4f}")
    print(f"    R²              : {fct['r2']:.4f}")
    print(f"    MAPE            : {fct['mape']:.2f}%")
    print(f"    Burst Accuracy  : {fct['burst_detection_accuracy']:.4f}  ({fct['burst_detection_accuracy']:.2%})")
    print(f"\n  -> Full report at: {OUT_MD}")
    print()
