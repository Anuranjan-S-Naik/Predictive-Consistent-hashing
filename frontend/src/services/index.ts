import { api } from './api-client';
import type { NodeMetrics, RoutingResult, RingSnapshot, DatastoreStats, BenchmarkResult, SimulationStatus, ForecastPoint } from '@/types';

// --- Node & Metrics ---
export const nodeService = {
  listNodes: () => api.get<NodeMetrics[]>('/api/v1/nodes').then(r => r.data),
  getNodeMetrics: (id: string) => api.get<NodeMetrics>(`/api/v1/nodes/${id}`).then(r => r.data),
};

// --- Routing & Ring ---
export const routingService = {
  submitRequest: (payload: Record<string, unknown>) =>
    api.post<RoutingResult>('/api/v1/request', payload).then(r => r.data),
  getRing: () => api.get<RingSnapshot>('/api/v1/ring').then(r => r.data),
};

// --- Simulation ---
export const simulationService = {
  start: (scenario: string, rps: number) =>
    api.post<SimulationStatus>('/api/v1/simulation/start', { scenario, rps }).then(r => r.data),
  stop: () => api.post<SimulationStatus>('/api/v1/simulation/stop').then(r => r.data),
  status: () => api.get<SimulationStatus>('/api/v1/simulation/status').then(r => r.data),
};

// --- Benchmarks ---
export const benchmarkService = {
  list: () => api.get<BenchmarkResult[]>('/api/v1/benchmarks').then(r => r.data),
  run: (config: Record<string, unknown>) =>
    api.post<BenchmarkResult>('/api/v1/benchmarks/run', config).then(r => r.data),
};

// --- Forecast ---
export const forecastService = {
  latest: () => api.get<ForecastPoint[]>('/api/v1/forecast').then(r => r.data),
};

// --- Datastores ---
export const datastoreService = {
  health: () => api.get<DatastoreStats>('/api/v1/datastores').then(r => r.data),
};

// --- Health ---
export const healthService = {
  check: () => api.get<{ status: string; active_nodes: number }>('/health').then(r => r.data),
};
