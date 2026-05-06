'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { FlaskConical, Play, Clock, CheckCircle, Loader2 } from 'lucide-react';
import { GlassPanel, SectionHeader, Badge, StatCard } from '@/components/ui';
import { cn } from '@/lib/utils';
import { SCENARIOS, ALLOCATION_MODES } from '@/constants';

export default function ExperimentsPage() {
  const [running, setRunning] = useState(false);
  const [scenario, setScenario] = useState('bursty');
  const [mode, setMode] = useState('predictive_framework');

  const pastExperiments = [
    { id: 'exp_001', scenario: 'uniform', mode: 'predictive_framework', status: 'completed', p99: 320, rps: 498 },
    { id: 'exp_002', scenario: 'bursty', mode: 'round_robin', status: 'completed', p99: 820, rps: 450 },
    { id: 'exp_003', scenario: 'flash_crowd', mode: 'least_connections', status: 'completed', p99: 1200, rps: 380 },
    { id: 'exp_004', scenario: 'uniform', mode: 'static_consistent_hash', status: 'completed', p99: 410, rps: 490 },
  ];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Experiment Runner</h1>
        <p className="text-sm text-zinc-500 mt-1">Configure and run benchmark experiments</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Experiment Config */}
        <div className="lg:col-span-2">
          <GlassPanel>
            <SectionHeader title="New Experiment" />
            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 block">Scenario</label>
                <div className="grid grid-cols-4 gap-2">
                  {SCENARIOS.map(s => (
                    <button key={s} onClick={() => setScenario(s)}
                      className={cn(
                        'px-3 py-2.5 rounded-xl text-xs font-medium capitalize transition-all border',
                        scenario === s ? 'bg-brand-500/15 border-brand-500/25 text-brand-400' : 'bg-white/[0.02] border-white/[0.04] text-zinc-400 hover:bg-white/[0.04]'
                      )}>
                      {s.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2 block">Allocation Mode</label>
                <div className="grid grid-cols-2 gap-2">
                  {ALLOCATION_MODES.map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      className={cn(
                        'px-3 py-2.5 rounded-xl text-xs font-medium capitalize transition-all border',
                        mode === m ? 'bg-cyan-500/15 border-cyan-500/25 text-cyan-400' : 'bg-white/[0.02] border-white/[0.04] text-zinc-400 hover:bg-white/[0.04]'
                      )}>
                      {m.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={() => setRunning(!running)}
                className={cn(
                  'flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all w-full justify-center',
                  running
                    ? 'bg-amber-600/20 text-amber-400 border border-amber-500/25'
                    : 'bg-emerald-600 text-white hover:bg-emerald-500'
                )}
              >
                {running ? <><Loader2 className="w-4 h-4 animate-spin" />Running...</> : <><Play className="w-4 h-4" />Start Experiment</>}
              </button>
            </div>
          </GlassPanel>
        </div>

        {/* Stats */}
        <div className="space-y-4">
          <StatCard label="Total Experiments" value={pastExperiments.length} icon={FlaskConical} color="indigo" />
          <StatCard label="Best p99" value="320ms" icon={Clock} color="emerald" />
        </div>
      </div>

      {/* Past Experiments */}
      <GlassPanel>
        <SectionHeader title="Experiment History" />
        <div className="space-y-2">
          {pastExperiments.map((exp, i) => (
            <motion.div key={exp.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.03] transition-colors">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-mono text-zinc-400 w-16">{exp.id}</span>
              <Badge variant="info">{exp.scenario}</Badge>
              <span className="text-xs text-zinc-300 capitalize">{exp.mode.replace(/_/g, ' ')}</span>
              <span className="ml-auto text-xs font-mono text-zinc-500">p99: {exp.p99}ms</span>
              <span className="text-xs font-mono text-zinc-500">{exp.rps} rps</span>
            </motion.div>
          ))}
        </div>
      </GlassPanel>
    </motion.div>
  );
}
