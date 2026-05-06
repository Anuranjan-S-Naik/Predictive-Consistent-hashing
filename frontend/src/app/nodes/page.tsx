'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Server, Cpu, HardDrive, Clock } from 'lucide-react';
import { Badge } from '@/components/ui';
import { cn, getStatusColor } from '@/lib/utils';
import { NODE_COLORS, NODE_LABELS } from '@/constants';
import type { NodeMetrics } from '@/types';

function useMockNodes() {
  const [nodes, setNodes] = useState<NodeMetrics[]>([]);
  useEffect(() => {
    const gen = (name: string, cap: number, cores: number, mem: number): NodeMetrics => ({
      node_id: name, capacity_score: cap, cpu_cores: cores, memory_gb: mem,
      cpu_pct: 10 + Math.random() * 65, memory_pct: 15 + Math.random() * 40,
      queue_depth_light: Math.floor(Math.random() * 100), queue_depth_medium: Math.floor(Math.random() * 70),
      queue_depth_heavy: Math.floor(Math.random() * 40), queue_depth_total: 0,
      latency_ema_ms: 30 + Math.random() * 250, throughput_rps: 50 + Math.random() * 200,
      vnode_count: Math.floor(cap * 1.5), total_requests_processed: Math.floor(5000 + Math.random() * 80000),
      total_requests_rejected: Math.floor(Math.random() * 100), timestamp_ms: Date.now(),
      is_healthy: Math.random() > 0.03, uptime_sec: Math.floor(7200 + Math.random() * 50000),
    } as any);
    const update = () => setNodes([
      gen('node_s1', 100, 4, 8), gen('node_s2', 70, 2, 4),
      gen('node_s3', 150, 8, 16), gen('node_s4', 90, 3, 6),
    ]);
    update();
    const iv = setInterval(update, 2500);
    return () => clearInterval(iv);
  }, []);
  return nodes;
}

export default function NodesPage() {
  const nodes = useMockNodes();

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Node Monitoring</h1>
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
