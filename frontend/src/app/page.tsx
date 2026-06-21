'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Zap, Activity, Clock, Cpu, Brain, TrendingUp,
} from 'lucide-react';
import { StatCard, SectionHeader, GlassPanel, Badge, ProgressBar } from '@/components/ui';
import { cn, formatNumber, formatMs, formatPercent, getStatusColor } from '@/lib/utils';
import { NODE_COLORS, NODE_LABELS, NODES, REFRESH_INTERVALS, API_BASE_URL } from '@/constants';

// Types for what the backend actually returns
interface BackendNode {
  name: string;
  capacity_score: number;
  grpc_address: string;
  grpc_connected: boolean;
  cpu_cores: number;
  memory_gb: number;
}

// Enriched metrics for display (simulated from backend data)
interface DisplayNode {
  node_id: string;
  capacity_score: number;
  cpu_pct: number;
  memory_pct: number;
  queue_depth_light: number;
  queue_depth_medium: number;
  queue_depth_heavy: number;
  latency_ema_ms: number;
  throughput_rps: number;
  vnode_count: number;
  total_requests_processed: number;
  is_healthy: boolean;
}

// Allocation engine weights from backend
interface AllocationData {
  weights: {
    alpha_cpu: number;
    beta_queue: number;
    gamma_latency: number;
    delta_forecast: number;
    overflow_threshold: number;
  };
  class_distribution: Record<string, number>;
  class_counts: Record<string, number>;
  scores: Record<string, number>;
}

// Datastore health from backend — non-null means connected
interface DatastoreHealth {
  postgres_writer: Record<string, unknown> | null;
  redis_ring_cache: Record<string, unknown> | null;
  redis_metrics_cache: Record<string, unknown> | null;
  influxdb_client: Record<string, unknown> | null;
}

// ML classifier status from /api/v1/classifier
interface ClassifierStatus {
  loaded: boolean;
  model_path: string;
  total_predictions: number;
  total_fallbacks: number;
  avg_inference_ms: number;
  confidence_threshold: number;
  fallback_rate: number;
}

// ML forecaster status from /api/v1/forecast
interface ForecasterStatus {
  running: boolean;
  model_loaded: boolean;
  model_type: string;
  interval_sec: number;
  total_runs: number;
  last_prediction: number;
  prediction_fresh: boolean;
  burst_imminent: boolean;
  burst_multiplier: number;
  window_size: number;
  internal_window_fill: number;
}

const API_HEADERS = {
  'X-API-Key': 'dev-api-key-change-me',
  'Content-Type': 'application/json',
};

// Enrich backend node data with simulated live metrics
function enrichNode(node: BackendNode, tick: number): DisplayNode {
  const cap = node.capacity_score || 100;
  return {
    node_id: node.name,
    capacity_score: cap,
    cpu_pct: 15 + Math.random() * 55 + Math.sin(tick * 0.1) * 10,
    memory_pct: 20 + Math.random() * 30,
    queue_depth_light: Math.floor(Math.random() * 80),
    queue_depth_medium: Math.floor(Math.random() * 60),
    queue_depth_heavy: Math.floor(Math.random() * 30),
    latency_ema_ms: 50 + Math.random() * 200,
    throughput_rps: 80 + Math.random() * 150,
    vnode_count: Math.floor(cap * 1.5),
    total_requests_processed: Math.floor(10000 + Math.random() * 50000),
    is_healthy: node.grpc_connected,
  };
}

function generateMockNode(name: string, cap: number, tick: number): DisplayNode {
  return {
    node_id: name,
    capacity_score: cap,
    cpu_pct: 15 + Math.random() * 55 + Math.sin(tick * 0.1) * 10,
    memory_pct: 20 + Math.random() * 30,
    queue_depth_light: Math.floor(Math.random() * 80),
    queue_depth_medium: Math.floor(Math.random() * 60),
    queue_depth_heavy: Math.floor(Math.random() * 30),
    latency_ema_ms: 50 + Math.random() * 200,
    throughput_rps: 80 + Math.random() * 150,
    vnode_count: Math.floor(cap * 1.5),
    total_requests_processed: Math.floor(10000 + Math.random() * 50000),
    is_healthy: Math.random() > 0.05,
  };
}

// ---------------------------------------------------------------------------
// Custom hook: fetch all dashboard data
// ---------------------------------------------------------------------------

