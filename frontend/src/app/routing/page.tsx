'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { Route, GitBranch, Target, AlertTriangle } from 'lucide-react';
import { GlassPanel, SectionHeader, Badge, ProgressBar, StatCard } from '@/components/ui';
import { cn, getStatusColor } from '@/lib/utils';
import { NODE_COLORS, NODES, REFRESH_INTERVALS, API_BASE_URL } from '@/constants';

const API_HEADERS = {
  'X-API-Key': 'dev-api-key-change-me',
  'Content-Type': 'application/json',
};

interface AllocationData {
  weights: {
    alpha_cpu: number;
    beta_queue: number;
    gamma_latency: number;
    delta_forecast: number;
    overflow_threshold: number;
  };
  scores: Record<string, number>;
  node_metrics: Record<string, any>;
  class_counts: Record<string, number>;
  class_distribution: Record<string, number>;
}

interface RecentRequest {
  request_id: string;
  predicted_class: string;
  assigned_node: string;
  routing_hops: number;
  allocation_score: number;
  routing_method: string;
  elapsed_ms: number;
  timestamp: number;
}

function useRoutingData() {
  const [allocation, setAllocation] = useState<AllocationData | null>(null);
  const [recentRequests, setRecentRequests] = useState<RecentRequest[]>([]);
  const [ringInfo, setRingInfo] = useState<{ total_vnodes: number; nodes: Record<string, { vnode_count: number }> } | null>(null);
  const [isLive, setIsLive] = useState(false);
  const recentRequestsRef = useRef<RecentRequest[]>([]);

  const fetchData = useCallback(async () => {
    const opts = { headers: API_HEADERS, signal: AbortSignal.timeout(4000) };

    try {
      const [allocRes, recentRes, ringRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/api/v1/allocation`, opts).then(r => r.ok ? r.json() : null),
        fetch(`${API_BASE_URL}/api/v1/recent_requests`, opts).then(r => r.ok ? r.json() : null),
        fetch(`${API_BASE_URL}/api/v1/ring`, opts).then(r => r.ok ? r.json() : null),
      ]);

      const allocData = allocRes.status === 'fulfilled' ? allocRes.value : null;
      const recentData = recentRes.status === 'fulfilled' ? recentRes.value : null;
      const ringData = ringRes.status === 'fulfilled' ? ringRes.value : null;

      if (allocData) {
        setAllocation(allocData);
        setIsLive(true);
      }

      if (recentData && Array.isArray(recentData)) {
        // Merge with existing, deduplicate
        const map = new Map(recentRequestsRef.current.map(r => [r.request_id, r]));
        recentData.forEach((req: RecentRequest) => {
          map.set(req.request_id, req);
        });
        const merged = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
        recentRequestsRef.current = merged;
        setRecentRequests(merged);
      }

      if (ringData) {
        setRingInfo(ringData as any);
      }
    } catch {
      setIsLive(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, REFRESH_INTERVALS.RING);
    return () => clearInterval(iv);
  }, [fetchData]);

  return { allocation, recentRequests, ringInfo, isLive };
}

export default function RoutingPage() {
  const { allocation, recentRequests, ringInfo, isLive } = useRoutingData();

  // Use real allocation scores from the backend
  const scores = allocation?.scores ?? {};
  const weights = allocation?.weights ?? {
    alpha_cpu: 0.35, beta_queue: 0.30, gamma_latency: 0.20,
    delta_forecast: 0.15, overflow_threshold: 0.85,
  };
  const nodeMetrics = allocation?.node_metrics ?? {};

  const sorted = Object.entries(scores).sort(([, a], [, b]) => a - b);
  const winner = sorted[0]?.[0] || '';
  const activeNodeCount = sorted.length || NODES.length;

  // Calculate chord overflow stats from the request stream
  const chordOverflows = recentRequests.filter(r => r.routing_method === 'chord_router').length;
  const totalRequests = recentRequests.length;
  const overflowRate = totalRequests > 0
    ? ((chordOverflows / totalRequests) * 100).toFixed(1)
    : '0.0';

  // Average score across all nodes
  const scoreValues = Object.values(scores);
  const avgScore = scoreValues.length > 0
    ? (scoreValues.reduce((s, v) => s + v, 0) / scoreValues.length).toFixed(3)
    : '0.000';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Routing Engine</h1>
          <Badge variant={isLive ? 'success' : 'info'}>{isLive ? 'Live' : 'Demo'}</Badge>
        </div>
        <p className="text-sm text-zinc-500 mt-1">Score-based allocation decisions and routing visualization</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Active Nodes" value={String(activeNodeCount)} icon={Route} color="indigo" />
        <StatCard label="Avg Score" value={avgScore} icon={Target} color="cyan" />
        <StatCard label="Chord Overflows" value={String(chordOverflows)} icon={GitBranch} color="amber" />
        <StatCard label="Overflow Rate" value={`${overflowRate}%`} icon={AlertTriangle} color="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Node Rankings */}
        <GlassPanel>
          <SectionHeader title="Node Score Rankings" subtitle="Lower score = better candidate" />
          <div className="space-y-3">
            {sorted.map(([nodeId, score], i) => {
              const color = NODE_COLORS[nodeId] || '#6366f1';
              const isWinner = i === 0;
              const isOverloaded = score > weights.overflow_threshold;
              return (
                <motion.div
                  key={nodeId}
                  layout
                  className={cn(
                    'flex items-center gap-4 p-4 rounded-xl border transition-all',
                    isWinner
                      ? 'bg-emerald-500/5 border-emerald-500/20'
                      : isOverloaded
                        ? 'bg-rose-500/5 border-rose-500/20'
                        : 'bg-white/[0.02] border-white/[0.04]'
                  )}
                >
                  <span className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold',
                    isWinner ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/[0.04] text-zinc-500'
                  )}>
                    #{i + 1}
                  </span>
                  <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                  <span className="text-sm font-medium text-zinc-200 w-20">{nodeId.replace('node_', 'S')}</span>
                  <div className="flex-1">
                    <ProgressBar value={score * 100} max={100}
                      color={score > 0.85 ? 'rose' : score > 0.6 ? 'amber' : 'emerald'} size="sm" />
                  </div>
                  <span className={cn(
                    'text-sm font-mono font-semibold w-14 text-right',
                    getStatusColor(score * 100, { warn: 60, crit: 85 })
                  )}>
                    {score.toFixed(3)}
                  </span>
                  {isWinner && <Badge variant="success">Selected</Badge>}
                  {isOverloaded && <Badge variant="danger">Overloaded</Badge>}
                </motion.div>
              );
            })}
          </div>
        </GlassPanel>

        {/* Score Breakdown — computed from real node_metrics using actual weights */}
        <GlassPanel>
          <SectionHeader title="Score Breakdown" subtitle={winner ? `Winner: ${winner.replace('node_', 'S')}` : undefined} />
          <div className="space-y-5">
            {sorted.slice(0, 2).map(([nodeId, totalScore]) => {
              const metrics = nodeMetrics[nodeId] || {};

              // Compute individual factor contributions using the same formula as the backend AllocationEngine
              const cpuNorm = Math.min((metrics.cpu_pct ?? 5.0) / 100.0, 1.0);
              const queueDepth = (metrics.queue_depth ?? 0);
              const queueMax = (metrics.queue_max ?? 450);
              const queueNorm = Math.min(queueDepth / Math.max(queueMax, 1), 1.0);
              const latencyNorm = Math.min((metrics.latency_ema_ms ?? 0) / Math.max(metrics.latency_max_ms ?? 5000, 1), 1.0);
              const forecastNorm = Math.min(metrics.predicted_load ?? 0, 1.0);

              return (
                <div key={nodeId} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full" style={{ background: NODE_COLORS[nodeId] }} />
                    <span className="text-sm font-semibold text-white">{nodeId}</span>
                    <span className="ml-auto text-sm font-mono text-zinc-400">Σ = {totalScore.toFixed(3)}</span>
                  </div>
                  {[
                    { label: 'α·CPU', val: cpuNorm, weight: weights.alpha_cpu, color: 'brand' },
                    { label: 'β·Queue', val: queueNorm, weight: weights.beta_queue, color: 'cyan' },
                    { label: 'γ·Latency', val: latencyNorm, weight: weights.gamma_latency, color: 'emerald' },
                    { label: 'δ·Forecast', val: forecastNorm, weight: weights.delta_forecast, color: 'amber' },
                  ].map(c => (
                    <div key={c.label} className="flex items-center gap-2 py-1">
                      <span className="text-xs text-zinc-500 w-20">{c.label}</span>
                      <ProgressBar value={c.val * 100} color={c.color as any} size="xs" className="flex-1" />
                      <span className="text-xs font-mono text-zinc-600 w-12 text-right">{(c.val * c.weight).toFixed(3)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </GlassPanel>
      </div>
    </motion.div>
  );
}
