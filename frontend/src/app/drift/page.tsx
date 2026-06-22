'use client';

import { motion } from 'framer-motion';
import { SectionHeader, GlassPanel, Badge, StatCard } from '@/components/ui';
import { Activity, AlertTriangle, Shield, TrendingDown } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, API_KEY } from '@/constants';

const API_HEADERS = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json',
};

interface DriftInfo {
  rolling_accuracy: number;
  outcome_count: number;
  feature_buffer_size: number;
  psi_scores: Record<string, number>;
  max_psi: number;
  psi_threshold: number;
  drift_detected: boolean;
  drifted_features: string[];
  retrain_recommended: boolean;
}

interface ClassifierStats {
  loaded: boolean;
  total_predictions: number;
  total_fallbacks: number;
  avg_inference_ms: number;
  fallback_rate: number;
  rolling_accuracy: number;
  drift_info: DriftInfo;
}

export default function DriftAnalysisPage() {
  const [stats, setStats] = useState<ClassifierStats | null>(null);
  const [isLive, setIsLive] = useState(false);

  const fetchDrift = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/classifier`, {
        headers: API_HEADERS,
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
        setIsLive(true);
      }
    } catch {
      setIsLive(false);
    }
  }, []);

  useEffect(() => {
    fetchDrift();
    const iv = setInterval(fetchDrift, 3000);
    return () => clearInterval(iv);
  }, [fetchDrift]);

  const drift = stats?.drift_info;
  const psiScores = drift?.psi_scores || {};
  const hasPsiData = Object.keys(psiScores).length > 0;

  // Build the table data from live PSI scores or show waiting state
  const tableData = hasPsiData
    ? Object.entries(psiScores).map(([feature, psi]) => ({
        feature,
        psi,
        status: psi > 0.2 ? 'drift' as const : psi > 0.1 ? 'warning' as const : 'stable' as const,
      })).sort((a, b) => b.psi - a.psi)
    : [
        // Show feature names with "awaiting data" when no PSI data yet
        'payload_bytes', 'cpu_estimate', 'endpoint_id', 'requests_last_5s',
        'avg_latency_ema', 'queue_depth', 'hour_of_day', 'is_burst',
      ].map(f => ({ feature: f, psi: 0, status: 'stable' as const }));

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Concept Drift Detection</h1>
          <p className="text-sm text-zinc-500 mt-1">
            Population Stability Index (PSI) monitoring for 8-dim feature pipeline
          </p>
        </div>
        <Badge variant={drift?.drift_detected ? 'danger' : isLive ? 'success' : 'info'}>
          {drift?.drift_detected ? 'Drift Detected!' : isLive ? 'Monitoring Active' : 'Connecting...'}
        </Badge>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Rolling Accuracy"
          value={`${((drift?.rolling_accuracy ?? 0) * 100).toFixed(1)}%`}
          icon={Shield}
          color={drift && drift.rolling_accuracy < 0.9 ? 'rose' : 'emerald'}
        />
        <StatCard
          label="Max PSI"
          value={(drift?.max_psi ?? 0).toFixed(4)}
          icon={TrendingDown}
          color={drift && drift.max_psi > 0.2 ? 'rose' : drift && drift.max_psi > 0.1 ? 'amber' : 'emerald'}
        />
        <StatCard
          label="Outcomes Tracked"
          value={(drift?.outcome_count ?? 0).toLocaleString()}
          icon={Activity}
          color="cyan"
        />
        <StatCard
          label="Feature Samples"
          value={(drift?.feature_buffer_size ?? 0).toLocaleString()}
          icon={Activity}
          color="indigo"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <GlassPanel>
            <SectionHeader
              title="Feature Distribution Stability (PSI)"
              subtitle={hasPsiData ? '● Live from classifier' : 'Awaiting 100+ feature samples...'}
            />
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
                  {tableData.map((item, idx) => (
                    <tr key={idx} className="border-b border-white/5">
                      <td className="px-4 py-3 font-mono text-zinc-300">{item.feature}</td>
                      <td className="px-4 py-3 font-mono">
                        {hasPsiData ? (
                          <span className={
                            item.psi > 0.2 ? 'text-rose-400' : item.psi > 0.1 ? 'text-amber-400' : 'text-emerald-400'
                          }>
                            {item.psi.toFixed(4)}
                          </span>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {!hasPsiData ? (
                          <Badge variant="info">Awaiting Data</Badge>
                        ) : item.status === 'stable' ? (
                          <Badge variant="success">Stable (&lt;0.1)</Badge>
                        ) : item.status === 'warning' ? (
                          <Badge variant="warning">Warning (0.1-0.2)</Badge>
                        ) : (
                          <Badge variant="danger">Drifted (&gt;0.2)</Badge>
                        )}
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
              {drift?.retrain_recommended ? (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-rose-400 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-rose-300">Model Retraining Recommended</h4>
                      <p className="text-xs text-rose-400/80 mt-1">
                        {drift.drifted_features.length > 0
                          ? `${drift.drifted_features.length} feature(s) show significant drift (PSI > ${drift.psi_threshold}): ${drift.drifted_features.join(', ')}`
                          : `Rolling accuracy dropped below 90% (currently ${(drift.rolling_accuracy * 100).toFixed(1)}%)`}
                      </p>
                    </div>
                  </div>
                </div>
              ) : drift && isLive ? (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Shield className="w-4 h-4 text-emerald-400 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-emerald-300">No Drift Detected</h4>
                      <p className="text-xs text-emerald-400/80 mt-1">
                        All features are within stable PSI range. Model accuracy is {((drift.rolling_accuracy) * 100).toFixed(1)}%.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-zinc-800/50 border border-white/5 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Activity className="w-4 h-4 text-zinc-500 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-zinc-400">Collecting Data</h4>
                      <p className="text-xs text-zinc-500 mt-1">
                        Send traffic via the Traffic Generator to start drift monitoring. At least 100 feature samples are needed.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Threshold Info */}
              <div className="p-3 bg-white/[0.02] rounded-lg border border-white/5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-zinc-500">PSI Threshold</span>
                  <span className="text-amber-400 font-mono">{drift?.psi_threshold ?? 0.20}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Window Size</span>
                  <span className="text-zinc-400 font-mono">500 outcomes</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Classifier Status</span>
                  <Badge variant={stats?.loaded ? 'success' : 'warning'}>
                    {stats?.loaded ? 'XGBoost' : 'Heuristic'}
                  </Badge>
                </div>
              </div>
            </div>
          </GlassPanel>
        </div>
      </div>
    </motion.div>
  );
}
