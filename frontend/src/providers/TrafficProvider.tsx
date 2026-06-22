'use client';

import { createContext, useContext, useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { API_BASE_URL, API_KEY } from '@/constants';

const API_HEADERS = {
  'X-API-Key': API_KEY,
  'Content-Type': 'application/json',
};

export interface RequestLog {
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

interface TrafficStats {
  total: number;
  avgLatency: number;
  light: number;
  medium: number;
  heavy: number;
  rps: number;
}

interface TrafficContextType {
  running: boolean;
  scenario: string;
  setScenario: (s: string) => void;
  logs: RequestLog[];
  stats: TrafficStats;
  handleToggle: () => void;
}

const TrafficContext = createContext<TrafficContextType | undefined>(undefined);

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

  const pool = endpoints[scenario as keyof typeof endpoints] || endpoints['Uniform Traffic'];
  const choice = pool[Math.floor(Math.random() * pool.length)];

  return {
    method: choice.method,
    endpoint: choice.endpoint,
    payload_bytes: Math.round(choice.pb()),
    source_id: `frontend_sim_${Date.now()}`,
  };
}

export function TrafficProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false);
  const [scenario, setScenario] = useState('Uniform Traffic');
  const [logs, setLogs] = useState<RequestLog[]>([]);
  const [stats, setStats] = useState<TrafficStats>({ total: 0, avgLatency: 0, light: 0, medium: 0, heavy: 0, rps: 0 });
  
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statsRef = useRef({ total: 0, totalLatency: 0, light: 0, medium: 0, heavy: 0, startTime: 0 });

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
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      setRunning(false);
    } else {
      setLogs([]);
      statsRef.current = { total: 0, totalLatency: 0, light: 0, medium: 0, heavy: 0, startTime: Date.now() };
      setStats({ total: 0, avgLatency: 0, light: 0, medium: 0, heavy: 0, rps: 0 });
      setRunning(true);

      intervalRef.current = setInterval(() => {
        sendRequest();
        sendRequest();
      }, 400);
    }
  };

  useEffect(() => {
    if (running && intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        sendRequest();
        sendRequest();
      }, 400);
    }
  }, [sendRequest, running]);

  // Clean up on complete unmount (though this provider wraps the whole app so it shouldn't unmount)
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return (
    <TrafficContext.Provider value={{ running, scenario, setScenario, logs, stats, handleToggle }}>
      {children}
    </TrafficContext.Provider>
  );
}

export function useTraffic() {
  const context = useContext(TrafficContext);
  if (context === undefined) {
    throw new Error('useTraffic must be used within a TrafficProvider');
  }
  return context;
}
