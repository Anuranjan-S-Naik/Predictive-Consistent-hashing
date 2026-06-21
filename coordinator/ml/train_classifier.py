"""
XGBoost Request Classifier — Training Script (P5-T1)
======================================================
Generates synthetic labeled training data matching the 8-dim feature vector
from feature_pipeline.py, trains an XGBClassifier via scikit-learn pipeline,
and saves the model to models/classifier_v1.joblib.

Labels:
  Light  — execution_ms < 100
  Medium — 100 <= execution_ms <= 500
  Heavy  — execution_ms > 500

Run:  python -m coordinator.ml.train_classifier
"""

import os
import numpy as np
from sklearn.model_selection import cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import classification_report, confusion_matrix
from xgboost import XGBClassifier
import joblib

SEED = 42
N_SAMPLES = 50000
MODEL_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "classifier_v1.joblib")

# Feature indices (same order as feature_pipeline.py):
#   [0] payload_bytes_norm  [1] cpu_estimate  [2] endpoint_id_norm
#   [3] requests_last_5s    [4] avg_latency_ema [5] queue_depth
#   [6] hour_of_day         [7] is_burst

LABEL_MAP = {"Light": 0, "Medium": 1, "Heavy": 2}
LABEL_NAMES = ["Light", "Medium", "Heavy"]


def generate_training_data(n: int = N_SAMPLES, seed: int = SEED):
    """Generate synthetic labeled data that mimics real traffic patterns.

    Generates a balanced dataset (30% Light, 40% Medium, 30% Heavy) by
    adjusting feature distributions for each class type.
    """
    rng = np.random.RandomState(seed)

    n_light = int(n * 0.30)
    n_medium = int(n * 0.40)
    n_heavy = n - n_light - n_medium

    def gen_features(count, class_type):
        if class_type == "Light":
            payload = rng.beta(1, 10, count) * 0.05
            cpu_base = rng.choice([0.05, 0.1], count)
            endpoint_id = rng.choice([0.0, 0.25], count, p=[0.7, 0.3])
            queue = rng.beta(1, 10, count) * 0.1
            burst = np.zeros(count)
        elif class_type == "Medium":
            payload = rng.beta(2, 5, count) * 0.3
            cpu_base = rng.choice([0.2, 0.3, 0.4], count)
            endpoint_id = rng.choice([0.25, 0.5, 0.75], count)
            queue = rng.beta(2, 5, count) * 0.5
            burst = (rng.random(count) < 0.05).astype(float)
        else: # Heavy
            payload = rng.beta(2, 2, count) * 0.8 + 0.2
            cpu_base = rng.choice([0.6, 0.8, 0.9], count)
            endpoint_id = rng.choice([0.75, 1.0], count, p=[0.3, 0.7])
            queue = rng.beta(2, 2, count) * 0.8 + 0.2
            burst = (rng.random(count) < 0.2).astype(float)
            
        cpu_noise = rng.normal(0, 0.05, count)
        cpu_est = np.clip(cpu_base + cpu_noise + payload * 0.3, 0, 1)
        
        req_5s = rng.beta(2, 8, count)
        if class_type == "Heavy":
            req_5s = np.where(burst > 0.5, np.clip(req_5s + 0.4, 0, 1), req_5s)
            
        latency = np.clip(rng.beta(2, 5, count) * 0.6 + cpu_est * 0.3, 0, 1)
        hour = rng.uniform(0, 1, count)
        
        # Simulate execution_ms from features
        exec_ms = (
            50
            + payload * 800
            + cpu_est * 400
            + endpoint_id * 300
            + queue * 100
            + burst * 200
            + rng.normal(0, 10, count)
        )
        
        # Force bounds to guarantee class labels match the intent
        if class_type == "Light":
            exec_ms = np.clip(exec_ms, 10, 99)
        elif class_type == "Medium":
            exec_ms = np.clip(exec_ms, 100, 499)
        else:
            exec_ms = np.clip(exec_ms, 500, 2000)
            
        y = np.full(count, LABEL_MAP[class_type])
        X = np.column_stack([payload, cpu_est, endpoint_id, req_5s,
                             latency, queue, hour, burst])
        return X, y

    X_light, y_light = gen_features(n_light, "Light")
    X_medium, y_medium = gen_features(n_medium, "Medium")
    X_heavy, y_heavy = gen_features(n_heavy, "Heavy")
    
    X = np.vstack([X_light, X_medium, X_heavy])
    y = np.concatenate([y_light, y_medium, y_heavy])
    
    # Shuffle the dataset
    indices = np.arange(n)
    rng.shuffle(indices)
    X = X[indices]
    y = y[indices]

    print(f"Generated {n} samples")
    print(f"  Class distribution: Light={np.sum(y==0)}, Medium={np.sum(y==1)}, Heavy={np.sum(y==2)}")
    
    return X, y


def train_and_save():
    """Train XGBoost classifier and save to disk."""
    print("=" * 60)
    print("P5-T1: Training XGBoost Request Classifier")
    print("=" * 60)

    X, y = generate_training_data()

    # Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=SEED, stratify=y
    )
    print(f"\nTrain: {len(X_train)}, Test: {len(X_test)}")

    # Build pipeline
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("classifier", XGBClassifier(
            n_estimators=200,
            max_depth=6,
            learning_rate=0.1,
            subsample=0.8,
            colsample_bytree=0.8,

            eval_metric="mlogloss",
            random_state=SEED,
            n_jobs=-1,
        )),
    ])

    # 5-fold cross-validation
    print("\nRunning 5-fold cross-validation...")
    cv_scores = cross_val_score(pipeline, X_train, y_train, cv=5, scoring="accuracy")
    print(f"  CV Accuracy: {cv_scores.mean():.4f} ± {cv_scores.std():.4f}")

    # Train on full training set
    print("\nTraining final model...")
    pipeline.fit(X_train, y_train)

    # Evaluate on test set
    y_pred = pipeline.predict(X_test)
    accuracy = (y_pred == y_test).mean()
    print(f"\nTest Accuracy: {accuracy:.4f}")
    print(f"\nClassification Report:")
    print(classification_report(y_test, y_pred, target_names=LABEL_NAMES))
    print("Confusion Matrix:")
    print(confusion_matrix(y_test, y_pred))

    # Save model
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(pipeline, MODEL_PATH)
    model_size = os.path.getsize(MODEL_PATH) / 1024
    print(f"\nModel saved to: {MODEL_PATH} ({model_size:.1f} KB)")
    print("=" * 60)

    return accuracy


if __name__ == "__main__":
    acc = train_and_save()
    if acc < 0.88:
        print(f"[WARN] Accuracy {acc:.4f} is below 88% target!")
    else:
        print(f"[OK] Accuracy {acc:.4f} meets 88% target!")
