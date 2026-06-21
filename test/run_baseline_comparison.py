"""
Baseline & Ablation Comparison Runner
=====================================
Automates the A/B testing of routing algorithms.

For each routing mode:
1. Starts the Docker Compose stack with ROUTING_MODE set.
2. Waits for health checks to pass.
3. Runs a headless Locust simulation for 30 seconds.
4. Extracts Average, P95, and P99 latency.
5. Tears down the stack.

Produces a Markdown table comparing the results.

Usage:
  python test/run_baseline_comparison.py

If Docker is not available, falls back to a standalone simulation
that benchmarks routing algorithms directly without Docker.
"""

import os
import sys
import subprocess
import time
import json
import shutil
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import URLError

ROOT_DIR = Path(__file__).parent.parent.resolve()
RESULTS_DIR = ROOT_DIR / "test" / "results"

MODES = [
    "round_robin",
    "least_conn",
    "static_hash",
    "ablation_classifier_only",
    "ablation_forecaster_only",
    "predictive",
]


def docker_available() -> bool:
    """Check if Docker is installed and the daemon is running."""
    if not shutil.which("docker"):
        return False
    try:
        result = subprocess.run(
            ["docker", "info"],
            capture_output=True, timeout=10,
        )
        return result.returncode == 0
    except Exception:
        return False


def wait_for_health(timeout=60) -> bool:
    """Wait for the coordinator to become healthy."""
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = Request("http://localhost:8000/health", method="GET")
            with urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    time.sleep(2)
                    return True
        except Exception:
            pass
        time.sleep(2)
    return False


def run_mode_docker(mode: str) -> dict:
    """Run a single benchmark mode using Docker Compose + Locust."""
    print(f"\n{'='*50}\nTesting Mode: {mode.upper()}\n{'='*50}")

    # 1. Start Docker Stack
    print("[1/4] Starting Docker Compose...")
    env = os.environ.copy()
    env["ROUTING_MODE"] = mode
    result = subprocess.run(
        ["docker", "compose", "up", "--build", "-d"],
        cwd=ROOT_DIR, env=env,
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"  ERROR: Docker Compose failed:\n  {result.stderr[:500]}")
        subprocess.run(
            ["docker", "compose", "down", "-v"],
            cwd=ROOT_DIR, capture_output=True,
        )
        return None

    # 2. Wait for health
    print("[2/4] Waiting for system health...")
    if not wait_for_health():
        print("  ERROR: System did not become healthy!")
        subprocess.run(
            ["docker", "compose", "down", "-v"],
            cwd=ROOT_DIR, capture_output=True,
        )
        return None

    # 3. Run Locust
    print("[3/4] Running traffic simulation (30s)...")
    os.makedirs(RESULTS_DIR, exist_ok=True)
    csv_prefix = RESULTS_DIR / f"{mode}_stats"
    locust_file = ROOT_DIR / "test" / "locustfile.py"

    locust_cmd = [
        "locust",
        "-f", str(locust_file),
        "--headless",
        "--users", "50",
        "--spawn-rate", "10",
        "--run-time", "30s",
        "--host", "http://localhost:8000",
        "--csv", str(csv_prefix),
    ]
    subprocess.run(locust_cmd, capture_output=True)

    # 4. Tear down and parse
    print("[4/4] Tearing down stack and parsing results...")
    subprocess.run(
        ["docker", "compose", "down", "-v"],
        cwd=ROOT_DIR, capture_output=True,
    )

    stats_file = RESULTS_DIR / f"{mode}_stats_stats.csv"
    if not stats_file.exists():
        print(f"  ERROR: Stats file not found: {stats_file}")
        return None

    import csv
    with open(stats_file) as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("Name") == "Aggregated":
                return {
                    "Mode": mode,
                    "Requests": int(row.get("Request Count", 0)),
                    "Avg_ms": round(float(row.get("Average Response Time", 0)), 2),
                    "P95_ms": round(float(row.get("95%", 0)), 2),
                    "P99_ms": round(float(row.get("99%", 0)), 2),
                    "Failures": int(row.get("Failure Count", 0)),
                }
    return None


# ---------------------------------------------------------------------------
# Standalone Simulation (no Docker required)
# ---------------------------------------------------------------------------

