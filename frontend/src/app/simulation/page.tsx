'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Square, Pause, Zap, Clock } from 'lucide-react';
import { GlassPanel, SectionHeader, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SCENARIOS } from '@/constants';

type SimState = 'idle' | 'running' | 'paused' | 'stopped';

export default function SimulationPage() {
  const [state, setState] = useState<SimState>('idle');
  const [scenario, setScenario] = useState('uniform');
  const [rps, setRps] = useState(200);
  const [elapsed, setElapsed] = useState(0);
  const [totalReqs, setTotalReqs] = useState(0);

  const handleStart = () => { setState('running'); setElapsed(0); setTotalReqs(0); };
  const handleStop = () => setState('stopped');
  const handlePause = () => setState(state === 'paused' ? 'running' : 'paused');

  const stateColors: Record<SimState, string> = {
    idle: 'text-zinc-500',
    running: 'text-emerald-400',
    paused: 'text-amber-400',
    stopped: 'text-zinc-500',
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Simulation Control</h1>
        <p className="text-sm text-zinc-500 mt-1">Configure and run traffic simulation scenarios</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Control Panel */}
        <div className="lg:col-span-2 space-y-5">
          <GlassPanel>
            <SectionHeader title="Scenario Configuration" />

            {/* Scenario selector */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 block">Traffic Pattern</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {SCENARIOS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setScenario(s)}
                      className={cn(
                        'px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 border',
                        scenario === s
                          ? 'bg-brand-500/15 border-brand-500/30 text-brand-400'
                          : 'bg-white/[0.02] border-white/[0.04] text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200'
                      )}
                    >
                      <span className="capitalize">{s.replace('_', ' ')}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* RPS Slider */}
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Requests Per Second
                  </label>
                  <span className="text-sm font-mono font-bold text-brand-400">{rps} RPS</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={2000}
                  step={10}
                  value={rps}
                  onChange={(e) => setRps(Number(e.target.value))}
                  className="w-full h-2 bg-white/[0.04] rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand-500 [&::-webkit-slider-thumb]:shadow-glow-sm
                    [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:transition-shadow
                    [&::-webkit-slider-thumb]:hover:shadow-glow-md"
                />
                <div className="flex justify-between text-[10px] text-zinc-700 mt-1">
                  <span>10</span><span>500</span><span>1000</span><span>2000</span>
                </div>
              </div>

              {/* Duration */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 block">Duration</label>
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <Clock className="w-4 h-4 text-zinc-600" />
                    <span className="text-sm font-mono text-zinc-300">300 seconds</span>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 block">Ramp Up</label>
                  <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                    <Zap className="w-4 h-4 text-zinc-600" />
                    <span className="text-sm font-mono text-zinc-300">10 seconds</span>
                  </div>
                </div>
              </div>
            </div>
          </GlassPanel>

          {/* Control Buttons */}
          <GlassPanel>
            <div className="flex items-center gap-3">
              <button
                onClick={handleStart}
                disabled={state === 'running'}
                className={cn(
                  'flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all',
                  state === 'running'
                    ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500 hover:shadow-[0_0_20px_rgba(52,211,153,0.2)]'
                )}
              >
                <Play className="w-4 h-4" />
                {state === 'idle' ? 'Start Simulation' : 'Restart'}
              </button>

              <button
                onClick={handlePause}
                disabled={state !== 'running' && state !== 'paused'}
                className={cn(
                  'flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all border',
                  state === 'running' || state === 'paused'
                    ? 'border-amber-500/30 text-amber-400 hover:bg-amber-500/10'
                    : 'border-zinc-800 text-zinc-600 cursor-not-allowed'
                )}
              >
                <Pause className="w-4 h-4" />
                {state === 'paused' ? 'Resume' : 'Pause'}
              </button>

              <button
                onClick={handleStop}
                disabled={state === 'idle' || state === 'stopped'}
                className={cn(
                  'flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all border',
                  state === 'running' || state === 'paused'
                    ? 'border-rose-500/30 text-rose-400 hover:bg-rose-500/10'
                    : 'border-zinc-800 text-zinc-600 cursor-not-allowed'
                )}
              >
                <Square className="w-4 h-4" />
                Stop
              </button>
            </div>
          </GlassPanel>
        </div>

        {/* Status Panel */}
        <div className="space-y-5">
          <GlassPanel>
            <SectionHeader title="Status" />
            <div className="flex items-center gap-3 mb-4">
              <div className={cn(
                'w-3 h-3 rounded-full',
                state === 'running' ? 'bg-emerald-400 animate-pulse shadow-[0_0_12px_rgba(52,211,153,0.5)]' :
                state === 'paused' ? 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.5)]' :
                'bg-zinc-600'
              )} />
              <span className={cn('text-lg font-semibold capitalize', stateColors[state])}>
                {state}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-white/[0.03]">
                <span className="text-sm text-zinc-500">Scenario</span>
                <Badge variant="info">{scenario}</Badge>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.03]">
                <span className="text-sm text-zinc-500">Target RPS</span>
                <span className="text-sm font-mono text-zinc-300">{rps}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-white/[0.03]">
                <span className="text-sm text-zinc-500">Elapsed</span>
                <span className="text-sm font-mono text-zinc-300">{elapsed}s</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-sm text-zinc-500">Total Requests</span>
                <span className="text-sm font-mono text-zinc-300">{totalReqs.toLocaleString()}</span>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel>
            <SectionHeader title="Scenario Info" />
            <div className="space-y-2 text-sm text-zinc-400">
              {scenario === 'uniform' && <p>Constant RPS with minimal jitter. Tests steady-state load balancing.</p>}
              {scenario === 'bursty' && <p>Poisson-distributed burst spikes every ~30s at 3× base rate.</p>}
              {scenario === 'flash_crowd' && <p>10× traffic surge at configured timestamp with ramp-up/down.</p>}
              {scenario === 'random' && <p>Variable 100–500 RPS with phase shifts every 15s.</p>}
            </div>
          </GlassPanel>
        </div>
      </div>
    </motion.div>
  );
}
