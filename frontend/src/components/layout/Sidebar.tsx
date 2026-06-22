'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard, Server, Route, Radio,
  GitBranch, Settings, Wifi, WifiOff,
  Activity, BarChart3, Brain, Zap, FlaskConical,
  AlertTriangle, TrendingUp
} from 'lucide-react';
import { API_BASE_URL } from '@/constants';

const NAV_SECTIONS = [
  {
    title: 'Overview',
    items: [
      { href: '/', icon: LayoutDashboard, label: 'Dashboard' },
    ],
  },
  {
    title: 'Testing & Analysis',
    items: [
      { href: '/traffic', icon: Zap, label: 'Traffic Generator' },
      { href: '/benchmarks', icon: FlaskConical, label: 'Algorithm Comparison' },
    ],
  },
  {
    title: 'Machine Learning',
    items: [
      { href: '/ml', icon: Brain, label: 'ML Explainability' },
      { href: '/forecasting', icon: TrendingUp, label: 'Forecasting' },
    ],
  },
  {
    title: 'Infrastructure',
    items: [
      { href: '/nodes', icon: Server, label: 'Nodes' },
      { href: '/routing', icon: Route, label: 'Routing' },
      { href: '/simulation', icon: Radio, label: 'Simulation' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { href: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [connected, setConnected] = useState(false);

  // Poll the backend /health endpoint to determine online/offline status
  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(3000) });
      setConnected(res.ok);
    } catch {
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const iv = setInterval(checkHealth, 5000);
    return () => clearInterval(iv);
  }, [checkHealth]);

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[260px] bg-surface-1/80 backdrop-blur-xl border-r border-white/[0.04] flex flex-col z-50">
      {/* Logo */}
      <div className="p-5 pb-4">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-cyan-500 flex items-center justify-center shadow-glow-sm group-hover:shadow-glow-md transition-shadow">
            <GitBranch className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">PCH Console</h1>
            <p className="text-[10px] text-zinc-500 font-medium tracking-wider uppercase">Predictive Hashing</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <p className="px-3 mb-2 text-[10px] font-semibold text-zinc-600 uppercase tracking-[0.15em]">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(isActive ? 'nav-link-active' : 'nav-link')}
                    >
                      <item.icon className={cn('w-4 h-4', isActive && 'text-brand-400')} />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Status bar */}
      <div className="p-4 border-t border-white/[0.04]">
        <div className="flex items-center gap-2 text-xs">
          {connected ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400 font-medium">Connected</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-zinc-600" />
              <span className="text-zinc-600 font-medium">Demo Mode</span>
            </>
          )}
          <span className="ml-auto text-zinc-700 font-mono text-[10px]">v0.1.0</span>
        </div>
      </div>
    </aside>
  );
}
