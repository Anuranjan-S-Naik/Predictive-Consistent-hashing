# coordinator/grpc package
"""gRPC interface for Coordinator ↔ Node communication."""

from .coordinator_pb2 import (
    RequestClass,
    RouteRequestMsg,
    RouteRequestResponse,
    CompletionMsg,
    CompletionResponse,
    NodeIdMsg,
    NodeMetricsResponse,
    HealthCheckRequest,
    HealthCheckResponse,
)

from .coordinator_pb2_grpc import (
    CoordinatorNodeServiceStub,
    CoordinatorNodeServiceServicer,
    add_CoordinatorNodeServiceServicer_to_server,
)

__all__ = [
    'RequestClass',
    'RouteRequestMsg',
    'RouteRequestResponse',
    'CompletionMsg',
    'CompletionResponse',
    'NodeIdMsg',
    'NodeMetricsResponse',
    'HealthCheckRequest',
    'HealthCheckResponse',
    'CoordinatorNodeServiceStub',
    'CoordinatorNodeServiceServicer',
    'add_CoordinatorNodeServiceServicer_to_server',
]
