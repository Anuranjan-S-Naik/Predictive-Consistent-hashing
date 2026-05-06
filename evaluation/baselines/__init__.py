# PAF Evaluation — Baselines package
"""Round-robin, least-connections, and static consistent hashing baseline implementations."""

from .round_robin import RoundRobinAllocator
from .least_connections import LeastConnectionsAllocator
from .static_consistent_hash import StaticConsistentHashAllocator

__all__ = [
    "RoundRobinAllocator",
    "LeastConnectionsAllocator",
    "StaticConsistentHashAllocator",
]
