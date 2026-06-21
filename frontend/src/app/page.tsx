'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useFlowStore } from '@/stores';
import { motion } from 'framer-motion';
import {
  Zap, Activity, Clock, Cpu, Brain, TrendingUp, Play, Square,
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
  node_metrics?: Record<string, any>;
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

interface RecentRequest {
  request_id: string;
  predicted_class: string;
  confidence: number;
  assigned_node: string;
  routing_hops: number;
  allocation_score: number;
  routing_method: string;
  elapsed_ms: number;
  timestamp: number;
  client_timestamp?: number;
}

interface DashboardMetrics {
  throughput_rps: number;
  avg_cpu_pct: number;
  avg_latency_ms: number;
  total_processed: number;
  timestamp: number;
}

const API_HEADERS = {
  'X-API-Key': 'dev-api-key-change-me',
  'Content-Type': 'application/json',
};

function generateMockNode(name: string, cap: number, tick: number, idle = false): DisplayNode {
  if (idle) {
    return {
      node_id: name,
      capacity_score: cap,
      cpu_pct: 5.0,
      memory_pct: 10.0,
      queue_depth_light: 0,
      queue_depth_medium: 0,
      queue_depth_heavy: 0,
      latency_ema_ms: 0.0,
      throughput_rps: 0.0,
      vnode_count: Math.floor(cap * 1.5),
      total_requests_processed: 0,
      is_healthy: true,
    };
  }
  // Use tick to create smooth deterministic cycles (prevents random blinking)
  const code = name.charCodeAt(name.length - 1) || 0;
  const baseCpu = 20 + (code * 3) % 30; // 20 to 50
  const cpuCycle = Math.sin(tick * 0.15) * 8;
  const cpu = Math.round(baseCpu + cpuCycle);

  const baseMem = 30 + (code * 5) % 25;
  const memCycle = Math.cos(tick * 0.05) * 3;
  const mem = Math.round(baseMem + memCycle);

  const baseQueue = 5 + (code * 7) % 20;
  const qCycle = Math.sin(tick * 0.2) * 4;
  const qTotal = Math.max(0, Math.round(baseQueue + qCycle));
  const q_light = Math.round(qTotal * 0.5);
  const q_medium = Math.round(qTotal * 0.35);
  const q_heavy = Math.round(qTotal * 0.15);

  const baseLatency = 60 + (code * 11) % 80;
  const latCycle = Math.sin(tick * 0.1) * 15;
  const latency = Math.max(5, Math.round(baseLatency + latCycle));

  const baseThroughput = 50 + (code * 13) % 70;
  const tpCycle = Math.cos(tick * 0.15) * 12;
  const throughput = Math.max(0, Math.round(baseThroughput + tpCycle));

  const processed = 5000 + tick * Math.round(baseThroughput / 10);

  return {
    node_id: name,
    capacity_score: cap,
    cpu_pct: cpu,
    memory_pct: mem,
    queue_depth_light: q_light,
    queue_depth_medium: q_medium,
    queue_depth_heavy: q_heavy,
    latency_ema_ms: latency,
    throughput_rps: throughput,
    vnode_count: Math.floor(cap * 1.5),
    total_requests_processed: processed,
    is_healthy: true,
  };
}

// ---------------------------------------------------------------------------
// Custom hook: fetch all dashboard data
// ---------------------------------------------------------------------------

function useDashboardData(isFlowRunning: boolean) {
  const [nodes, setNodes] = useState<DisplayNode[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [allocation, setAllocation] = useState<AllocationData | null>(null);
  const [datastores, setDatastores] = useState<DatastoreHealth | null>(null);
  const [daaRunning, setDaaRunning] = useState(false);
  const [feedbackRunning, setFeedbackRunning] = useState(false);
  const [classifierStatus, setClassifierStatus] = useState<ClassifierStatus | null>(null);
  const [forecasterStatus, setForecasterStatus] = useState<ForecasterStatus | null>(null);
  const [recentRequests, setRecentRequests] = useState<RecentRequest[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const tickRef = useRef(0);
  const recentRequestsRef = useRef<RecentRequest[]>([]);
  const consecutiveLiveFailuresRef = useRef(0);
  const nodesRef = useRef<DisplayNode[]>([]);
  const nodesDataRef = useRef<any>(null);

  const fetchAll = useCallback(async () => {
    tickRef.current += 1;
    const opts = { headers: API_HEADERS, signal: AbortSignal.timeout(4000) };
    const nowClient = Date.now() / 1000;

    const isFirstOrSlowTick = tickRef.current === 1 || tickRef.current % 5 === 0;

    // Launch fetches concurrently for fast initial render
    Promise.allSettled([
      fetch(`${API_BASE_URL}/api/v1/allocation`, opts).then(r => r.ok ? r.json() : null).then(d => {
        if (d) setAllocation(d);
        return d;
      }),
      isFirstOrSlowTick
        ? fetch(`${API_BASE_URL}/api/v1/nodes`, opts).then(r => r.ok ? r.json() : null).then(d => { if (d) nodesDataRef.current = d; return d; })
        : Promise.resolve(nodesDataRef.current),
      isFirstOrSlowTick
        ? fetch(`${API_BASE_URL}/api/v1/datastores`, opts).then(r => r.ok ? r.json() : null).then(d => { if (d) setDatastores(d); return d; })
        : Promise.resolve(datastores),
      isFirstOrSlowTick
        ? fetch(`${API_BASE_URL}/api/v1/daa`, opts).then(r => r.ok ? r.json() : null).then(d => { if (d) setDaaRunning(d.running ?? false); return d; })
        : Promise.resolve(null),
      isFirstOrSlowTick
        ? fetch(`${API_BASE_URL}/api/v1/feedback`, opts).then(r => r.ok ? r.json() : null).then(d => { if (d) setFeedbackRunning(d.running ?? false); return d; })
        : Promise.resolve(null),
      isFirstOrSlowTick
        ? fetch(`${API_BASE_URL}/api/v1/classifier`, opts).then(r => r.ok ? r.json() : null).then(d => { if (d) setClassifierStatus(d); return d; })
        : Promise.resolve(classifierStatus),
      isFirstOrSlowTick
        ? fetch(`${API_BASE_URL}/api/v1/forecast`, opts).then(r => r.ok ? r.json() : null).then(d => { if (d) setForecasterStatus(d); return d; })
        : Promise.resolve(forecasterStatus),
      fetch(`${API_BASE_URL}/api/v1/recent_requests`, opts).then(r => r.ok ? r.json() : null),
      fetch(`${API_BASE_URL}/api/v1/dashboard_metrics`, opts).then(r => r.ok ? r.json() : null).catch(() => null)
    ]).then(results => {
      // Handle node mapping after allocation and nodes are fetched
      const allocData = results[0].status === 'fulfilled' ? results[0].value : null;
      const nodesData = results[1].status === 'fulfilled' ? results[1].value : null;
      const recentReqsData = results[7].status === 'fulfilled' ? results[7].value : null;
      const dbMetricsData = results[8].status === 'fulfilled' ? results[8].value : null;

      // Update recent requests stream
      const map = new Map(recentRequestsRef.current.map(r => [r.request_id, r]));
      if (recentReqsData && Array.isArray(recentReqsData)) {
        recentReqsData.forEach((req: RecentRequest) => {
          const existing = map.get(req.request_id);
          if (!existing) {
            req.client_timestamp = nowClient;
            map.set(req.request_id, req);
          } else {
            req.client_timestamp = existing.client_timestamp;
            map.set(req.request_id, req);
          }
        });
      }
      const newRequestsList = Array.from(map.values()).sort((a, b) => b.timestamp - a.timestamp);
      recentRequestsRef.current = newRequestsList;
      setRecentRequests(newRequestsList);

      let live = false;
      let updatedNodes: DisplayNode[] = [];

      if (nodesData && nodesData.nodes && nodesData.nodes.length > 0) {
        consecutiveLiveFailuresRef.current = 0;
        const maxTs = newRequestsList.length > 0 ? Math.max(...newRequestsList.map(r => r.timestamp)) : 0;

        updatedNodes = nodesData.nodes.map((n: BackendNode) => {
          const metrics = allocData?.node_metrics?.[n.name] || {};
          
          // Calculate node statistics dynamically from the request stream
          const nodeReqs = newRequestsList.filter(r => r.assigned_node === n.name);
          const reqs1_5s = nodeReqs.filter(r => r.timestamp >= maxTs - 1.5);
          
          const computedRps = reqs1_5s.length / 1.5;
          const computedQueue = reqs1_5s.reduce((sum, r) => {
            const w = r.predicted_class === 'Heavy' ? 12 : r.predicted_class === 'Medium' ? 4 : 1;
            return sum + w;
          }, 0) / 1.5;

          const last10Reqs = nodeReqs.slice(0, 10);
          const computedLatency = last10Reqs.length > 0
            ? last10Reqs.reduce((sum, r) => sum + r.elapsed_ms, 0) / last10Reqs.length
            : 0;

          // Merge backend metrics with frontend calculations (if backend returns default/0 values, use computed)
          const rps = metrics.throughput_rps && metrics.throughput_rps > 0 ? metrics.throughput_rps : computedRps;
          const latency = metrics.latency_ema_ms && metrics.latency_ema_ms > 0 ? metrics.latency_ema_ms : computedLatency;
          
          const q_light = metrics.queue_depth_light ?? Math.round(computedQueue * 0.5);
          const q_medium = metrics.queue_depth_medium ?? Math.round(computedQueue * 0.35);
          const q_heavy = metrics.queue_depth_heavy ?? Math.round(computedQueue * 0.15);

          // Estimate CPU: idle baseline + load factor from RPS/Queue
          let cpu = metrics.cpu_pct ?? 0.0;
          if (cpu <= 5.0) {
            const load = (computedRps * 5 + computedQueue * 2.5) / ((n.capacity_score || 100) / 100);
            cpu = Math.min(95.0, 5.0 + load);
          }

          // Memory: baseline + drift from requests processed
          let mem = metrics.memory_pct ?? 0.0;
          if (mem <= 0.0) {
            mem = Math.min(80.0, 15.0 + nodeReqs.length * 0.02);
          }


          return {
            node_id: n.name,
            capacity_score: n.capacity_score || 100,
            cpu_pct: cpu,
            memory_pct: mem,
            queue_depth_light: q_light,
            queue_depth_medium: q_medium,
            queue_depth_heavy: q_heavy,
            latency_ema_ms: latency,
            throughput_rps: rps,
            vnode_count: metrics.vnode_count ?? Math.floor((n.capacity_score || 100) * 1.5),
            total_requests_processed: metrics.total_requests_processed || nodeReqs.length,
            is_healthy: n.grpc_connected,
          };
        });
        nodesRef.current = updatedNodes;
        setNodes(updatedNodes);
        live = true;
      } else {
        consecutiveLiveFailuresRef.current += 1;
        // Keep live state and previous node configs for up to 4 consecutive glitches
        if (consecutiveLiveFailuresRef.current < 4 && nodesRef.current.length > 0) {
          live = true;
          updatedNodes = nodesRef.current;
        }
      }

      if (live) {
        setIsLive(true);

        // Derive overall cards metrics dynamically from node stats and request stream
        const totalRps = updatedNodes.reduce((sum, n) => sum + n.throughput_rps, 0);
        const avgCpu = updatedNodes.length > 0 ? updatedNodes.reduce((sum, n) => sum + n.cpu_pct, 0) / updatedNodes.length : 0;
        
        const avgNodeLatency = updatedNodes.length > 0
          ? updatedNodes.reduce((sum, n) => sum + n.latency_ema_ms, 0) / updatedNodes.length
          : 0;

        const backendTotal = dbMetricsData?.total_processed ?? 0;
        const totalProcessed = Math.max(backendTotal, newRequestsList.length);

        setDashboardMetrics({
            throughput_rps: dbMetricsData?.throughput_rps && dbMetricsData.throughput_rps > 0 ? dbMetricsData.throughput_rps : totalRps,
            avg_cpu_pct: dbMetricsData?.avg_cpu_pct && dbMetricsData.avg_cpu_pct > 0 ? dbMetricsData.avg_cpu_pct : avgCpu,
            avg_latency_ms: dbMetricsData?.avg_latency_ms && dbMetricsData.avg_latency_ms > 0 ? dbMetricsData.avg_latency_ms : avgNodeLatency,
            total_processed: totalProcessed,
            timestamp: nowClient
          });
      } else {
        const mockNodes = [
          generateMockNode('node_s1', 100, tickRef.current, false),
          generateMockNode('node_s2', 70, tickRef.current, false),
          generateMockNode('node_s3', 150, tickRef.current, false),
          generateMockNode('node_s4', 90, tickRef.current, false),
        ];
        nodesRef.current = mockNodes;
        setNodes(mockNodes);
        setIsLive(false);

        // Calculate card metrics for mock nodes in Demo mode too (prevents flat 0s)
        const totalRps = mockNodes.reduce((sum, n) => sum + n.throughput_rps, 0);
        const avgCpu = mockNodes.length > 0 ? mockNodes.reduce((sum, n) => sum + n.cpu_pct, 0) / mockNodes.length : 0;
        const avgLatency = mockNodes.length > 0 ? mockNodes.reduce((sum, n) => sum + n.latency_ema_ms, 0) / mockNodes.length : 0;
        const totalProcessed = mockNodes.reduce((sum, n) => sum + n.total_requests_processed, 0);

        setDashboardMetrics({
            throughput_rps: totalRps,
            avg_cpu_pct: avgCpu,
            avg_latency_ms: avgLatency,
            total_processed: totalProcessed,
            timestamp: nowClient
          });
      }
    });
  }, []);

  useEffect(() => {
    fetchAll();
    const iv = setInterval(fetchAll, REFRESH_INTERVALS.METRICS);
    return () => clearInterval(iv);
  }, [fetchAll]);

  const resetClient = useCallback(() => {
    recentRequestsRef.current = [];
    setRecentRequests([]);
    setDashboardMetrics({
      throughput_rps: 0,
      avg_cpu_pct: 5.0,
      avg_latency_ms: 0,
      total_processed: 0,
      timestamp: Date.now() / 1000,
    });
  }, []);

  return { nodes, isLive, allocation, datastores, daaRunning, feedbackRunning, classifierStatus, forecasterStatus, recentRequests, dashboardMetrics, resetClient };
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const pageLoadAtRef = useRef(Date.now() / 1000);

  // Global flow state — persists across page navigations
  const isFlowRunning = useFlowStore(s => s.isFlowRunning);
  const selectedFlow = useFlowStore(s => s.selectedFlow);
  const isUpdatingFlow = useFlowStore(s => s.isUpdatingFlow);
  const setFlowRunning = useFlowStore(s => s.setFlowRunning);
  const setSelectedFlow = useFlowStore(s => s.setSelectedFlow);
  const setUpdatingFlow = useFlowStore(s => s.setUpdatingFlow);

  const { nodes, isLive, allocation, datastores, daaRunning, feedbackRunning, classifierStatus, forecasterStatus, recentRequests, dashboardMetrics, resetClient } = useDashboardData(isFlowRunning);

  const handleSelectFlow = (flow: 'light-medium' | 'medium-high') => {
    setSelectedFlow(flow);
  };

  const handleToggleFlow = async () => {
    setUpdatingFlow(true);
    const action = isFlowRunning ? 'stop' : 'start';
    try {
      const res = await fetch('/api/simulation/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, flowType: selectedFlow })
      });
      const data = await res.json();
      if (data.status === 'success') {
        setFlowRunning(!isFlowRunning);
        if (action === 'stop') {
          resetClient();
        }
      }
    } catch (err) {
      console.error('Failed to change traffic flow state:', err);
    } finally {
      setUpdatingFlow(false);
    }
  };

  const visibleRecentRequests = useMemo(
    () => recentRequests.slice(0, 50),
    [recentRequests],
  );

  const totalRps = dashboardMetrics?.throughput_rps ?? 0;
  const avgCpu = dashboardMetrics?.avg_cpu_pct ?? 0;
  const totalProcessed = dashboardMetrics?.total_processed ?? 0;
  const avgLatency = dashboardMetrics?.avg_latency_ms ?? 0;

  // Use live allocation data or fallback
  const weights = allocation?.weights ?? {
    alpha_cpu: 0.35, beta_queue: 0.30, gamma_latency: 0.20,
    delta_forecast: 0.15, overflow_threshold: 0.85,
  };
  const classDist = allocation?.class_distribution ?? { Light: 52, Medium: 33, Heavy: 15 };

  // Build system status from live data
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
      <motion.div variants={item} className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-white/[0.03] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">System Overview</h1>
            <Badge variant={isLive ? 'success' : 'info'}>{isLive ? 'Live' : 'Demo'}</Badge>
          </div>
          <p className="text-sm text-zinc-500 mt-1">
            Real-time monitoring of the Predictive Adaptive Request Allocation Framework
          </p>
        </div>

        {/* Traffic Flow Controls */}
        <div className="flex flex-wrap items-center gap-3 bg-zinc-950/60 border border-white/[0.05] p-2 rounded-xl backdrop-blur-md">
          <div className="flex items-center gap-1.5 px-2">
            <Activity className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Flow Config:</span>
          </div>

          <div className="flex bg-black/40 border border-white/[0.03] p-1 rounded-lg">
            <button
              onClick={() => handleSelectFlow('light-medium')}
              disabled={isFlowRunning || isUpdatingFlow}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200",
                selectedFlow === 'light-medium'
                  ? "bg-zinc-800 text-white border border-white/[0.05] shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
              )}
            >
              Light-Medium
            </button>
            <button
              onClick={() => handleSelectFlow('medium-high')}
              disabled={isFlowRunning || isUpdatingFlow}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition-all duration-200",
                selectedFlow === 'medium-high'
                  ? "bg-zinc-800 text-white border border-white/[0.05] shadow-sm"
                  : "text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
              )}
            >
              Medium-Heavy
            </button>
          </div>

          <div className="w-px h-5 bg-white/[0.08]" />

          <button
            onClick={handleToggleFlow}
            disabled={isUpdatingFlow}
            className={cn(
              "flex items-center gap-2 px-4 py-1.5 text-xs font-bold rounded-lg transition-all duration-200 border shadow-md",
              isFlowRunning
                ? "bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border-rose-500/30 hover:border-rose-500/50"
                : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:border-emerald-500/50",
              isUpdatingFlow && "opacity-50 cursor-not-allowed"
            )}
          >
            {isFlowRunning ? (
              <>
                <Square className="w-3 h-3 fill-rose-400 text-rose-400" />
                <span>Stop Flow</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 fill-emerald-400 text-emerald-400" />
                <span>Start Flow</span>
              </>
            )}
          </button>
        </div>
      </motion.div>

      {/* Live Traffic Log */}
      <motion.div variants={item}>
        <GlassPanel>
          <SectionHeader title="Live Traffic Stream" subtitle={isLive ? '● Live' : undefined} />
          <div className="bg-black/40 rounded-lg p-3 font-mono text-xs overflow-y-auto h-56 border border-white/[0.05] space-y-1.5 flex flex-col scrollbar-thin scrollbar-thumb-zinc-700">
            {visibleRecentRequests.length === 0 ? (
              <span className="text-zinc-600 m-auto">Awaiting traffic...</span>
            ) : (
              visibleRecentRequests.map((req) => {
                const isHeavy = req.predicted_class === 'Heavy';
                const isLight = req.predicted_class === 'Light';
                return (
                  <div key={req.request_id} className="flex items-center gap-3 border-b border-white/[0.02] pb-1.5 opacity-90 hover:opacity-100 transition-opacity">
                    <span className="text-zinc-500 w-24 whitespace-nowrap">
                      t+{Math.max(0, (req.client_timestamp || req.timestamp) - pageLoadAtRef.current).toFixed(1)}s
                    </span>
                    <span className="text-zinc-300 w-24 truncate">{req.request_id}</span>
                    <Badge variant={isLight ? 'success' : isHeavy ? 'danger' : 'warning'} className="w-16 justify-center">
                      {req.predicted_class}
                    </Badge>
                    <span className="text-zinc-400 w-32 truncate">→ {req.assigned_node}</span>
                    <span className="text-zinc-500 hidden sm:inline-block">score: {req.allocation_score.toFixed(4)}</span>
                    {req.routing_hops > 1 && (
                      <Badge variant="info" className="ml-auto whitespace-nowrap">{req.routing_hops} hops</Badge>
                    )}
                    <span className="text-emerald-400/70 ml-auto whitespace-nowrap">{req.elapsed_ms.toFixed(1)} ms</span>
                  </div>
                );
              })
            )}
          </div>
        </GlassPanel>
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
              <Badge variant={forecasterStatus?.burst_imminent ? 'danger' : 'success'}>
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
