"""
Traffic Generator — Async Request Injector
=============================================
Reads a scenario YAML and fires requests at the coordinator's POST /api/v1/request.
Supports 4 traffic patterns: Uniform, Bursty, Flash Crowd, Random.

Usage:
    python -m traffic_generator.generator
    # Or via Docker Compose: docker compose --profile generate up traffic_generator
"""

import asyncio
import logging
import math
import os
import random
import time
import uuid
from typing import Dict, List

import aiohttp
import yaml

logger = logging.getLogger("traffic_generator")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)s | %(levelname)s | %(message)s",
)

COORDINATOR_URL = os.getenv("COORDINATOR_URL", "http://coordinator:8000/api/v1/request")
SCENARIO_FILE = os.getenv("SCENARIO_FILE", "scenarios/uniform.yaml")
API_KEY = os.getenv("API_KEY", "dev-api-key-change-me")


def load_scenario(path: str) -> dict:
    """Load scenario YAML config."""
    with open(path, "r") as f:
        return yaml.safe_load(f)


def pick_class(distribution: Dict[str, float]) -> str:
    """Randomly select a request class based on distribution weights."""
    r = random.random()
    cumulative = 0.0
    for cls, weight in distribution.items():
        cumulative += weight
        if r <= cumulative:
            return cls.capitalize()
    return "Medium"


def pick_endpoint(endpoints: List[dict]) -> dict:
    """Randomly select an endpoint based on weights."""
    r = random.random()
    cumulative = 0.0
    for ep in endpoints:
        cumulative += ep.get("weight", 0.2)
        if r <= cumulative:
            return ep
    return endpoints[0] if endpoints else {"path": "/api/status", "method": "GET", "avg_payload_bytes": 128}


