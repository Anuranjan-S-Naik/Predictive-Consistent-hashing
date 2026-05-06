"""Initial schema: nodes, requests, predictions, experiments, feedback_events

Revision ID: 0001
Revises: -
Create Date: 2026-05-06
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

# Revision identifiers
revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create all initial tables for the Predictive Adaptive Request Allocation Framework."""

    # ---- Table: nodes ----
    op.create_table(
        'nodes',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('node_name', sa.String(32), nullable=False, unique=True),
        sa.Column('capacity_score', sa.Integer(), nullable=False, server_default='100'),
        sa.Column('ip_address', sa.String(64), nullable=False),
        sa.Column('grpc_port', sa.Integer(), nullable=False, server_default='50051'),
        sa.Column('cpu_cores', sa.Integer(), nullable=False, server_default='4'),
        sa.Column('memory_gb', sa.Integer(), nullable=False, server_default='8'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_nodes_is_active', 'nodes', ['is_active'])
    op.create_index('idx_nodes_node_name', 'nodes', ['node_name'])

    # Seed initial node data
    nodes_table = sa.table(
        'nodes',
        sa.column('node_name', sa.String),
        sa.column('capacity_score', sa.Integer),
        sa.column('ip_address', sa.String),
        sa.column('grpc_port', sa.Integer),
        sa.column('cpu_cores', sa.Integer),
        sa.column('memory_gb', sa.Integer),
        sa.column('is_active', sa.Boolean),
    )
    op.bulk_insert(nodes_table, [
        {
            'node_name': 'node_s1', 'capacity_score': 100,
            'ip_address': 'node_s1', 'grpc_port': 50051,
            'cpu_cores': 4, 'memory_gb': 8, 'is_active': True,
        },
        {
            'node_name': 'node_s2', 'capacity_score': 70,
            'ip_address': 'node_s2', 'grpc_port': 50052,
            'cpu_cores': 2, 'memory_gb': 4, 'is_active': True,
        },
        {
            'node_name': 'node_s3', 'capacity_score': 150,
            'ip_address': 'node_s3', 'grpc_port': 50053,
            'cpu_cores': 8, 'memory_gb': 16, 'is_active': True,
        },
        {
            'node_name': 'node_s4', 'capacity_score': 90,
            'ip_address': 'node_s4', 'grpc_port': 50054,
            'cpu_cores': 3, 'memory_gb': 6, 'is_active': True,
        },
    ])

    # ---- Table: requests ----
    op.create_table(
        'requests',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('request_id', sa.String(64), nullable=False, unique=True),
        sa.Column('arrival_ts', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('endpoint_id', sa.SmallInteger(), nullable=False, server_default='0'),
        sa.Column('endpoint_path', sa.String(128)),
        sa.Column('method', sa.String(8), nullable=False, server_default="'GET'"),
        sa.Column('payload_bytes', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('source_id', sa.String(64)),
        sa.Column('burst_frequency', sa.Float()),
        sa.Column('avg_latency_ema', sa.Float()),
        sa.Column('queue_depth_at_arrival', sa.Integer()),
        sa.Column('hour_of_day', sa.SmallInteger()),
        sa.Column('is_burst', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('experiment_id', sa.String(64)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index('idx_requests_arrival_ts', 'requests', ['arrival_ts'])
    op.create_index('idx_requests_endpoint_id', 'requests', ['endpoint_id'])
    op.create_index('idx_requests_experiment_id', 'requests', ['experiment_id'])
    op.create_index('idx_requests_request_id', 'requests', ['request_id'])

    # ---- Table: predictions ----
    op.create_table(
        'predictions',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('request_id', sa.BigInteger(),
                  sa.ForeignKey('requests.id', ondelete='CASCADE'), nullable=False),
        sa.Column('request_id_str', sa.String(64), nullable=False),
        sa.Column('predicted_class', sa.String(8), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('inference_ms', sa.Float()),
        sa.Column('node_assigned', sa.String(32), nullable=False),
        sa.Column('routing_hops', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('assigned_by', sa.String(32), server_default="'allocation_engine'"),
        sa.Column('allocation_score', sa.Float()),
        sa.Column('dispatch_ts', sa.DateTime(timezone=True)),
        sa.Column('completion_ts', sa.DateTime(timezone=True)),
        sa.Column('execution_ms', sa.Float()),
        sa.Column('queue_wait_ms', sa.Float()),
        sa.Column('total_latency_ms', sa.Float()),
        sa.Column('success', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('error_message', sa.Text()),
        sa.Column('ground_truth_class', sa.String(8)),
        sa.Column('experiment_id', sa.String(64)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        # Check constraints
        sa.CheckConstraint(
            "predicted_class IN ('Light', 'Medium', 'Heavy')",
            name='ck_predictions_predicted_class'
        ),
        sa.CheckConstraint(
            "ground_truth_class IN ('Light', 'Medium', 'Heavy') OR ground_truth_class IS NULL",
            name='ck_predictions_ground_truth_class'
        ),
    )
    op.create_index('idx_predictions_request_id', 'predictions', ['request_id'])
    op.create_index('idx_predictions_predicted_class', 'predictions', ['predicted_class'])
    op.create_index('idx_predictions_node_assigned', 'predictions', ['node_assigned'])
    op.create_index('idx_predictions_experiment_id', 'predictions', ['experiment_id'])
    op.create_index('idx_predictions_created_at', 'predictions', ['created_at'])

    # ---- Table: experiments ----
    op.create_table(
        'experiments',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(128), nullable=False, unique=True),
        sa.Column('scenario', JSONB(), nullable=False),
        sa.Column('allocation_mode', sa.String(32), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True)),
        sa.Column('ended_at', sa.DateTime(timezone=True)),
        sa.Column('duration_sec', sa.Float()),
        sa.Column('total_requests', sa.Integer()),
        sa.Column('results_summary', JSONB()),
        sa.Column('latency_p50_ms', sa.Float()),
        sa.Column('latency_p95_ms', sa.Float()),
        sa.Column('latency_p99_ms', sa.Float()),
        sa.Column('throughput_rps', sa.Float()),
        sa.Column('load_variance_stddev', sa.Float()),
        sa.Column('failure_rate_pct', sa.Float()),
        sa.Column('avg_cpu_utilization', sa.Float()),
        sa.Column('avg_routing_hops', sa.Float()),
        sa.Column('config_snapshot', JSONB()),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "allocation_mode IN ('round_robin', 'least_connections', "
            "'static_consistent_hash', 'predictive_framework')",
            name='ck_experiments_allocation_mode'
        ),
    )
    op.create_index('idx_experiments_allocation_mode', 'experiments', ['allocation_mode'])

    # ---- Table: feedback_events ----
    op.create_table(
        'feedback_events',
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=True),
        sa.Column('ts', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('action_type', sa.String(32), nullable=False),
        sa.Column('trigger_metric', sa.String(64), nullable=False),
        sa.Column('trigger_value', sa.Float()),
        sa.Column('threshold_value', sa.Float()),
        sa.Column('node_id', sa.String(32)),
        sa.Column('old_value', sa.Float()),
        sa.Column('new_value', sa.Float()),
        sa.Column('details', JSONB()),
        sa.Column('experiment_id', sa.String(64)),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "action_type IN ('vnode_adjustment', 'model_retrain', 'finger_refresh', "
            "'drift_warning', 'node_removal', 'node_addition', "
            "'emergency_rebalance', 'alert')",
            name='ck_feedback_events_action_type'
        ),
    )
    op.create_index('idx_feedback_events_ts', 'feedback_events', ['ts'])
    op.create_index('idx_feedback_events_action_type', 'feedback_events', ['action_type'])
    op.create_index('idx_feedback_events_node_id', 'feedback_events', ['node_id'])


def downgrade() -> None:
    """Drop all tables in reverse order."""
    op.drop_table('feedback_events')
    op.drop_table('experiments')
    op.drop_table('predictions')
    op.drop_table('requests')
    op.drop_table('nodes')
