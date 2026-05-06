"""
Benchmark Runner — Baseline Evaluation & Training Data Export
===============================================================
Runs all 4 scenario YAMLs against each of the 3+1 baseline modes:
  - Round Robin
  - Least Connections
  - Static Consistent Hashing
  - Predictive Framework (when available)

Records results to experiments table and exports labelled training CSV.

Usage:
  python -m evaluation.benchmark_runner --scenarios scenarios/ --output results_summary.csv
"""

import argparse
import csv
import json
import logging
import os
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, List

import yaml

logger = logging.getLogger("evaluation.benchmark_runner")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)

# Import baselines and core modules
from evaluation.baselines.round_robin import RoundRobinAllocator
from evaluation.baselines.least_connections import LeastConnectionsAllocator
from coordinator.routing.hash_ring import ConsistentHashRing
from coordinator.routing.allocation_engine import AllocationEngine
from coordinator.routing.chord_router import ChordRouter
from coordinator.intake.feature_pipeline import FeaturePipeline


@dataclass
class BenchmarkResult:
    """Results from a single benchmark experiment run."""
    experiment_name: str
    scenario_name: str
    allocation_mode: str
    duration_sec: float
    total_requests: int
    latency_p50_ms: float
    latency_p95_ms: float
    latency_p99_ms: float
    throughput_rps: float
    load_variance_stddev: float
    failure_rate_pct: float
    avg_cpu_utilization: float
    avg_routing_hops: float


# Default node configuration
DEFAULT_NODES = [
    ("node_s1", 100),
    ("node_s2", 70),
    ("node_s3", 150),
    ("node_s4", 90),
]

ALLOCATION_MODES = ["round_robin", "least_connections", "static_consistent_hash"]


def load_scenarios(scenario_dir: str) -> List[dict]:
    """Load all YAML scenario files from a directory."""
    scenarios = []
    for filename in sorted(Path(scenario_dir).glob("*.yaml")):
        with open(filename, "r") as f:
            scenario = yaml.safe_load(f)
            scenario["_filename"] = str(filename)
            scenarios.append(scenario)
    return scenarios


def simulate_benchmark(
    scenario: dict,
    mode: str,
    nodes: List[tuple],
    num_requests: int = 1000,
) -> BenchmarkResult:
    """Simulate a benchmark run for a given scenario and allocation mode.

    This is a simplified in-process simulation for Phase 3.
    Full Docker-based benchmarks run in Phase 6.

    Args:
        scenario: Loaded scenario YAML dict.
        mode: Allocation mode string.
        nodes: List of (node_name, capacity) tuples.
        num_requests: Number of requests to simulate.

    Returns:
        BenchmarkResult with computed metrics.
    """
    import random
    import statistics

    scenario_name = scenario.get("scenario", {}).get("name", "unknown")
    experiment_name = f"{scenario_name}_{mode}_{int(time.time())}"

    # Initialize allocator based on mode
    if mode == "round_robin":
        allocator = RoundRobinAllocator()
        allocator.set_nodes([n[0] for n in nodes])
    elif mode == "least_connections":
        allocator = LeastConnectionsAllocator()
        allocator.set_nodes([n[0] for n in nodes])
    elif mode == "static_consistent_hash":
        ring = ConsistentHashRing(vnode_base_count=150)
        for name, cap in nodes:
            ring.add_node(name, cap)
    else:
        ring = ConsistentHashRing(vnode_base_count=150)
        for name, cap in nodes:
            ring.add_node(name, cap)

    # Simulated execution time ranges (ms)
    exec_times = {"Light": (40, 60), "Medium": (150, 250), "Heavy": (800, 1200)}

    # Class distribution from scenario
    traffic = scenario.get("traffic", {})
    class_dist = traffic.get("class_distribution", {"light": 0.5, "medium": 0.35, "heavy": 0.15})

    # Track metrics
    latencies = []
    node_requests: Dict[str, int] = {n[0]: 0 for n in nodes}
    node_cpu_samples: Dict[str, List[float]] = {n[0]: [] for n in nodes}
    failures = 0

    feature_pipeline = FeaturePipeline()
    start = time.time()

    for i in range(num_requests):
        # Pick class
        r = random.random()
        cumulative = 0.0
        req_class = "Medium"
        for cls, weight in class_dist.items():
            cumulative += weight
            if r <= cumulative:
                req_class = cls.capitalize()
                break

        request_key = f"req_{i:08d}"

        # Route based on mode
        if mode in ("round_robin", "least_connections"):
            selected = allocator.get_node(request_key)
        else:
            selected = ring.get_node(request_key)

        if selected is None:
            failures += 1
            continue

        # Track connection counts for least-connections
        if mode == "least_connections":
            allocator.on_request_start(selected)

        # Simulate execution latency
        min_ms, max_ms = exec_times.get(req_class, (100, 300))
        exec_ms = random.uniform(min_ms, max_ms)
        queue_ms = random.uniform(0, 20)  # Simulated queue wait
        total_ms = exec_ms + queue_ms

        latencies.append(total_ms)
        node_requests[selected] = node_requests.get(selected, 0) + 1

        # Simulated CPU per node (proportional to requests received)
        for node_name in node_requests:
            load_pct = min(node_requests[node_name] / (num_requests / len(nodes)) * 50, 95)
            node_cpu_samples[node_name].append(load_pct)

        if mode == "least_connections":
            allocator.on_request_complete(selected)

        # Extract features for training data
        feature_pipeline.extract_features(
            endpoint="/api/data",
            method="POST",
            payload_bytes=random.randint(128, 65536),
        )

    elapsed = time.time() - start

    # Compute metrics
    latencies.sort()
    n_lat = len(latencies)

    if n_lat == 0:
        return BenchmarkResult(
            experiment_name=experiment_name,
            scenario_name=scenario_name,
            allocation_mode=mode,
            duration_sec=elapsed,
            total_requests=num_requests,
            latency_p50_ms=0, latency_p95_ms=0, latency_p99_ms=0,
            throughput_rps=0, load_variance_stddev=0,
            failure_rate_pct=100.0, avg_cpu_utilization=0, avg_routing_hops=1,
        )

    p50 = latencies[int(n_lat * 0.50)]
    p95 = latencies[int(n_lat * 0.95)]
    p99 = latencies[int(n_lat * 0.99)]

    # Load variance: stddev of request distribution across nodes
    request_counts = list(node_requests.values())
    load_stddev = statistics.stdev(request_counts) if len(request_counts) > 1 else 0.0

    # Average CPU utilization across nodes
    avg_cpu_values = []
    for samples in node_cpu_samples.values():
        if samples:
            avg_cpu_values.append(statistics.mean(samples))
    avg_cpu = statistics.mean(avg_cpu_values) if avg_cpu_values else 0.0

    return BenchmarkResult(
        experiment_name=experiment_name,
        scenario_name=scenario_name,
        allocation_mode=mode,
        duration_sec=round(elapsed, 3),
        total_requests=num_requests,
        latency_p50_ms=round(p50, 2),
        latency_p95_ms=round(p95, 2),
        latency_p99_ms=round(p99, 2),
        throughput_rps=round(num_requests / max(elapsed, 0.001), 1),
        load_variance_stddev=round(load_stddev, 2),
        failure_rate_pct=round(failures / num_requests * 100, 2),
        avg_cpu_utilization=round(avg_cpu, 2),
        avg_routing_hops=1.0,
    )


