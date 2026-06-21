'use client';

import { motion } from 'framer-motion';
import { SectionHeader, GlassPanel, Badge } from '@/components/ui';
import { FlaskConical, BarChart3, Clock, Zap } from 'lucide-react';
import { useState } from 'react';

export default function AlgorithmComparisonPage() {
  const [activeTab, setActiveTab] = useState<'latency' | 'throughput'>('latency');

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Algorithm Comparison</h1>
          <p className="text-sm text-zinc-500 mt-1">A/B Testing Baseline vs Predictive Routing</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <GlassPanel className="col-span-1 lg:col-span-4 flex items-center justify-between p-4">
          <div className="flex items-center gap-4">
            <FlaskConical className="text-brand-400 w-8 h-8" />
            <div>
              <h3 className="font-semibold text-white">Live Benchmark Status</h3>
              <p className="text-sm text-zinc-400">Comparing 4 routing strategies under Heavy Burst workload</p>
            </div>
          </div>
          <div className="flex gap-2 bg-black/40 p-1 rounded-lg border border-white/10">
            <button 
              onClick={() => setActiveTab('latency')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'latency' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Latency
            </button>
            <button 
              onClick={() => setActiveTab('throughput')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'throughput' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Throughput
            </button>
          </div>
        </GlassPanel>

        {/* Predictive System (Winner) */}
        <GlassPanel className="col-span-1 border-brand-500/30 shadow-[0_0_15px_rgba(99,102,241,0.1)] relative overflow-hidden">
          <div className="absolute top-0 right-0 bg-brand-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg">WINNER</div>
          <h3 className="text-lg font-bold text-white mb-1">Predictive DAA</h3>
          <p className="text-xs text-zinc-500 mb-4">Proactive load awareness</p>
          
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-zinc-400">P99 Latency</span>
                <span className="text-emerald-400 font-mono font-bold">250 ms</span>
              </div>
              <div className="h-2 bg-black/50 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 w-[25%]" />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-zinc-400">Max Throughput</span>
                <span className="text-white font-mono">1,250 RPS</span>
              </div>
            </div>
          </div>
        </GlassPanel>

        {/* Least Connections */}
        <GlassPanel className="col-span-1">
          <h3 className="text-lg font-bold text-white mb-1">Least Connections</h3>
          <p className="text-xs text-zinc-500 mb-4">Reactive queue balancing</p>
          
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-zinc-400">P99 Latency</span>
                <span className="text-amber-400 font-mono font-bold">310 ms</span>
              </div>
              <div className="h-2 bg-black/50 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 w-[45%]" />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-zinc-400">Max Throughput</span>
                <span className="text-white font-mono">1,100 RPS</span>
              </div>
            </div>
          </div>
        </GlassPanel>

        {/* Static Hash */}
        <GlassPanel className="col-span-1">
          <h3 className="text-lg font-bold text-white mb-1">Static Hash</h3>
          <p className="text-xs text-zinc-500 mb-4">Fixed vnodes, no awareness</p>
          
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-zinc-400">P99 Latency</span>
                <span className="text-rose-400 font-mono font-bold">420 ms</span>
              </div>
              <div className="h-2 bg-black/50 rounded-full overflow-hidden">
                <div className="h-full bg-rose-500 w-[70%]" />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-zinc-400">Max Throughput</span>
                <span className="text-white font-mono">950 RPS</span>
              </div>
            </div>
          </div>
        </GlassPanel>
        
        {/* Round Robin */}
        <GlassPanel className="col-span-1">
          <h3 className="text-lg font-bold text-white mb-1">Round Robin</h3>
          <p className="text-xs text-zinc-500 mb-4">Blind distribution</p>
          
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-zinc-400">P99 Latency</span>
                <span className="text-rose-500 font-mono font-bold">580 ms</span>
              </div>
              <div className="h-2 bg-black/50 rounded-full overflow-hidden">
                <div className="h-full bg-rose-600 w-[95%]" />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-zinc-400">Max Throughput</span>
                <span className="text-white font-mono">820 RPS</span>
              </div>
            </div>
          </div>
        </GlassPanel>

      </div>
    </motion.div>
  );
}
