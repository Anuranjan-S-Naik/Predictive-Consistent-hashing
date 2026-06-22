'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Server, Cpu, HardDrive, Clock } from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn, getStatusColor } from '@/lib/utils';
import { NODE_COLORS, NODE_LABELS, REFRESH_INTERVALS, API_BASE_URL } from '@/constants';

interface BackendNode {
  name: string;
  capacity_score: number;
  grpc_address: string;
  grpc_connected: boolean;
  cpu_cores: number;
  memory_gb: number;
}

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
  cpu_cores: number;
  memory_gb: number;
  grpc_address: string;
}

function enrichNode(node: BackendNode, metrics: any = {}, vnodeCount: number = 0): DisplayNode {
  const cap = node.capacity_score || 100;
  return {
    node_id: node.name,
    capacity_score: cap,
    cpu_pct: metrics.cpu_pct || 0,
    memory_pct: metrics.memory_pct || 0,
    queue_depth_light: metrics.queue_depth_light || 0,
    queue_depth_medium: metrics.queue_depth_medium || 0,
    queue_depth_heavy: metrics.queue_depth_heavy || 0,
    latency_ema_ms: metrics.latency_ema_ms || 0,
    throughput_rps: metrics.throughput_rps || 0,
    vnode_count: vnodeCount || 0,
    total_requests_processed: metrics.total_requests_processed || 0,
    is_healthy: node.grpc_connected,
    cpu_cores: node.cpu_cores || 4,
    memory_gb: node.memory_gb || 8,
    grpc_address: node.grpc_address || '',
  };
}

function generateMockNode(name: string, cap: number): DisplayNode {
  return {
    node_id: name,
    capacity_score: cap,
    cpu_pct: 0,
    memory_pct: 0,
    queue_depth_light: 0,
    queue_depth_medium: 0,
    queue_depth_heavy: 0,
    latency_ema_ms: 0,
    throughput_rps: 0,
    vnode_count: 0,
    total_requests_processed: 0,
    is_healthy: false,
    cpu_cores: 4,
    memory_gb: 8,
    grpc_address: 'N/A',
  };
}

function useNodes() {
  const [nodes, setNodes] = useState<DisplayNode[]>([]);
  const [isLive, setIsLive] = useState(false);
  const tickRef = { current: 0 };

  const fetchNodes = useCallback(async () => {
    tickRef.current += 1;
    const opts = { headers: { 'X-API-Key': 'dev-api-key-change-me' }, signal: AbortSignal.timeout(4000) };
    
    let allocData: any = null;
    let ringData: any = null;
    try {
      const [resAlloc, resRing] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/allocation`, opts),
        fetch(`${API_BASE_URL}/api/v1/ring`, opts)
      ]);
      if (resAlloc.ok) allocData = await resAlloc.json();
      if (resRing.ok) ringData = await resRing.json();
    } catch { /* ignore */ }

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/nodes`, opts);
      if (res.ok) {
        const data = await res.json();
        const backendNodes: BackendNode[] = data.nodes || [];
        if (backendNodes.length > 0) {
          setNodes(backendNodes.map(n => {
            const metrics = allocData?.node_metrics?.[n.name] || {};
            const vnodeCount = ringData?.nodes?.[n.name]?.vnode_count || 0;
            return enrichNode(n, metrics, vnodeCount);
          }));
          setIsLive(true);
          return;
        }
      }
    } catch { /* fallback */ }
    setIsLive(false);
    setNodes([
      generateMockNode('node_s1', 100),
      generateMockNode('node_s2', 70),
      generateMockNode('node_s3', 150),
      generateMockNode('node_s4', 90),
    ]);
  }, []);

  useEffect(() => { fetchNodes(); const iv = setInterval(fetchNodes, REFRESH_INTERVALS.NODES); return () => clearInterval(iv); }, [fetchNodes]);
  return { nodes, isLive };
}

