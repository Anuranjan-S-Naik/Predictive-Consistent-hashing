export const WS_EVENTS = {
  NODE_METRICS: 'node_metrics',
  REQUEST_FLOW: 'request_flow',
  FORECASTS: 'forecasts',
  ALERTS: 'alerts',
  BENCHMARK_PROGRESS: 'benchmark_progress',
  QUEUE_UPDATES: 'queue_updates',
  SIMULATION_STATUS: 'simulation_status',
} as const;

export type WsEventType = typeof WS_EVENTS[keyof typeof WS_EVENTS];
