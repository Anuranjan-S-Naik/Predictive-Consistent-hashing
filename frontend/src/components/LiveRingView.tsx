'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { NODE_COLORS, NODES } from '@/constants';
import type { RingData, AllocationData, DAAData } from '@/hooks/useRingData';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CX = 160, CY = 160, RING_R = 120;
const NODE_NAMES = ['S1', 'S2', 'S3', 'S4'];
const COLORS = [NODE_COLORS.node_s1, NODE_COLORS.node_s2, NODE_COLORS.node_s3, NODE_COLORS.node_s4];
const LIGHT_COLORS = ['#312e81', '#164e63', '#064e3b', '#78350f'];

// ---------------------------------------------------------------------------
// SVG Ring Drawing
// ---------------------------------------------------------------------------

interface RingDrawProps {
  nodeCount: number;
  vnodeCounts: number[];  // per-node vnode count
  loads: number[];        // per-node load value
  names: string[];
  colors: string[];
  lightColors: string[];
  dots?: { angle: number; heavy: boolean; id: number }[];
}

function drawRingSVG({
  nodeCount, vnodeCounts, loads, names, colors, lightColors, dots = []
}: RingDrawProps): React.ReactNode[] {
  const elements: React.ReactNode[] = [];

  // Ring background
  elements.push(
    <circle key="ring-bg" cx={CX} cy={CY} r={RING_R}
      fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
  );

  // Vnode positions for arcs
  const positions: { server: number; angle: number }[] = [];
  for (let s = 0; s < nodeCount; s++) {
    const count = vnodeCounts[s] || 1;
    // Distribute vnodes evenly around the ring, offset by server index
    for (let v = 0; v < Math.min(count, 12); v++) {
      // Scale down display: show max 12 dots per server for visual clarity
      const angle = ((s * (360 / nodeCount) + v * (360 / Math.min(count, 12))) % 360) / 360 * 2 * Math.PI - Math.PI / 2;
      positions.push({ server: s, angle });
    }
  }
  positions.sort((a, b) => a.angle - b.angle);

  // Color arcs between vnodes
  if (positions.length > 0) {
    for (let i = 0; i < positions.length; i++) {
      const a1 = positions[i].angle;
      let a2 = positions[(i + 1) % positions.length].angle;
      if (a2 <= a1) a2 += 2 * Math.PI;
      const steps = 24;
      const pts: string[] = [];
      for (let k = 0; k <= steps; k++) {
        const a = a1 + (a2 - a1) * k / steps;
        pts.push(`${CX + (RING_R - 7) * Math.cos(a)},${CY + (RING_R - 7) * Math.sin(a)}`);
      }
      elements.push(
        <path key={`arc-${i}`}
          d={`M${pts[0]} ${pts.slice(1).map(p => `L${p}`).join(' ')}`}
          fill="none" stroke={colors[positions[i].server]}
          strokeWidth="13" strokeOpacity="0.2" />
      );
    }
  }

  // Vnode dots on ring
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const x = CX + RING_R * Math.cos(p.angle);
    const y = CY + RING_R * Math.sin(p.angle);
    elements.push(
      <circle key={`vnode-${i}`} cx={x} cy={y} r="5"
        fill={colors[p.server]} stroke="rgb(10,10,20)" strokeWidth="2" />
    );
  }

  // Server labels in center
  for (let s = 0; s < nodeCount; s++) {
    const baseAngle = (s * (360 / nodeCount)) / 360 * 2 * Math.PI - Math.PI / 2;
    const lx = CX + 62 * Math.cos(baseAngle);
    const ly = CY + 62 * Math.sin(baseAngle);
    elements.push(
      <circle key={`label-bg-${s}`} cx={lx} cy={ly} r="24"
        fill={lightColors[s]} stroke={colors[s]} strokeWidth="1.5" opacity="0.9" />
    );
    elements.push(
      <text key={`label-name-${s}`} x={lx} y={ly - 5}
        textAnchor="middle" dominantBaseline="central"
        fontSize="14" fontWeight="600" fill={colors[s]}>
        {names[s]}
      </text>
    );
    elements.push(
      <text key={`label-count-${s}`} x={lx} y={ly + 10}
        textAnchor="middle" dominantBaseline="central"
        fontSize="9" fill={colors[s]} opacity="0.85">
        {vnodeCounts[s]} vnodes
      </text>
    );
  }

  // Flow dots
  for (let i = 0; i < dots.length; i++) {
    const dot = dots[i];
    elements.push(
      <circle key={`dot-${dot.id}`}
        cx={CX + RING_R * Math.cos(dot.angle)}
        cy={CY + RING_R * Math.sin(dot.angle)}
        r={dot.heavy ? 7 : 4}
        fill={dot.heavy ? '#f87171' : '#34d399'}
        opacity="0.9">
        <animate attributeName="opacity" values="0.9;0.3;0" dur="1.0s" fill="freeze" />
      </circle>
    );
  }

  return elements;
}

// ---------------------------------------------------------------------------
// LiveRingView Component
// ---------------------------------------------------------------------------