export default function NodesPage() {
  const { nodes, isLive } = useNodes();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">Node Monitoring</h1>
          <Badge variant={isLive ? 'success' : 'info'}>{isLive ? 'Live' : 'Demo'}</Badge>
        </div>
        <p className="text-sm text-zinc-500 mt-1">Live health and performance for all cluster nodes</p>
      </div>

      {/* Node detail cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {nodes.map((node, i) => {
          const color = Object.values(NODE_COLORS)[i] || '#6366f1';
          const totalQ = node.queue_depth_light + node.queue_depth_medium + node.queue_depth_heavy;
          return (
            <motion.div
              key={node.node_id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="glass-card overflow-hidden"
            >
              {/* Header bar */}
              <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between"
                style={{ background: `linear-gradient(135deg, ${color}10, transparent)` }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${color}20`, border: `1px solid ${color}30` }}>
                    <Server className="w-5 h-5" style={{ color }} />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">{node.node_id}</h3>
                    <p className="text-xs text-zinc-500">{NODE_LABELS[node.node_id]} • Cap {node.capacity_score}</p>
                  </div>
                </div>
                <Badge variant={node.is_healthy ? 'success' : 'danger'}>
                  {node.is_healthy ? 'Healthy' : 'Down'}
                </Badge>
              </div>

              {/* Metrics Grid */}
              <div className="p-5 grid grid-cols-3 gap-4">
                <MetricCell label="CPU" value={node.cpu_pct} suffix="%" icon={Cpu}
                  color={getStatusColor(node.cpu_pct)} />
                <MetricCell label="Memory" value={node.memory_pct} suffix="%" icon={HardDrive}
                  color={getStatusColor(node.memory_pct)} />
                <MetricCell label="Latency" value={node.latency_ema_ms} suffix="ms" icon={Clock}
                  color={getStatusColor(node.latency_ema_ms, { warn: 200, crit: 500 })} />
              </div>

              {/* Queue bars */}
              <div className="px-5 pb-5 space-y-2">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-500">Queue Depth ({totalQ})</span>
                  <span className="text-zinc-600 font-mono">{node.vnode_count} vnodes</span>
                </div>
                <div className="flex gap-1 h-3 rounded-full overflow-hidden bg-white/[0.03]">
                  <div className="bg-emerald-500 rounded-l-full transition-all duration-500"
                    style={{ width: `${(node.queue_depth_light / (totalQ || 1)) * 100}%` }} />
                  <div className="bg-amber-500 transition-all duration-500"
                    style={{ width: `${(node.queue_depth_medium / (totalQ || 1)) * 100}%` }} />
                  <div className="bg-rose-500 rounded-r-full transition-all duration-500"
                    style={{ width: `${(node.queue_depth_heavy / (totalQ || 1)) * 100}%` }} />
                </div>
                <div className="flex gap-4 text-[10px] text-zinc-600">
                  <span><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1" />Light {node.queue_depth_light}</span>
                  <span><span className="inline-block w-2 h-2 rounded-sm bg-amber-500 mr-1" />Medium {node.queue_depth_medium}</span>
                  <span><span className="inline-block w-2 h-2 rounded-sm bg-rose-500 mr-1" />Heavy {node.queue_depth_heavy}</span>
                </div>
              </div>

              {/* Footer stats */}
              <div className="px-5 py-3 bg-white/[0.01] border-t border-white/[0.04] flex justify-between text-xs text-zinc-500">
                <span>Throughput: <span className="text-zinc-300 font-mono">{node.throughput_rps.toFixed(0)} rps</span></span>
                <span>Processed: <span className="text-zinc-300 font-mono">{node.total_requests_processed.toLocaleString()}</span></span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

function MetricCell({ label, value, suffix, icon: Icon, color }: {
  label: string; value: number; suffix: string; icon: any; color: string;
}) {
  return (
    <div className="text-center">
      <Icon className={cn('w-4 h-4 mx-auto mb-1.5', color)} />
      <p className={cn('text-lg font-bold font-mono', color)}>{value.toFixed(1)}{suffix}</p>
      <p className="text-[10px] text-zinc-600 uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}
