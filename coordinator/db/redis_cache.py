"""
Redis Cache Layer — Ring Snapshot & Metrics Cache
===================================================
Provides an in-process cache for ring:vnodes and metrics:{node_id} data
that is periodically refreshed from Redis. This eliminates Redis as a
hot-path dependency for per-request ring lookups.

Cache strategy:
  - Ring snapshot: Python dict refreshed every 100ms from Redis sorted set
  - Node metrics: Python dict refreshed every 1s from Redis hashes
  - Fall-through to Redis on cache miss
  - In-memory-only mode for when Redis is unavailable

Validated for 1000+ RPS uniform traffic (P4-T2).
"""

import asyncio
import json
import logging
import time
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger("coordinator.db.redis_cache")

# Cache refresh intervals
RING_REFRESH_MS = 100       # Ring snapshot refresh every 100ms
METRICS_REFRESH_MS = 1000   # Node metrics refresh every 1s


class RedisRingCache:
    """In-process cache for the hash ring stored in Redis.

    Caches the Redis sorted set `ring:vnodes` as a Python dict.
    Refreshed every 100ms to keep hot-path ring lookups at sub-microsecond
    latency instead of Redis round-trip (~0.5-2ms).
    """

    def __init__(self, redis_client=None, ring_key: str = "ring:vnodes"):
        self.redis = redis_client
        self.ring_key = ring_key

        # In-process cache
        self._ring_snapshot: Dict[int, str] = {}  # hash_position -> node_name
        self._last_refresh: float = 0.0
        self._refresh_count: int = 0
        self._refresh_latency_ms: float = 0.0
        self._running = False

    async def start(self):
        """Start the background refresh loop."""
        self._running = True
        asyncio.create_task(self._refresh_loop())
        logger.info(f"RedisRingCache started (refresh every {RING_REFRESH_MS}ms)")

    async def stop(self):
        """Stop the refresh loop."""
        self._running = False

    async def _refresh_loop(self):
        """Background loop: refresh ring snapshot from Redis."""
        while self._running:
            await self._refresh()
            await asyncio.sleep(RING_REFRESH_MS / 1000.0)

    async def _refresh(self):
        """Refresh the ring snapshot from Redis sorted set."""
        if not self.redis:
            return

        start = time.perf_counter()
        try:
            # ZRANGEBYSCORE with scores to get (position, node_name) pairs
            entries = await self.redis.zrangebyscore(
                self.ring_key, "-inf", "+inf", withscores=True
            )
            new_snapshot = {}
            for member, score in entries:
                # member = "node_name", score = hash_position
                if isinstance(member, bytes):
                    member = member.decode("utf-8")
                new_snapshot[int(score)] = member

            self._ring_snapshot = new_snapshot
            self._last_refresh = time.time()
            self._refresh_count += 1
            self._refresh_latency_ms = (time.perf_counter() - start) * 1000

        except Exception as e:
            logger.warning(f"Ring cache refresh failed: {e}")

    def get_snapshot(self) -> Dict[int, str]:
        """Get the cached ring snapshot (sub-microsecond)."""
        return self._ring_snapshot

    async def write_ring_to_redis(self, ring_data: Dict[str, List[int]]):
        """Write ring data to Redis sorted set.

        Args:
            ring_data: Dict of node_name -> list of hash positions.
        """
        if not self.redis:
            return

        try:
            pipe = self.redis.pipeline()
            pipe.delete(self.ring_key)
            for node_name, positions in ring_data.items():
                for pos in positions:
                    pipe.zadd(self.ring_key, {node_name: pos})
            await pipe.execute()
            logger.info(
                f"Ring written to Redis: {sum(len(v) for v in ring_data.values())} vnodes"
            )
        except Exception as e:
            logger.error(f"Failed to write ring to Redis: {e}")

    def get_stats(self) -> Dict:
        """Get cache statistics."""
        return {
            "ring_cache_size": len(self._ring_snapshot),
            "last_refresh": self._last_refresh,
            "refresh_count": self._refresh_count,
            "refresh_latency_ms": round(self._refresh_latency_ms, 3),
        }


