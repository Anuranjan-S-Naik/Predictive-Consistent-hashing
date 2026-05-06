'use client';

import { motion } from 'framer-motion';
import { BarChart3, Clock, Gauge, TrendingDown, Download, ArrowUpDown } from 'lucide-react';
import { GlassPanel, SectionHeader, StatCard, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';

const MOCK_RESULTS = [
  { scenario: 'Uniform', mode: 'Round Robin', p50: 85, p95: 210, p99: 450, rps: 485, variance: 12.5, failure: 0.2 },
  { scenario: 'Uniform', mode: 'Least Connections', p50: 72, p95: 180, p99: 380, rps: 495, variance: 8.2, failure: 0.1 },
  { scenario: 'Uniform', mode: 'Consistent Hash', p50: 78, p95: 195, p99: 410, rps: 490, variance: 10.1, failure: 0.15 },
  { scenario: 'Uniform', mode: 'Predictive', p50: 65, p95: 155, p99: 320, rps: 498, variance: 5.5, failure: 0.05 },
  { scenario: 'Bursty', mode: 'Round Robin', p50: 120, p95: 380, p99: 820, rps: 450, variance: 25.0, failure: 1.2 },
  { scenario: 'Bursty', mode: 'Least Connections', p50: 98, p95: 310, p99: 680, rps: 470, variance: 18.0, failure: 0.8 },
  { scenario: 'Bursty', mode: 'Consistent Hash', p50: 110, p95: 350, p99: 750, rps: 460, variance: 22.0, failure: 1.0 },
  { scenario: 'Bursty', mode: 'Predictive', p50: 78, p95: 220, p99: 450, rps: 488, variance: 9.5, failure: 0.3 },
];

export default function BenchmarksPage() {
  const bestP99 = Math.min(...MOCK_RESULTS.map(r => r.p99));
  const bestRps = Math.max(...MOCK_RESULTS.map(r => r.rps));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-white">Benchmark Analysis</h1>
          <p className="text-sm text-zinc-500 mt-1">Compare allocation algorithms across scenarios</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-zinc-300 hover:bg-white/[0.06] transition-colors">
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Total Experiments" value="8" icon={BarChart3} color="indigo" />
        <StatCard label="Best p99 Latency" value={`${bestP99}ms`} icon={Clock} color="emerald" />
        <StatCard label="Peak Throughput" value={`${bestRps} RPS`} icon={Gauge} color="cyan" />
        <StatCard label="Lowest Variance" value="5.5" icon={TrendingDown} color="amber" />
      </div>

      {/* Results Table */}
      <GlassPanel>
        <SectionHeader title="Experiment Results" subtitle="4 scenarios × 4 allocation modes" />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Scenario', 'Allocation Mode', 'p50 (ms)', 'p95 (ms)', 'p99 (ms)', 'Throughput', 'Variance', 'Failure %'].map(h => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    <button className="flex items-center gap-1 hover:text-zinc-300 transition-colors">
                      {h} <ArrowUpDown className="w-3 h-3" />
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_RESULTS.map((r, i) => {
                const isBest = r.mode === 'Predictive';
                return (
                  <motion.tr
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={cn(
                      'border-b border-white/[0.03] transition-colors hover:bg-white/[0.02]',
                      isBest && 'bg-emerald-500/[0.03]'
                    )}
                  >
                    <td className="py-3 px-4">
                      <Badge variant="info">{r.scenario}</Badge>
                    </td>
                    <td className="py-3 px-4">
                      <span className={cn('font-medium', isBest ? 'text-emerald-400' : 'text-zinc-300')}>
                        {r.mode}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-zinc-300">{r.p50}</td>
                    <td className="py-3 px-4 font-mono text-zinc-300">{r.p95}</td>
                    <td className={cn('py-3 px-4 font-mono font-semibold',
                      r.p99 === bestP99 ? 'text-emerald-400' : r.p99 > 600 ? 'text-rose-400' : 'text-zinc-300')}>
                      {r.p99}
                    </td>
                    <td className="py-3 px-4 font-mono text-zinc-300">{r.rps} rps</td>
                    <td className="py-3 px-4 font-mono text-zinc-400">{r.variance}</td>
                    <td className={cn('py-3 px-4 font-mono',
                      r.failure > 0.5 ? 'text-rose-400' : 'text-zinc-400')}>
                      {r.failure}%
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </motion.div>
  );
}
