'use client';

import { motion } from 'framer-motion';
import { SectionHeader, GlassPanel, Badge, StatCard, ProgressBar } from '@/components/ui';
import { Activity, AlertTriangle, Shield, Brain, TrendingUp } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, API_KEY } from '@/constants';

const API_HEADERS = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json',
};

interface ClassifierStats {
  loaded: boolean;
  total_predictions: number;
  total_fallbacks: number;
  avg_inference_ms: number;
  fallback_rate: number;
  rolling_accuracy: number;
  drift_info: {
    rolling_accuracy: number;
    outcome_count: number;
    feature_buffer_size: number;
    psi_scores: Record<string, number>;
    max_psi: number;
    psi_threshold: number;
    drift_detected: boolean;
    drifted_features: string[];
    retrain_recommended: boolean;
  };
}

interface ForecasterStatus {
  running: boolean;
  model_loaded: boolean;
  model_type: string;
  total_runs: number;
  last_prediction: number;
  burst_imminent: boolean;
  internal_window_fill: number;
  window_size: number;
}

export default function ModelHealthPage() {
  const [classifier, setClassifier] = useState<ClassifierStats | null>(null);
  const [forecaster, setForecaster] = useState<ForecasterStatus | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [accuracyHistory, setAccuracyHistory] = useState<{ acc: number; psi: number; time: number }[]>([]);

  const fetchHealth = useCallback(async () => {
    try {
      const [cRes, fRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/v1/classifier`, { headers: API_HEADERS, signal: AbortSignal.timeout(4000) }),
        fetch(`${API_BASE_URL}/api/v1/forecast`, { headers: API_HEADERS, signal: AbortSignal.timeout(4000) }),
      ]);

      if (cRes.ok) {
        const data = await cRes.json();
        setClassifier(data);
        setIsLive(true);

        // Build accuracy history over time
        const acc = data.drift_info?.rolling_accuracy ?? data.rolling_accuracy ?? 0;
        const psi = data.drift_info?.max_psi ?? 0;
        setAccuracyHistory(prev => {
          const next = [...prev, { acc, psi, time: Date.now() }];
          return next.length > 30 ? next.slice(-30) : next;
        });
      } else {
        setIsLive(false);
      }

      if (fRes.ok) setForecaster(await fRes.json());
    } catch {
      setIsLive(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const iv = setInterval(fetchHealth, 5000);
    return () => clearInterval(iv);
  }, [fetchHealth]);

  const drift = classifier?.drift_info;
  const rollingAcc = drift?.rolling_accuracy ?? 0;
  const maxPsi = drift?.max_psi ?? 0;
  const psiThreshold = drift?.psi_threshold ?? 0.2;
  const driftDetected = drift?.drift_detected ?? false;
  const retrainRecommended = drift?.retrain_recommended ?? false;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Model Health & Drift</h1>
          <p className="text-sm text-zinc-500 mt-1">Live PSI and accuracy tracking from classifier pipeline</p>
        </div>
        <Badge variant={driftDetected ? 'danger' : isLive ? 'success' : 'info'}>
          {driftDetected ? 'Warning: Data Drift Detected' : isLive ? 'Models Healthy' : 'Connecting...'}
        </Badge>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Rolling Accuracy"
          value={`${(rollingAcc * 100).toFixed(1)}%`}
          icon={Shield}
          color={rollingAcc < 0.9 ? 'rose' : 'emerald'}
        />
        <StatCard
          label="Max PSI"
          value={maxPsi.toFixed(4)}
          icon={TrendingUp}
          color={maxPsi > psiThreshold ? 'rose' : maxPsi > 0.1 ? 'amber' : 'emerald'}
        />
        <StatCard
          label="Classifier Predictions"
          value={(classifier?.total_predictions ?? 0).toLocaleString()}
          icon={Brain}
          color="indigo"
        />
        <StatCard
          label="Forecaster Runs"
          value={(forecaster?.total_runs ?? 0).toLocaleString()}
          icon={Activity}
          color="cyan"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          {/* Drift Alert Card */}
          <GlassPanel>
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                retrainRecommended ? 'bg-amber-500/20' : 'bg-emerald-500/20'
              }`}>
                {retrainRecommended ? (
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                ) : (
                  <Shield className="w-5 h-5 text-emerald-500" />
                )}
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">
                  {retrainRecommended ? 'Data Drift Detected' : 'Models Healthy'}
                </h3>
                <p className="text-sm text-zinc-400">
                  {retrainRecommended ? (
                    <>
                      {drift?.drifted_features && drift.drifted_features.length > 0 ? (
                        <>Feature distribution for <code className="text-amber-300">{drift.drifted_features[0]}</code> has shifted. PSI is <strong className="text-rose-400">{maxPsi.toFixed(4)}</strong> (Threshold: {psiThreshold}).</>
                      ) : (
                        <>Rolling accuracy dropped to <strong className="text-rose-400">{(rollingAcc * 100).toFixed(1)}%</strong>. Consider retraining.</>
                      )}
                    </>
                  ) : isLive ? (
                    <>All features within stable PSI range. Model accuracy is {(rollingAcc * 100).toFixed(1)}%.</>
                  ) : (
                    <>Send traffic to begin health monitoring. Classifier and forecaster will report metrics automatically.</>
                  )}
                </p>
                {retrainRecommended && (
                  <button className="mt-4 px-4 py-2 bg-amber-500/10 text-amber-500 text-sm font-medium rounded-lg border border-amber-500/20 hover:bg-amber-500/20 transition-colors w-full">
                    Trigger Retraining Pipeline
                  </button>
                )}
              </div>
            </div>
          </GlassPanel>

          {/* Current Metrics */}
          <GlassPanel>
            <SectionHeader title="Current Metrics" subtitle={isLive ? '● Live' : undefined} />
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-zinc-400">Rolling Accuracy</span>
                  <span className={`font-bold font-mono ${rollingAcc < 0.9 ? 'text-amber-400' : 'text-emerald-400'}`}>
                    {(rollingAcc * 100).toFixed(1)}%
                  </span>
                </div>
                <ProgressBar value={rollingAcc * 100} color={rollingAcc < 0.9 ? 'amber' : 'emerald'} size="sm" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-zinc-400">Max PSI</span>
                  <span className={`font-bold font-mono ${maxPsi > psiThreshold ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {maxPsi.toFixed(4)}
                  </span>
                </div>
                <ProgressBar value={(maxPsi / 0.3) * 100} color={maxPsi > psiThreshold ? 'rose' : 'emerald'} size="sm" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-zinc-400">Classifier Inference</span>
                  <span className="text-zinc-300 font-mono">{(classifier?.avg_inference_ms ?? 0).toFixed(3)} ms</span>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-zinc-400">Fallback Rate</span>
                  <span className="text-zinc-300 font-mono">{((classifier?.fallback_rate ?? 0) * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </GlassPanel>

          {/* Component Status */}
          <GlassPanel>
            <SectionHeader title="Component Status" />
            <div className="space-y-2 text-sm mt-3">
              {[
                { label: 'XGBoost Classifier', ok: classifier?.loaded ?? false },
                { label: 'GRU Forecaster', ok: forecaster?.model_loaded ?? false },
                { label: 'Forecaster Loop', ok: forecaster?.running ?? false },
                { label: 'Drift Monitor', ok: (drift?.outcome_count ?? 0) > 0 },
              ].map(c => (
                <div key={c.label} className="flex items-center justify-between py-1">
                  <span className="text-zinc-400">{c.label}</span>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${c.ok ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                    <span className={`text-xs ${c.ok ? 'text-emerald-400' : 'text-zinc-600'}`}>
                      {c.ok ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </GlassPanel>
        </div>

        {/* Accuracy & PSI Chart */}
        <GlassPanel className="lg:col-span-2 flex flex-col">
          <SectionHeader title="Accuracy vs PSI Over Time" subtitle={isLive ? '● Live' : 'Waiting for data...'} />
          <div className="flex-1 min-h-[350px] mt-4">
            {accuracyHistory.length > 2 ? (
              <div className="h-full flex flex-col">
                {/* Chart area */}
                <div className="flex-1 relative flex items-end gap-1">
                  {accuracyHistory.map((point, i) => {
                    const accH = point.acc * 100;
                    const psiH = Math.min((point.psi / 0.3) * 100, 100);
                    return (
                      <div key={i} className="flex-1 flex gap-px h-full items-end relative group">
                        <div className="flex-1 rounded-t-sm bg-emerald-500/30 transition-all duration-300"
                          style={{ height: `${accH}%` }} />
                        <div className="flex-1 rounded-t-sm bg-rose-500/30 transition-all duration-300"
                          style={{ height: `${psiH}%` }} />
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 hidden group-hover:block
                          bg-surface-2 border border-white/[0.08] rounded-lg px-2 py-1 text-[10px] whitespace-nowrap z-10">
                          <p className="text-emerald-400">Acc: {(point.acc * 100).toFixed(1)}%</p>
                          <p className="text-rose-400">PSI: {point.psi.toFixed(4)}</p>
                        </div>
                      </div>
                    );
                  })}
                  {/* PSI threshold line */}
                  <div
                    className="absolute left-0 right-0 border-t border-dashed border-amber-500/50"
                    style={{ bottom: `${(psiThreshold / 0.3) * 100}%` }}
                  >
                    <span className="absolute right-0 -top-4 text-[10px] text-amber-400">Drift Threshold</span>
                  </div>
                </div>
                <div className="flex items-center gap-6 mt-3 text-xs">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-emerald-500/60" />Accuracy</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-1.5 rounded-full bg-rose-500/60" />Max PSI</span>
                  <span className="flex items-center gap-1.5"><span className="w-8 h-0 border-t border-dashed border-amber-500/60" />Threshold</span>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                Send traffic to populate the accuracy/PSI chart over time
              </div>
            )}
          </div>
          <p className="text-xs text-zinc-500 mt-4 text-center">
            As PSI (red) crosses the drift threshold, rolling accuracy (green) may decline due to concept drift.
          </p>
        </GlassPanel>
      </div>
    </motion.div>
  );
}
