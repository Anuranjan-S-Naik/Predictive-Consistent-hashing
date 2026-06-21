"""
Feature Extraction Pipeline
=============================
Extracts a 12-dimensional normalized feature vector from each raw request:
  [0] payload_bytes      — min-max normalized, max=131072
  [1] cpu_estimate       — heuristic from endpoint + payload
  [2] endpoint_id        — integer encoding (0–4)
  [3] requests_last_5s   — Redis sliding window counter, normalized
  [4] avg_latency_ema    — Exponential moving average, normalized
  [5] queue_depth        — current coordinator queue depth, normalized
  [6] hour_of_day        — arrival hour / 24
  [7] is_burst           — binary (1 if requests_last_5s > 2x moving avg)
  --- v2 features (Feature Engineering v2) ---
  [8] method_encoded     — HTTP method: GET=0.0, POST=0.5, PUT=0.75, DELETE=1.0
  [9] error_rate_5m      — rolling 5-minute error rate, normalized
  [10] client_req_rate   — per-client requests/sec, normalized
  [11] cache_hit_ratio   — rolling cache hit ratio, normalized

Output: numpy-compatible list of 12 floats in [0, 1].
"""

import logging
import time
from collections import defaultdict
from datetime import datetime
from typing import Dict, List, Optional

logger = logging.getLogger("coordinator.intake.feature_pipeline")

# Normalization bounds from config
PAYLOAD_MAX = 131072        # 128 KB
REQUESTS_WINDOW_MAX = 200
LATENCY_EMA_MAX = 5000.0    # ms
QUEUE_DEPTH_MAX = 500
EMA_ALPHA = 0.3             # Smoothing factor for latency EMA

# Endpoint ID lookup
ENDPOINT_IDS = {
    "/api/search": 0,
    "/api/data": 1,
    "/api/inference": 2,
    "/api/status": 3,
    "/api/batch": 4,
}

# CPU estimate heuristic per endpoint
CPU_ESTIMATES = {
    "/api/search": 0.2,
    "/api/data": 0.4,
    "/api/inference": 0.9,
    "/api/status": 0.1,
    "/api/batch": 0.7,
}

# v2: HTTP method encoding
METHOD_ENCODING = {
    "GET": 0.0,
    "POST": 0.5,
    "PUT": 0.75,
    "DELETE": 1.0,
    "PATCH": 0.6,
    "HEAD": 0.1,
    "OPTIONS": 0.05,
}

# v2 normalization
CLIENT_RATE_MAX = 50.0       # max expected requests/sec per client
ERROR_RATE_WINDOW_SEC = 300  # 5 minutes


