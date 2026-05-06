// ============================================================================
// Predictive Consistent Hashing — Core Type Definitions
// ============================================================================

export interface NodeMetrics {
  node_id: string;
  cpu_pct: number;
  memory_pct: number;
  queue_depth_light: number;
  queue_depth_medium: number;
  queue_depth_heavy: number;
  queue_depth_total: number;
  latency_ema_ms: number;
  throughput_rps: number;
  capacity_score: number;
  vnode_count: number;
  total_requests_processed: number;
  total_requests_rejected: number;
  timestamp_ms: number;
  is_healthy: boolean;
  uptime_sec: number;
}

export interface NodeConfig {
  name: string;
  capacity_score: number;
  grpc_address: string;
  cpu_cores: number;
  memory_gb: number;
}

export type RequestClass = 'Light' | 'Medium' | 'Heavy';

export interface RoutingResult {
  request_id: string;
  predicted_class: RequestClass;
  confidence: number;
  assigned_node: string;
  routing_hops: number;
  allocation_score: number;
  routing_method: string;
  feature_vector: number[];
  pipeline_latency_ms: number;
  status: string;
}

export interface SimulationStatus {
  state: 'idle' | 'running' | 'paused' | 'stopped' | 'failed';
  scenario: string;
  rps: number;
  duration_sec: number;
  elapsed_sec: number;
  total_requests: number;
  errors: number;
}

export interface BenchmarkResult {
  name: string;
  scenario: string;
  allocation_mode: string;
  latency_p50_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
  throughput_rps: number;
  load_variance: number;
  failure_rate_pct: number;
  total_requests: number;
  duration_sec: number;
}

export interface ForecastPoint {
  timestamp: number;
  predicted: number;
  actual?: number;
  confidence_lower?: number;
  confidence_upper?: number;
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  node_id?: string;
  timestamp: number;
  acknowledged: boolean;
}

export interface DatastoreStats {
  postgres_writer: {
    total_rows_written: number;
    total_flushes: number;
    current_request_buffer_size: number;
    last_flush_duration_ms: number;
    flush_errors: number;
  } | null;
  redis_ring_cache: {
    ring_cache_size: number;
    refresh_count: number;
    refresh_latency_ms: number;
  } | null;
  redis_metrics_cache: {
    cached_nodes: number;
    refresh_count: number;
    refresh_latency_ms: number;
  } | null;
  influxdb_client: {
    total_points_written: number;
    total_flushes: number;
    flush_errors: number;
    current_buffer_size: number;
  } | null;
}

export interface RingSnapshot {
  nodes: Record<string, number>;
  total_vnodes: number;
}

export interface QueueState {
  node_id: string;
  light: { depth: number; max: number; weight: number };
  medium: { depth: number; max: number; weight: number };
  heavy: { depth: number; max: number; weight: number };
}

export interface ChordFingerEntry {
  k: number;
  start: number;
  target_node: string;
}

export interface ScenarioConfig {
  name: string;
  description: string;
  rps: number;
  duration_seconds: number;
  pattern_type: string;
  class_distribution: {
    light: number;
    medium: number;
    heavy: number;
  };
}
