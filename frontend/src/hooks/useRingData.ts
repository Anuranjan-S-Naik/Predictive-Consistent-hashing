'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '@/constants';

// ---------------------------------------------------------------------------
// Types — derived from actual API response shapes (audited via curl)
// ---------------------------------------------------------------------------

export interface RingNodeData {
  vnode_count: number;
  capacity_score: number;
}

export interface RingData {
  total_vnodes: number;
  total_nodes: number;
  nodes: Record<string, RingNodeData>;
  avg_capacity: number;
  last_updated: number;
}

export interface NodeMetrics {
  cpu_pct: number;
  queue_depth: number;
  queue_max: number;
  latency_ema_ms: number;
  latency_max_ms: number;
  predicted_load: number;
  throughput_rps?: number;
  _updated_at: number;
}

export interface AllocationData {
  weights: Record<string, number>;
  scores: Record<string, number>;
  node_metrics: Record<string, NodeMetrics>;
  class_counts: Record<string, number>;
  class_distribution: Record<string, number>;
}

export interface DAANodeAdjustment {
  node_name: string;
  old_vnodes: number;
  new_vnodes: number;
  cpu_pct: number;
  queue_depth_pct: number;
  cpu_factor: number;
  queue_factor: number;
  burst_damping: number;
  reason: string;
}

export interface DAAHistoryEntry {
  run_id: number;
  timestamp: number;
  total_vnodes_before: number;
  total_vnodes_after: number;
  triggered_by: string;
  duration_ms: number;
}

export interface DAAData {
  running: boolean;
  interval_sec: number;
  total_runs: number;
  last_run_time: number;
  last_run_duration_ms: number;
  burst_imminent: boolean;
  thresholds: Record<string, number>;
  last_adjustments: DAANodeAdjustment[];
  last_total_vnodes: number;
  history: DAAHistoryEntry[];
}

export interface UseRingDataResult {
  ring: RingData | null;
  allocation: AllocationData | null;
  daa: DAAData | null;
  loading: boolean;
  error: string | null;
  connected: boolean;
  lastFetch: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 2000;

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export function useRingData(enabled: boolean = true): UseRingDataResult {
  const [ring, setRing] = useState<RingData | null>(null);
  const [allocation, setAllocation] = useState<AllocationData | null>(null);
  const [daa, setDaa] = useState<DAAData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastFetch, setLastFetch] = useState(0);
  const mountedRef = useRef(true);

  const poll = useCallback(async () => {
    if (!enabled) return;
    try {
      const [ringRes, allocRes, daaRes] = await Promise.all([
        fetchJSON<RingData>('/api/v1/ring'),
        fetchJSON<AllocationData>('/api/v1/allocation'),
        fetchJSON<DAAData>('/api/v1/daa'),
      ]);
      if (!mountedRef.current) return;
      setRing(ringRes);
      setAllocation(allocRes);
      setDaa(daaRes);
      setConnected(true);
      setError(null);
      setLastFetch(Date.now());
    } catch (e: unknown) {
      if (!mountedRef.current) return;
      setConnected(false);
      setError(e instanceof Error ? e.message : 'Failed to fetch');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    mountedRef.current = true;
    poll();
    const iv = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(iv);
    };
  }, [poll]);

  return { ring, allocation, daa, loading, error, connected, lastFetch };
}