class FeaturePipeline:
    """Extracts and normalizes features from raw HTTP requests.

    Maintains internal state for sliding-window counters and EMA latency.
    Can optionally use Redis for distributed window counting.

    v2 adds: method encoding, error rate, client rate, cache hit ratio.
    """

    def __init__(self, redis_client=None, config: Optional[dict] = None):
        """
        Args:
            redis_client: Optional async Redis client for distributed counters.
            config: Optional config dict to override normalization bounds.
        """
        self.redis = redis_client

        # Load config overrides
        if config:
            features_cfg = config.get("features", {})
            norm = features_cfg.get("normalization", {})
            global PAYLOAD_MAX, REQUESTS_WINDOW_MAX, LATENCY_EMA_MAX, QUEUE_DEPTH_MAX, EMA_ALPHA
            PAYLOAD_MAX = norm.get("payload_bytes_max", PAYLOAD_MAX)
            REQUESTS_WINDOW_MAX = norm.get("requests_per_window_max", REQUESTS_WINDOW_MAX)
            LATENCY_EMA_MAX = norm.get("latency_ema_max_ms", LATENCY_EMA_MAX)
            QUEUE_DEPTH_MAX = norm.get("queue_depth_max", QUEUE_DEPTH_MAX)
            EMA_ALPHA = features_cfg.get("ema_alpha", EMA_ALPHA)

        # In-memory state (used when Redis is unavailable)
        self._request_count_window: List[float] = []  # Timestamps in last 5s
        self._latency_ema: float = 0.0
        self._request_count_ema: float = 0.0
        self._total_requests: int = 0

        # v2 state
        self._error_count_window: List[float] = []    # Error timestamps
        self._total_count_window: List[float] = []     # All request timestamps for error rate
        self._client_request_times: Dict[str, List[float]] = defaultdict(list)
        self._cache_hits: int = 0
        self._cache_total: int = 0
        self._cache_hit_ema: float = 0.5  # Start at 50%

    def _normalize(self, value: float, max_val: float) -> float:
        """Min-max normalize to [0, 1], clamped."""
        if max_val <= 0:
            return 0.0
        return min(max(value / max_val, 0.0), 1.0)

    def _get_requests_last_5s(self) -> int:
        """Count requests in the last 5 seconds (in-memory sliding window)."""
        now = time.time()
        cutoff = now - 5.0
        self._request_count_window = [t for t in self._request_count_window if t > cutoff]
        return len(self._request_count_window)

    def _update_latency_ema(self, latency_ms: float):
        """Update exponential moving average of latency."""
        if self._total_requests == 0:
            self._latency_ema = latency_ms
        else:
            self._latency_ema = EMA_ALPHA * latency_ms + (1 - EMA_ALPHA) * self._latency_ema

    def _is_burst(self, requests_last_5s: int) -> bool:
        """Detect burst: current window count > 2x the moving average."""
        if self._total_requests < 10:
            return False

        self._request_count_ema = (
            EMA_ALPHA * requests_last_5s + (1 - EMA_ALPHA) * self._request_count_ema
        )
        return requests_last_5s > 2.0 * self._request_count_ema

    # --- v2 feature helpers ---

    def _get_error_rate_5m(self) -> float:
        """Rolling 5-minute error rate."""
        now = time.time()
        cutoff = now - ERROR_RATE_WINDOW_SEC
        self._error_count_window = [t for t in self._error_count_window if t > cutoff]
        self._total_count_window = [t for t in self._total_count_window if t > cutoff]
        total = len(self._total_count_window)
        if total < 5:
            return 0.0
        return len(self._error_count_window) / total

    def _get_client_rate(self, client_id: str) -> float:
        """Get per-client request rate (requests/sec over last 10s)."""
        now = time.time()
        cutoff = now - 10.0
        self._client_request_times[client_id] = [
            t for t in self._client_request_times[client_id] if t > cutoff
        ]
        count = len(self._client_request_times[client_id])
        return count / 10.0  # requests per second

    def record_error(self):
        """Record that a request resulted in an error (4xx/5xx)."""
        self._error_count_window.append(time.time())

    def record_cache_result(self, hit: bool):
        """Record a cache hit or miss for the cache hit ratio feature."""
        self._cache_total += 1
        if hit:
            self._cache_hits += 1
        # Update EMA
        val = 1.0 if hit else 0.0
        self._cache_hit_ema = 0.1 * val + 0.9 * self._cache_hit_ema

    def extract_features(
        self,
        endpoint: str,
        method: str,
        payload_bytes: int,
        queue_depth: int = 0,
        current_latency_ms: float = 0.0,
        client_id: str = "",
    ) -> List[float]:
        """Extract and normalize the 12-dimensional feature vector (v2).

        Args:
            endpoint: Request path (e.g., '/api/search').
            method: HTTP method (e.g., 'POST').
            payload_bytes: Request body size in bytes.
            queue_depth: Current coordinator queue depth.
            current_latency_ms: Latest observed latency (for EMA update).
            client_id: Optional client identifier for per-client rate tracking.

        Returns:
            List of 12 normalized floats in [0, 1].
        """
        now = time.time()

        # Record this request in the sliding window
        self._request_count_window.append(now)
        self._total_count_window.append(now)
        self._total_requests += 1

        # Track client rate
        if client_id:
            self._client_request_times[client_id].append(now)

        # Update latency EMA
        if current_latency_ms > 0:
            self._update_latency_ema(current_latency_ms)

        # === Original 8 features ===

        # Feature 0: payload_bytes (normalized)
        f_payload = self._normalize(payload_bytes, PAYLOAD_MAX)

        # Feature 1: cpu_estimate (heuristic from endpoint + payload size)
        base_cpu = CPU_ESTIMATES.get(endpoint, 0.3)
        payload_factor = min(payload_bytes / PAYLOAD_MAX, 1.0)
        f_cpu = min(base_cpu + payload_factor * 0.3, 1.0)

        # Feature 2: endpoint_id (integer encoding, normalized to [0, 1])
        endpoint_id = ENDPOINT_IDS.get(endpoint, 0)
        f_endpoint = endpoint_id / max(len(ENDPOINT_IDS) - 1, 1)

        # Feature 3: requests_last_5s (sliding window count)
        requests_5s = self._get_requests_last_5s()
        f_requests = self._normalize(requests_5s, REQUESTS_WINDOW_MAX)

        # Feature 4: avg_latency_ema (normalized)
        f_latency = self._normalize(self._latency_ema, LATENCY_EMA_MAX)

        # Feature 5: queue_depth (normalized)
        f_queue = self._normalize(queue_depth, QUEUE_DEPTH_MAX)

        # Feature 6: hour_of_day (normalized)
        hour = datetime.now().hour
        f_hour = hour / 24.0

        # Feature 7: is_burst (binary)
        f_burst = 1.0 if self._is_burst(requests_5s) else 0.0

        # === v2 features ===

        # Feature 8: method_encoded
        f_method = METHOD_ENCODING.get(method.upper(), 0.3)

        # Feature 9: error_rate_5m
        f_error_rate = min(self._get_error_rate_5m(), 1.0)

        # Feature 10: client_request_rate (normalized)
        if client_id:
            client_rate = self._get_client_rate(client_id)
            f_client_rate = self._normalize(client_rate, CLIENT_RATE_MAX)
        else:
            f_client_rate = 0.0

        # Feature 11: cache_hit_ratio (EMA)
        f_cache_hit = self._cache_hit_ema

        return [
            f_payload, f_cpu, f_endpoint, f_requests, f_latency,
            f_queue, f_hour, f_burst,
            f_method, f_error_rate, f_client_rate, f_cache_hit,
        ]

    def extract_features_v1(
        self,
        endpoint: str,
        method: str,
        payload_bytes: int,
        queue_depth: int = 0,
        current_latency_ms: float = 0.0,
    ) -> List[float]:
        """Backward-compatible 8-feature extraction (v1).

        Returns only the original 8 features for the trained v1 classifier.
        """
        full = self.extract_features(
            endpoint, method, payload_bytes, queue_depth, current_latency_ms
        )
        return full[:8]

    def get_stats(self) -> Dict:
        """Get pipeline statistics."""
        return {
            "total_requests": self._total_requests,
            "latency_ema_ms": self._latency_ema,
            "request_count_ema": self._request_count_ema,
            "current_window_size": len(self._request_count_window),
            "feature_version": "v2",
            "feature_count": 12,
            "error_rate_5m": round(self._get_error_rate_5m(), 4),
            "cache_hit_ema": round(self._cache_hit_ema, 4),
            "tracked_clients": len(self._client_request_times),
        }
