-- ============================================================================
-- Predictive Adaptive Request Allocation Framework
-- PostgreSQL Schema Definition
-- ============================================================================
-- Tables: nodes, requests, predictions, experiments, feedback_events
-- Run this script or use the Alembic migration (db/migrations/0001_initial.py)
-- ============================================================================

-- Enable UUID extension (optional, for future use)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- Table: nodes
-- ============================================================================
-- Stores the registered server nodes in the cluster.
-- Seeded at startup with S1–S4; updated if nodes join/leave.
-- ============================================================================

CREATE TABLE IF NOT EXISTS nodes (
    id              SERIAL PRIMARY KEY,
    node_name       VARCHAR(32) NOT NULL UNIQUE,
    capacity_score  INTEGER NOT NULL DEFAULT 100,
    ip_address      VARCHAR(64) NOT NULL,
    grpc_port       INTEGER NOT NULL DEFAULT 50051,
    cpu_cores       INTEGER NOT NULL DEFAULT 4,
    memory_gb       INTEGER NOT NULL DEFAULT 8,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nodes_is_active ON nodes (is_active);
CREATE INDEX IF NOT EXISTS idx_nodes_node_name ON nodes (node_name);

-- Seed initial node data
INSERT INTO nodes (node_name, capacity_score, ip_address, grpc_port, cpu_cores, memory_gb, is_active)
VALUES
    ('node_s1', 100, 'node_s1', 50051, 4, 8,  TRUE),
    ('node_s2',  70, 'node_s2', 50052, 2, 4,  TRUE),
    ('node_s3', 150, 'node_s3', 50053, 8, 16, TRUE),
    ('node_s4',  90, 'node_s4', 50054, 3, 6,  TRUE)
ON CONFLICT (node_name) DO NOTHING;

-- ============================================================================
-- Table: requests
-- ============================================================================
-- Logs every incoming request with its extracted features.
-- Used for training data generation and post-hoc analysis.
-- ============================================================================

CREATE TABLE IF NOT EXISTS requests (
    id                  BIGSERIAL PRIMARY KEY,
    request_id          VARCHAR(64) NOT NULL UNIQUE,
    arrival_ts          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    endpoint_id         SMALLINT NOT NULL DEFAULT 0,
    endpoint_path       VARCHAR(128),
    method              VARCHAR(8) NOT NULL DEFAULT 'GET',
    payload_bytes       INTEGER NOT NULL DEFAULT 0,
    source_id           VARCHAR(64),
    burst_frequency     FLOAT,
    avg_latency_ema     FLOAT,
    queue_depth_at_arrival INTEGER,
    hour_of_day         SMALLINT,
    is_burst            BOOLEAN NOT NULL DEFAULT FALSE,
    experiment_id       VARCHAR(64),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requests_arrival_ts ON requests (arrival_ts);
CREATE INDEX IF NOT EXISTS idx_requests_endpoint_id ON requests (endpoint_id);
CREATE INDEX IF NOT EXISTS idx_requests_experiment_id ON requests (experiment_id);
CREATE INDEX IF NOT EXISTS idx_requests_request_id ON requests (request_id);

-- ============================================================================
-- Table: predictions
-- ============================================================================
-- Stores ML classification results and execution outcomes for every request.
-- Links to requests table via request_id.
-- Critical for: training data, accuracy measurement, drift detection.
-- ============================================================================

CREATE TABLE IF NOT EXISTS predictions (
    id                  BIGSERIAL PRIMARY KEY,
    request_id          BIGINT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    request_id_str      VARCHAR(64) NOT NULL,
    predicted_class     VARCHAR(8) NOT NULL CHECK (predicted_class IN ('Light', 'Medium', 'Heavy')),
    confidence          FLOAT NOT NULL DEFAULT 0.0,
    inference_ms        FLOAT,
    node_assigned       VARCHAR(32) NOT NULL,
    routing_hops        INTEGER NOT NULL DEFAULT 1,
    assigned_by         VARCHAR(32) DEFAULT 'allocation_engine',
    allocation_score    FLOAT,
    dispatch_ts         TIMESTAMPTZ,
    completion_ts       TIMESTAMPTZ,
    execution_ms        FLOAT,
    queue_wait_ms       FLOAT,
    total_latency_ms    FLOAT,
    success             BOOLEAN NOT NULL DEFAULT TRUE,
    error_message       TEXT,
    -- Ground-truth label derived from actual execution_ms (for ML training)
    ground_truth_class  VARCHAR(8) CHECK (ground_truth_class IN ('Light', 'Medium', 'Heavy', NULL)),
    experiment_id       VARCHAR(64),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_request_id ON predictions (request_id);
CREATE INDEX IF NOT EXISTS idx_predictions_predicted_class ON predictions (predicted_class);
CREATE INDEX IF NOT EXISTS idx_predictions_node_assigned ON predictions (node_assigned);
CREATE INDEX IF NOT EXISTS idx_predictions_experiment_id ON predictions (experiment_id);
CREATE INDEX IF NOT EXISTS idx_predictions_created_at ON predictions (created_at);

-- ============================================================================
-- Table: experiments
-- ============================================================================
-- Stores metadata and summary results for each benchmark experiment run.
-- 16 total runs expected: 4 scenarios × 4 allocation modes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS experiments (
    id                  SERIAL PRIMARY KEY,
    name                VARCHAR(128) NOT NULL UNIQUE,
    scenario            JSONB NOT NULL,
    allocation_mode     VARCHAR(32) NOT NULL CHECK (allocation_mode IN (
                            'round_robin', 'least_connections',
                            'static_consistent_hash', 'predictive_framework'
                        )),
    started_at          TIMESTAMPTZ,
    ended_at            TIMESTAMPTZ,
    duration_sec        FLOAT,
    total_requests      INTEGER,
    results_summary     JSONB,
    -- Flattened key metrics for easy querying
    latency_p50_ms      FLOAT,
    latency_p95_ms      FLOAT,
    latency_p99_ms      FLOAT,
    throughput_rps       FLOAT,
    load_variance_stddev FLOAT,
    failure_rate_pct     FLOAT,
    avg_cpu_utilization  FLOAT,
    avg_routing_hops     FLOAT,
    config_snapshot      JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_experiments_allocation_mode ON experiments (allocation_mode);

-- ============================================================================
-- Table: feedback_events
-- ============================================================================
-- Logs every action taken by the feedback/self-optimization loop.
-- Used for debugging adaptation behavior and analyzing system responsiveness.
-- ============================================================================

CREATE TABLE IF NOT EXISTS feedback_events (
    id                  BIGSERIAL PRIMARY KEY,
    ts                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    action_type         VARCHAR(32) NOT NULL CHECK (action_type IN (
                            'vnode_adjustment', 'model_retrain', 'finger_refresh',
                            'drift_warning', 'node_removal', 'node_addition',
                            'emergency_rebalance', 'alert'
                        )),
    trigger_metric      VARCHAR(64) NOT NULL,
    trigger_value       FLOAT,
    threshold_value     FLOAT,
    node_id             VARCHAR(32),
    old_value           FLOAT,
    new_value           FLOAT,
    details             JSONB,
    experiment_id       VARCHAR(64),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_events_ts ON feedback_events (ts);
CREATE INDEX IF NOT EXISTS idx_feedback_events_action_type ON feedback_events (action_type);
CREATE INDEX IF NOT EXISTS idx_feedback_events_node_id ON feedback_events (node_id);

-- ============================================================================
-- Utility Views
-- ============================================================================

-- View: per-node request counts and average latency
CREATE OR REPLACE VIEW v_node_performance AS
SELECT
    p.node_assigned,
    p.predicted_class,
    COUNT(*) AS request_count,
    AVG(p.execution_ms) AS avg_execution_ms,
    AVG(p.total_latency_ms) AS avg_total_latency_ms,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY p.total_latency_ms) AS p95_latency_ms,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY p.total_latency_ms) AS p99_latency_ms,
    SUM(CASE WHEN p.success = FALSE THEN 1 ELSE 0 END) AS failure_count
FROM predictions p
GROUP BY p.node_assigned, p.predicted_class;

-- View: experiment comparison summary
CREATE OR REPLACE VIEW v_experiment_comparison AS
SELECT
    e.name,
    e.allocation_mode,
    (e.scenario->>'name') AS scenario_name,
    e.latency_p50_ms,
    e.latency_p95_ms,
    e.latency_p99_ms,
    e.throughput_rps,
    e.load_variance_stddev,
    e.failure_rate_pct,
    e.duration_sec,
    e.total_requests
FROM experiments e
ORDER BY (e.scenario->>'name'), e.allocation_mode;
