'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, Bell, Info, XCircle } from 'lucide-react';
import { GlassPanel, SectionHeader, Badge, StatCard } from '@/components/ui';
import { cn } from '@/lib/utils';

function generateAlerts() {
  const now = Date.now();
  return [
    { id: '1', severity: 'critical' as const, title: 'Node S3 CPU > 90%', message: 'Sustained high CPU for 35 seconds on node_s3.', node_id: 'node_s3', timestamp: now - 120000, acknowledged: false },
    { id: '2', severity: 'warning' as const, title: 'Chord overflow spike', message: '15 overflow routings in last 30 seconds.', timestamp: now - 300000, acknowledged: false },
    { id: '3', severity: 'warning' as const, title: 'Queue depth warning', message: 'node_s2 heavy queue at 85/100 capacity.', node_id: 'node_s2', timestamp: now - 600000, acknowledged: true },
    { id: '4', severity: 'info' as const, title: 'Benchmark completed', message: 'Bursty scenario benchmark finished with 0 errors.', timestamp: now - 900000, acknowledged: true },
    { id: '5', severity: 'critical' as const, title: 'PostgreSQL flush error', message: 'Batch insert failed: connection timeout after 5s.', timestamp: now - 1200000, acknowledged: true },
    { id: '6', severity: 'info' as const, title: 'Ring rebalanced', message: 'DAA redistributed 45 vnodes across 4 nodes.', timestamp: now - 1800000, acknowledged: true },
  ];
}

export default function AlertsPage() {
  const [filter, setFilter] = useState<string>('all');
  const [MOCK_ALERTS] = useState(generateAlerts);
  const alerts = filter === 'all'
    ? MOCK_ALERTS
    : MOCK_ALERTS.filter(a => a.severity === filter);

  const critCount = MOCK_ALERTS.filter(a => a.severity === 'critical' && !a.acknowledged).length;
  const warnCount = MOCK_ALERTS.filter(a => a.severity === 'warning' && !a.acknowledged).length;

  const severityIcons = { critical: XCircle, warning: AlertTriangle, info: Info };
  const severityColors = {
    critical: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
    warning: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    info: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Alert Center</h1>
        <p className="text-sm text-zinc-500 mt-1">System warnings and operational alerts</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard label="Critical" value={critCount} icon={XCircle} color="rose" />
        <StatCard label="Warnings" value={warnCount} icon={AlertTriangle} color="amber" />
        <StatCard label="Total Alerts" value={MOCK_ALERTS.length} icon={Bell} color="indigo" />
      </div>

      <GlassPanel>
        <div className="flex items-center justify-between mb-4">
          <SectionHeader title="Alert History" />
          <div className="flex gap-1.5">
            {['all', 'critical', 'warning', 'info'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all',
                  filter === f ? 'bg-brand-500/15 text-brand-400 border border-brand-500/25' : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.03]'
                )}>
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {alerts.map((alert, i) => {
            const Icon = severityIcons[alert.severity];
            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className={cn(
                  'flex items-start gap-3 p-4 rounded-xl border transition-all',
                  alert.acknowledged ? 'bg-white/[0.01] border-white/[0.03] opacity-60' : severityColors[alert.severity]
                )}
              >
                <Icon className={cn('w-5 h-5 mt-0.5 flex-shrink-0',
                  alert.severity === 'critical' ? 'text-rose-400' :
                  alert.severity === 'warning' ? 'text-amber-400' : 'text-blue-400')} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-white">{alert.title}</span>
                    {alert.acknowledged && <Badge variant="default">Ack</Badge>}
                  </div>
                  <p className="text-xs text-zinc-400">{alert.message}</p>
                  <p className="text-[10px] text-zinc-600 mt-1">{new Date(alert.timestamp).toLocaleString()}</p>
                </div>
                {!alert.acknowledged && (
                  <button className="px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors flex-shrink-0">
                    Ack
                  </button>
                )}
              </motion.div>
            );
          })}
        </div>
      </GlassPanel>
    </motion.div>
  );
}
