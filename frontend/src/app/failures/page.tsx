'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bomb, Wifi, WifiOff, Server } from 'lucide-react';
import { GlassPanel, SectionHeader, Badge, StatCard } from '@/components/ui';
import { cn } from '@/lib/utils';
import { NODES, NODE_COLORS } from '@/constants';

export default function FailuresPage() {
  const [crashed, setCrashed] = useState<string[]>([]);
  const [redisDown, setRedisDown] = useState(false);

  const toggleCrash = (node: string) => {
    setCrashed(prev => prev.includes(node) ? prev.filter(n => n !== node) : [...prev, node]);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Failure Injection</h1>
        <p className="text-sm text-zinc-500 mt-1">Simulate node crashes, redis failures, and overload scenarios</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Crashed Nodes" value={crashed.length} icon={Bomb} color="rose" />
        <StatCard label="Active Nodes" value={NODES.length - crashed.length} icon={Server} color="emerald" />
        <StatCard label="Redis" value={redisDown ? 'Down' : 'Online'} icon={redisDown ? WifiOff : Wifi} color={redisDown ? 'rose' : 'emerald'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Node Crash */}
        <GlassPanel>
          <SectionHeader title="Node Crash Simulation" subtitle="Click to toggle node state" />
          <div className="grid grid-cols-2 gap-3">
            {NODES.map((n, i) => {
              const isCrashed = crashed.includes(n);
              const color = Object.values(NODE_COLORS)[i];
              return (
                <button key={n} onClick={() => toggleCrash(n)}
                  className={cn(
                    'p-4 rounded-xl border transition-all text-left',
                    isCrashed
                      ? 'bg-rose-500/10 border-rose-500/25'
                      : 'bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04]'
                  )}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className={cn('w-3 h-3 rounded-full', isCrashed ? 'bg-rose-500' : 'bg-emerald-400')}
                      style={isCrashed ? {} : { background: color }} />
                    <span className={cn('text-sm font-semibold', isCrashed ? 'text-rose-400' : 'text-white')}>{n}</span>
                  </div>
                  <Badge variant={isCrashed ? 'danger' : 'success'}>
                    {isCrashed ? 'CRASHED' : 'Online'}
                  </Badge>
                </button>
              );
            })}
          </div>
        </GlassPanel>

        {/* Service Failures */}
        <GlassPanel>
          <SectionHeader title="Service Failures" />
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <div>
                <p className="text-sm font-medium text-white">Redis Failure</p>
                <p className="text-xs text-zinc-500">Simulate Redis connection loss</p>
              </div>
              <button onClick={() => setRedisDown(!redisDown)}
                className={cn(
                  'w-12 h-6 rounded-full p-0.5 transition-colors',
                  redisDown ? 'bg-rose-500' : 'bg-zinc-700'
                )}>
                <div className={cn('w-5 h-5 rounded-full bg-white transition-transform', redisDown ? 'translate-x-6' : 'translate-x-0')} />
              </button>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <div>
                <p className="text-sm font-medium text-white">Latency Injection</p>
                <p className="text-xs text-zinc-500">Add artificial delay to requests</p>
              </div>
              <select className="bg-surface-3 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300">
                <option>None</option>
                <option>+100ms</option>
                <option>+500ms</option>
                <option>+1000ms</option>
              </select>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <div>
                <p className="text-sm font-medium text-white">CPU Overload</p>
                <p className="text-xs text-zinc-500">Force high CPU on selected node</p>
              </div>
              <select className="bg-surface-3 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300">
                <option>Disabled</option>
                {NODES.map(n => <option key={n}>{n}</option>)}
              </select>
            </div>
          </div>
        </GlassPanel>
      </div>
    </motion.div>
  );
}