def export_results_csv(results: List[BenchmarkResult], output_path: str):
    """Export benchmark results to CSV."""
    if not results:
        return

    fieldnames = list(asdict(results[0]).keys())
    with open(output_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for result in results:
            writer.writerow(asdict(result))

    logger.info(f"Results exported to {output_path} ({len(results)} rows)")


def run_full_benchmark(scenario_dir: str = "scenarios", output_path: str = "results_summary.csv", num_requests: int = 5000):
    """Run the complete benchmark matrix: 4 scenarios × 3 modes = 12 runs.

    Args:
        scenario_dir: Directory containing scenario YAML files.
        output_path: Path for the results CSV.
        num_requests: Number of requests per experiment run.
    """
    scenarios = load_scenarios(scenario_dir)
    logger.info(f"Loaded {len(scenarios)} scenarios from {scenario_dir}")
    logger.info(f"Allocation modes: {ALLOCATION_MODES}")
    logger.info(f"Requests per run: {num_requests}")
    logger.info("=" * 60)

    all_results = []

    for scenario in scenarios:
        scenario_name = scenario.get("scenario", {}).get("name", "unknown")

        for mode in ALLOCATION_MODES:
            logger.info(f"Running: {scenario_name} × {mode}...")
            result = simulate_benchmark(scenario, mode, DEFAULT_NODES, num_requests)
            all_results.append(result)

            logger.info(
                f"  → p50={result.latency_p50_ms}ms, p95={result.latency_p95_ms}ms, "
                f"p99={result.latency_p99_ms}ms, throughput={result.throughput_rps} RPS, "
                f"load_var={result.load_variance_stddev}, fail={result.failure_rate_pct}%"
            )

    logger.info("=" * 60)
    logger.info(f"Benchmark complete: {len(all_results)} experiments")

    # Export results
    export_results_csv(all_results, output_path)

    # Print comparison table
    print("\n" + "=" * 100)
    print(f"{'Scenario':<15} {'Mode':<25} {'p50':>8} {'p95':>8} {'p99':>8} {'RPS':>8} {'LoadVar':>8} {'Fail%':>6}")
    print("=" * 100)
    for r in all_results:
        print(
            f"{r.scenario_name:<15} {r.allocation_mode:<25} "
            f"{r.latency_p50_ms:>8.1f} {r.latency_p95_ms:>8.1f} {r.latency_p99_ms:>8.1f} "
            f"{r.throughput_rps:>8.1f} {r.load_variance_stddev:>8.1f} {r.failure_rate_pct:>6.1f}"
        )
    print("=" * 100)

    return all_results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PAF Benchmark Runner")
    parser.add_argument("--scenarios", default="scenarios", help="Scenario YAML directory")
    parser.add_argument("--output", default="results_summary.csv", help="Output CSV path")
    parser.add_argument("--requests", type=int, default=5000, help="Requests per experiment")
    args = parser.parse_args()

    run_full_benchmark(args.scenarios, args.output, args.requests)
