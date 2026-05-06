"""
Training Data Exporter
========================
Exports labelled request logs from the benchmark to CSV format
for ML training in Phase 5. Derives ground-truth class labels
from actual execution time:
  - Light:  < 100 ms
  - Medium: 100–500 ms
  - Heavy:  > 500 ms

Usage:
  python -m evaluation.export_training_data --output training_data.csv
"""

import csv
import logging
import random
import time
from pathlib import Path
from typing import List

from coordinator.intake.feature_pipeline import FeaturePipeline

logger = logging.getLogger("evaluation.export_training_data")
logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(name)s | %(levelname)s | %(message)s")

# Execution time ranges (ms) for ground-truth labeling
EXEC_TIMES = {"Light": (40, 60), "Medium": (150, 250), "Heavy": (800, 1200)}
CLASS_THRESHOLDS = {"light_max_ms": 100, "medium_max_ms": 500}

ENDPOINTS = ["/api/search", "/api/data", "/api/inference", "/api/status", "/api/batch"]
METHODS = ["GET", "POST", "PUT", "DELETE"]


def derive_ground_truth(execution_ms: float) -> str:
    """Derive ground-truth class label from actual execution time."""
    if execution_ms < CLASS_THRESHOLDS["light_max_ms"]:
        return "Light"
    elif execution_ms < CLASS_THRESHOLDS["medium_max_ms"]:
        return "Medium"
    else:
        return "Heavy"


def generate_training_dataset(
    num_samples: int = 50000,
    class_distribution: dict = None,
) -> List[dict]:
    """Generate a synthetic labelled training dataset.

    Each sample includes the 8-dimensional feature vector and ground-truth
    class label derived from simulated execution time.

    Args:
        num_samples: Number of training samples to generate.
        class_distribution: Dict of class -> probability.

    Returns:
        List of dicts with features + labels.
    """
    if class_distribution is None:
        class_distribution = {"Light": 0.50, "Medium": 0.35, "Heavy": 0.15}

    pipeline = FeaturePipeline()
    dataset = []

    logger.info(f"Generating {num_samples} training samples...")

    for i in range(num_samples):
        # Pick class based on distribution
        r = random.random()
        cumulative = 0.0
        actual_class = "Medium"
        for cls, prob in class_distribution.items():
            cumulative += prob
            if r <= cumulative:
                actual_class = cls
                break

        # Generate realistic request parameters based on class
        if actual_class == "Light":
            endpoint = random.choice(["/api/status", "/api/search"])
            method = "GET"
            payload = random.randint(64, 2000)
        elif actual_class == "Medium":
            endpoint = random.choice(["/api/data", "/api/search"])
            method = random.choice(["GET", "POST"])
            payload = random.randint(1000, 16000)
        else:
            endpoint = random.choice(["/api/inference", "/api/batch"])
            method = "POST"
            payload = random.randint(8000, 131072)

        # Simulated execution time
        min_ms, max_ms = EXEC_TIMES[actual_class]
        exec_ms = random.uniform(min_ms, max_ms)
        ground_truth = derive_ground_truth(exec_ms)

        # Extract features
        features = pipeline.extract_features(
            endpoint=endpoint,
            method=method,
            payload_bytes=payload,
            queue_depth=random.randint(0, 200),
            current_latency_ms=exec_ms,
        )

        dataset.append({
            "request_id": f"train_{i:08d}",
            "f_payload_bytes": features[0],
            "f_cpu_estimate": features[1],
            "f_endpoint_id": features[2],
            "f_requests_last_5s": features[3],
            "f_avg_latency_ema": features[4],
            "f_queue_depth": features[5],
            "f_hour_of_day": features[6],
            "f_is_burst": features[7],
            "endpoint": endpoint,
            "method": method,
            "payload_bytes": payload,
            "execution_ms": round(exec_ms, 2),
            "ground_truth_class": ground_truth,
        })

        if (i + 1) % 10000 == 0:
            logger.info(f"  Generated {i + 1}/{num_samples} samples")

    return dataset


def export_to_csv(dataset: List[dict], output_path: str):
    """Export training dataset to CSV."""
    if not dataset:
        logger.warning("Empty dataset, nothing to export")
        return

    fieldnames = list(dataset[0].keys())
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(dataset)

    logger.info(f"Training data exported: {len(dataset)} samples to {output_path}")

    # Print class distribution
    class_counts = {}
    for row in dataset:
        cls = row["ground_truth_class"]
        class_counts[cls] = class_counts.get(cls, 0) + 1
    logger.info(f"Class distribution: {class_counts}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="PAF Training Data Exporter")
    parser.add_argument("--output", default="training_data.csv", help="Output CSV path")
    parser.add_argument("--samples", type=int, default=50000, help="Number of samples")
    args = parser.parse_args()

    dataset = generate_training_dataset(args.samples)
    export_to_csv(dataset, args.output)
