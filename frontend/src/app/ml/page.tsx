'use client';

import { motion } from 'framer-motion';
import { SectionHeader, GlassPanel, Badge, StatCard, ProgressBar } from '@/components/ui';
import { Brain, Search, Play, Loader2 } from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';
import { API_BASE_URL, API_KEY } from '@/constants';

const API_HEADERS = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json',
};

interface ClassifierStats {
  loaded: boolean;
  model_path: string;
  total_predictions: number;
  total_fallbacks: number;
  avg_inference_ms: number;
  confidence_threshold: number;
  fallback_rate: number;
  rolling_accuracy?: number;
  drift_info?: {
    rolling_accuracy: number;
    psi_scores: Record<string, number>;
    drift_detected: boolean;
  };
}

interface PredictionResult {
  request_id: string;
  predicted_class: string;
  confidence: number;
  assigned_node: string;
  routing_hops: number;
  allocation_score: number;
  feature_vector?: number[];
}

// Feature names corresponding to the 8-dim vector
const FEATURE_NAMES = [
  'payload_bytes_norm',
  'cpu_estimate',
  'endpoint_id_norm',
  'requests_last_5s',
  'avg_latency_ema',
  'queue_depth',
  'hour_of_day',
  'is_burst',
];

export default function MLInsightsPage() {
  const [classifierStats, setClassifierStats] = useState<ClassifierStats | null>(null);
  const [predicting, setPredicting] = useState(false);
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [predPayload, setPredPayload] = useState({ method: 'POST', endpoint: '/api/inference', payload_bytes: 120000 });

  // Fetch classifier stats from backend
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/classifier`, {
        headers: API_HEADERS,
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) setClassifierStats(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStats();
    const iv = setInterval(fetchStats, 3000);
    return () => clearInterval(iv);
  }, [fetchStats]);

  // Send a test request and show the prediction result
  const runPrediction = useCallback(async () => {
    setPredicting(true);
    setPrediction(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/request`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify({
          ...predPayload,
          source_id: `ml_test_${Date.now()}`,
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json();
        setPrediction(data);
      }
    } catch { /* ignore */ }
    setPredicting(false);
  }, [predPayload]);

  const loaded = classifierStats?.loaded ?? false;
  const driftInfo = classifierStats?.drift_info;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">ML Insights</h1>
          <p className="text-sm text-zinc-500 mt-1">Live XGBoost classifier status and feature analysis</p>
        </div>
        <Badge variant={loaded ? 'success' : 'warning'}>{loaded ? 'ML Active' : 'Heuristic Fallback'}</Badge>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Predictions"
          value={(classifierStats?.total_predictions ?? 0).toLocaleString()}
          icon={Brain}
          color="indigo"
        />
        <StatCard
          label="Avg Inference"
          value={`${(classifierStats?.avg_inference_ms ?? 0).toFixed(3)} ms`}
          icon={Brain}
          color="emerald"
        />
        <StatCard
          label="Fallback Rate"
          value={`${((classifierStats?.fallback_rate ?? 0) * 100).toFixed(1)}%`}
          icon={Brain}
          color="amber"
        />
        <StatCard
          label="Rolling Accuracy"
          value={`${((driftInfo?.rolling_accuracy ?? classifierStats?.rolling_accuracy ?? 0) * 100).toFixed(1)}%`}
          icon={Brain}
          color="cyan"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Feature Importance from PSI Scores (Live) */}
        <GlassPanel>
          <SectionHeader title="Feature Importance (from PSI Analysis)" />
          <div className="mt-6 space-y-4">
            <p className="text-sm text-zinc-400 mb-4">
              {driftInfo && Object.keys(driftInfo.psi_scores || {}).length > 0
                ? 'Live PSI scores showing feature distribution stability vs training data.'
                : 'Feature importance based on model architecture. Send traffic to see live PSI drift scores.'}
            </p>
            {driftInfo && Object.keys(driftInfo.psi_scores || {}).length > 0 ? (
              // Live PSI data from backend
              Object.entries(driftInfo.psi_scores)
                .sort(([, a], [, b]) => b - a)
                .map(([name, psi]) => (
                  <div key={name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-300 font-mono">{name}</span>
                      <span className={`font-mono ${
                        psi > 0.2 ? 'text-rose-400' : psi > 0.1 ? 'text-amber-400' : 'text-emerald-400'
                      }`}>PSI: {psi.toFixed(4)}</span>
                    </div>
                    <div className="h-1.5 bg-black/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          psi > 0.2 ? 'bg-rose-500' : psi > 0.1 ? 'bg-amber-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(psi / 0.3, 1) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
            ) : (
              // Default feature list when no live data
              FEATURE_NAMES.map((name, i) => {
                const importance = [0.85, 0.55, 0.45, 0.35, 0.25, 0.20, 0.15, 0.10][i];
                return (
                  <div key={name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-300 font-mono">{name}</span>
                      <span className="text-zinc-500">{importance.toFixed(2)}</span>
                    </div>
                    <div className="h-1.5 bg-black/50 rounded-full overflow-hidden">
                      <div className="h-full bg-indigo-500" style={{ width: `${importance * 100}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </GlassPanel>

        {/* Live Prediction Test */}
        <GlassPanel>
          <SectionHeader title="Test Prediction (Live)" icon={Search} />
          <div className="mt-4 space-y-4">
            {/* Input Controls */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Method</label>
                <select
                  value={predPayload.method}
                  onChange={(e) => setPredPayload(p => ({ ...p, method: e.target.value }))}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-brand-500/50"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1">Payload (bytes)</label>
                <input
                  type="number"
                  value={predPayload.payload_bytes}
                  onChange={(e) => setPredPayload(p => ({ ...p, payload_bytes: Number(e.target.value) }))}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-300 font-mono focus:outline-none focus:border-brand-500/50"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">Endpoint</label>
              <input
                type="text"
                value={predPayload.endpoint}
                onChange={(e) => setPredPayload(p => ({ ...p, endpoint: e.target.value }))}
                className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-zinc-300 font-mono focus:outline-none focus:border-brand-500/50"
              />
            </div>
            <button
              onClick={runPrediction}
              disabled={predicting}
              className="w-full py-2.5 rounded-lg bg-brand-500/20 text-brand-400 font-semibold text-sm hover:bg-brand-500/30 transition-colors flex items-center justify-center gap-2 border border-brand-500/30"
            >
              {predicting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {predicting ? 'Predicting...' : 'Send & Classify'}
            </button>

            {/* Prediction Result */}
            {prediction && (
              <div className="p-4 bg-black/30 rounded-lg border border-white/5 space-y-3">
                <div className="flex justify-between items-center pb-3 border-b border-white/5">
                  <div>
                    <div className="text-xs text-zinc-500 font-mono">{prediction.request_id}</div>
                    <div className="text-sm font-semibold text-white">{predPayload.method} {predPayload.endpoint}</div>
                  </div>
                  <Badge variant={
                    prediction.predicted_class === 'Heavy' ? 'danger' :
                    prediction.predicted_class === 'Medium' ? 'warning' : 'success'
                  }>
                    Predicted: {prediction.predicted_class}
                  </Badge>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Confidence</span>
                    <span className="text-brand-400 font-mono font-bold">{(prediction.confidence * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Assigned Node</span>
                    <span className="text-cyan-400 font-mono">{prediction.assigned_node}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Allocation Score</span>
                    <span className="text-zinc-300 font-mono">{(prediction.allocation_score ?? 0).toFixed(4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Routing Hops</span>
                    <span className="text-zinc-300 font-mono">{prediction.routing_hops}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </GlassPanel>
      </div>
    </motion.div>
  );
}
