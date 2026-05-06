'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Layers, Clock, Scale } from 'lucide-react';
import { GlassPanel, SectionHeader, StatCard, Badge, ProgressBar } from '@/components/ui';
import { cn } from '@/lib/utils';
import { NODE_COLORS, NODES } from '@/constants';

export default function QueuesPage() {
  const [tick, setTick] = useState(0);
  useEffect(() => { const iv = setInterval(() => setTick(t => t + 1), 2000); return () => clearInterval(iv); }, []);

  const queues = NODES.map((n, i) => ({
    node: n,
    light: { depth: Math.floor(20 + Math.random() * 80), max: 200, weight: 3 },
    medium: { depth: Math.floor(10 + Math.random() * 60), max: 150, weight: 2 },
    heavy: { depth: Math.floor(5 + Math.random() * 30), max: 100, weight: 1 },
  }));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">WFQ Scheduler</h1>
        <p className="text-sm text-zinc-500 mt-1">Weighted Fair Queue visualization with 3:2:1 class ratios</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Weight Ratio" value="3:2:1" icon={Scale} color="indigo" />
        <StatCard label="Total Queued" value={queues.reduce((s, q) => s + q.light.depth + q.medium.depth + q.heavy.depth, 0)} icon={Layers} color="cyan" />
        <StatCard label="Exec Time Range" value="40–1200ms" icon={Clock} color="amber" />
      </div>

      {/* Queue bars per node */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {queues.map((q, i) => {
          const color = Object.values(NODE_COLORS)[i];
          return (
            <GlassPanel key={q.node}>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                <span className="text-sm font-semibold text-white">{q.node}</span>
              </div>
              <div className="space-y-4">
                {([
                  { cls: 'Light', data: q.light, color: 'emerald', time: '40–60ms' },
                  { cls: 'Medium', data: q.medium, color: 'amber', time: '150–250ms' },
                  { cls: 'Heavy', data: q.heavy, color: 'rose', time: '800–1200ms' },
                ] as const).map(queue => (
                  <div key={queue.cls}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-zinc-300">{queue.cls}</span>
                        <Badge variant="default">w={queue.data.weight}</Badge>
                      </div>
                      <span className="text-xs font-mono text-zinc-500">
                        {queue.data.depth}/{queue.data.max}
                      </span>
                    </div>
                    <ProgressBar value={queue.data.depth} max={queue.data.max} color={queue.color} size="md" />
                    <p className="text-[10px] text-zinc-600 mt-0.5">Exec: {queue.time}</p>
                  </div>
                ))}
              </div>

              {/* Dequeue order */}
              <div className="mt-4 pt-3 border-t border-white/[0.04]">
                <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Dequeue Cycle</p>
                <div className="flex gap-1">
                  {['L', 'L', 'L', 'M', 'M', 'H'].map((c, j) => (
                    <motion.div
                      key={j}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: j * 0.05 }}
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold',
                        c === 'L' ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' :
                        c === 'M' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20' :
                        'bg-rose-500/15 text-rose-400 border border-rose-500/20'
                      )}
                    >
                      {c}
                    </motion.div>
                  ))}
                </div>
              </div>
            </GlassPanel>
          );
        })}
      </div>
    </motion.div>
  );
}
