'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Route, GitBranch, Target, AlertTriangle } from 'lucide-react';
import { GlassPanel, SectionHeader, Badge, ProgressBar, StatCard } from '@/components/ui';
import { cn, getStatusColor } from '@/lib/utils';
import { NODE_COLORS, NODES } from '@/constants';

function useMockScores() {
  const [scores, setScores] = useState<Record<string, number>>({});
  useEffect(() => {
    const update = () => setScores(Object.fromEntries(
      NODES.map(n => [n, 0.1 + Math.random() * 0.7])
    ));
    update();
    const iv = setInterval(update, 3000);
    return () => clearInterval(iv);
  }, []);
  return scores;
}

export default function RoutingPage() {
  const scores = useMockScores();
  const sorted = Object.entries(scores).sort(([, a], [, b]) => a - b);
  const winner = sorted[0]?.[0] || '';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Routing Engine</h1>
        <p className="text-sm text-zinc-500 mt-1">Score-based allocation decisions and routing visualization</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Active Nodes" value="4" icon={Route} color="indigo" />
        <StatCard label="Avg Score" value={(Object.values(scores).reduce((s, v) => s + v, 0) / 4).toFixed(3)} icon={Target} color="cyan" />
        <StatCard label="Chord Overflows" value="12" icon={GitBranch} color="amber" />
        <StatCard label="Overflow Rate" value="2.4%" icon={AlertTriangle} color="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Node Rankings */}
        <GlassPanel>
          <SectionHeader title="Node Score Rankings" subtitle="Lower score = better candidate" />
          <div className="space-y-3">
            {sorted.map(([nodeId, score], i) => {
              const color = NODE_COLORS[nodeId] || '#6366f1';
              const isWinner = i === 0;
              const isOverloaded = score > 0.85;
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

        {/* Score Breakdown */}
        <GlassPanel>
          <SectionHeader title="Score Breakdown" subtitle={`Winner: ${winner.replace('node_', 'S')}`} />
          <div className="space-y-5">
            {sorted.slice(0, 2).map(([nodeId, totalScore]) => {
              const cpu = 0.1 + Math.random() * 0.3;
              const queue = 0.05 + Math.random() * 0.25;
              const lat = 0.03 + Math.random() * 0.15;
              const forecast = Math.random() * 0.1;
              return (
                <div key={nodeId} className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-3 h-3 rounded-full" style={{ background: NODE_COLORS[nodeId] }} />
                    <span className="text-sm font-semibold text-white">{nodeId}</span>
                    <span className="ml-auto text-sm font-mono text-zinc-400">Σ = {totalScore.toFixed(3)}</span>
                  </div>
                  {[
                    { label: 'α·CPU', val: cpu, weight: 0.35, color: 'brand' },
                    { label: 'β·Queue', val: queue, weight: 0.30, color: 'cyan' },
                    { label: 'γ·Latency', val: lat, weight: 0.20, color: 'emerald' },
                    { label: 'δ·Forecast', val: forecast, weight: 0.15, color: 'amber' },
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