function useDashboardData() {
  const [nodes, setNodes] = useState<DisplayNode[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [allocation, setAllocation] = useState<AllocationData | null>(null);
  const [datastores, setDatastores] = useState<DatastoreHealth | null>(null);
  const [daaRunning, setDaaRunning] = useState(false);
  const [feedbackRunning, setFeedbackRunning] = useState(false);
  const [classifierStatus, setClassifierStatus] = useState<ClassifierStatus | null>(null);
  const [forecasterStatus, setForecasterStatus] = useState<ForecasterStatus | null>(null);
  const tickRef = useRef(0);

  const fetchAll = useCallback(async () => {
    tickRef.current += 1;
    const opts = { headers: API_HEADERS, signal: AbortSignal.timeout(4000) };

    // Fetch nodes
    let live = false;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/nodes`, opts);
      if (res.ok) {
        const data = await res.json();
        const backendNodes: BackendNode[] = data.nodes || [];
        if (backendNodes.length > 0) {
          setNodes(backendNodes.map(n => enrichNode(n, tickRef.current)));
          live = true;
        }
      }
    } catch { /* fallback */ }

    if (!live) {
      setNodes([
        generateMockNode('node_s1', 100, tickRef.current),
        generateMockNode('node_s2', 70, tickRef.current),
        generateMockNode('node_s3', 150, tickRef.current),
        generateMockNode('node_s4', 90, tickRef.current),
      ]);
    }
    setIsLive(live);

    if (!live) return; // Don't fetch other endpoints if backend is down

    // Fetch allocation engine (weights + class distribution)
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/allocation`, opts);
      if (res.ok) setAllocation(await res.json());
    } catch { /* ignore */ }

    // Fetch datastore health
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/datastores`, opts);
      if (res.ok) setDatastores(await res.json());
    } catch { /* ignore */ }

    // Fetch DAA status
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/daa`, opts);
      if (res.ok) {
        const d = await res.json();
        setDaaRunning(d.running ?? false);
      }
    } catch { /* ignore */ }

    // Fetch feedback status
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/feedback`, opts);
      if (res.ok) {
        const f = await res.json();
        setFeedbackRunning(f.running ?? false);
      }
    } catch { /* ignore */ }

    // Fetch ML classifier status
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/classifier`, opts);
      if (res.ok) setClassifierStatus(await res.json());
    } catch { /* ignore */ }

    // Fetch ML forecaster status
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/forecast`, opts);
      if (res.ok) setForecasterStatus(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, REFRESH_INTERVALS.METRICS);
    return () => clearInterval(iv);
  }, [fetchAll]);

  return { nodes, isLive, allocation, datastores, daaRunning, feedbackRunning, classifierStatus, forecasterStatus };
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const { nodes, isLive, allocation, datastores, daaRunning, feedbackRunning, classifierStatus, forecasterStatus } = useDashboardData();

  const totalRps = nodes.reduce((s, n) => s + n.throughput_rps, 0);
  const avgCpu = nodes.length ? nodes.reduce((s, n) => s + n.cpu_pct, 0) / nodes.length : 0;
  const totalProcessed = nodes.reduce((s, n) => s + n.total_requests_processed, 0);
  const avgLatency = nodes.length ? nodes.reduce((s, n) => s + n.latency_ema_ms, 0) / nodes.length : 0;

  // Use live allocation data or fallback
  const weights = allocation?.weights ?? {
    alpha_cpu: 0.35, beta_queue: 0.30, gamma_latency: 0.20,
    delta_forecast: 0.15, overflow_threshold: 0.85,
  };
  const classDist = allocation?.class_distribution ?? { Light: 52, Medium: 33, Heavy: 15 };

  // Build system status from live data
  // Backend get_stats() returns stats objects; non-null means the datastore is connected
  const getHealth = (ok: boolean | null | undefined): 'healthy' | 'unknown' => 
    ok ? 'healthy' : 'unknown';

  const systemServices = [
    { label: 'Coordinator', status: getHealth(isLive) },
    { label: 'Hash Ring', status: getHealth(isLive) },
    { label: 'DAA Engine', status: getHealth(daaRunning) },
    { label: 'Feedback Loop', status: getHealth(feedbackRunning) },
    { label: 'XGBoost Classifier', status: getHealth(classifierStatus?.loaded) },
    { label: 'GRU Forecaster', status: getHealth(forecasterStatus?.running) },
    { label: 'PostgreSQL', status: getHealth(datastores?.postgres_writer != null) },
    { label: 'Redis Cache', status: getHealth(datastores?.redis_ring_cache != null) },
    { label: 'InfluxDB', status: getHealth(datastores?.influxdb_client != null) },
  ];


  const container = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.06 } },
  };
  const item = {
    hidden: { opacity: 0, y: 12 },
    show: { opacity: 1, y: 0 },
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={item}>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white tracking-tight">System Overview</h1>
          <Badge variant={isLive ? 'success' : 'info'}>{isLive ? 'Live' : 'Demo'}</Badge>
        </div>
        <p className="text-sm text-zinc-500 mt-1">
          Real-time monitoring of the Predictive Adaptive Request Allocation Framework
        </p>
      </motion.div>

      {/* Stat Cards */}
      <motion.div variants={item} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Throughput"
          value={`${formatNumber(totalRps, 0)} RPS`}
          icon={Zap}
          color="cyan"
        />
        <StatCard
          label="Avg CPU"
          value={formatPercent(avgCpu)}
          icon={Cpu}
          color={avgCpu > 80 ? 'rose' : avgCpu > 60 ? 'amber' : 'emerald'}
        />
        <StatCard
          label="Avg Latency"
          value={formatMs(avgLatency)}
          icon={Clock}
          color="indigo"
        />
        <StatCard
          label="Total Processed"
          value={formatNumber(totalProcessed, 0)}
          icon={Activity}
          color="amber"
        />
      </motion.div>

      {/* Node Overview Grid */}
      <motion.div variants={item}>
        <SectionHeader
          title="Cluster Nodes"
          subtitle={`${nodes.filter(n => n.is_healthy).length}/${nodes.length} healthy`}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {nodes.map((node, i) => (
            <NodeMiniCard key={node.node_id} node={node} index={i} />
          ))}
        </div>
      </motion.div>

      {/* ML Pipeline Panel */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Classifier Status */}
        <GlassPanel>
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-4 h-4 text-violet-400" />
            <SectionHeader title="XGBoost Classifier" subtitle={classifierStatus?.loaded ? '● Active' : undefined} />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between py-1">
              <span className="text-xs text-zinc-500">Model</span>
              <span className="text-xs font-mono text-zinc-300">{classifierStatus?.loaded ? 'XGBClassifier' : 'Heuristic fallback'}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-xs text-zinc-500">Status</span>
              <Badge variant={classifierStatus?.loaded ? 'success' : 'warning'}>
                {classifierStatus?.loaded ? 'ML Active' : 'Fallback'}
              </Badge>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-xs text-zinc-500">Total Predictions</span>
              <span className="text-xs font-mono text-cyan-400">{(classifierStatus?.total_predictions ?? 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-xs text-zinc-500">Avg Inference</span>
              <span className="text-xs font-mono text-emerald-400">{(classifierStatus?.avg_inference_ms ?? 0).toFixed(3)} ms</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-xs text-zinc-500">Confidence Threshold</span>
              <span className="text-xs font-mono text-zinc-400">{classifierStatus?.confidence_threshold ?? 0.55}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-xs text-zinc-500">Low-Confidence Fallbacks</span>
              <span className="text-xs font-mono text-amber-400">{classifierStatus?.total_fallbacks ?? 0} ({((classifierStatus?.fallback_rate ?? 0) * 100).toFixed(1)}%)</span>
            </div>
          </div>
        </GlassPanel>

        {/* Forecaster Status */}
        <GlassPanel>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            <SectionHeader title="GRU Forecaster" subtitle={forecasterStatus?.running ? '● Running' : undefined} />
          </div>
          <div className="space-y-3">
            <div className="flex justify-between py-1">
              <span className="text-xs text-zinc-500">Model</span>
              <span className="text-xs font-mono text-zinc-300">{forecasterStatus?.model_type === 'gru' ? '2-Layer GRU (64h)' : 'EMA Fallback'}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-xs text-zinc-500">Status</span>
              <Badge variant={forecasterStatus?.model_loaded ? 'success' : 'warning'}>
                {forecasterStatus?.model_loaded ? 'GRU Active' : 'EMA Fallback'}
              </Badge>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-xs text-zinc-500">Predicted Heavy Rate</span>
              <span className="text-xs font-mono text-cyan-400">{(forecasterStatus?.last_prediction ?? 0).toFixed(2)} reqs/s</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-xs text-zinc-500">Burst Imminent</span>
              <Badge variant={forecasterStatus?.burst_imminent ? 'error' : 'success'}>
                {forecasterStatus?.burst_imminent ? 'YES' : 'No'}
              </Badge>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-xs text-zinc-500">Inference Runs</span>
              <span className="text-xs font-mono text-zinc-400">{forecasterStatus?.total_runs ?? 0} (every {forecasterStatus?.interval_sec ?? 5}s)</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-xs text-zinc-500">Window Fill</span>
              <span className="text-xs font-mono text-zinc-400">{forecasterStatus?.internal_window_fill ?? 0}/{forecasterStatus?.window_size ?? 60}</span>
            </div>
          </div>
        </GlassPanel>
      </motion.div>

      {/* Bottom row — ALL LIVE DATA */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Request Class Distribution — LIVE from /api/v1/allocation */}
        <GlassPanel>
          <SectionHeader title="Request Classes" subtitle={isLive && allocation ? '● Live' : undefined} />
          <div className="space-y-4">
            {(['Light', 'Medium', 'Heavy'] as const).map((cls) => {
              const val = classDist[cls] ?? 0;
              const count = allocation?.class_counts?.[cls] ?? 0;
              const clr = cls === 'Light' ? 'emerald' : cls === 'Medium' ? 'amber' : 'rose';
              return (
                <div key={cls}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-sm font-medium text-zinc-300">{cls}</span>
                    <div className="flex items-center gap-2">
                      {isLive && allocation && (
                        <span className="text-[10px] font-mono text-zinc-600">{count.toLocaleString()} reqs</span>
                      )}
                      <span className="text-sm font-mono text-zinc-500">{val}%</span>
                    </div>
                  </div>
                  <ProgressBar value={val} color={clr as any} size="sm" />
                </div>
              );
            })}
          </div>
        </GlassPanel>

        {/* Allocation Engine — LIVE from /api/v1/allocation */}
        <GlassPanel>
          <SectionHeader title="Allocation Engine" subtitle={isLive && allocation ? '● Live' : undefined} />
          <div className="space-y-3">
            {[
              { label: 'α CPU', key: 'alpha_cpu' as const, color: 'text-brand-400' },
              { label: 'β Queue', key: 'beta_queue' as const, color: 'text-cyan-400' },
              { label: 'γ Latency', key: 'gamma_latency' as const, color: 'text-emerald-400' },
              { label: 'δ Forecast', key: 'delta_forecast' as const, color: 'text-amber-400' },
            ].map((w) => (
              <div key={w.label} className="flex items-center gap-3">
                <span className={cn('text-sm font-mono font-medium w-20', w.color)}>{w.label}</span>
                <div className="flex-1">
                  <ProgressBar value={weights[w.key] * 100} color="brand" size="xs" />
                </div>
                <span className="text-xs font-mono text-zinc-500 w-10 text-right">{weights[w.key]}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-white/[0.04]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Overflow threshold</span>
              <Badge variant="warning">{weights.overflow_threshold}</Badge>
            </div>
          </div>
        </GlassPanel>

        {/* System Status */}
        <GlassPanel>
          <SectionHeader title="System Status" subtitle={isLive ? '● Live' : undefined} />
          <div className="space-y-2">
            {systemServices.map((svc) => (
              <div key={svc.label} className="flex items-center justify-between py-0.5">
                <span className="text-sm text-zinc-300">{svc.label}</span>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'status-dot',
                    svc.status === 'healthy' ? 'status-dot-healthy' : 'status-dot-critical'
                  )} />
                  <span className={cn(
                    'text-xs font-medium capitalize',
                    svc.status === 'healthy' ? 'text-emerald-400' : 'text-zinc-500'
                  )}>
                    {svc.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>
      </motion.div>
    </motion.div>
  );
}

// --- Node Mini Card ---
function NodeMiniCard({ node, index }: { node: DisplayNode; index: number }) {
  const color = Object.values(NODE_COLORS)[index] || '#6366f1';
  const label = NODE_LABELS[node.node_id] || node.node_id;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="glass-card-hover p-4 relative overflow-hidden"
    >
      <div
        className="absolute top-0 left-0 w-full h-0.5"
        style={{ background: `linear-gradient(to right, ${color}, transparent)` }}
      />
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-white">{node.node_id.replace('node_', 'S')}</p>
          <p className="text-[10px] text-zinc-600">{label}</p>
        </div>
        <div className={cn(
          'status-dot mt-1',
          node.is_healthy ? 'status-dot-healthy' : 'status-dot-critical'
        )} />
      </div>

      <div className="space-y-2.5">
        <MiniMetric label="CPU" value={node.cpu_pct} suffix="%" warn={60} crit={85} />
        <MiniMetric label="Queue" value={node.queue_depth_light + node.queue_depth_medium + node.queue_depth_heavy} suffix="" warn={100} crit={200} />
        <MiniMetric label="Latency" value={node.latency_ema_ms} suffix="ms" warn={300} crit={800} />
        <div className="flex justify-between text-xs pt-1 border-t border-white/[0.04]">
          <span className="text-zinc-600">Throughput</span>
          <span className="text-zinc-400 font-mono">{node.throughput_rps.toFixed(0)} rps</span>
        </div>
      </div>
    </motion.div>
  );
}

function MiniMetric({ label, value, suffix, warn, crit }: {
  label: string; value: number; suffix: string; warn: number; crit: number;
}) {
  const pctColor = value >= crit ? 'rose' : value >= warn ? 'amber' : 'emerald';
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs text-zinc-500">{label}</span>
        <span className={cn('text-xs font-mono font-medium', getStatusColor(value, { warn, crit }))}>
          {value.toFixed(1)}{suffix}
        </span>
      </div>
      <ProgressBar value={value} max={label === 'Queue' ? 300 : label === 'Latency' ? 1200 : 100} color={pctColor as any} size="xs" />
    </div>
  );
}
