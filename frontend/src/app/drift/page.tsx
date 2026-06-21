'use client';

import { motion } from 'framer-motion';
import { SectionHeader, GlassPanel, Badge } from '@/components/ui';
import { Activity, AlertTriangle, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';

// Simulated drift data matching the feature_pipeline v2
const DRIFT_DATA = [
  { feature: 'payload_bytes_norm', psi: 0.02, status: 'stable' },
  { feature: 'cpu_estimate', psi: 0.05, status: 'stable' },
  { feature: 'endpoint_id_norm', psi: 0.12, status: 'warning' },
  { feature: 'requests_last_5s', psi: 0.08, status: 'stable' },
  { feature: 'avg_latency_ema', psi: 0.25, status: 'drift' },
  { feature: 'queue_depth', psi: 0.03, status: 'stable' },
  { feature: 'hour_of_day', psi: 0.01, status: 'stable' },
  { feature: 'is_burst', psi: 0.06, status: 'stable' },
  { feature: 'method_encoded', psi: 0.00, status: 'stable' },
  { feature: 'error_rate_5m', psi: 0.18, status: 'warning' },
  { feature: 'client_request_rate', psi: 0.04, status: 'stable' },
  { feature: 'cache_hit_ratio', psi: 0.22, status: 'drift' },
];

export default function DriftAnalysisPage() {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Concept Drift Detection</h1>
          <p className="text-sm text-zinc-500 mt-1">Population Stability Index (PSI) monitoring for 12-dim features</p>
        </div>
        <Badge variant="warning">Monitoring Active</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <GlassPanel>
            <SectionHeader title="Feature Distribution Stability (PSI)" icon={Activity} />
            <div className="mt-6">
              <table className="w-full text-sm text-left text-zinc-400">
                <thead className="text-xs text-zinc-500 uppercase bg-white/[0.02]">
                  <tr>
                    <th className="px-4 py-3 font-medium">Feature</th>
                    <th className="px-4 py-3 font-medium">PSI Value</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {DRIFT_DATA.map((item, idx) => (
                    <tr key={idx} className="border-b border-white/5">
                      <td className="px-4 py-3 font-mono text-zinc-300">{item.feature}</td>
                      <td className="px-4 py-3 font-mono">{item.psi.toFixed(3)}</td>
                      <td className="px-4 py-3">
                        {item.status === 'stable' && <Badge variant="success">Stable (&lt;0.1)</Badge>}
                        {item.status === 'warning' && <Badge variant="warning">Warning (0.1-0.2)</Badge>}
                        {item.status === 'drift' && <Badge variant="error">Drifted (&gt;0.2)</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        </div>

        <div className="space-y-6">
          <GlassPanel>
            <SectionHeader title="Drift Alerts" icon={AlertTriangle} />
            <div className="mt-4 space-y-4">
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-rose-300">Model Retraining Recommended</h4>
                    <p className="text-xs text-rose-400/80 mt-1">
                      2 features (avg_latency_ema, cache_hit_ratio) show significant drift (PSI &gt; 0.2).
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-amber-300">Monitor Warning</h4>
                    <p className="text-xs text-amber-400/80 mt-1">
                      endpoint_id_norm distribution is shifting. New traffic patterns detected.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </GlassPanel>
        </div>
      </div>
    </motion.div>
  );
}
