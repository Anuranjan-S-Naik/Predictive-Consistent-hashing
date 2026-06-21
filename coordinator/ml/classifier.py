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
        }