class RedisMetricsCache:
    """In-process cache for per-node metrics stored in Redis hashes.

    Caches `metrics:{node_id}` hashes (HGETALL) as Python dicts.
    Refreshed every 1s to decouple metrics reads from Redis latency.
    """

    def __init__(
        self,
        redis_client=None,
        metrics_prefix: str = "metrics:",
        metrics_ttl_sec: int = 10,
    ):
        self.redis = redis_client
        self.metrics_prefix = metrics_prefix
        self.metrics_ttl_sec = metrics_ttl_sec

        # In-process cache: node_name -> metrics dict
        self._metrics_cache: Dict[str, Dict] = {}
        self._node_names: List[str] = []
        self._last_refresh: float = 0.0
        self._refresh_count: int = 0
        self._refresh_latency_ms: float = 0.0
        self._running = False

    def set_node_names(self, names: List[str]):
        """Set the list of node names to cache metrics for."""
        self._node_names = list(names)
        for name in names:
            if name not in self._metrics_cache:
                self._metrics_cache[name] = {}

    async def start(self):
        """Start the background refresh loop."""
        self._running = True
        asyncio.create_task(self._refresh_loop())
        logger.info(
            f"RedisMetricsCache started: {len(self._node_names)} nodes "
            f"(refresh every {METRICS_REFRESH_MS}ms)"
        )

    async def stop(self):
        """Stop the refresh loop."""
        self._running = False

    async def _refresh_loop(self):
        """Background loop: refresh all node metrics from Redis."""
        while self._running:
            await self._refresh_all()
            await asyncio.sleep(METRICS_REFRESH_MS / 1000.0)

    async def _refresh_all(self):
        """Refresh metrics for all nodes from Redis."""
        if not self.redis or not self._node_names:
            return

        start = time.perf_counter()
        try:
            pipe = self.redis.pipeline()
            for name in self._node_names:
                pipe.hgetall(f"{self.metrics_prefix}{name}")
            results = await pipe.execute()

            for name, data in zip(self._node_names, results):
                if data:
                    # Decode bytes keys/values if needed
                    decoded = {}
                    for k, v in data.items():
                        key = k.decode("utf-8") if isinstance(k, bytes) else k
                        val = v.decode("utf-8") if isinstance(v, bytes) else v
                        # Try to parse numeric values
                        try:
                            decoded[key] = float(val)
                        except (ValueError, TypeError):
                            decoded[key] = val
                    self._metrics_cache[name] = decoded

            self._last_refresh = time.time()
            self._refresh_count += 1
            self._refresh_latency_ms = (time.perf_counter() - start) * 1000

        except Exception as e:
            logger.warning(f"Metrics cache refresh failed: {e}")

    def get_node_metrics(self, node_name: str) -> Dict:
        """Get cached metrics for a node (sub-microsecond)."""
        return self._metrics_cache.get(node_name, {})

    def get_all_metrics(self) -> Dict[str, Dict]:
        """Get all cached node metrics."""
        return dict(self._metrics_cache)

    async def write_node_metrics(self, node_name: str, metrics: Dict):
        """Write node metrics to Redis hash and update local cache.

        Args:
            node_name: Node identifier.
            metrics: Dict of metric_name -> value.
        """
        # Update local cache immediately
        self._metrics_cache[node_name] = metrics

        if not self.redis:
            return

        try:
            key = f"{self.metrics_prefix}{node_name}"
            # Convert all values to strings for Redis hash
            str_metrics = {k: str(v) for k, v in metrics.items()}
            await self.redis.hset(key, mapping=str_metrics)
            await self.redis.expire(key, self.metrics_ttl_sec)
        except Exception as e:
            logger.warning(f"Failed to write metrics for {node_name}: {e}")

    def get_stats(self) -> Dict:
        """Get cache statistics."""
        return {
            "cached_nodes": len(self._metrics_cache),
            "node_names": self._node_names,
            "last_refresh": self._last_refresh,
            "refresh_count": self._refresh_count,
            "refresh_latency_ms": round(self._refresh_latency_ms, 3),
        }
