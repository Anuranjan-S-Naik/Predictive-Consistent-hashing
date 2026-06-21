"""
GRU Traffic Forecaster — Runtime Module (P5-T4)
=================================================
Background asyncio task that runs GRU inference every 5 seconds:

  1. Queries InfluxDB for last 60 heavy-request-count data points
     (falls back to internal sliding-window counter)
  2. Runs GRU inference to predict next-10s heavy request volume
  3. Writes forecast to Redis key `forecast:latest` (TTL 15s)
  4. Sets burst_imminent flag if predicted > 1.5× current average
  5. Notifies DAA engine of burst state changes

Usage:
    forecaster = TrafficForecaster(config, daa_engine)
    await forecaster.start()
"""

import asyncio
import logging
import os
import time
from collections import deque
from typing import Dict, Optional, TYPE_CHECKING

import numpy as np

logger = logging.getLogger("coordinator.ml.forecaster")

if TYPE_CHECKING:
    from coordinator.routing.daa import DynamicAdaptiveAllocator

# Default config
DEFAULT_MODEL_PATH = "models/forecaster_v1.pt"
DEFAULT_WINDOW_SIZE = 60
DEFAULT_PREDICT_AHEAD = 10
DEFAULT_INTERVAL_SEC = 5
DEFAULT_BURST_MULTIPLIER = 1.5
DEFAULT_STALE_AFTER_SEC = 30
DEFAULT_WARMUP_MIN_POINTS = 60


