'use client';

import { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Zap, Activity, Clock, Cpu,
} from 'lucide-react';
import { StatCard, SectionHeader, GlassPanel, Badge, ProgressBar } from '@/components/ui';
import { cn, formatNumber, formatMs, formatPercent, getStatusColor } from '@/lib/utils';
import { NODE_COLORS, NODE_LABELS, NODES } from '@/constants';
import type { NodeMetrics } from '@/types';

// Simulated live data for demo
function useMockMetrics() {
  const [nodes, setNodes] = useState<NodeMetrics[]>([]);
  const tickRef = useRef(0);

  useEffect(() => {
    const genNode = (name: string, cap: number): NodeMetrics => ({
      node_id: name,
      cpu_pct: 15 + Math.random() * 55 + Math.sin(tickRef.current * 0.1) * 10,
      memory_pct: 20 + Math.random() * 30,
      queue_depth_light: Math.floor(Math.random() * 80),
      queue_depth_medium: Math.floor(Math.random() * 60),
      queue_depth_heavy: Math.floor(Math.random() * 30),
      queue_depth_total: 0,
      latency_ema_ms: 50 + Math.random() * 200,
      throughput_rps: 80 + Math.random() * 150,
      capacity_score: cap,
      vnode_count: Math.floor(cap * 1.5),
      total_requests_processed: Math.floor(10000 + Math.random() * 50000),
      total_requests_rejected: Math.floor(Math.random() * 50),
      timestamp_ms: Date.now(),
      is_healthy: Math.random() > 0.05,
      uptime_sec: Math.floor(3600 + Math.random() * 36000),
    });

    const update = () => {
      tickRef.current += 1;
      setNodes([
        genNode('node_s1', 100),
        genNode('node_s2', 70),
        genNode('node_s3', 150),
        genNode('node_s4', 90),
      ]);
    };

    update();
    const iv = setInterval(update, 2000);
    return () => clearInterval(iv);
  }, []);

  return nodes;
}

export default function DashboardPage() {
  const nodes = useMockMetrics();

  const totalRps = nodes.reduce((s, n) => s + n.throughput_rps, 0);
  const avgCpu = nodes.length ? nodes.reduce((s, n) => s + n.cpu_pct, 0) / nodes.length : 0;
  const totalProcessed = nodes.reduce((s, n) => s + n.total_requests_processed, 0);
  const avgLatency = nodes.length ? nodes.reduce((s, n) => s + n.latency_ema_ms, 0) / nodes.length : 0;
  const totalQueue = nodes.reduce((s, n) => s + n.queue_depth_light + n.queue_depth_medium + n.queue_depth_heavy, 0);

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
        <h1 className="text-2xl font-bold text-white tracking-tight">System Overview</h1>
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
          trend={{ value: 12.3, label: 'vs last hour' }}
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
          trend={{ value: -5.2, label: 'improvement' }}
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

      {/* Bottom row */}
      <motion.div variants={item} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Request Class Distribution */}
        <GlassPanel>
          <SectionHeader title="Request Classes" />
          <div className="space-y-4">
            {['Light', 'Medium', 'Heavy'].map((cls) => {
              const val = cls === 'Light' ? 52 : cls === 'Medium' ? 33 : 15;
              const clr = cls === 'Light' ? 'emerald' : cls === 'Medium' ? 'amber' : 'rose';
              return (
                <div key={cls}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-sm font-medium text-zinc-300">{cls}</span>
                    <span className="text-sm font-mono text-zinc-500">{val}%</span>
                  </div>
                  <ProgressBar value={val} color={clr as any} size="sm" />
                </div>
              );
            })}
          </div>
        </GlassPanel>

        {/* Allocation Engine */}
        <GlassPanel>
          <SectionHeader title="Allocation Engine" />
          <div className="space-y-3">
            {[
              { label: 'α CPU', weight: 0.35, color: 'text-brand-400' },
              { label: 'β Queue', weight: 0.30, color: 'text-cyan-400' },
              { label: 'γ Latency', weight: 0.20, color: 'text-emerald-400' },
              { label: 'δ Forecast', weight: 0.15, color: 'text-amber-400' },
            ].map((w) => (
              <div key={w.label} className="flex items-center gap-3">
                <span className={cn('text-sm font-mono font-medium w-20', w.color)}>{w.label}</span>
                <div className="flex-1">
                  <ProgressBar value={w.weight * 100} color="brand" size="xs" />
                </div>
                <span className="text-xs font-mono text-zinc-500 w-10 text-right">{w.weight}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-white/[0.04]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Overflow threshold</span>
              <Badge variant="warning">0.85</Badge>
            </div>
          </div>
        </GlassPanel>

        {/* System Status */}
        <GlassPanel>
          <SectionHeader title="System Status" />
          <div className="space-y-3">
            {[
              { label: 'Coordinator', status: 'healthy' as const },
              { label: 'Hash Ring', status: 'healthy' as const },
              { label: 'PostgreSQL', status: 'healthy' as const },
              { label: 'Redis Cache', status: 'healthy' as const },
              { label: 'InfluxDB', status: 'healthy' as const },
              { label: 'Prometheus', status: 'healthy' as const },
            ].map((svc) => (
              <div key={svc.label} className="flex items-center justify-between py-1">
                <span className="text-sm text-zinc-300">{svc.label}</span>
                <div className="flex items-center gap-2">
                  <div className={cn(
                    'status-dot',
                    svc.status === 'healthy' ? 'status-dot-healthy' : 'status-dot-critical'
                  )} />
                  <span className={cn(
                    'text-xs font-medium capitalize',
                    svc.status === 'healthy' ? 'text-emerald-400' : 'text-rose-400'
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
function NodeMiniCard({ node, index }: { node: NodeMetrics; index: number }) {
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
