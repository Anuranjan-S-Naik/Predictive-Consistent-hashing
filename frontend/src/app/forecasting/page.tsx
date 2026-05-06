'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, AlertTriangle, Eye, BarChart3 } from 'lucide-react';
import { GlassPanel, SectionHeader, StatCard, ProgressBar } from '@/components/ui';


export default function ForecastingPage() {
  const [points, setPoints] = useState<{ t: number; predicted: number; actual: number }[]>([]);
  useEffect(() => {
    const data = Array.from({ length: 60 }, (_, i) => {
      const base = 15 + Math.sin(i * 0.15) * 8;
      return {
        t: Date.now() - (60 - i) * 5000,
        predicted: base + Math.random() * 3,
        actual: base + (Math.random() - 0.5) * 6,
      };
    });
    setPoints(data);
  }, []);

  const mae = points.length > 0
    ? (points.reduce((s, p) => s + Math.abs(p.predicted - p.actual), 0) / points.length).toFixed(2)
    : '–';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Traffic Forecasting</h1>
        <p className="text-sm text-zinc-500 mt-1">GRU-based heavy request rate prediction</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard label="Prediction MAE" value={mae} icon={TrendingUp} color="indigo" />
        <StatCard label="Window Size" value="60 pts" icon={Eye} color="cyan" />
        <StatCard label="Burst Detected" value="No" icon={AlertTriangle} color="emerald" />
        <StatCard label="Confidence" value="87%" icon={BarChart3} color="amber" />
      </div>

      <GlassPanel>
        <SectionHeader title="Predicted vs Actual" subtitle="Heavy request rate (per second)" />
        {/* Inline sparkline visualization */}
        <div className="relative h-64 flex items-end gap-px">
          {points.slice(-40).map((p, i) => {
            const maxVal = 35;
            const predH = (p.predicted / maxVal) * 100;
            const actH = (p.actual / maxVal) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-0.5 relative group">
                <div className="w-full flex gap-px h-full items-end">
                  <div className="flex-1 rounded-t-sm bg-brand-500/40 transition-all duration-300"
                    style={{ height: `${predH}%` }} />
                  <div className="flex-1 rounded-t-sm bg-cyan-500/40 transition-all duration-300"
                    style={{ height: `${actH}%` }} />
                </div>
                {/* Tooltip */}
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block
                  bg-surface-2 border border-white/[0.08] rounded-lg px-2 py-1 text-[10px] whitespace-nowrap z-10">
                  <p className="text-brand-400">Pred: {p.predicted.toFixed(1)}</p>
                  <p className="text-cyan-400">Actual: {p.actual.toFixed(1)}</p>
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-6 mt-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-brand-500/60" />Predicted</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-cyan-500/60" />Actual</span>
        </div>
      </GlassPanel>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <GlassPanel>
          <SectionHeader title="Model Info" />
          <div className="space-y-2 text-sm">
            {[
              ['Architecture', 'GRU (2-layer, 64 hidden)'],
              ['Input', '60-point rolling window'],
              ['Output', '10s ahead heavy count'],
              ['Burst Multiplier', '1.5×'],
              ['Model File', 'forecaster_v1.pt'],
              ['Status', 'Phase 5 — Not yet trained'],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between py-1.5 border-b border-white/[0.03]">
                <span className="text-zinc-500">{k}</span>
                <span className="text-zinc-300 font-mono text-xs">{v}</span>
              </div>
            ))}
          </div>
        </GlassPanel>

        <GlassPanel>
          <SectionHeader title="Burst Detection" />
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 mb-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="status-dot status-dot-healthy" />
              <span className="text-sm font-medium text-emerald-400">No Burst Detected</span>
            </div>
            <p className="text-xs text-zinc-500">Current rate is within normal range. Burst threshold: 1.5× moving average.</p>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Current Avg</span>
              <span className="text-zinc-300 font-mono">14.7 req/s</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-zinc-500">Burst Threshold</span>
              <span className="text-amber-400 font-mono">22.1 req/s</span>
            </div>
            <ProgressBar value={14.7} max={30} color="emerald" size="sm" />
          </div>
        </GlassPanel>
      </div>
    </motion.div>
  );
}
