export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';
export const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'dev-api-key-change-me';

export const NODES = ['node_s1', 'node_s2', 'node_s3', 'node_s4'] as const;

export const NODE_COLORS: Record<string, string> = {
  node_s1: '#6366f1',
  node_s2: '#22d3ee',
  node_s3: '#34d399',
  node_s4: '#fbbf24',
};

export const NODE_LABELS: Record<string, string> = {
  node_s1: 'S1 — Standard',
  node_s2: 'S2 — Compact',
  node_s3: 'S3 — Power',
  node_s4: 'S4 — Balanced',
};

export const CLASS_COLORS: Record<string, string> = {
  Light: '#34d399',
  Medium: '#fbbf24',
  Heavy: '#f87171',
};

export const SCENARIOS = ['uniform', 'bursty', 'flash_crowd', 'random'] as const;

export const ALLOCATION_MODES = [
  'round_robin',
  'least_connections',
  'static_consistent_hash',
  'predictive_framework',
] as const;

export const REFRESH_INTERVALS = {
  METRICS: 1000,
  NODES: 3000,
  RING: 5000,
  FORECAST: 5000,
  DATASTORES: 10000,
} as const;
