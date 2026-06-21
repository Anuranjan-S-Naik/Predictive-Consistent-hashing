'use client';

import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

const PAGE_TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/nodes': 'Node Monitoring',
  '/routing': 'Routing Engine',
  '/simulation': 'Simulation Control',
  '/settings': 'Settings',
};

export function TopBar() {
  const pathname = usePathname();
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

      {/* Right side — clean branding */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-zinc-600 font-mono">Predictive Consistent Hashing</span>
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-600 to-brand-400 flex items-center justify-center text-white text-xs font-bold">
          P
        </div>
      </div>
    </header>
  );
}
