'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Download } from 'lucide-react';
import { GlassPanel, SectionHeader, Badge } from '@/components/ui';
import { cn } from '@/lib/utils';
import { CLASS_COLORS } from '@/constants';

function generateLogs() {
  return Array.from({ length: 30 }, (_, i) => ({
    id: `req_${(10000 + i).toString().padStart(8, '0')}`,
    endpoint: ['/api/search', '/api/data', '/api/inference', '/api/status', '/api/batch'][Math.floor(Math.random() * 5)],
    method: Math.random() > 0.5 ? 'POST' : 'GET',
    class: (['Light', 'Medium', 'Heavy'] as const)[Math.floor(Math.random() * 3)],
    node: `node_s${Math.floor(Math.random() * 4) + 1}`,
    score: (0.1 + Math.random() * 0.7).toFixed(3),
    hops: Math.floor(Math.random() * 3) + 1,
    latency: Math.floor(30 + Math.random() * 500),
    timestamp: Date.now() - Math.floor(Math.random() * 300000),
    status: Math.random() > 0.02 ? 'success' : 'error',
  }));
}

export default function LogsPage() {
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [MOCK_LOGS] = useState(generateLogs);

  const filtered = MOCK_LOGS.filter(l =>
    (classFilter === 'all' || l.class === classFilter) &&
    (search === '' || l.id.includes(search) || l.endpoint.includes(search))
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-white">Request Logs</h1>
          <p className="text-sm text-zinc-500 mt-1">Browse classified and routed request history</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] text-sm text-zinc-300 hover:bg-white/[0.06] transition-colors">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {/* Filters */}
      <GlassPanel className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04] flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-zinc-600" />
          <input type="text" placeholder="Search request ID or endpoint..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="bg-transparent text-sm text-zinc-300 outline-none flex-1 placeholder:text-zinc-700" />
        </div>
        {['all', 'Light', 'Medium', 'Heavy'].map(f => (
          <button key={f} onClick={() => setClassFilter(f)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all capitalize',
              classFilter === f ? 'bg-brand-500/15 text-brand-400 border border-brand-500/25' : 'text-zinc-500 hover:text-zinc-300'
            )}>
            {f}
          </button>
        ))}
      </GlassPanel>

      {/* Log Table */}
      <GlassPanel>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['Request ID', 'Endpoint', 'Class', 'Node', 'Score', 'Hops', 'Latency', 'Status', 'Time'].map(h => (
                  <th key={h} className="text-left py-3 px-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((log, i) => (
                <motion.tr key={log.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="border-b border-white/[0.02] hover:bg-white/[0.02] transition-colors">
                  <td className="py-2.5 px-3 font-mono text-xs text-zinc-400">{log.id}</td>
                  <td className="py-2.5 px-3 text-zinc-300 text-xs">{log.endpoint}</td>
                  <td className="py-2.5 px-3">
                    <span className="text-xs font-medium px-2 py-0.5 rounded-md"
                      style={{ background: `${CLASS_COLORS[log.class]}15`, color: CLASS_COLORS[log.class] }}>
                      {log.class}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-xs text-zinc-400">{log.node.replace('node_', 'S')}</td>
                  <td className="py-2.5 px-3 font-mono text-xs text-zinc-400">{log.score}</td>
                  <td className="py-2.5 px-3 font-mono text-xs text-zinc-400">{log.hops}</td>
                  <td className={cn('py-2.5 px-3 font-mono text-xs', log.latency > 300 ? 'text-amber-400' : 'text-zinc-400')}>
                    {log.latency}ms
                  </td>
                  <td className="py-2.5 px-3">
                    <Badge variant={log.status === 'success' ? 'success' : 'danger'}>{log.status}</Badge>
                  </td>
                  <td className="py-2.5 px-3 text-[10px] text-zinc-600">{new Date(log.timestamp).toLocaleTimeString()}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </motion.div>
  );
}
