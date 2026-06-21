"""
Train Classifier on Real Data (P1.1)
=====================================
Reads real traffic logs from data/real_training_data.csv, extracts
the 12-dimensional features using FeaturePipeline, and trains the
new XGBoost classifier.
"""

import os
import csv
import numpy as np
import joblib
from pathlib import Path
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, confusion_matrix
from xgboost import XGBClassifier

from coordinator.intake.feature_pipeline import FeaturePipeline

ROOT = Path(__file__).parent.parent.parent.resolve()
DATA_FILE = ROOT / "data" / "real_training_data.csv"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "classifier_v1.joblib"

LABEL_MAP = {"Light": 0, "Medium": 1, "Heavy": 2}
LABEL_NAMES = ["Light", "Medium", "Heavy"]

def main():
    print("============================================================")
    print("  Training XGBoost Classifier on Real Traffic Data")
    print("============================================================")
    
    if not DATA_FILE.exists():
        print(f"ERROR: Data file not found at {DATA_FILE}")
        return

    # Initialize feature pipeline
    pipeline = FeaturePipeline()
    X = []
    y = []

    # Read CSV
    with open(DATA_FILE, "r") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Extract 12-dimensional feature vector
            features = pipeline.extract_features(
                endpoint=row["endpoint"],
                method=row["method"],
                payload_bytes=int(row["payload_bytes"])
            )
            
            X.append(features)
            y.append(LABEL_MAP.get(row["true_class"], 0))

    X = np.array(X)
    y = np.array(y)

    print(f"[OK] Loaded {len(X)} samples with {X.shape[1]} features.")

    # Train/Test Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Train XGBoost
    print("\nTraining XGBoost model...")
    model = XGBClassifier(
        n_estimators=150,
        max_depth=5,
        learning_rate=0.1,
        eval_metric='mlogloss',
        random_state=42,
        use_label_encoder=False
    )
    
    model.fit(X_train, y_train)
    
    print("[OK] Model trained successfully.")

    # Evaluate
    y_pred = model.predict(X_test)
    print("\nEvaluation Report (Test Set):")
    print("-" * 50)
    print(classification_report(y_test, y_pred, target_names=LABEL_NAMES))
    
    print("\nConfusion Matrix:")
    print(confusion_matrix(y_test, y_pred))

    # Save model
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    print(f"\n[OK] Model saved to {MODEL_PATH}")


if __name__ == "__main__":
    main()