interface LiveRingViewProps {
  ring: RingData | null;
  allocation: AllocationData | null;
  daa: DAAData | null;
  connected: boolean;
  loading: boolean;
  error: string | null;
}

export function LiveRingView({ ring, allocation, daa, connected, loading, error }: LiveRingViewProps) {
  const [dots, setDots] = useState<{ angle: number; heavy: boolean; id: number }[]>([]);
  const dotCounterRef = useRef(0);

  // --- Derive Live data ---
  const liveVnodes = ring ? NODES.map(n => ring.nodes[n]?.vnode_count ?? 0) : [0, 0, 0, 0];
  const liveLoads = allocation ? NODES.map(n => {
    const m = allocation.node_metrics[n];
    return m ? m.cpu_pct : 0;
  }) : [0, 0, 0, 0];
  const liveThroughputs = allocation ? NODES.map(n => {
    const m = allocation.node_metrics[n];
    return m?.throughput_rps ?? 0;
  }) : [0, 0, 0, 0];

  // --- Spawn visual dots based on throughput_rps ---
  useEffect(() => {
    if (!connected || !allocation) return;
    
    const intervalId = setInterval(() => {
      let spawned = false;
      const newDots: { angle: number; heavy: boolean; id: number }[] = [];
      
      liveThroughputs.forEach((rps, sIdx) => {
        if (rps <= 0) return;
        
        // rps is requests per second. At 100ms interval, prob = rps / 10
        const prob = rps / 10;
        let toSpawn = Math.floor(prob);
        if (Math.random() < (prob - toSpawn)) toSpawn++;
        
        // Cap visual dots to avoid SVG clutter
        toSpawn = Math.min(toSpawn, 3);
        
        for (let i = 0; i < toSpawn; i++) {
          const vCount = liveVnodes[sIdx] || 1;
          const vIdx = Math.floor(Math.random() * Math.min(vCount, 12));
          // Match the arc positions formula in drawRingSVG
          const angle = ((sIdx * (360 / 4) + vIdx * (360 / Math.min(vCount, 12))) % 360) / 360 * 2 * Math.PI - Math.PI / 2;
          
          const cpu = liveLoads[sIdx];
          const isHeavy = Math.random() < (cpu / 150); // Higher CPU = more red dots
          newDots.push({ angle, heavy: isHeavy, id: dotCounterRef.current++ });
          spawned = true;
        }
      });
      
      if (spawned) {
        setDots(prev => {
          const combined = [...prev, ...newDots];
          return combined.slice(-35); // Keep max 35 dots on screen
        });
      }
    }, 100);
    
    return () => clearInterval(intervalId);
  }, [JSON.stringify(liveThroughputs), JSON.stringify(liveVnodes), JSON.stringify(liveLoads), connected]);

  // Smoothly expire old dots
  useEffect(() => {
    if (dots.length === 0) return;
    const t = setTimeout(() => {
      setDots(prev => prev.slice(1));
    }, 1000);
    return () => clearTimeout(t);
  }, [dots]);

  return (
    <div className="space-y-4">
      {/* Header Info */}
      <div className="flex items-center gap-3 justify-end">
        <span className="text-[11px] text-zinc-600 font-mono">
          {connected ? 'Polling every 2s' : 'Disconnected'}
        </span>
      </div>

      {/* Error / loading states */}
      {error && !connected && (
        <div className="px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          ⚠ Backend unreachable — {error}. Start the Docker stack and try again.
        </div>
      )}
      {loading && !ring && (
        <div className="px-4 py-3 rounded-xl bg-white/[0.03] border border-white/[0.04] text-zinc-500 text-sm animate-pulse">
          Connecting to backend...
        </div>
      )}
      {connected && ring && ring.total_nodes === 0 && (
        <div className="px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
          No servers registered in the ring.
        </div>
      )}

      {/* Ring SVG */}
      <div className="flex justify-center">
        <svg width="320" height="320" viewBox="0 0 320 320" className="drop-shadow-lg">
          {drawRingSVG({
            nodeCount: 4,
            vnodeCounts: liveVnodes,
            loads: liveLoads,
            names: NODE_NAMES,
            colors: COLORS,
            lightColors: LIGHT_COLORS,
            dots: dots,
          })}
        </svg>
      </div>

      {/* Per-node stat row */}
      <div className="grid grid-cols-4 gap-2">
        {NODES.map((nodeId, i) => {
          const vnodeCount = liveVnodes[i];
          const loadVal = liveLoads[i];
          const score = allocation ? allocation.scores[nodeId] ?? 0 : 0;

          return (
            <div key={nodeId}
              className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3 text-center"
              style={{ borderLeftColor: COLORS[i], borderLeftWidth: 3 }}
            >
              <div className="text-[10px] text-zinc-500 mb-1">{NODE_NAMES[i]}</div>
              <div className="text-lg font-semibold font-mono" style={{ color: COLORS[i] }}>
                {vnodeCount}
              </div>
              <div className="text-[10px] text-zinc-600">vnodes</div>
              <div className="text-[10px] text-zinc-500 mt-1">
                CPU {loadVal.toFixed(0)}% · Score {score.toFixed(2)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
