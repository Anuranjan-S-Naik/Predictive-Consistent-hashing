# -*- coding: utf-8 -*-
"""gRPC service stubs for coordinator.proto.

Provides:
  - CoordinatorNodeServiceStub     (client — coordinator calls nodes)
  - CoordinatorNodeServiceServicer (server — nodes implement this)
  - add_CoordinatorNodeServiceServicer_to_server (registration helper)

Replace with protoc-generated code when grpcio-tools is installed:
  python -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. coordinator.proto
"""

import grpc
import pickle
from . import coordinator_pb2 as pb2


class CoordinatorNodeServiceStub:
    """Client-side gRPC stub for calling node RPCs."""

    def __init__(self, channel: grpc.Channel):
        self.RouteRequest = channel.unary_unary(
            '/paf.CoordinatorNodeService/RouteRequest',
            request_serializer=lambda m: pickle.dumps(m.__dict__),
            response_deserializer=lambda d: _from_bytes(pb2.RouteRequestResponse, d),
        )
        self.ReportCompletion = channel.unary_unary(
            '/paf.CoordinatorNodeService/ReportCompletion',
            request_serializer=lambda m: pickle.dumps(m.__dict__),
            response_deserializer=lambda d: _from_bytes(pb2.CompletionResponse, d),
        )
        self.GetNodeMetrics = channel.unary_unary(
            '/paf.CoordinatorNodeService/GetNodeMetrics',
            request_serializer=lambda m: pickle.dumps(m.__dict__),
            response_deserializer=lambda d: _from_bytes(pb2.NodeMetricsResponse, d),
        )
        self.HealthCheck = channel.unary_unary(
            '/paf.CoordinatorNodeService/HealthCheck',
            request_serializer=lambda m: pickle.dumps(m.__dict__),
            response_deserializer=lambda d: _from_bytes(pb2.HealthCheckResponse, d),
        )


class CoordinatorNodeServiceServicer:
    """Server-side base class. Nodes subclass and implement all RPCs."""

    def RouteRequest(self, request, context):
        context.set_code(grpc.StatusCode.UNIMPLEMENTED)
        context.set_details('RouteRequest not implemented')
        raise NotImplementedError('RouteRequest not implemented')

    def ReportCompletion(self, request, context):
        context.set_code(grpc.StatusCode.UNIMPLEMENTED)
        context.set_details('ReportCompletion not implemented')
        raise NotImplementedError('ReportCompletion not implemented')

    def GetNodeMetrics(self, request, context):
        context.set_code(grpc.StatusCode.UNIMPLEMENTED)
        context.set_details('GetNodeMetrics not implemented')
        raise NotImplementedError('GetNodeMetrics not implemented')

    def HealthCheck(self, request, context):
        context.set_code(grpc.StatusCode.UNIMPLEMENTED)
        context.set_details('HealthCheck not implemented')
        raise NotImplementedError('HealthCheck not implemented')


def add_CoordinatorNodeServiceServicer_to_server(servicer, server):
    """Register servicer with a gRPC server."""
    from grpc import unary_unary_rpc_method_handler

    rpc_method_handlers = {
        'RouteRequest': unary_unary_rpc_method_handler(
            servicer.RouteRequest,
            request_deserializer=lambda d: _from_bytes(pb2.RouteRequestMsg, d),
            response_serializer=lambda m: pickle.dumps(m.__dict__),
        ),
        'ReportCompletion': unary_unary_rpc_method_handler(
            servicer.ReportCompletion,
            request_deserializer=lambda d: _from_bytes(pb2.CompletionMsg, d),
            response_serializer=lambda m: pickle.dumps(m.__dict__),
        ),
        'GetNodeMetrics': unary_unary_rpc_method_handler(
            servicer.GetNodeMetrics,
            request_deserializer=lambda d: _from_bytes(pb2.NodeIdMsg, d),
            response_serializer=lambda m: pickle.dumps(m.__dict__),
        ),
        'HealthCheck': unary_unary_rpc_method_handler(
            servicer.HealthCheck,
            request_deserializer=lambda d: _from_bytes(pb2.HealthCheckRequest, d),
            response_serializer=lambda m: pickle.dumps(m.__dict__),
        ),
    }
    generic_handler = grpc.method_handlers_generic_handler(
        'paf.CoordinatorNodeService', rpc_method_handlers,
    )
    server.add_generic_rpc_handlers((generic_handler,))


def _from_bytes(cls, data):
    """Deserialize pickle bytes into a message class instance."""
    obj = cls()
    obj.__dict__.update(pickle.loads(data))
    return obj
