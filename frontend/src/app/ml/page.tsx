'use client';

import { motion } from 'framer-motion';
import { SectionHeader, GlassPanel, Badge } from '@/components/ui';
import { Brain, Search, Lightbulb, Workflow } from 'lucide-react';
import { useState } from 'react';

export default function MLInsightsPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">ML Insights (SHAP)</h1>
          <p className="text-sm text-zinc-500 mt-1">Explainability for XGBoost routing decisions</p>
        </div>
        <Badge variant="info">Phase 3 Feature</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassPanel>
          <SectionHeader title="Global Feature Importance" icon={BarChart3} />
          <div className="mt-6 space-y-4">
            <p className="text-sm text-zinc-400 mb-4">
              Average impact of each feature on model output magnitude.
            </p>
            {[
              { name: 'payload_bytes_norm', impact: 0.85, color: 'bg-indigo-500' },
              { name: 'endpoint_id_norm', impact: 0.55, color: 'bg-indigo-400' },
              { name: 'cpu_estimate', impact: 0.45, color: 'bg-indigo-300' },
              { name: 'cache_hit_ratio', impact: 0.35, color: 'bg-indigo-200' },
              { name: 'avg_latency_ema', impact: 0.25, color: 'bg-indigo-100' },
            ].map(f => (
              <div key={f.name}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-300 font-mono">{f.name}</span>
                  <span className="text-zinc-500">{f.impact.toFixed(2)}</span>
                </div>
                <div className="h-1.5 bg-black/50 rounded-full overflow-hidden">
                  <div className={`h-full ${f.color}`} style={{ width: `${f.impact * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel>
          <SectionHeader title="Local Explanation (Single Request)" icon={Search} />
          <div className="mt-4 p-4 bg-black/30 rounded-lg border border-white/5">
            <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/5">
              <div>
                <div className="text-xs text-zinc-500 font-mono">req_00012345</div>
                <div className="text-sm font-semibold text-white">POST /api/inference</div>
              </div>
              <Badge variant="error">Predicted: Heavy</Badge>
            </div>
            
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <span className="text-rose-400 font-bold w-6">+0.4</span>
                <span className="text-zinc-300 font-mono w-24">payload_bytes_norm</span>
                <span className="text-zinc-500 text-xs flex-1">Very large payload (120KB) pushed prediction towards Heavy.</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-rose-400 font-bold w-6">+0.2</span>
                <span className="text-zinc-300 font-mono w-24">endpoint_id_norm</span>
                <span className="text-zinc-500 text-xs flex-1">/api/inference is historically CPU intensive.</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-emerald-400 font-bold w-6">-0.1</span>
                <span className="text-zinc-300 font-mono w-24">queue_depth</span>
                <span className="text-zinc-500 text-xs flex-1">Queue was empty, slightly lowering score.</span>
              </div>
            </div>
          </div>
        </GlassPanel>
      </div>
    </motion.div>
  );
}

// Quick placeholder for the icon to fix missing import
function BarChart3(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}
