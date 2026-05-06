'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Cpu, Clock, Activity, Database, HardDrive } from 'lucide-react';
import { GlassPanel, SectionHeader, StatCard, ProgressBar, Badge } from '@/components/ui';
import { cn, formatPercent, formatMs } from '@/lib/utils';
import { NODES, NODE_COLORS } from '@/constants';

export default function MetricsPage() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 2000); return () => clearInterval(iv); }, []);

  const nodeData = NODES.map((n, i) => ({
    id: n,
    cpu: 15 + Math.sin(tick * 0.2 + i) * 20 + Math.random() * 15,
    mem: 20 + Math.random() * 35,
    lat: 40 + Math.random() * 250,
    rps: 60 + Math.random() * 180,
    queue: Math.floor(Math.random() * 150),
  }));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">System Metrics</h1>
        <p className="text-sm text-zinc-500 mt-1">Real-time performance monitoring across all nodes</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Cluster CPU" value={formatPercent(nodeData.reduce((s, n) => s + n.cpu, 0) / 4)} icon={Cpu} color="indigo" />
        <StatCard label="Avg Latency" value={formatMs(nodeData.reduce((s, n) => s + n.lat, 0) / 4)} icon={Clock} color="cyan" />
        <StatCard label="Total RPS" value={`${nodeData.reduce((s, n) => s + n.rps, 0).toFixed(0)}`} icon={Activity} color="emerald" />
        <StatCard label="Total Queue" value={`${nodeData.reduce((s, n) => s + n.queue, 0)}`} icon={Database} color="amber" />
      </div>

      {/* Per-node metrics table */}
      <GlassPanel>
        <SectionHeader title="Node Metrics (Live)" subtitle="Refreshes every 2 seconds" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Node', 'CPU %', 'Memory %', 'Latency', 'Throughput', 'Queue', 'Status'].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {nodeData.map((n, i) => (
                <tr key={n.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: Object.values(NODE_COLORS)[i] }} />
                      <span className="font-medium text-zinc-200">{n.id}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <ProgressBar value={n.cpu} color={n.cpu > 80 ? 'rose' : n.cpu > 60 ? 'amber' : 'emerald'} size="xs" className="w-16" />
                      <span className="font-mono text-zinc-300">{n.cpu.toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-zinc-400">{n.mem.toFixed(1)}%</td>
                  <td className={cn('py-3 px-4 font-mono', n.lat > 500 ? 'text-rose-400' : n.lat > 200 ? 'text-amber-400' : 'text-zinc-300')}>
                    {n.lat.toFixed(0)}ms
                  </td>
                  <td className="py-3 px-4 font-mono text-zinc-300">{n.rps.toFixed(0)} rps</td>
                  <td className="py-3 px-4 font-mono text-zinc-400">{n.queue}</td>
                  <td className="py-3 px-4"><Badge variant="success">Healthy</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassPanel>

      {/* Datastore Health */}
      <GlassPanel>
        <SectionHeader title="Datastore Health" subtitle="PostgreSQL, Redis, InfluxDB" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { name: 'PostgreSQL', icon: Database, writes: '45.2K', flushes: 46, latency: '1.2ms', errors: 0 },
            { name: 'Redis Cache', icon: HardDrive, writes: '∞ (in-memory)', flushes: 12800, latency: '0.003ms', errors: 0 },
            { name: 'InfluxDB', icon: Activity, writes: '8.4K pts', flushes: 84, latency: '3.1ms', errors: 0 },
          ].map(ds => (
            <div key={ds.name} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <div className="flex items-center gap-2 mb-3">
                <ds.icon className="w-4 h-4 text-brand-400" />
                <span className="text-sm font-semibold text-white">{ds.name}</span>
                <Badge variant="success" className="ml-auto">OK</Badge>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-zinc-500">Writes</span><span className="text-zinc-300 font-mono">{ds.writes}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Flushes</span><span className="text-zinc-300 font-mono">{ds.flushes}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Latency</span><span className="text-zinc-300 font-mono">{ds.latency}</span></div>
                <div className="flex justify-between"><span className="text-zinc-500">Errors</span><span className="text-emerald-400 font-mono">{ds.errors}</span></div>
              </div>
            </div>
          ))}
        </div>
      </GlassPanel>
    </motion.div>
  );
}
