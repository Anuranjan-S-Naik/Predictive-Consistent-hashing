"""
Locust Real Traffic Generator (P1.1)
=====================================
Shoots realistic traffic patterns at the coordinator node to populate
the PostgreSQL database with real training examples.

Usage:
  locust -f test/locustfile.py --headless --users 100 --spawn-rate 10 --run-time 2m --host http://localhost:8000
"""

import random
from locust import HttpUser, task, between


class RealisticTrafficUser(HttpUser):
    # Wait between 0.1 to 1 second between tasks
    wait_time = between(0.1, 1.0)
    
    headers = {"X-API-Key": "dev-api-key-change-me"}

    @task(3)
    def call_status(self):
        # Light request
        self.client.post("/api/v1/request", headers=self.headers, json={
            "endpoint": "/api/status",
            "method": "GET",
            "payload_bytes": random.randint(100, 500)
        })

    @task(3)
    def call_search(self):
        # Light/Medium request
        self.client.post("/api/v1/request", headers=self.headers, json={
            "endpoint": "/api/search",
            "method": "GET",
            "payload_bytes": random.randint(500, 5000)
        })

    @task(4)
    def call_data(self):
        # Medium request
        self.client.post("/api/v1/request", headers=self.headers, json={
            "endpoint": "/api/data",
            "method": "POST",
            "payload_bytes": random.randint(2000, 20000)
        })

    @task(2)
    def call_batch(self):
        # Medium/Heavy request
        self.client.post("/api/v1/request", headers=self.headers, json={
            "endpoint": "/api/batch",
            "method": "POST",
            "payload_bytes": random.randint(30000, 80000)
        })

    @task(1)
    def call_inference(self):
        # Heavy request
        self.client.post("/api/v1/request", headers=self.headers, json={
            "endpoint": "/api/inference",
            "method": "POST",
            "payload_bytes": random.randint(80000, 130000)
        })