def run_standalone_simulation():
    """
    Benchmark routing algorithms directly in Python without Docker.

    Simulates 10,000 requests through each routing algorithm and measures
    the routing decision latency (not end-to-end network latency).
    """
    print("\n" + "=" * 60)
    print("  STANDALONE SIMULATION (no Docker)")
    print("  Benchmarking routing decision speed for 10,000 requests")
    print("=" * 60)

    sys.path.insert(0, str(ROOT_DIR))

    import numpy as np
    from coordinator.routing.hash_ring import ConsistentHashRing
    from coordinator.routing.allocation_engine import AllocationEngine
    from coordinator.routing.baselines import (
        RoundRobinBalancer,
        LeastConnectionsBalancer,
        StaticHashBalancer,
    )

    NODE_NAMES = ["node_s1", "node_s2", "node_s3", "node_s4"]
    N_REQUESTS = 10_000

    # Build a shared hash ring
    ring = ConsistentHashRing(vnode_base_count=150, vnode_min_count=10)
    for name in NODE_NAMES:
        ring.add_node(name, 100)

    # Seed realistic metrics
    rng = np.random.RandomState(42)

    def seed_metrics(engine):
        for name in NODE_NAMES:
            engine.update_node_metrics(name, {
                "cpu_pct": rng.uniform(5, 60),
                "queue_depth": rng.randint(0, 100),
                "queue_max": 450,
                "latency_ema_ms": rng.uniform(10, 200),
                "latency_max_ms": 5000.0,
                "predicted_load": rng.uniform(0, 0.5),
            })

    configs = [
        ("Round Robin",   RoundRobinBalancer(NODE_NAMES)),
        ("Least Conn",    LeastConnectionsBalancer(NODE_NAMES)),
        ("Static Hash",   StaticHashBalancer(ring)),
        ("Predictive",    AllocationEngine()),
    ]

    results = []

    for label, engine in configs:
        seed_metrics(engine)

        latencies = []
        for i in range(N_REQUESTS):
            req_id = f"req_{i:08d}"
            candidates = ring.get_candidates(req_id, count=3)

            t0 = time.perf_counter()
            node, score, overloaded = engine.select_node(candidates)
            elapsed_us = (time.perf_counter() - t0) * 1_000_000  # microseconds
            latencies.append(elapsed_us)

        arr = np.array(latencies)
        results.append({
            "Mode": label,
            "Requests": N_REQUESTS,
            "Avg_us": round(float(np.mean(arr)), 2),
            "P95_us": round(float(np.percentile(arr, 95)), 2),
            "P99_us": round(float(np.percentile(arr, 99)), 2),
            "Std_us": round(float(np.std(arr)), 2),
        })
        print(f"  OK {label:<16} Avg={results[-1]['Avg_us']:.2f}us  P95={results[-1]['P95_us']:.2f}us  P99={results[-1]['P99_us']:.2f}us")

    return results


def print_docker_results(results):
    """Print Docker-based results as a markdown table."""
    print(f"\n{'='*80}")
    print("FINAL COMPARISON RESULTS (End-to-End via Docker + Locust)")
    print(f"{'='*80}\n")
    print("| Routing Mode         | Requests | Avg (ms) | P95 (ms) | P99 (ms) | Failures |")
    print("|----------------------|----------|----------|----------|----------|----------|")
    for r in results:
        mode_fmt = r["Mode"].replace("_", " ").title()
        print(f"| {mode_fmt:<20} | {r['Requests']:<8} | {r['Avg_ms']:<8} | {r['P95_ms']:<8} | {r['P99_ms']:<8} | {r['Failures']:<8} |")


def print_standalone_results(results):
    """Print standalone results as a markdown table."""
    print(f"\n{'='*80}")
    print("ROUTING DECISION LATENCY COMPARISON (Standalone, us)")
    print(f"{'='*80}\n")
    print("| Routing Mode         | Requests | Avg (us)  | P95 (us)  | P99 (us)  | Std (us)  |")
    print("|----------------------|----------|-----------|-----------|-----------|-----------|")
    for r in results:
        print(f"| {r['Mode']:<20} | {r['Requests']:<8} | {r['Avg_us']:<9} | {r['P95_us']:<9} | {r['P99_us']:<9} | {r['Std_us']:<9} |")

    # Save to file
    os.makedirs(RESULTS_DIR, exist_ok=True)
    out_file = RESULTS_DIR / "standalone_comparison.json"
    with open(out_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\n  Results saved to: {out_file}")


def main():
    print("Baseline & Ablation Comparison Runner\n")

    if docker_available():
        print("Docker detected — running full end-to-end benchmark.\n")
        # Clean up any leftover containers
        subprocess.run(
            ["docker", "compose", "down", "-v"],
            cwd=ROOT_DIR, capture_output=True,
        )
        results = []
        for mode in MODES:
            res = run_mode_docker(mode)
            if res:
                results.append(res)
        if results:
            print_docker_results(results)
        else:
            print("\n  All Docker runs failed. Falling back to standalone simulation.\n")
            standalone_results = run_standalone_simulation()
            print_standalone_results(standalone_results)
    else:
        print("Docker not available — running standalone routing benchmark.\n")
        standalone_results = run_standalone_simulation()
        print_standalone_results(standalone_results)

    print("\n[OK] Testing complete.")


if __name__ == "__main__":
    main()
