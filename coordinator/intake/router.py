"""
Coordinator Intake Router — Request Endpoint
===============================================
Wires the full Phase 3 request pipeline:
  1. Receive HTTP POST /api/v1/request
  2. Extract features (FeaturePipeline)
  3. Classify request (stub: use heuristic until Phase 5 ML)
  4. Hash ring lookup (ConsistentHashRing)
  5. Score-based node selection (AllocationEngine)
  6. Chord overflow routing if needed (ChordRouter)
  7. Log to PostgreSQL (async batch)
  8. Return allocation result
"""

import logging
import time
import uuid
from typing import Dict, Optional

logger = logging.getLogger("coordinator.intake.router")

# Heuristic classifier (Phase 3 — replaced by XGBoost in Phase 5)
def heuristic_classify(endpoint: str, payload_bytes: int, method: str) -> tuple:
    """Simple rule-based classification for Phase 3 (no ML yet).

    Returns:
        Tuple of (class_label, confidence).
    """
    if payload_bytes > 16000 or endpoint in ("/api/inference", "/api/batch"):
        return "Heavy", 0.75
    elif payload_bytes > 2000 or endpoint == "/api/data" or method == "POST":
        return "Medium", 0.70
    else:
        return "Light", 0.80


class RequestRouter:
    """Orchestrates the full request routing pipeline.

    Components wired:
      - FeaturePipeline: extract 8-dim feature vector
      - Classifier: predict class (heuristic in Phase 3, XGBoost in Phase 5)
      - HashRing: consistent hash lookup for candidates
      - AllocationEngine: score-based node selection
      - ChordRouter: overflow multi-hop routing
    """

    def __init__(self, hash_ring, allocation_engine, chord_router, feature_pipeline):
        self.ring = hash_ring
        self.engine = allocation_engine
        self.chord = chord_router
        self.pipeline = feature_pipeline

        # Request counter for ID generation
        self._counter = 0

    async def route_request(self, raw_request: dict) -> dict:
        """Process a raw request through the full pipeline.

        Args:
            raw_request: Dict with endpoint, method, payload_bytes, source_id, timestamp.

        Returns:
            Dict with request_id, predicted_class, confidence, assigned_node,
            routing_hops, allocation_score, routing_method, feature_vector.
        """
        start_time = time.perf_counter()
        self._counter += 1

        # Generate request ID
        request_id = f"req_{self._counter:08d}"

        endpoint = raw_request.get("endpoint", "/api/status")
        method = raw_request.get("method", "GET")
        payload_bytes = raw_request.get("payload_bytes", 128)
        source_id = raw_request.get("source_id", "unknown")

        # Step 1: Feature extraction
        feature_vector = self.pipeline.extract_features(
            endpoint=endpoint,
            method=method,
            payload_bytes=payload_bytes,
            queue_depth=0,  # Will be populated from live metrics
        )

        # Step 2: Classification (heuristic for Phase 3)
        predicted_class, confidence = heuristic_classify(endpoint, payload_bytes, method)

        # Step 3: Hash ring lookup
        primary_node = self.ring.get_node(request_id)
        candidates = self.ring.get_candidates(request_id, count=3)

        if not primary_node:
            return {
                "request_id": request_id,
                "error": "No nodes available in hash ring",
                "status": "rejected",
            }

        # Step 4: Score-based selection
        selected_node, score, all_overloaded = self.engine.select_node(candidates)
        routing_hops = 1
        routing_method = "allocation_engine"

        # Step 5: Chord overflow routing if all overloaded
        if all_overloaded:
            all_scores = self.engine.get_all_scores()
            chord_node, hops, method_used = self.chord.route(
                overloaded_node=selected_node,
                node_scores=all_scores,
            )
            if chord_node:
                selected_node = chord_node
                routing_hops = hops
                routing_method = method_used

        elapsed_ms = (time.perf_counter() - start_time) * 1000

        return {
            "request_id": request_id,
            "predicted_class": predicted_class,
            "confidence": confidence,
            "assigned_node": selected_node,
            "routing_hops": routing_hops,
            "allocation_score": round(score, 4),
            "routing_method": routing_method,
            "feature_vector": [round(f, 4) for f in feature_vector],
            "pipeline_latency_ms": round(elapsed_ms, 3),
            "status": "routed",
        }
