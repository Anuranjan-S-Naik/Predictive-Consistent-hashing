'use client';

import { motion } from 'framer-motion';
import { SectionHeader, GlassPanel, Badge, StatCard, ProgressBar } from '@/components/ui';
import { Zap, Play, Square, Activity, Server, Brain, Clock } from 'lucide-react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { API_BASE_URL, API_KEY, CLASS_COLORS } from '@/constants';

const API_HEADERS = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json',
};

interface RequestLog {
  id: string;
  timestamp: number;
  method: string;
  endpoint: string;
  payloadBytes: number;
  predictedClass: string;
  confidence: number;
  assignedNode: string;
  latencyMs: number;
  routingHops: number;
}

// Generate realistic request payloads based on scenario type
function generatePayload(scenario: string): { method: string; endpoint: string; payload_bytes: number; source_id: string } {
  const endpoints = {
    'Uniform Traffic': [
      { method: 'GET', endpoint: '/api/status', pb: () => 128 + Math.random() * 512 },
      { method: 'GET', endpoint: '/api/data', pb: () => 256 + Math.random() * 2048 },
      { method: 'POST', endpoint: '/api/search', pb: () => 1024 + Math.random() * 8192 },
      { method: 'POST', endpoint: '/api/submit', pb: () => 512 + Math.random() * 4096 },
    ],
    'Flash Crowd': [
      { method: 'GET', endpoint: '/api/trending', pb: () => 512 + Math.random() * 4096 },
      { method: 'POST', endpoint: '/api/search', pb: () => 2048 + Math.random() * 16384 },
      { method: 'POST', endpoint: '/api/inference', pb: () => 8192 + Math.random() * 65536 },
      { method: 'GET', endpoint: '/api/feed', pb: () => 1024 + Math.random() * 8192 },
    ],
    'Heavy Burst': [
      { method: 'POST', endpoint: '/api/inference', pb: () => 65536 + Math.random() * 131072 },
      { method: 'POST', endpoint: '/api/train', pb: () => 131072 + Math.random() * 262144 },
      { method: 'POST', endpoint: '/api/batch', pb: () => 32768 + Math.random() * 65536 },
      { method: 'POST', endpoint: '/api/transform', pb: () => 16384 + Math.random() * 131072 },
    ],
    'Mixed Workload': [
      { method: 'GET', endpoint: '/api/status', pb: () => 64 + Math.random() * 256 },
      { method: 'POST', endpoint: '/api/search', pb: () => 2048 + Math.random() * 16384 },
      { method: 'POST', endpoint: '/api/inference', pb: () => 65536 + Math.random() * 131072 },
      { method: 'GET', endpoint: '/api/data', pb: () => 512 + Math.random() * 4096 },
    ],
  };

  const pool = endpoints[scenario] || endpoints['Uniform Traffic'];
  const choice = pool[Math.floor(Math.random() * pool.length)];

  return {
    method: choice.method,
    endpoint: choice.endpoint,
    payload_bytes: Math.round(choice.pb()),
    source_id: `frontend_sim_${Date.now()}`,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

export default function TrafficGeneratorPage() {
  const [running, setRunning] = useState(false);
  const [scenario, setScenario] = useState('Uniform Traffic');
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [stats, setStats] = useState({ total: 0, avgLatency: 0, light: 0, medium: 0, heavy: 0, rps: 0 });
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef({ total: 0, totalLatency: 0, light: 0, medium: 0, heavy: 0, startTime: 0 });

  const scenarios = ['Uniform Traffic', 'Flash Crowd', 'Heavy Burst', 'Mixed Workload'];

  // Auto-scroll the log feed to bottom
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const sendRequest = useCallback(async () => {
    const payload = generatePayload(scenario);
    const start = performance.now();

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/request`, {
        method: 'POST',
        headers: API_HEADERS,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });

      const elapsed = performance.now() - start;

      if (res.ok) {
        const data = await res.json();
        const entry: RequestLog = {
          id: data.request_id || `req_${Date.now()}`,
          timestamp: Date.now(),
          method: payload.method,
          endpoint: payload.endpoint,
          payloadBytes: payload.payload_bytes,
          predictedClass: data.predicted_class || 'Medium',
          confidence: data.confidence || 0,
          assignedNode: data.assigned_node || 'unknown',
          latencyMs: elapsed,
          routingHops: data.routing_hops || 1,
        };

        // Update stats
        const s = statsRef.current;
        s.total += 1;
        s.totalLatency += elapsed;
        if (entry.predictedClass === 'Light') s.light += 1;
        else if (entry.predictedClass === 'Medium') s.medium += 1;
        else s.heavy += 1;

        const elapsedSec = (Date.now() - s.startTime) / 1000 || 1;

        setStats({
          total: s.total,
          avgLatency: s.totalLatency / s.total,
          light: s.light,
          medium: s.medium,
          heavy: s.heavy,
          rps: s.total / elapsedSec,
        });

        setLogs(prev => {
          const next = [...prev, entry];
          return next.length > 200 ? next.slice(-200) : next;
        });
      }
    } catch {
      // Silently skip failed requests
    }
  }, [scenario]);

  const handleToggle = () => {
    if (running) {
      // Stop
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setRunning(false);
    } else {
      // Start
      setLogs([]);
      statsRef.current = { total: 0, totalLatency: 0, light: 0, medium: 0, heavy: 0, startTime: Date.now() };
      setStats({ total: 0, avgLatency: 0, light: 0, medium: 0, heavy: 0, rps: 0 });
      setRunning(true);

      // Send requests at ~5 RPS from the browser
      intervalRef.current = setInterval(() => {
        sendRequest();
        sendRequest();
      }, 400);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Update sendRequest reference in interval when scenario changes
  useEffect(() => {
    if (running && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        sendRequest();
        sendRequest();
      }, 400);
    }
  }, [sendRequest, running]);

  const classColor = (cls: string) => {
    if (cls === 'Light') return 'text-emerald-400';
    if (cls === 'Heavy') return 'text-rose-400';
    return 'text-amber-400';
  };

  const methodColor = (m: string) => m === 'POST' ? 'text-brand-400' : 'text-cyan-400';

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Traffic Generator</h1>
          <p className="text-sm text-zinc-500 mt-1">Send real requests to the coordinator and observe live routing decisions</p>
        </div>
        <Badge variant={running ? 'success' : 'info'}>{running ? 'Generating Traffic' : 'Idle'}</Badge>
      </div>

      {/* Live Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Sent" value={stats.total.toLocaleString()} icon={Zap} color="cyan" />
        <StatCard label="Avg Latency" value={`${stats.avgLatency.toFixed(1)}ms`} icon={Clock} color="indigo" />
        <StatCard label="Throughput" value={`${stats.rps.toFixed(1)} RPS`} icon={Activity} color="emerald" />
        <StatCard label="Heavy Requests" value={stats.heavy.toLocaleString()} icon={Brain} color="rose" />
      </div>

      {/* Class Distribution Bar */}
      {stats.total > 0 && (
        <GlassPanel>
          <SectionHeader title="Live Class Distribution" subtitle={`${stats.total} requests classified`} />
          <div className="grid grid-cols-3 gap-4 mt-3">
            {[
              { label: 'Light', count: stats.light, color: 'emerald' },
              { label: 'Medium', count: stats.medium, color: 'amber' },
              { label: 'Heavy', count: stats.heavy, color: 'rose' },
            ].map(c => (
              <div key={c.label}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-zinc-400">{c.label}</span>
                  <span className="text-zinc-500 font-mono">{((c.count / stats.total) * 100).toFixed(1)}%</span>
                </div>
                <ProgressBar value={(c.count / stats.total) * 100} color={c.color as any} size="sm" />
              </div>
            ))}
          </div>
        </GlassPanel>
      )}

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
          <SectionHeader title="Live Request Feed" subtitle={running ? '● Streaming' : undefined} />

          <div className="mt-4 bg-black/40 rounded-lg border border-white/[0.05] p-4 h-[400px] overflow-y-auto font-mono text-xs space-y-1">
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-600">
                {running ? 'Connecting to coordinator...' : 'Select a scenario and click Start to send real requests.'}
              </div>
            ) : (
              <>
                {logs.map((log) => (
                  <div key={log.id} className="flex items-center gap-2 py-0.5 border-b border-white/[0.02]">
                    <span className={`font-bold w-10 ${methodColor(log.method)}`}>{log.method}</span>
                    <span className="text-zinc-300 w-32 truncate">{log.endpoint}</span>
                    <span className="text-zinc-600 w-14 text-right">{formatBytes(log.payloadBytes)}</span>
                    <span className="text-zinc-600 mx-1">→</span>
                    <span className={`font-semibold w-14 ${classColor(log.predictedClass)}`}>{log.predictedClass}</span>
                    <span className="text-zinc-500 w-10 text-right">{(log.confidence * 100).toFixed(0)}%</span>
                    <span className="text-zinc-600 mx-1">→</span>
                    <span className="text-cyan-400 w-16">{log.assignedNode.replace('node_', 'S')}</span>
                    <span className="text-zinc-500 ml-auto">{log.latencyMs.toFixed(0)}ms</span>
                  </div>
                ))}
                <div ref={logsEndRef} />
                {running && <div className="animate-pulse text-zinc-600 pt-1">Sending requests...</div>}
              </>
            )}
          </div>
        </GlassPanel>
      </div>
    </motion.div>
  );
}
