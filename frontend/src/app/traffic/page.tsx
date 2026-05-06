'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, Shuffle, Flame, TrendingUp } from 'lucide-react';
import { GlassPanel, SectionHeader, Badge, ProgressBar } from '@/components/ui';
import { cn } from '@/lib/utils';
import { CLASS_COLORS } from '@/constants';

export default function TrafficPage() {
  const [pattern, setPattern] = useState('uniform');
  const [rps, setRps] = useState(200);

  const patterns = [
    { id: 'uniform', label: 'Uniform', icon: TrendingUp, desc: 'Constant rate with jitter' },
    { id: 'bursty', label: 'Bursty', icon: Zap, desc: 'Poisson burst spikes' },
    { id: 'flash_crowd', label: 'Flash Crowd', icon: Flame, desc: '10× surge at trigger' },
    { id: 'random', label: 'Random', icon: Shuffle, desc: 'Variable phases' },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Traffic Generator</h1>
        <p className="text-sm text-zinc-500 mt-1">Configure request traffic patterns and class distribution</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Pattern Selector */}
          <GlassPanel>
            <SectionHeader title="Traffic Pattern" />
            <div className="grid grid-cols-2 gap-3">
              {patterns.map(p => (
                <button key={p.id} onClick={() => setPattern(p.id)}
                  className={cn(
                    'p-4 rounded-xl border text-left transition-all',
                    pattern === p.id
                      ? 'bg-brand-500/10 border-brand-500/25'
                      : 'bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04]'
                  )}>
                  <p.icon className={cn('w-5 h-5 mb-2', pattern === p.id ? 'text-brand-400' : 'text-zinc-500')} />
                  <p className={cn('text-sm font-semibold', pattern === p.id ? 'text-white' : 'text-zinc-300')}>
                    {p.label}
                  </p>
                  <p className="text-xs text-zinc-600 mt-0.5">{p.desc}</p>
                </button>
              ))}
            </div>
          </GlassPanel>

          {/* RPS Control */}
          <GlassPanel>
            <SectionHeader title="Rate Configuration" />
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Base RPS</span>
                  <span className="text-lg font-mono font-bold text-brand-400">{rps}</span>
                </div>
                <input type="range" min={10} max={2000} step={10} value={rps}
                  onChange={e => setRps(Number(e.target.value))}
                  className="w-full h-2 bg-white/[0.04] rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-500 [&::-webkit-slider-thumb]:shadow-glow-sm" />
              </div>
              {pattern === 'bursty' && (
                <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                  <p className="text-xs text-amber-400 font-medium">Burst multiplier: 3×</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Peak RPS during burst: {rps * 3}</p>
                </div>
              )}
            </div>
          </GlassPanel>
        </div>

        {/* Class Distribution */}
        <GlassPanel>
          <SectionHeader title="Request Mix" />
          <div className="space-y-6">
            {[
              { cls: 'Light', pct: 55, desc: 'GET /status, /search', time: '40–60ms' },
              { cls: 'Medium', pct: 30, desc: 'POST /data, GET /search', time: '150–250ms' },
              { cls: 'Heavy', pct: 15, desc: 'POST /inference, /batch', time: '800–1200ms' },
            ].map(c => (
              <div key={c.cls}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm" style={{ background: CLASS_COLORS[c.cls] }} />
                    <span className="text-sm font-medium text-white">{c.cls}</span>
                  </div>
                  <span className="text-sm font-mono text-zinc-400">{c.pct}%</span>
                </div>
                <ProgressBar value={c.pct} color={c.cls === 'Light' ? 'emerald' : c.cls === 'Medium' ? 'amber' : 'rose'} size="sm" />
                <div className="flex justify-between text-[10px] text-zinc-600 mt-1">
                  <span>{c.desc}</span>
                  <span>{c.time}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 pt-4 border-t border-white/[0.04]">
            <p className="text-xs text-zinc-600 mb-2">Effective distribution at {rps} RPS:</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { cls: 'Light', rpsVal: Math.floor(rps * 0.55) },
                { cls: 'Medium', rpsVal: Math.floor(rps * 0.30) },
                { cls: 'Heavy', rpsVal: Math.floor(rps * 0.15) },
              ].map(c => (
                <div key={c.cls} className="p-2 rounded-lg bg-white/[0.02]">
                  <p className="text-lg font-mono font-bold text-zinc-200">{c.rpsVal}</p>
                  <p className="text-[10px] text-zinc-600">rps</p>
                </div>
              ))}
            </div>
          </div>
        </GlassPanel>
      </div>
    </motion.div>
  );
}
