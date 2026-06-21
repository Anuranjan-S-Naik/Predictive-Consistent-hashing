import sys
import time
import json
import asyncio

sys.path.append('c:\\Users\\ShriKrishna\\Desktop\\OS\\Predictive_Consistent_Hashing')

from coordinator.intake.router import RequestRouter
from coordinator.routing.allocation_engine import AllocationEngine
from coordinator.ml.forecaster import TrafficForecaster

async def main():
    engine = AllocationEngine()
    
    # Mock Consistent Hash Ring
    class MockRing:
        def get_candidates(self, key, count):
            return ["node_s1", "node_s2", "node_s3", "node_s4"]
    
    # Mock Feature Pipeline
    class MockPipeline:
        def extract_features(self, endpoint, method, payload_bytes, queue_depth):
            return [1.0, 0.0, 0.0, 0.0]

    router = RequestRouter(
        hash_ring=MockRing(),
        allocation_engine=engine,
        chord_router=None,
        feature_pipeline=MockPipeline(),
        classifier=None
    )

    # Initialize nodes (like in main.py)
    for node in ["node_s1", "node_s2", "node_s3", "node_s4"]:
        engine.update_node_metrics(node, {"cpu_pct": 5.0, "queue_depth": 0, "queue_max": 450, "latency_ema_ms": 0.0})

    print("="*40)
    print("HOP 1 - BACKEND COMPUTATION & BUG REPRODUCTIONS")
    print("="*40)

    # Simulate 3 quick concurrent requests to demonstrate identical timestamps
    reqs = [
        {"request_id": f"req_{i}", "endpoint": "/api/status", "method": "GET", "payload_bytes": 100}
        for i in range(3)
    ]
    
    results = await asyncio.gather(*(router.route_request(r) for r in reqs))
    
    print("\\n[EVIDENCE] Raw Request Results (showing identical timestamps and flat scores):")
    for r in results:
        print(f"Req: {r['request_id']} | Score: {r['allocation_score']} | Timestamp: {r['timestamp']}")

    print("\\n[EVIDENCE] Dashboard Metrics Response (Hop 1):")
    metrics = router.get_dashboard_metrics(node_metrics=engine.get_all_metrics())
    print(json.dumps(metrics, indent=2))

if __name__ == "__main__":
    asyncio.run(main())
