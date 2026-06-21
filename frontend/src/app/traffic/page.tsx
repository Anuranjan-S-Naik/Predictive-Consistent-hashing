'use client';

import { motion } from 'framer-motion';
import { SectionHeader, GlassPanel, Badge } from '@/components/ui';
import { Zap, Play, Square, Activity } from 'lucide-react';
import { useState } from 'react';

export default function TrafficGeneratorPage() {
  const [running, setRunning] = useState(false);
  const [scenario, setScenario] = useState('Uniform Traffic');

  const scenarios = [
    'Uniform Traffic',
    'Flash Crowd',
    'Heavy Burst',
    'Mixed Workload'
  ];

  const handleToggle = () => {
    setRunning(!running);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Traffic Generator</h1>
          <p className="text-sm text-zinc-500 mt-1">Simulate real-world HTTP traffic patterns</p>
        </div>
        <Badge variant={running ? 'success' : 'info'}>{running ? 'Generating Traffic' : 'Idle'}</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <GlassPanel className="lg:col-span-1">
          <SectionHeader title="Simulation Controls" />
          
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-xs text-zinc-400 font-medium mb-2 block">Scenario</label>
              <div className="space-y-2">
                {scenarios.map(s => (
                  <button
                    key={s}
                    onClick={() => setScenario(s)}
                    disabled={running}
                    className={`w-full text-left px-3 py-2 rounded-md text-sm border transition-colors ${
                      scenario === s 
                        ? 'bg-brand-500/20 border-brand-500/50 text-brand-300' 
                        : 'bg-white/[0.02] border-white/10 text-zinc-400 hover:bg-white/[0.05]'
                    } ${running ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-white/10">
              <button
                onClick={handleToggle}
                className={`w-full py-3 rounded-lg flex items-center justify-center gap-2 font-semibold transition-colors ${
                  running 
                    ? 'bg-rose-500/20 text-rose-400 hover:bg-rose-500/30' 
                    : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                }`}
              >
                {running ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {running ? 'Stop Simulation' : 'Start Simulation'}
              </button>
            </div>
          </div>
        </GlassPanel>

        <GlassPanel className="lg:col-span-2">
          <SectionHeader title="Live Request Feed" icon={Activity} />
          
          <div className="mt-4 bg-black/40 rounded-lg border border-white/[0.05] p-4 h-[400px] overflow-y-auto font-mono text-sm space-y-2">
            {!running ? (
              <div className="h-full flex items-center justify-center text-zinc-600">
                Simulation stopped. Select a scenario and click Start.
              </div>
            ) : (
              <>
                <div className="text-zinc-500">Starting scenario: {scenario}...</div>
                <div className="text-emerald-400 flex justify-between">
                  <span>POST /api/search</span>
                  <span className="text-zinc-500">Payload: 20KB</span>
                </div>
                <div className="text-cyan-400 flex justify-between">
                  <span>GET /api/data</span>
                  <span className="text-zinc-500">Payload: 5KB</span>
                </div>
                <div className="text-rose-400 flex justify-between">
                  <span>POST /api/inference</span>
                  <span className="text-zinc-500">Payload: 120KB</span>
                </div>
                <div className="text-emerald-400 flex justify-between">
                  <span>GET /api/status</span>
                  <span className="text-zinc-500">Payload: 1KB</span>
                </div>
                <div className="animate-pulse text-zinc-600">Generating requests...</div>
              </>
            )}
          </div>
        </GlassPanel>
      </div>
    </motion.div>
  );
}
