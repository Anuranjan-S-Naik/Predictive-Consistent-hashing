'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

// --- Stat Card ---
interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  trend?: { value: number; label: string };
  color?: 'indigo' | 'cyan' | 'emerald' | 'amber' | 'rose';
  className?: string;
}

const colorMap = {
  indigo: 'from-brand-500/20 to-brand-600/5 border-brand-500/20 text-brand-400',
  cyan: 'from-cyan-500/20 to-cyan-600/5 border-cyan-500/20 text-cyan-400',
  emerald: 'from-emerald-500/20 to-emerald-600/5 border-emerald-500/20 text-emerald-400',
  amber: 'from-amber-500/20 to-amber-600/5 border-amber-500/20 text-amber-400',
  rose: 'from-rose-500/20 to-rose-600/5 border-rose-500/20 text-rose-400',
};

export function StatCard({ label, value, icon: Icon, trend, color = 'indigo', className }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        'glass-card p-5 relative overflow-hidden group',
        className
      )}
    >
      <div className={cn(
        'absolute top-0 right-0 w-24 h-24 rounded-full blur-3xl opacity-30 -translate-y-6 translate-x-6 transition-opacity group-hover:opacity-50',
        `bg-gradient-to-br ${colorMap[color].split(' ').slice(0, 2).join(' ')}`
      )} />
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <span className="metric-label">{label}</span>
          {Icon && (
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br', colorMap[color])}>
              <Icon className="w-4 h-4" />
            </div>
          )}
        </div>
        <p className="metric-value text-white">{value}</p>
        {trend && (
          <p className={cn('text-xs mt-1.5 font-medium', trend.value >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
            {trend.value >= 0 ? '↑' : '↓'} {Math.abs(trend.value)}% {trend.label}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// --- Section Header ---
export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-5">
      <div>
        <h2 className="text-lg font-semibold text-white tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-zinc-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

// --- Badge ---
export function Badge({ children, variant = 'default', className }: {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
  className?: string;
}) {
  const variants = {
    default: 'bg-zinc-800 text-zinc-300 border-zinc-700',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    danger: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    info: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md border', variants[variant], className)}>
      {children}
    </span>
  );
}

// --- Progress Bar ---
export function ProgressBar({ value, max = 100, color = 'brand', className, size = 'sm' }: {
  value: number;
  max?: number;
  color?: 'brand' | 'emerald' | 'amber' | 'rose' | 'cyan';
  className?: string;
  size?: 'xs' | 'sm' | 'md';
}) {
  const pct = Math.min((value / max) * 100, 100);
  const barColors = {
    brand: 'bg-brand-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    cyan: 'bg-cyan-500',
  };
  const sizes = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5' };

  return (
    <div className={cn('w-full bg-white/[0.04] rounded-full overflow-hidden', sizes[size], className)}>
      <motion.div
        className={cn('h-full rounded-full', barColors[color])}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
    </div>
  );
}

// --- Glass Panel ---
export function GlassPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('glass-card p-5', className)}>
      {children}
    </div>
  );
}

// --- Skeleton ---
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

// --- Empty State ---
export function EmptyState({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-zinc-600" />
      </div>
      <h3 className="text-base font-medium text-zinc-400 mb-1">{title}</h3>
      <p className="text-sm text-zinc-600 max-w-sm">{description}</p>
    </div>
  );
}
