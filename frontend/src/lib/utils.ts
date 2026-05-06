import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number, decimals = 1): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(decimals)}K`;
  return n.toFixed(decimals);
}

export function formatMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms.toFixed(0)}ms`;
}

export function formatPercent(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

export function getStatusColor(value: number, thresholds = { warn: 60, crit: 85 }): string {
  if (value >= thresholds.crit) return 'text-rose-400';
  if (value >= thresholds.warn) return 'text-amber-400';
  return 'text-emerald-400';
}

export function getStatusBg(value: number, thresholds = { warn: 60, crit: 85 }): string {
  if (value >= thresholds.crit) return 'bg-rose-500/10 border-rose-500/20';
  if (value >= thresholds.warn) return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-emerald-500/10 border-emerald-500/20';
}
