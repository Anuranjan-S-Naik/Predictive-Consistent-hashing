'use client';

import { usePathname } from 'next/navigation';
import { Bell, Search, ChevronRight } from 'lucide-react';
import { useAlertStore } from '@/stores';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/simulation': 'Simulation Control',
  '/nodes': 'Node Monitoring',
  '/traffic': 'Traffic Generator',
  '/routing': 'Routing Engine',
  '/routing/chord': 'Chord DHT Routing',
  '/routing/queues': 'WFQ Scheduler',
  '/metrics': 'System Metrics',
  '/forecasting': 'Traffic Forecasting',
  '/benchmarks': 'Benchmark Analysis',
  '/experiments': 'Experiment Runner',
  '/alerts': 'Alert Center',
  '/logs': 'Request Logs',
  '/failures': 'Failure Injection',
  '/settings': 'Settings',
};

export function TopBar() {
  const pathname = usePathname();
  const alertCount = useAlertStore((s) => s.alerts.filter((a) => !a.acknowledged).length);
  const title = PAGE_TITLES[pathname] || 'PCH Console';

  const crumbs = pathname.split('/').filter(Boolean);

  return (
    <header className="h-14 border-b border-white/[0.04] bg-surface-1/40 backdrop-blur-xl flex items-center justify-between px-6 sticky top-0 z-40">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-sm">
        <span className="text-zinc-500">PCH</span>
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <ChevronRight className="w-3 h-3 text-zinc-700" />
            <span className={i === crumbs.length - 1 ? 'text-zinc-200 font-medium capitalize' : 'text-zinc-500 capitalize'}>
              {c.replace(/-/g, ' ')}
            </span>
          </span>
        ))}
        {crumbs.length === 0 && (
          <>
            <ChevronRight className="w-3 h-3 text-zinc-700" />
            <span className="text-zinc-200 font-medium">Dashboard</span>
          </>
        )}
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        <button className="p-2 rounded-lg hover:bg-white/[0.04] text-zinc-500 hover:text-zinc-300 transition-colors">
          <Search className="w-4 h-4" />
        </button>
        <button className="relative p-2 rounded-lg hover:bg-white/[0.04] text-zinc-500 hover:text-zinc-300 transition-colors">
          <Bell className="w-4 h-4" />
          {alertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse">
              {alertCount > 9 ? '9+' : alertCount}
            </span>
          )}
        </button>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-600 to-brand-400 flex items-center justify-center text-white text-xs font-bold">
          A
        </div>
      </div>
    </header>
  );
}
