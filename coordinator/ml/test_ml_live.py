"""Quick test: send requests of different classes to verify ML classification."""
import urllib.request
import json

API = "http://localhost:8000/api/v1/request"
HEADERS = {"X-API-Key": "dev-api-key-change-me", "Content-Type": "application/json"}

tests = [
    {"endpoint": "/api/status", "method": "GET", "payload_bytes": 64, "source_id": "light-test"},
    {"endpoint": "/api/data", "method": "POST", "payload_bytes": 4000, "source_id": "medium-test"},
    {"endpoint": "/api/inference", "method": "POST", "payload_bytes": 50000, "source_id": "heavy-test"},
]

for t in tests:
    req = urllib.request.Request(API, data=json.dumps(t).encode(), headers=HEADERS)
    try:
        resp = urllib.request.urlopen(req)
        result = json.loads(resp.read().decode())
        print(f"[{t['source_id']:12s}] class={result['predicted_class']:6s} "
              f"conf={result['confidence']:.3f} method={result['classification_method']} "
              f"node={result['assigned_node']} latency={result['pipeline_latency_ms']:.1f}ms")
    except Exception as e:
        print(f"[{t['source_id']:12s}] ERROR: {e}")

# Also test forecast + classifier API endpoints
for ep in ["/api/v1/forecast", "/api/v1/classifier"]:
    req = urllib.request.Request(f"http://localhost:8000{ep}", headers=HEADERS)
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read().decode())
    print(f"\n--- {ep} ---")
    for k, v in data.items():
        print(f"  {k}: {v}")
