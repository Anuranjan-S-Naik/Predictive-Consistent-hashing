'use client';

import { motion } from 'framer-motion';
import { Save, RotateCcw } from 'lucide-react';
import { GlassPanel, SectionHeader } from '@/components/ui';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Configure framework parameters and connections</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Coordinator */}
        <GlassPanel>
          <SectionHeader title="Coordinator" />
          <div className="space-y-3">
            {[
              ['API URL', 'http://localhost:8000'],
              ['gRPC Port', '50050'],
              ['API Key', '••••••••••'],
              ['Log Level', 'INFO'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2 border-b border-white/[0.03]">
                <span className="text-sm text-zinc-500">{k}</span>
                <input type="text" defaultValue={v}
                  className="bg-surface-3 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-mono w-48 text-right outline-none focus:border-brand-500/40" />
              </div>
            ))}
          </div>
        </GlassPanel>

        {/* Hash Ring */}
        <GlassPanel>
          <SectionHeader title="Hash Ring" />
          <div className="space-y-3">
            {[
              ['Algorithm', 'MurmurHash3-128'],
              ['Base Vnodes', '150'],
              ['Min Vnodes', '10'],
              ['Cache Refresh', '100ms'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2 border-b border-white/[0.03]">
                <span className="text-sm text-zinc-500">{k}</span>
                <span className="text-xs text-zinc-300 font-mono">{v}</span>
              </div>
            ))}
          </div>
        </GlassPanel>

        {/* Allocation */}
        <GlassPanel>
          <SectionHeader title="Allocation Weights" />
          <div className="space-y-3">
            {[
              ['α (CPU)', '0.35', 'brand'],
              ['β (Queue)', '0.30', 'cyan'],
              ['γ (Latency)', '0.20', 'emerald'],
              ['δ (Forecast)', '0.15', 'amber'],
              ['Overflow Threshold', '0.85', 'rose'],
            ].map(([k, v, c]) => (
              <div key={k} className="flex items-center justify-between py-2 border-b border-white/[0.03]">
                <span className={cn('text-sm', `text-${c}-400`)}>{k}</span>
                <input type="text" defaultValue={v}
                  className="bg-surface-3 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-zinc-300 font-mono w-20 text-right outline-none focus:border-brand-500/40" />
              </div>
            ))}
          </div>
        </GlassPanel>

        {/* Scheduler */}
        <GlassPanel>
          <SectionHeader title="WFQ Scheduler" />
          <div className="space-y-3">
            {[
              ['Light Weight', '3'],
              ['Light Max Depth', '200'],
              ['Medium Weight', '2'],
              ['Medium Max Depth', '150'],
              ['Heavy Weight', '1'],
              ['Heavy Max Depth', '100'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2 border-b border-white/[0.03]">
                <span className="text-sm text-zinc-500">{k}</span>
                <span className="text-xs text-zinc-300 font-mono">{v}</span>
              </div>
            ))}
          </div>
        </GlassPanel>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button className="btn-glow flex items-center gap-2">
          <Save className="w-4 h-4" /> Save Changes
        </button>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] transition-colors">
          <RotateCcw className="w-4 h-4" /> Reset Defaults
        </button>
      </div>
    </motion.div>
  );
}
