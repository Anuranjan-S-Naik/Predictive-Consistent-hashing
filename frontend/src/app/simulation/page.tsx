'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Activity, Cpu, Layers, Zap, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import { GlassPanel, SectionHeader, Badge, StatCard } from '@/components/ui';
import { LiveRingView } from '@/components/LiveRingView';
import DemoRingView from '@/components/DemoRingView';
import { useRingData } from '@/hooks/useRingData';
import { NODES, NODE_LABELS, NODE_COLORS } from '@/constants';
import { cn } from '@/lib/utils';

let hasInitialRestartRunSim = false;

export default function SimulationPage() {
  const [activeTab, setActiveTab] = useState<'live' | 'demo'>('live');
  const { ring, allocation, daa, connected, loading, error } = useRingData(true);


  // Derive summary stats from real data
  const totalVnodes = ring?.total_vnodes ?? 0;
  const totalNodes = ring?.total_nodes ?? 0;
  const daaRuns = daa?.total_runs ?? 0;
  const burstImminent = daa?.burst_imminent ?? false;
  const totalClassified = allocation
    ? Object.values(allocation.class_counts).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-white">Live Ring & Simulation</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Real-time consistent hash ring visualization with adaptive vnode rebalancing
          </p>
        </div>
        <div className="flex space-x-1 bg-white/[0.02] p-1 rounded-lg border border-white/[0.05] shadow-inner">
          <button
            onClick={() => setActiveTab('live')}
            className={cn(
              "px-5 py-2 text-sm rounded-md font-medium transition-all duration-200",
              activeTab === 'live' 
                ? "bg-indigo-600 text-white shadow" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            Live Mode
          </button>
          <button
            onClick={() => setActiveTab('demo')}
            className={cn(
              "px-5 py-2 text-sm rounded-md font-medium transition-all duration-200",
              activeTab === 'demo' 
                ? "bg-indigo-600 text-white shadow" 
                : "text-zinc-400 hover:text-white"
            )}
          >
            Demo Mode
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Vnodes" value={totalVnodes.toLocaleString()} icon={Layers} color="indigo" />
        <StatCard label="Active Nodes" value={totalNodes} icon={Cpu} color="cyan" />
        <StatCard label="DAA Runs" value={daaRuns.toLocaleString()} icon={Activity} color="emerald" />
        <StatCard label="Requests Classified" value={totalClassified.toLocaleString()} icon={Zap} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Ring Visualization — takes 2 cols */}
        <div className="lg:col-span-2">
          <GlassPanel>
            <SectionHeader 
              title={activeTab === 'live' ? "Hash Ring (Live)" : "Hash Ring (Demo)"} 
              subtitle={activeTab === 'live' ? "Live vnode distribution across the cluster" : "Illustrative vnode distribution and rebalancing"} 
            />
            {activeTab === 'live' ? (
              <LiveRingView
                ring={ring}
                allocation={allocation}
                daa={daa}
                connected={connected}
                loading={loading}
                error={error}
              />
            ) : (
              <DemoRingView />
            )}
          </GlassPanel>
        </div>

        {/* Right sidebar — DAA Status */}
        <div className="space-y-5">
          {/* DAA Status */}
          <GlassPanel>
            <SectionHeader title="DAA Engine" />
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-white/[0.03]">
                <span className="text-sm text-zinc-500">Status</span>
                <Badge variant={daa?.running ? 'success' : 'default'}>
                  {daa?.running ? 'Running' : 'Stopped'}
                </Badge>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.03]">
                <span className="text-sm text-zinc-500">Interval</span>
                <span className="text-sm font-mono text-zinc-300">{daa?.interval_sec ?? '—'}s</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.03]">
                <span className="text-sm text-zinc-500">Total Runs</span>
                <span className="text-sm font-mono text-zinc-300">{daaRuns.toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.03]">
                <span className="text-sm text-zinc-500">Burst Imminent</span>
                <Badge variant={burstImminent ? 'danger' : 'default'}>
                  {burstImminent ? 'YES' : 'No'}
                </Badge>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-zinc-500">Last Duration</span>
                <span className="text-sm font-mono text-zinc-300">
                  {daa?.last_run_duration_ms?.toFixed(2) ?? '—'} ms
                </span>
              </div>
            </div>
          </GlassPanel>

          {/* Class Distribution */}
          {allocation && (
            <GlassPanel>
              <SectionHeader title="Request Classes" />
              <div className="space-y-3">
                {['Light', 'Medium', 'Heavy'].map(cls => {
                  const count = allocation.class_counts[cls] ?? 0;
                  const pct = allocation.class_distribution[cls] ?? 0;
                  const barColor = cls === 'Light' ? 'bg-emerald-500' : cls === 'Medium' ? 'bg-amber-500' : 'bg-rose-500';
                  return (
                    <div key={cls}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-zinc-400">{cls}</span>
                        <span className="text-zinc-300 font-mono">{count.toLocaleString()} ({pct}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                        <div className={cn('h-full rounded-full transition-all duration-700', barColor)}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlassPanel>
          )}

          {/* How to generate traffic */}
          <GlassPanel>
            <SectionHeader title="Generate Traffic" />
            <div className="space-y-2 text-sm text-zinc-500">
              <p>Traffic is controlled dynamically from the **System Overview** dashboard page.</p>
              <p className="text-[11px] text-zinc-600">
                Go to the dashboard to select and start the Light-Medium or Medium-Heavy traffic flows.
              </p>
            </div>
          </GlassPanel>
        </div>
      </div>

      {/* DAA Adjustment History */}
      {daa && daa.last_adjustments.length > 0 && (
        <GlassPanel>
          <SectionHeader title="Last DAA Adjustments" subtitle={`Run #${daa.total_runs}`} />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.04]">
                  <th className="text-left py-2 px-3 text-zinc-500 font-medium text-xs uppercase tracking-wider">Node</th>
                  <th className="text-right py-2 px-3 text-zinc-500 font-medium text-xs uppercase tracking-wider">Vnodes</th>
                  <th className="text-right py-2 px-3 text-zinc-500 font-medium text-xs uppercase tracking-wider">CPU%</th>
                  <th className="text-right py-2 px-3 text-zinc-500 font-medium text-xs uppercase tracking-wider">Queue%</th>
                  <th className="text-right py-2 px-3 text-zinc-500 font-medium text-xs uppercase tracking-wider">Factors (C×Q×B)</th>
                  <th className="text-left py-2 px-3 text-zinc-500 font-medium text-xs uppercase tracking-wider">Reason</th>
                </tr>
              </thead>
              <tbody>
                {daa.last_adjustments.map((adj, i) => {
                  const changed = adj.old_vnodes !== adj.new_vnodes;
                  return (
                    <tr key={adj.node_name}
                      className={cn('border-b border-white/[0.02] transition-colors',
                        changed ? 'bg-brand-500/5' : 'hover:bg-white/[0.02]')}>
                      <td className="py-2.5 px-3">
                        <span className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS_MAP[adj.node_name] }} />
                          <span className="text-zinc-300 font-medium">{adj.node_name}</span>
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {changed ? (
                          <span className="text-brand-400 font-semibold">
                            {adj.old_vnodes} → {adj.new_vnodes}
                          </span>
                        ) : (
                          <span className="text-zinc-400">{adj.new_vnodes}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-zinc-400">{adj.cpu_pct.toFixed(1)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-zinc-400">{adj.queue_depth_pct.toFixed(1)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-zinc-500 text-xs">
                        {adj.cpu_factor.toFixed(2)} × {adj.queue_factor.toFixed(2)} × {adj.burst_damping.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-zinc-500 text-xs max-w-[200px] truncate" title={adj.reason}>
                        {adj.reason}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassPanel>
      )}
    </motion.div>
  );
}

// Quick lookup for table row colors
const COLORS_MAP: Record<string, string> = {
  node_s1: '#6366f1',
  node_s2: '#22d3ee',
  node_s3: '#34d399',
  node_s4: '#fbbf24',
};
