import { create } from 'zustand';
import type { NodeMetrics, SimulationStatus, Alert, RoutingResult } from '@/types';

// --- Simulation Store ---
interface SimulationState {
  status: SimulationStatus;
  setStatus: (s: SimulationStatus) => void;
}

export const useSimulationStore = create<SimulationState>((set) => ({
  status: {
    state: 'idle',
    scenario: '',
    rps: 0,
    duration_sec: 0,
    elapsed_sec: 0,
    total_requests: 0,
    errors: 0,
  },
  setStatus: (status) => set({ status }),
}));

// --- Node Store ---
interface NodeState {
  nodes: Record<string, NodeMetrics>;
  updateNode: (id: string, m: NodeMetrics) => void;
  updateAll: (nodes: NodeMetrics[]) => void;
}

export const useNodeStore = create<NodeState>((set) => ({
  nodes: {},
  updateNode: (id, m) => set((s) => ({ nodes: { ...s.nodes, [id]: m } })),
  updateAll: (nodes) =>
    set({
      nodes: Object.fromEntries(nodes.map((n) => [n.node_id, n])),
    }),
}));

// --- Alert Store ---
interface AlertState {
  alerts: Alert[];
  addAlert: (a: Alert) => void;
  acknowledge: (id: string) => void;
  clearAll: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  alerts: [],
  addAlert: (a) => set((s) => ({ alerts: [a, ...s.alerts].slice(0, 100) })),
  acknowledge: (id) =>
    set((s) => ({
      alerts: s.alerts.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
    })),
  clearAll: () => set({ alerts: [] }),
}));

// --- Routing Store ---
interface RoutingState {
  recentRequests: RoutingResult[];
  totalRouted: number;
  addResult: (r: RoutingResult) => void;
}

export const useRoutingStore = create<RoutingState>((set) => ({
  recentRequests: [],
  totalRouted: 0,
  addResult: (r) =>
    set((s) => ({
      recentRequests: [r, ...s.recentRequests].slice(0, 50),
      totalRouted: s.totalRouted + 1,
    })),
}));

// --- WebSocket Store ---
interface WsState {
  connected: boolean;
  lastPing: number;
  setConnected: (c: boolean) => void;
  setPing: (t: number) => void;
}

export const useWsStore = create<WsState>((set) => ({
  connected: false,
  lastPing: 0,
  setConnected: (connected) => set({ connected }),
  setPing: (lastPing) => set({ lastPing }),
}));