class TrafficForecaster:
    """Background forecasting service using trained GRU model.

    Maintains an internal sliding window of heavy-request counts and
    periodically runs inference to predict upcoming traffic.
    """

    def __init__(
        self,
        config: Optional[dict] = None,
        daa_engine=None,
        redis_client=None,
        influxdb_client=None,
    ):
        cfg = (config or {}).get("ml", {}).get("forecaster", {})

        self.model_path = cfg.get("model_path", DEFAULT_MODEL_PATH)
        self.window_size = cfg.get("window_size", DEFAULT_WINDOW_SIZE)
        self.predict_ahead = cfg.get("predict_ahead", DEFAULT_PREDICT_AHEAD)
        self.interval_sec = cfg.get("inference_interval_sec", DEFAULT_INTERVAL_SEC)
        self.burst_multiplier = cfg.get("burst_multiplier", DEFAULT_BURST_MULTIPLIER)
        self.stale_after_sec = cfg.get("stale_after_sec", DEFAULT_STALE_AFTER_SEC)
        self.warmup_min_points = cfg.get("warmup_min_points", DEFAULT_WARMUP_MIN_POINTS)

        self.daa_engine = daa_engine
        self.redis = redis_client
        self.influxdb = influxdb_client

        # Model state
        self._model = None
        self._loaded = False
        self._series_mean = 0.0
        self._series_std = 1.0

        # Internal sliding window (fallback when InfluxDB unavailable)
        self._window: deque = deque(maxlen=self.window_size)

        # Forecast state
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._last_prediction: float = 0.0
        self._last_prediction_time: float = 0.0
        self._burst_imminent: bool = False
        self._run_count: int = 0
        self._total_requests_heavy: int = 0

        # Redis key for forecast
        self._forecast_key = "forecast:latest"
        ds_cfg = (config or {}).get("datastores", {}).get("redis", {})
        self._forecast_key = ds_cfg.get("forecast_key", self._forecast_key)
        self._forecast_ttl = ds_cfg.get("forecast_ttl_sec", 15)

    def load(self) -> bool:
        """Load the trained GRU model from disk."""
        try:
            import torch
            from coordinator.ml.train_forecaster import GRUForecaster

            if not os.path.exists(self.model_path):
                logger.warning(
                    f"Forecaster model not found at {self.model_path}. "
                    f"Using EMA fallback."
                )
                return False

            checkpoint = torch.load(self.model_path, map_location="cpu", weights_only=False)

            self._model = GRUForecaster(
                input_size=checkpoint.get("input_size", 1),
                hidden_size=checkpoint.get("hidden_size", 64),
                num_layers=checkpoint.get("num_layers", 2),
            )
            self._model.load_state_dict(checkpoint["model_state_dict"])
            self._model.eval()

            self._series_mean = checkpoint.get("series_mean", 0.0)
            self._series_std = checkpoint.get("series_std", 1.0)

            self._loaded = True
            logger.info(
                f"Forecaster loaded from {self.model_path} "
                f"(mean={self._series_mean:.2f}, std={self._series_std:.2f})"
            )
            return True

        except Exception as e:
            logger.error(f"Failed to load forecaster: {e}", exc_info=True)
            return False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def record_heavy_request(self):
        """Called by the request pipeline when a Heavy request arrives."""
        self._total_requests_heavy += 1

    async def start(self):
        """Start the background forecasting loop."""
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info(
            f"Forecaster started: interval={self.interval_sec}s, "
            f"model_loaded={self._loaded}, "
            f"burst_multiplier={self.burst_multiplier}"
        )

    async def stop(self):
        """Stop the background forecasting loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info(f"Forecaster stopped after {self._run_count} runs")

    async def _run_loop(self):
        """Background loop: run forecast every interval."""
        while self._running:
            try:
                await self._forecast_cycle()
            except Exception as e:
                logger.error(f"Forecast cycle error: {e}", exc_info=True)
            await asyncio.sleep(self.interval_sec)

    async def _forecast_cycle(self):
        """Perform one forecasting cycle."""
        self._run_count += 1

        # Get the latest window of heavy-request counts
        window = await self._get_window_data()

        if len(window) < self.warmup_min_points:
            # Not enough data yet — use EMA fallback
            prediction = self._ema_fallback(window)
        elif not self._loaded:
            prediction = self._ema_fallback(window)
        else:
            prediction = self._gru_predict(window)

        # Detect burst and damp prediction if needed
        if len(window) > 10:
            current_avg = float(np.mean(window[-10:]))
        else:
            current_avg = float(np.mean(window)) if window else 1.0

        # Damp prediction if system is completely idle to avoid baseline hallucination
        if current_avg < 0.1:
            prediction = 0.0

        self._last_prediction = prediction
        self._last_prediction_time = time.time()

        old_burst = self._burst_imminent
        # Require an absolute minimum of 5.0 heavy requests/sec to call it a "burst"
        # Otherwise, tiny noise on a 0-request idle system triggers false positives
        self._burst_imminent = (prediction > 5.0) and (prediction > self.burst_multiplier * max(current_avg, 1.0))

        # Notify DAA of burst state change
        if old_burst != self._burst_imminent and self.daa_engine:
            self.daa_engine.set_burst_imminent(self._burst_imminent)

        # Write to Redis
        await self._write_to_redis(prediction)

        if self._run_count % 12 == 0:  # Log every minute
            logger.info(
                f"Forecast #{self._run_count}: predicted={prediction:.2f} "
                f"current_avg={current_avg:.2f} burst={'YES' if self._burst_imminent else 'no'}"
            )

    async def _get_window_data(self) -> list:
        """Get the latest window of heavy-request counts.

        Tries InfluxDB first, falls back to internal counter.
        """
        # Try InfluxDB
        if self.influxdb and hasattr(self.influxdb, 'query_heavy_counts'):
            try:
                data = await self.influxdb.query_heavy_counts(self.window_size)
                if data and len(data) >= 10:
                    return data
            except Exception:
                pass

        # Fallback: use internal sliding window
        # Append current count and reset
        self._window.append(float(self._total_requests_heavy))
        self._total_requests_heavy = 0

        return list(self._window)

    def _gru_predict(self, window: list) -> float:
        """Run GRU inference on the window data."""
        try:
            import torch

            data = np.array(window[-self.window_size:], dtype=np.float32)
            # Normalize using training stats
            data_norm = (data - self._series_mean) / (self._series_std + 1e-8)

            # Reshape: (1, window_size, 1)
            x = torch.from_numpy(data_norm).reshape(1, -1, 1)

            with torch.no_grad():
                pred_norm = self._model(x).item()

            # Denormalize
            prediction = pred_norm * self._series_std + self._series_mean
            return max(prediction, 0.0)

        except Exception as e:
            logger.error(f"GRU inference error: {e}")
            return self._ema_fallback(window)

    def _ema_fallback(self, window: list) -> float:
        """Simple EMA-based fallback prediction."""
        if not window:
            return 0.0

        alpha = 0.3
        ema = window[0]
        for val in window[1:]:
            ema = alpha * val + (1 - alpha) * ema
        return max(ema, 0.0)

    async def _write_to_redis(self, prediction: float):
        """Write forecast to Redis with TTL."""
        if not self.redis:
            return

        try:
            import json
            forecast_data = json.dumps({
                "predicted_heavy_rate": round(prediction, 3),
                "burst_imminent": self._burst_imminent,
                "timestamp": time.time(),
                "model_used": "gru" if self._loaded else "ema",
                "run_id": self._run_count,
            })

            if hasattr(self.redis, '_redis') and self.redis._redis:
                await self.redis._redis.setex(
                    self._forecast_key,
                    self._forecast_ttl,
                    forecast_data,
                )
        except Exception as e:
            logger.debug(f"Redis forecast write failed (non-critical): {e}")

    def get_predicted_load(self, node_name: str, total_nodes: int = 4) -> float:
        """Get the predicted load share for a specific node.

        Distributes the total predicted heavy rate across nodes based
        on their vnode share. Returns a normalized value in [0, 1].

        This value feeds into δ·predicted_load in the allocation engine.
        """
        if self._last_prediction <= 0 or not self._is_fresh():
            return 0.0

        # Simple equal distribution for now
        # In production, this would be weighted by vnode share
        per_node = self._last_prediction / max(total_nodes, 1)
        # Normalize: assume max capacity per node is ~10 heavy reqs/s
        return min(per_node / 10.0, 1.0)

    def _is_fresh(self) -> bool:
        """Check if the latest prediction is still fresh."""
        return (time.time() - self._last_prediction_time) < self.stale_after_sec

    def get_status(self) -> Dict:
        """Get forecaster status for API endpoint."""
        return {
            "running": self._running,
            "model_loaded": self._loaded,
            "model_path": self.model_path,
            "model_type": "gru" if self._loaded else "ema_fallback",
            "interval_sec": self.interval_sec,
            "total_runs": self._run_count,
            "last_prediction": round(self._last_prediction, 3),
            "last_prediction_time": self._last_prediction_time,
            "prediction_fresh": self._is_fresh(),
            "burst_imminent": self._burst_imminent,
            "burst_multiplier": self.burst_multiplier,
            "window_size": self.window_size,
            "internal_window_fill": len(self._window),
        }
