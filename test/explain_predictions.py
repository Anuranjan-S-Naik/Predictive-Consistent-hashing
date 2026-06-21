"""
SHAP Explainability for XGBoost Request Classifier
====================================================
Generates SHAP explanations for the XGBoost classifier to understand
which features drive routing decisions.

Produces:
  1. Global feature importance (mean |SHAP|)
  2. Local explanations for sample requests (Light, Medium, Heavy)
  3. Summary statistics saved to test/results/shap_report.json

Usage:
    python test/explain_predictions.py

Requirements:
    pip install shap
"""

import os
import sys
import json
import time
import numpy as np
from pathlib import Path

ROOT = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(ROOT))

MODEL_DIR = ROOT / "models"
CLASSIFIER_PATH = MODEL_DIR / "classifier_v1.joblib"
RESULTS_DIR = ROOT / "test" / "results"

FEATURE_NAMES = [
    "payload_bytes",
    "cpu_estimate",
    "endpoint_id",
    "requests_last_5s",
    "avg_latency_ema",
    "queue_depth",
    "hour_of_day",
    "is_burst",
]

CLASS_NAMES = ["Light", "Medium", "Heavy"]


def load_model():
    """Load the trained XGBoost pipeline."""
    import joblib
    if not CLASSIFIER_PATH.exists():
        print(f"ERROR: Model not found at {CLASSIFIER_PATH}")
        sys.exit(1)
    return joblib.load(CLASSIFIER_PATH)


def generate_test_samples(n=500, seed=99):
    """Generate balanced test samples for SHAP analysis."""
    from coordinator.ml.train_classifier import generate_training_data
    X, y = generate_training_data(n=n, seed=seed)
    return X, y


def run_shap_analysis():
    """Run full SHAP analysis and produce report."""
    print("=" * 60)
    print("  SHAP Explainability Analysis")
    print("=" * 60)

    # Load model
    print("\n[1/5] Loading classifier...")
    pipeline = load_model()
    # Extract the XGBoost model from the sklearn pipeline
    xgb_model = pipeline.named_steps["classifier"]
    scaler = pipeline.named_steps["scaler"]

    # Generate data
    print("[2/5] Generating test data...")
    X_raw, y = generate_test_samples(n=500, seed=99)
    X_scaled = scaler.transform(X_raw)

    # Compute SHAP values
    print("[3/5] Computing SHAP values (this may take a moment)...")
    try:
        import shap
    except ImportError:
        print("\n  SHAP library not installed. Installing...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "shap", "-q"])
        import shap

    t0 = time.perf_counter()
    explainer = shap.TreeExplainer(xgb_model)
    shap_values_raw = explainer.shap_values(X_scaled)
    elapsed = time.perf_counter() - t0
    print(f"    SHAP computation: {elapsed:.2f}s for {X_scaled.shape[0]} samples")

    # Normalize shap_values to list-of-2D format: shap_values[class_idx] = (N, 8)
    if isinstance(shap_values_raw, list):
        # Old format: list of 3 arrays, each (N, 8)
        shap_values = shap_values_raw
    elif isinstance(shap_values_raw, np.ndarray):
        if shap_values_raw.ndim == 3:
            # New format: (N, 8, 3) -> transpose to list of (N, 8)
            shap_values = [shap_values_raw[:, :, c] for c in range(shap_values_raw.shape[2])]
        elif shap_values_raw.ndim == 2:
            # Single output: (N, 8) - wrap in list, duplicate for all classes
            shap_values = [shap_values_raw, shap_values_raw, shap_values_raw]
        else:
            print(f"  Unexpected SHAP shape: {shap_values_raw.shape}")
            return None
    else:
        print(f"  Unexpected SHAP type: {type(shap_values_raw)}")
        return None

    n_features_shap = shap_values[0].shape[1] if shap_values[0].ndim == 2 else 1
    print(f"    SHAP shape per class: {shap_values[0].shape} (expected N x {len(FEATURE_NAMES)})")

    # If SHAP returned fewer features than expected, trim feature names
    active_features = FEATURE_NAMES[:n_features_shap]

    # shap_values is a list of 3 arrays (one per class), each (N, n_features)
    # Global importance: mean absolute SHAP across all classes
    print("\n[4/5] Computing global feature importance...")

    global_importance = {}
    for i, fname in enumerate(active_features):
        mean_abs_shap = np.mean([
            np.abs(shap_values[cls][:, i]).mean()
            for cls in range(3)
        ])
        global_importance[fname] = round(float(mean_abs_shap), 4)

    # Sort by importance
    sorted_features = sorted(global_importance.items(), key=lambda x: x[1], reverse=True)

    print("\n  Global Feature Importance (mean |SHAP|):")
    print("  " + "-" * 45)
    for fname, score in sorted_features:
        bar = "#" * int(score * 50)
        print(f"  {fname:<20} {score:.4f}  {bar}")

    # Per-class importance
    per_class_importance = {}
    for cls_idx, cls_name in enumerate(CLASS_NAMES):
        cls_imp = {}
        for i, fname in enumerate(active_features):
            cls_imp[fname] = round(float(np.abs(shap_values[cls_idx][:, i]).mean()), 4)
        per_class_importance[cls_name] = cls_imp

    # Local explanations: pick 1 sample from each class
    print("\n[5/5] Generating local explanations...")

    local_explanations = []
    for cls_idx, cls_name in enumerate(CLASS_NAMES):
        # Find a sample predicted as this class
        mask = y == cls_idx
        if not np.any(mask):
            continue
        idx = np.where(mask)[0][0]

        sample_raw = X_raw[idx]
        sample_shap = {
            fname: {
                cname: round(float(shap_values[c][idx, i]), 4)
                for c, cname in enumerate(CLASS_NAMES)
            }
            for i, fname in enumerate(active_features)
        }

        # Most influential features for the predicted class
        cls_shap = shap_values[cls_idx][idx]
        top_features = sorted(
            zip(active_features, cls_shap),
            key=lambda x: abs(x[1]),
            reverse=True
        )[:3]

        explanation = {
            "sample_index": int(idx),
            "true_class": cls_name,
            "feature_values": {
                fname: round(float(sample_raw[i]), 4)
                for i, fname in enumerate(active_features)
            },
            "shap_values": sample_shap,
            "top_3_drivers": [
                {"feature": f, "shap_value": round(float(v), 4),
                 "direction": "pushes toward" if v > 0 else "pushes away from",
                 "class": cls_name}
                for f, v in top_features
            ],
        }
        local_explanations.append(explanation)

        print(f"\n  --- {cls_name} Request (sample #{idx}) ---")
        for f, v in top_features:
            direction = "+" if v > 0 else "-"
            fidx = active_features.index(f) if f in active_features else 0
            print(f"    {direction}{abs(v):.4f}  {f:<20}  (raw={sample_raw[fidx]:.4f})")

    # Build report
    report = {
        "model": "classifier_v1.joblib",
        "analysis_timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "n_samples": int(X_scaled.shape[0]),
        "shap_computation_sec": round(elapsed, 2),
        "global_feature_importance": dict(sorted_features),
        "per_class_importance": per_class_importance,
        "local_explanations": local_explanations,
        "feature_names": FEATURE_NAMES,
        "class_names": CLASS_NAMES,
    }

    # Save
    os.makedirs(RESULTS_DIR, exist_ok=True)
    out_path = RESULTS_DIR / "shap_report.json"
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\n  Report saved to: {out_path}")

    print(f"\n{'=' * 60}")
    print("  SHAP Analysis Complete")
    print(f"{'=' * 60}")

    return report


if __name__ == "__main__":
    run_shap_analysis()
