import React, { useState, useCallback } from 'react';

const CX = 160;
const CY = 160;
const R = 120;
const COLORS = ['#534AB7', '#0F6E56', '#993C1D', '#854F0B', '#185FA5'];
const LIGHT_COLORS = ['#1E1A3F', '#092B21', '#3D180B', '#331F04', '#0A2542']; // Dark mode background for name badges
const NAMES = ['A', 'B', 'C', 'D', 'E'];

type Mode = 'fixed' | 'adaptive';

interface Dot {
  angle: number;
  heavy: boolean;
  server: number;
  id: number;
}

export default function DemoRingView() {
  const [mode, setMode] = useState<Mode>('fixed');
  const [loads, setLoads] = useState<number[]>([0, 0, 0, 0, 0]);
  const [vnodes, setVnodes] = useState<number[]>([4, 4, 4, 4, 4]);
  const [flowCount, setFlowCount] = useState<number>(0);
  const [dots, setDots] = useState<Dot[]>([]);
  const [logMessage, setLogMessage] = useState<string>('Click "Send heavy flow" to start.');
  const [dotCounter, setDotCounter] = useState(0);

  const getVnodePositions = useCallback(() => {
    let positions: { server: number; angle: number }[] = [];
    for (let s = 0; s < 5; s++) {
      let count = mode === 'fixed' ? 4 : vnodes[s];
      for (let v = 0; v < count; v++) {
        let angle = (((s * 100 + v * (500 / count)) % 500) / 500) * 2 * Math.PI - Math.PI / 2;
        positions.push({ server: s, angle });
      }
    }
    return positions.sort((a, b) => a.angle - b.angle);
  }, [mode, vnodes]);

  const getServerForAngle = useCallback((angle: number) => {
    let positions = getVnodePositions();
    let norm = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    for (let p of positions) {
      let pa = ((p.angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (pa >= norm) return p.server;
    }
    return positions[0].server;
  }, [getVnodePositions]);

  const sendFlow = (isHeavy: boolean) => {
    setFlowCount(c => c + 1);
    let angle = Math.random() * 2 * Math.PI - Math.PI / 2;
    let server = getServerForAngle(angle);
    let weight = isHeavy ? 40 + Math.round(Math.random() * 60) : 2 + Math.round(Math.random() * 8);
    
    setLoads(prev => {
      let next = [...prev];
      next[server] += weight;
      return next;
    });

    const newDot = { angle, heavy: isHeavy, server, id: dotCounter };
    setDotCounter(c => c + 1);
    
    setDots(prev => {
      let next = [...prev, newDot];
      if (next.length > 6) next.shift();
      return next;
    });

    setLogMessage(`Flow #${flowCount + 1} → ${isHeavy ? 'heavy' : 'light'} (weight ${weight}) → Server ${NAMES[server]} (now load ${Math.round(loads[server] + weight)})`);

    setTimeout(() => {
      setDots(prev => prev.filter(d => d.id !== newDot.id));
    }, isHeavy ? 1200 : 800);
  };

  const rebalance = () => {
    if (mode === 'fixed') {
      setLogMessage('Fixed mode: vnodes never change. Switch to Adaptive to see rebalancing.');
      return;
    }
    let total = loads.reduce((a, b) => a + b, 0);
    if (total === 0) {
      setLogMessage('Send some flows first, then rebalance.');
      return;
    }
    let avg = total / 5;
    let newVnodes = loads.map(l => {
      if (avg === 0) return 4;
      let ratio = l / avg;
      if (ratio > 1.4) return 2;
      if (ratio > 1.1) return 3;
      if (ratio < 0.6) return 6;
      if (ratio < 0.9) return 5;
      return 4;
    });
    
    let changes: string[] = [];
    for (let s = 0; s < 5; s++) {
      if (newVnodes[s] !== vnodes[s]) {
        changes.push(`${NAMES[s]}: ${vnodes[s]}→${newVnodes[s]} slots`);
      }
    }
    setVnodes(newVnodes);
    setLogMessage(changes.length ? 'Rebalanced: ' + changes.join(', ') : 'Already balanced — no changes needed.');
  };

  const resetAll = () => {
    setLoads([0, 0, 0, 0, 0]);
    setVnodes([4, 4, 4, 4, 4]);
    setDots([]);
    setFlowCount(0);
    setLogMessage('Reset. Try sending 5-6 heavy flows, then click Rebalance.');
  };

  const positions = getVnodePositions();
  const totalLoad = loads.reduce((a, b) => a + b, 0) || 1;
  const avgLoad = totalLoad / 5;

  return (
    <div className="flex flex-col space-y-6">
      <div className="bg-indigo-900/30 text-indigo-300 border border-indigo-800/50 rounded-lg p-3 text-sm flex items-center justify-center font-medium shadow-sm">
        <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Illustrative simulation — not connected to backend
      </div>

      <div className="flex justify-center my-2">
        <svg width="320" height="320" viewBox="0 0 320 320">
          <circle cx={CX} cy={CY} r={R} fill="none" stroke="#374151" strokeWidth="1.5" />
          
          {positions.length > 0 && positions.map((p, i) => {
            let a1 = p.angle;
            let a2 = positions[(i + 1) % positions.length].angle;
            if (a2 <= a1) a2 += 2 * Math.PI;
            let steps = 30;
            let pts = [];
            for (let k = 0; k <= steps; k++) {
              let a = a1 + (a2 - a1) * k / steps;
              pts.push(`${CX + (R - 7) * Math.cos(a)},${CY + (R - 7) * Math.sin(a)}`);
            }
            return (
              <path
                key={`arc-${i}`}
                d={`M${pts[0]} ` + pts.slice(1).map(pt => `L${pt}`).join(' ')}
                fill="none"
                stroke={COLORS[p.server]}
                strokeWidth="13"
                strokeOpacity="0.3"
              />
            );
          })}

          {positions.map((p, i) => (
            <circle
              key={`dot-${i}`}
              cx={CX + R * Math.cos(p.angle)}
              cy={CY + R * Math.sin(p.angle)}
              r="6"
              fill={COLORS[p.server]}
              stroke="#1f2937"
              strokeWidth="2"
            />
          ))}

          {NAMES.map((name, s) => {
            let count = mode === 'fixed' ? 4 : vnodes[s];
            let baseAngle = (s * 100 / 500) * 2 * Math.PI - Math.PI / 2;
            let lx = CX + 68 * Math.cos(baseAngle);
            let ly = CY + 68 * Math.sin(baseAngle);
            return (
              <g key={`label-${s}`}>
                <circle cx={lx} cy={ly} r="22" fill={LIGHT_COLORS[s]} stroke={COLORS[s]} strokeWidth="1.5" />
                <text x={lx} y={ly - 5} textAnchor="middle" dominantBaseline="central" fontSize="14" fontWeight="600" fill={COLORS[s]}>{name}</text>
                <text x={lx} y={ly + 9} textAnchor="middle" dominantBaseline="central" fontSize="10" fill={COLORS[s]} opacity="0.9">{count} slots</text>
              </g>
            );
          })}

          {dots.map(dot => (
            <circle
              key={dot.id}
              cx={CX + R * Math.cos(dot.angle)}
              cy={CY + R * Math.sin(dot.angle)}
              r={dot.heavy ? "7" : "4"}
              fill={dot.heavy ? "#E24B4A" : "#10B981"}
              opacity="0.95"
            />
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-5 gap-3">
        {loads.map((load, s) => {
          let pct = Math.round((load / totalLoad) * 100);
          let count = mode === 'fixed' ? 4 : vnodes[s];
          let overloaded = load > avgLoad * 1.3;
          let underloaded = load < avgLoad * 0.7 && totalLoad > 0;
          return (
            <div key={s} className="bg-gray-800/80 rounded-lg p-3 text-center border border-gray-700 relative overflow-hidden shadow-sm">
              <div className="absolute top-0 left-0 bottom-0 w-1" style={{ backgroundColor: COLORS[s] }}></div>
              <div className="text-xs text-gray-400 mb-1 font-medium">Server {NAMES[s]}</div>
              <div className="text-xl font-bold" style={{ color: COLORS[s] }}>{Math.round(load)}</div>
              <div className="text-[11px] text-gray-400 mt-1 uppercase tracking-wider">{pct}% load</div>
              <div className="text-[11px] font-medium mt-1" style={{ color: COLORS[s] }}>{count} slots</div>
              <div className="h-4 mt-1">
                {overloaded && <div className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Overloaded</div>}
                {underloaded && <div className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Underused</div>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col items-center space-y-5 pb-2">
        <div className="flex flex-wrap justify-center gap-3">
          <button onClick={() => sendFlow(true)} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm font-medium text-gray-200 transition-all shadow-sm">
            Send heavy flow
          </button>
          <button onClick={() => sendFlow(false)} className="px-5 py-2.5 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-lg text-sm font-medium text-gray-200 transition-all shadow-sm">
            Send light flow
          </button>
          <button onClick={rebalance} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-all shadow-sm">
            Rebalance vnodes
          </button>
          <button onClick={resetAll} className="px-5 py-2.5 bg-gray-800 hover:bg-red-900/30 border border-gray-700 hover:border-red-800/50 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 transition-all">
            Reset
          </button>
        </div>

        <div className="flex items-center space-x-2 bg-gray-900 rounded-full p-1 border border-gray-800 shadow-inner">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider pl-4 pr-2">Mode</span>
          <button 
            onClick={() => { setMode('fixed'); setLogMessage('Mode: Fixed vnodes (4 each, never changes)'); }} 
            className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${mode === 'fixed' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Fixed
          </button>
          <button 
            onClick={() => { setMode('adaptive'); setLogMessage('Mode: Adaptive vnodes (adjusts after rebalance)'); }} 
            className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 ${mode === 'adaptive' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-gray-200'}`}
          >
            Adaptive
          </button>
        </div>

        <div className="text-sm text-emerald-400/90 font-mono mt-2 bg-gray-950 p-3 rounded-lg w-full text-center border border-gray-800/50 shadow-inner min-h-[46px] flex items-center justify-center">
          {logMessage}
        </div>
      </div>
    </div>
  );
}
