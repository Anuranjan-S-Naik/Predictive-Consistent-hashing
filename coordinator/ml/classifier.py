"""
XGBoost Request Classifier — Runtime Module (P5-T3)
=====================================================
Loads the trained classifier_v1.joblib model at startup and provides
a fast classify() method for real-time request classification.

Usage:
    classifier = RequestClassifier(config)
    label, confidence = classifier.classify(feature_vector)
"""

import logging
import os
import time
from typing import Optional, Tuple, List

import numpy as np

logger = logging.getLogger("coordinator.ml.classifier")

LABEL_NAMES = ["Light", "Medium", "Heavy"]

# Default model path (relative to project root)
DEFAULT_MODEL_PATH = "models/classifier_v1.joblib"


class RequestClassifier:
    """ML-based request classifier using trained XGBoost pipeline.

    Falls back to heuristic classification if model is not available.
    Thread-safe: scikit-learn predict is thread-safe for read-only operations.
    """

    def __init__(self, config: Optional[dict] = None):
        """Initialize classifier.

        Args:
            config: Optional config dict with ml.classifier settings.
        """
        cfg = (config or {}).get("ml", {}).get("classifier", {})
        self.model_path = cfg.get("model_path", DEFAULT_MODEL_PATH)
        self.confidence_threshold = cfg.get("confidence_threshold", 0.55)
        self.inference_timeout_ms = cfg.get("inference_timeout_ms", 5)

        self._model = None
        self._loaded = False
        self._total_predictions = 0
        self._total_fallbacks = 0
        self._avg_inference_ms = 0.0

    def load(self) -> bool:
        """Load the trained model from disk.

        Returns:
            True if model loaded successfully, False otherwise.
        """
        try:
            import joblib
            if not os.path.exists(self.model_path):
                logger.warning(
                    f"Classifier model not found at {self.model_path}. "
                    f"Using heuristic classification."
                )
                return False

            self._model = joblib.load(self.model_path)
            self._loaded = True
            logger.info(
                f"Classifier loaded from {self.model_path} "
                f"(confidence_threshold={self.confidence_threshold})"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to load classifier: {e}", exc_info=True)
            return False

    @property
    def is_loaded(self) -> bool:
        """Whether the ML model is loaded and ready."""
        return self._loaded

    def classify(self, feature_vector: List[float]) -> Tuple[str, float]:
        """Classify a request using the ML model.

        Args:
            feature_vector: 8-dimensional normalized feature vector from FeaturePipeline.

        Returns:
            Tuple of (class_label, confidence) where class_label is one of
            'Light', 'Medium', 'Heavy' and confidence is in [0, 1].
        """
        if not self._loaded:
            return self._heuristic_classify(feature_vector)

        try:
            start = time.perf_counter()

            # Reshape for scikit-learn: (1, 8)
            X = np.array(feature_vector, dtype=np.float64).reshape(1, -1)

            # Get class probabilities
            proba = self._model.predict_proba(X)[0]
            predicted_idx = int(np.argmax(proba))
            confidence = float(proba[predicted_idx])

            elapsed_ms = (time.perf_counter() - start) * 1000
            self._update_stats(elapsed_ms)

            # Low-confidence fallback to Medium
            if confidence < self.confidence_threshold:
                self._total_fallbacks += 1
                return "Medium", confidence

            return LABEL_NAMES[predicted_idx], confidence

        except Exception as e:
            logger.error(f"Classifier inference error: {e}", exc_info=True)
            return self._heuristic_classify(feature_vector)

    def _heuristic_classify(self, features: List[float]) -> Tuple[str, float]:
        """Fallback heuristic classification based on feature values.

        Uses payload_bytes and cpu_estimate features as primary signals.
        """
        payload_norm = features[0] if len(features) > 0 else 0.5
        cpu_est = features[1] if len(features) > 1 else 0.5

        if payload_norm > 0.5 or cpu_est > 0.7:
            return "Heavy", 0.65
        elif payload_norm > 0.15 or cpu_est > 0.3:
            return "Medium", 0.60
        else:
            return "Light", 0.70

    def _update_stats(self, inference_ms: float):
        """Update running statistics."""
        self._total_predictions += 1
        # Running average
        alpha = 0.1
        self._avg_inference_ms = (
            alpha * inference_ms + (1 - alpha) * self._avg_inference_ms
        )

    def get_stats(self) -> dict:
        """Get classifier statistics for monitoring."""
        return {
            "loaded": self._loaded,
            "model_path": self.model_path,
            "total_predictions": self._total_predictions,
            "total_fallbacks": self._total_fallbacks,
            "avg_inference_ms": round(self._avg_inference_ms, 4),
            "confidence_threshold": self.confidence_threshold,
            "fallback_rate": (
                round(self._total_fallbacks / max(self._total_predictions, 1), 4)
            ),
            "rolling_accuracy": round(self._rolling_accuracy, 4),
            "drift_info": self.get_drift_info(),
        }

    # ------------------------------------------------------------------
    # Drift Detection: Rolling Accuracy + Feature Distribution Tracking
    # ------------------------------------------------------------------

    def __init_drift_tracking(self):
        """Lazily called to set up drift tracking data structures."""
        if hasattr(self, '_drift_initialized'):
            return
        self._drift_initialized = True
        self._rolling_window_size = 500
        self._outcome_buffer = []   # list of (predicted, actual) tuples
        self._rolling_accuracy = 1.0
        # Feature distribution: store histogram bins for PSI
        self._n_bins = 10
        self._reference_histograms = {}  # feature_idx -> np.array of bin counts
        self._current_histograms = {}    # feature_idx -> np.array of bin counts
        self._feature_buffer = []        # list of feature vectors (recent window)
        self._feature_buffer_max = 1000
        self._psi_scores = {}            # feature_idx -> PSI value
        self._psi_threshold = 0.20       # PSI > 0.20 = significant drift

    def record_outcome(self, predicted_class: str, actual_class: str,
                       feature_vector: list = None):
        """Record the true outcome of a classified request for drift detection.

        Called when a request completes and we know the real execution time,
        which tells us the true class (Light/Medium/Heavy).

        Args:
            predicted_class: What the classifier predicted ("Light", "Medium", "Heavy").
            actual_class: The true class based on observed execution time.
            feature_vector: Optional 8-dim feature vector for PSI tracking.
        """
        self.__init_drift_tracking()

        correct = 1 if predicted_class == actual_class else 0
        self._outcome_buffer.append((predicted_class, actual_class, correct))

        # Keep only the last N outcomes
        if len(self._outcome_buffer) > self._rolling_window_size:
            self._outcome_buffer = self._outcome_buffer[-self._rolling_window_size:]

        # Update rolling accuracy
        if self._outcome_buffer:
            total_correct = sum(o[2] for o in self._outcome_buffer)
            self._rolling_accuracy = total_correct / len(self._outcome_buffer)

        # Track feature distributions for PSI
        if feature_vector is not None and len(feature_vector) == 8:
            self._feature_buffer.append(feature_vector)
            if len(self._feature_buffer) > self._feature_buffer_max:
                self._feature_buffer = self._feature_buffer[-self._feature_buffer_max:]

    def set_reference_distribution(self, X_reference: np.ndarray):
        """Set the reference (training) feature distribution for PSI calculation.

        Called once at startup with the training data feature matrix.

        Args:
            X_reference: (N, 8) numpy array of training data features.
        """
        self.__init_drift_tracking()
        for i in range(X_reference.shape[1]):
            col = X_reference[:, i]
            hist, _ = np.histogram(col, bins=self._n_bins, range=(0.0, 1.0))
            # Add smoothing to avoid division by zero
            hist = hist.astype(float) + 1e-6
            hist = hist / hist.sum()
            self._reference_histograms[i] = hist
        logger.info(f"Reference distribution set from {X_reference.shape[0]} samples")

    def compute_psi(self) -> dict:
        """Compute Population Stability Index for each feature.

        PSI measures how much the current feature distribution has shifted
        from the reference (training) distribution.

        PSI < 0.10 : No significant shift
        PSI 0.10-0.20 : Moderate shift, monitor closely
        PSI > 0.20 : Significant shift, consider retraining

        Returns:
            Dict of feature_index -> PSI score.
        """
        self.__init_drift_tracking()
        if not self._reference_histograms or len(self._feature_buffer) < 100:
            return {}

        X_current = np.array(self._feature_buffer)
        psi_scores = {}

        for i, ref_hist in self._reference_histograms.items():
            if i >= X_current.shape[1]:
                continue
            col = X_current[:, i]
            curr_hist, _ = np.histogram(col, bins=self._n_bins, range=(0.0, 1.0))
            curr_hist = curr_hist.astype(float) + 1e-6
            curr_hist = curr_hist / curr_hist.sum()

            # PSI = sum((current - reference) * ln(current / reference))
            psi = float(np.sum((curr_hist - ref_hist) * np.log(curr_hist / ref_hist)))
            psi_scores[i] = round(psi, 4)

        self._psi_scores = psi_scores
        return psi_scores

    def get_drift_info(self) -> dict:
        """Get drift detection status for the API and dashboard.

        Returns:
            Dict with rolling accuracy, PSI scores, and drift alert status.
        """
        self.__init_drift_tracking()
        psi_scores = self.compute_psi()

        feature_names = [
            "payload_bytes", "cpu_estimate", "endpoint_id",
            "requests_last_5s", "avg_latency_ema", "queue_depth",
            "hour_of_day", "is_burst",
        ]

        psi_named = {}
        max_psi = 0.0
        drifted_features = []

        for idx, score in psi_scores.items():
            name = feature_names[idx] if idx < len(feature_names) else f"feature_{idx}"
            psi_named[name] = score
            if score > max_psi:
                max_psi = score
            if score > self._psi_threshold:
                drifted_features.append(name)

        return {
            "rolling_accuracy": round(self._rolling_accuracy, 4),
            "outcome_count": len(self._outcome_buffer),
            "feature_buffer_size": len(self._feature_buffer),
            "psi_scores": psi_named,
            "max_psi": round(max_psi, 4),
            "psi_threshold": self._psi_threshold,
            "drift_detected": max_psi > self._psi_threshold,
            "drifted_features": drifted_features,
            "retrain_recommended": (
                self._rolling_accuracy < 0.90 or max_psi > self._psi_threshold
            ),
        }

