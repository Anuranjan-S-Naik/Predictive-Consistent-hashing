'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { GitBranch, ArrowRight, Hash } from 'lucide-react';
import { GlassPanel, SectionHeader, StatCard, Badge } from '@/components/ui';
import { NODE_COLORS, NODES } from '@/constants';

export default function ChordPage() {
  const fingerTable = useMemo(() => NODES.map((n, i) => ({
    node: n,
    fingers: Array.from({ length: 4 }, (_, k) => ({
      k,
      start: Math.floor((i * 64 + Math.pow(2, k)) % 256),
      target: NODES[(i + k + 1) % NODES.length],
    })),
  })), []);

  const recentHops = [
    { req: 'req_0084', from: 'node_s1', to: 'node_s3', hops: 2, reason: 'overflow' },
    { req: 'req_0092', from: 'node_s2', to: 'node_s4', hops: 1, reason: 'overflow' },
    { req: 'req_0098', from: 'node_s4', to: 'node_s1', hops: 3, reason: 'overflow' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Chord DHT Routing</h1>
        <p className="text-sm text-zinc-500 mt-1">Finger table visualization and hop tracing</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Ring Size" value="2²⁸" icon={Hash} color="indigo" />
        <StatCard label="Max Hops" value="4" icon={GitBranch} color="cyan" />
        <StatCard label="Recent Overflows" value="12" icon={ArrowRight} color="amber" />
      </div>

      {/* Chord Ring Visual */}
      <GlassPanel>
        <SectionHeader title="Chord Ring" subtitle="Visual representation of node positions on the hash ring" />
        <div className="flex justify-center py-8">
          <div className="relative w-64 h-64">
            {/* Ring */}
            <div className="absolute inset-0 rounded-full border-2 border-white/[0.06]" />
            {/* Nodes */}
            {NODES.map((n, i) => {
              const angle = (i / NODES.length) * 2 * Math.PI - Math.PI / 2;
              const x = 50 + 42 * Math.cos(angle);
              const y = 50 + 42 * Math.sin(angle);
              const color = Object.values(NODE_COLORS)[i];
              return (
                <motion.div
                  key={n}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: i * 0.15, type: 'spring' }}
                  className="absolute w-12 h-12 -translate-x-1/2 -translate-y-1/2 rounded-xl flex items-center justify-center text-xs font-bold text-white cursor-pointer group"
                  style={{
                    left: `${x}%`, top: `${y}%`,
                    background: `${color}25`, border: `2px solid ${color}50`,
                    boxShadow: `0 0 20px ${color}20`,
                  }}
                >
                  {n.replace('node_', 'S')}
                  <div className="absolute -bottom-6 text-[9px] text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    {n}
                  </div>
                </motion.div>
              );
            })}
            {/* Center label */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-xs text-zinc-700 font-mono">DHT</span>
            </div>
          </div>
        </div>
      </GlassPanel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Finger Tables */}
        <GlassPanel>
          <SectionHeader title="Finger Tables" />
          <div className="space-y-4">
            {fingerTable.map(({ node, fingers }, ni) => (
              <div key={node} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: Object.values(NODE_COLORS)[ni] }} />
                  <span className="text-sm font-semibold text-white">{node}</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-zinc-600">
                      <th className="text-left py-1 font-medium">k</th>
                      <th className="text-left py-1 font-medium">Start</th>
                      <th className="text-left py-1 font-medium">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fingers.map(f => (
                      <tr key={f.k} className="border-t border-white/[0.02]">
                        <td className="py-1 font-mono text-zinc-400">{f.k}</td>
                        <td className="py-1 font-mono text-zinc-500">{f.start}</td>
                        <td className="py-1 font-mono text-cyan-400">{f.target}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </GlassPanel>

        {/* Recent Hops */}
        <GlassPanel>
          <SectionHeader title="Recent Routing Hops" />
          <div className="space-y-3">
            {recentHops.map((hop, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
                className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="info">{hop.req}</Badge>
                  <span className="text-xs text-zinc-500">{hop.hops} hop{hop.hops > 1 ? 's' : ''}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-300 font-mono">{hop.from.replace('node_', 'S')}</span>
                  <ArrowRight className="w-3 h-3 text-zinc-600" />
                  <span className="text-cyan-400 font-mono">{hop.to.replace('node_', 'S')}</span>
                  <Badge variant="warning" className="ml-auto">{hop.reason}</Badge>
                </div>
              </motion.div>
            ))}
          </div>
        </GlassPanel>
      </div>
    </motion.div>
  );
}