async def send_request(
    session: aiohttp.ClientSession,
    url: str,
    endpoint: dict,
    source_id: str,
    experiment_id: str,
    chosen_class: str = None,
) -> dict:
    """Send a single request to the coordinator."""
    payload = {
        "endpoint": endpoint["path"],
        "method": endpoint.get("method", "GET"),
        "payload_bytes": max(1, int(random.gauss(
            endpoint.get("avg_payload_bytes", 256),
            endpoint.get("avg_payload_bytes", 256) * 0.2,
        ))),
        "source_id": source_id,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }
    if chosen_class:
        payload["class"] = chosen_class

    headers = {"X-API-Key": API_KEY, "Content-Type": "application/json"}

    try:
        async with session.post(url, json=payload, headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            result = await resp.json()
            return {"status": resp.status, "result": result}
    except Exception as e:
        return {"status": 0, "error": str(e)}


async def generate_uniform(scenario: dict, session: aiohttp.ClientSession):
    """Uniform traffic: constant RPS for full duration."""
    traffic = scenario["traffic"]
    rps = traffic["rps"]
    duration = traffic["duration_seconds"]
    ramp_up = traffic.get("ramp_up_seconds", 10)
    class_dist = traffic.get("class_distribution", {"light": 0.5, "medium": 0.35, "heavy": 0.15})
    endpoints = traffic.get("endpoints", [])
    source_count = traffic.get("source_ids", {}).get("count", 50)
    prefix = traffic.get("source_ids", {}).get("prefix", "user_")
    jitter = traffic.get("pattern", {}).get("jitter_pct", 5) / 100.0

    experiment_id = f"uniform_{int(time.time())}"
    logger.info(f"Starting UNIFORM scenario: {rps} RPS for {duration}s (experiment={experiment_id})")

    start_time = time.time()
    total_sent = 0

    while (time.time() - start_time) < duration:
        elapsed = time.time() - start_time

        # Ramp-up phase
        current_rps = rps if elapsed > ramp_up else rps * (elapsed / ramp_up)
        if current_rps < 1:
            current_rps = 1

        # Apply jitter
        interval = 1.0 / current_rps
        interval *= random.uniform(1 - jitter, 1 + jitter)

        source_id = f"{prefix}{random.randint(0, source_count - 1)}"
        endpoint = pick_endpoint(endpoints)
        chosen_class = pick_class(class_dist)

        asyncio.create_task(send_request(session, COORDINATOR_URL, endpoint, source_id, experiment_id, chosen_class))
        total_sent += 1

        if total_sent % 500 == 0:
            logger.info(f"  Sent {total_sent} requests ({elapsed:.0f}s elapsed, {current_rps:.0f} RPS)")

        await asyncio.sleep(interval)

    logger.info(f"UNIFORM scenario complete: {total_sent} requests in {time.time()-start_time:.1f}s")


async def generate_bursty(scenario: dict, session: aiohttp.ClientSession):
    """Bursty traffic: baseline with periodic Poisson burst spikes."""
    traffic = scenario["traffic"]
    base_rps = traffic["rps"]
    duration = traffic["duration_seconds"]
    ramp_up = traffic.get("ramp_up_seconds", 10)
    base_dist = traffic.get("class_distribution", {"light": 0.55, "medium": 0.30, "heavy": 0.15})
    pattern = traffic.get("pattern", {})
    burst_interval = pattern.get("burst_interval_mean_sec", 30)
    burst_duration = pattern.get("burst_duration_sec", 5)
    burst_multiplier = pattern.get("burst_rps_multiplier", 3.0)
    burst_dist = pattern.get("burst_class_distribution", {"light": 0.2, "medium": 0.25, "heavy": 0.55})
    endpoints = traffic.get("endpoints", [])
    source_count = traffic.get("source_ids", {}).get("count", 50)
    prefix = traffic.get("source_ids", {}).get("prefix", "user_")

    experiment_id = f"bursty_{int(time.time())}"
    logger.info(f"Starting BURSTY scenario: {base_rps} RPS baseline, bursts every ~{burst_interval}s")

    start_time = time.time()
    next_burst = start_time + random.expovariate(1.0 / burst_interval)
    burst_end = 0
    total_sent = 0

    while (time.time() - start_time) < duration:
        now = time.time()
        elapsed = now - start_time
        in_burst = now < burst_end

        if not in_burst and now >= next_burst:
            burst_end = now + burst_duration
            next_burst = now + burst_duration + random.expovariate(1.0 / burst_interval)
            logger.info(f"  BURST started at {elapsed:.1f}s (duration={burst_duration}s, {burst_multiplier}× RPS)")
            in_burst = True

        current_rps = base_rps * burst_multiplier if in_burst else base_rps
        class_dist = burst_dist if in_burst else base_dist

        if elapsed < ramp_up:
            current_rps *= elapsed / ramp_up

        interval = 1.0 / max(current_rps, 1)
        source_id = f"{prefix}{random.randint(0, source_count - 1)}"
        endpoint = pick_endpoint(endpoints)
        chosen_class = pick_class(class_dist)

        asyncio.create_task(send_request(session, COORDINATOR_URL, endpoint, source_id, experiment_id, chosen_class))
        total_sent += 1

        if total_sent % 500 == 0:
            status = "BURST" if in_burst else "baseline"
            logger.info(f"  Sent {total_sent} ({status}, {current_rps:.0f} RPS)")

        await asyncio.sleep(interval)

    logger.info(f"BURSTY scenario complete: {total_sent} requests in {time.time()-start_time:.1f}s")


async def generate_flash_crowd(scenario: dict, session: aiohttp.ClientSession):
    """Flash crowd: sudden 10× surge then return to baseline."""
    traffic = scenario["traffic"]
    base_rps = traffic["rps"]
    duration = traffic["duration_seconds"]
    base_dist = traffic.get("class_distribution", {"light": 0.50, "medium": 0.35, "heavy": 0.15})
    pattern = traffic.get("pattern", {})
    surge_start = pattern.get("surge_start_sec", 60)
    surge_duration = pattern.get("surge_duration_sec", 30)
    surge_multiplier = pattern.get("surge_rps_multiplier", 10.0)
    surge_ramp_up = pattern.get("surge_ramp_up_sec", 2)
    surge_ramp_down = pattern.get("surge_ramp_down_sec", 10)
    surge_dist = pattern.get("surge_class_distribution", {"light": 0.45, "medium": 0.35, "heavy": 0.20})
    endpoints = traffic.get("endpoints", [])
    source_count = traffic.get("source_ids", {}).get("count", 200)
    prefix = traffic.get("source_ids", {}).get("prefix", "user_")

    experiment_id = f"flash_crowd_{int(time.time())}"
    logger.info(f"Starting FLASH CROWD: surge at t={surge_start}s, {surge_multiplier}× for {surge_duration}s")

    start_time = time.time()
    total_sent = 0

    while (time.time() - start_time) < duration:
        elapsed = time.time() - start_time
        surge_end = surge_start + surge_duration

        if elapsed < surge_start:
            current_rps = base_rps
        elif elapsed < surge_start + surge_ramp_up:
            progress = (elapsed - surge_start) / surge_ramp_up
            current_rps = base_rps + (base_rps * (surge_multiplier - 1)) * progress
        elif elapsed < surge_end:
            current_rps = base_rps * surge_multiplier
        elif elapsed < surge_end + surge_ramp_down:
            progress = (elapsed - surge_end) / surge_ramp_down
            current_rps = base_rps * surge_multiplier - (base_rps * (surge_multiplier - 1)) * progress
        else:
            current_rps = base_rps

        interval = 1.0 / max(current_rps, 1)
        source_id = f"{prefix}{random.randint(0, source_count - 1)}"
        endpoint = pick_endpoint(endpoints)

        # Use surge class distribution if we are actively in or transitioning to/from the surge
        in_surge = surge_start <= elapsed < (surge_end + surge_ramp_down)
        class_dist = surge_dist if in_surge else base_dist
        chosen_class = pick_class(class_dist)

        asyncio.create_task(send_request(session, COORDINATOR_URL, endpoint, source_id, experiment_id, chosen_class))
        total_sent += 1

        if total_sent % 500 == 0:
            logger.info(f"  Sent {total_sent} ({elapsed:.0f}s, {current_rps:.0f} RPS)")

        await asyncio.sleep(interval)

    logger.info(f"FLASH CROWD complete: {total_sent} requests in {time.time()-start_time:.1f}s")


async def generate_random(scenario: dict, session: aiohttp.ClientSession):
    """Random mixed traffic: variable RPS, shifting class mix, micro-bursts."""
    traffic = scenario["traffic"]
    avg_rps = traffic["rps"]
    duration = traffic["duration_seconds"]
    pattern = traffic.get("pattern", {})
    rps_min = pattern.get("rps_range", {}).get("min", 100)
    rps_max = pattern.get("rps_range", {}).get("max", 500)
    phase_dur = pattern.get("phase_duration_sec", 15)
    micro = pattern.get("micro_burst", {})
    class_dist = traffic.get("class_distribution", {"light": 0.40, "medium": 0.35, "heavy": 0.25})
    endpoints = traffic.get("endpoints", [])
    source_count = traffic.get("source_ids", {}).get("count", 100)
    prefix = traffic.get("source_ids", {}).get("prefix", "user_")

    experiment_id = f"random_{int(time.time())}"
    logger.info(f"Starting RANDOM scenario: {rps_min}-{rps_max} RPS, {phase_dur}s phases")

    start_time = time.time()
    total_sent = 0
    current_rps = random.randint(rps_min, rps_max)
    phase_start = start_time

    while (time.time() - start_time) < duration:
        now = time.time()

        if now - phase_start > phase_dur:
            current_rps = random.randint(rps_min, rps_max)
            phase_start = now

            if micro.get("enabled") and random.random() < micro.get("probability_per_phase", 0.4):
                logger.info(f"  MICRO-BURST at {now-start_time:.0f}s ({current_rps * micro.get('rps_multiplier', 2.5):.0f} RPS)")

            # Randomly shift class distribution if ranges are provided
            ranges = pattern.get("class_distribution_ranges", {})
            if ranges:
                l_min = ranges.get("light", {}).get("min", 0.20)
                l_max = ranges.get("light", {}).get("max", 0.60)
                m_min = ranges.get("medium", {}).get("min", 0.20)
                m_max = ranges.get("medium", {}).get("max", 0.50)
                h_min = ranges.get("heavy", {}).get("min", 0.10)
                h_max = ranges.get("heavy", {}).get("max", 0.40)

                l_val = random.uniform(l_min, l_max)
                m_val = random.uniform(m_min, m_max)
                h_val = random.uniform(h_min, h_max)

                total = l_val + m_val + h_val
                class_dist = {
                    "light": l_val / total,
                    "medium": m_val / total,
                    "heavy": h_val / total
                }

        interval = 1.0 / max(current_rps, 1)
        source_id = f"{prefix}{random.randint(0, source_count - 1)}"
        endpoint = pick_endpoint(endpoints)
        chosen_class = pick_class(class_dist)

        asyncio.create_task(send_request(session, COORDINATOR_URL, endpoint, source_id, experiment_id, chosen_class))
        total_sent += 1

        if total_sent % 500 == 0:
            logger.info(f"  Sent {total_sent} ({now-start_time:.0f}s, {current_rps} RPS)")

        await asyncio.sleep(interval)

async def generate_fixed_cycle(scenario: dict, session: aiohttp.ClientSession):
    """Fixed 10-second cycle: 0-2s Light, 2-7s Medium, 7-10s Heavy."""
    traffic = scenario["traffic"]
    base_rps = traffic["rps"]
    duration = traffic["duration_seconds"]
    source_count = traffic.get("source_ids", {}).get("count", 100)
    prefix = traffic.get("source_ids", {}).get("prefix", "user_")

    experiment_id = f"fixed_cycle_{int(time.time())}"
    logger.info(f"Starting FIXED CYCLE scenario: 10s loop ({base_rps} RPS) for {duration}s")

    endpoints = {
        "Light": {"path": "/api/status", "method": "GET", "avg_payload_bytes": 128},
        "Medium": {"path": "/api/data", "method": "GET", "avg_payload_bytes": 4000},
        "Heavy": {"path": "/api/inference", "method": "POST", "avg_payload_bytes": 20000},
    }

    start_time = time.time()
    total_sent = 0

    while (time.time() - start_time) < duration:
        elapsed = time.time() - start_time
        cycle_sec = elapsed % 10.0

        if cycle_sec < 2.0:
            current_class = "Light"
        elif cycle_sec < 7.0:
            current_class = "Medium"
        else:
            current_class = "Heavy"

        interval = 1.0 / max(base_rps, 1)
        source_id = f"{prefix}{random.randint(0, source_count - 1)}"
        endpoint = endpoints[current_class]

        asyncio.create_task(send_request(session, COORDINATOR_URL, endpoint, source_id, experiment_id, current_class))
        total_sent += 1

        if total_sent % 100 == 0:
            logger.info(f"  Sent {total_sent} ({elapsed:.1f}s, Phase: {current_class})")

        await asyncio.sleep(interval)

    logger.info(f"FIXED CYCLE scenario complete: {total_sent} requests in {time.time()-start_time:.1f}s")


# Pattern type → generator function mapping
GENERATORS = {
    "constant": generate_uniform,
    "poisson_burst": generate_bursty,
    "flash_crowd": generate_flash_crowd,
    "random_mixed": generate_random,
    "fixed_cycle": generate_fixed_cycle,
}


async def main():
    """Main entry point: load scenario and run the appropriate generator."""
    scenario = load_scenario(SCENARIO_FILE)
    scenario_name = scenario.get("scenario", {}).get("name", "unknown")
    pattern_type = scenario.get("traffic", {}).get("pattern", {}).get("type", "constant")

    logger.info("=" * 60)
    logger.info(f"PAF Traffic Generator — {scenario_name}")
    logger.info(f"  Coordinator: {COORDINATOR_URL}")
    logger.info(f"  Scenario: {SCENARIO_FILE}")
    logger.info(f"  Pattern: {pattern_type}")
    logger.info("=" * 60)

    generator = GENERATORS.get(pattern_type, generate_uniform)

    connector = aiohttp.TCPConnector(limit=100, limit_per_host=100)
    async with aiohttp.ClientSession(connector=connector) as session:
        await generator(scenario, session)

    logger.info("Traffic generator finished.")


if __name__ == "__main__":
    asyncio.run(main())
