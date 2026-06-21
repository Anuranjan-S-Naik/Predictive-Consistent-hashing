'use client';

import { motion } from 'framer-motion';
import { SectionHeader, GlassPanel, Badge } from '@/components/ui';
import { Activity, AlertTriangle } from 'lucide-react';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  MarkLineComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer]);

export default function ModelHealthPage() {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const accuracy = [0.99, 0.98, 0.99, 0.97, 0.96, 0.94, 0.92];
  const psi = [0.05, 0.06, 0.04, 0.08, 0.12, 0.18, 0.25];

  const chartOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: '#18181b',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#e4e4e7', fontSize: 12 },
    },
    legend: {
      data: ['Accuracy', 'PSI'],
      textStyle: { color: '#a1a1aa', fontSize: 12 },
      top: 0,
    },
    grid: {
      left: '8%',
      right: '8%',
      bottom: '8%',
      top: '15%',
    },
    xAxis: {
      type: 'category' as const,
      data: days,
      axisLine: { lineStyle: { color: '#3f3f46' } },
      axisLabel: { color: '#a1a1aa' },
    },
    yAxis: [
      {
        type: 'value' as const,
        name: 'Accuracy',
        min: 0.8,
        max: 1.0,
        axisLine: { lineStyle: { color: '#10b981' } },
        axisLabel: { color: '#10b981', formatter: '{value}' },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      },
      {
        type: 'value' as const,
        name: 'PSI',
        min: 0,
        max: 0.3,
        axisLine: { lineStyle: { color: '#f43f5e' } },
        axisLabel: { color: '#f43f5e', formatter: '{value}' },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: 'Accuracy',
        type: 'line',
        yAxisIndex: 0,
        data: accuracy,
        smooth: true,
        lineStyle: { width: 2, color: '#10b981' },
        itemStyle: { color: '#10b981' },
        symbol: 'circle',
        symbolSize: 6,
      },
      {
        name: 'PSI',
        type: 'line',
        yAxisIndex: 1,
        data: psi,
        smooth: true,
        lineStyle: { width: 2, color: '#f43f5e' },
        itemStyle: { color: '#f43f5e' },
        symbol: 'circle',
        symbolSize: 6,
        markLine: {
          silent: true,
          lineStyle: { color: '#f59e0b', type: 'dashed' as const },
          data: [{ yAxis: 0.2, label: { formatter: 'Drift Threshold', color: '#f59e0b', fontSize: 10 } }],
        },
      },
    ],
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Model Health & Drift</h1>
          <p className="text-sm text-zinc-500 mt-1">Population Stability Index (PSI) and live accuracy tracking</p>
        </div>
        <Badge variant="warning">Warning: Data Drift Detected</Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <GlassPanel>
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h3 className="text-white font-semibold mb-1">Data Drift Detected</h3>
                <p className="text-sm text-zinc-400">
                  Feature distribution for <code className="text-amber-300">payload_bytes</code> has shifted significantly over the last 48 hours.
                  PSI is currently <strong className="text-rose-400">0.25</strong> (Threshold: 0.20).
                </p>
                <button className="mt-4 px-4 py-2 bg-amber-500/10 text-amber-500 text-sm font-medium rounded-lg border border-amber-500/20 hover:bg-amber-500/20 transition-colors w-full">
                  Trigger Retraining Pipeline
                </button>
              </div>
            </div>
          </GlassPanel>

          <GlassPanel>
            <SectionHeader title="Current Metrics" />
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-zinc-400">Rolling Accuracy (7d)</span>
                  <span className="text-amber-400 font-bold font-mono">92.4%</span>
                </div>
                <div className="h-1.5 bg-black/50 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: '92.4%' }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-zinc-400">Max PSI (Payload)</span>
                  <span className="text-rose-400 font-bold font-mono">0.25</span>
                </div>
                <div className="h-1.5 bg-black/50 rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full" style={{ width: '80%' }} />
                </div>
              </div>
            </div>
          </GlassPanel>
        </div>

        <GlassPanel className="lg:col-span-2 flex flex-col">
          <SectionHeader title="Accuracy vs PSI Degradation" />
          <div className="flex-1 min-h-[350px] mt-4">
            <ReactEChartsCore echarts={echarts} option={chartOption} style={{ height: '100%', width: '100%' }} />
          </div>
          <p className="text-xs text-zinc-500 mt-4 text-center">
            As PSI (red line) crosses the 0.20 threshold, rolling accuracy (green line) begins to decline due to concept drift.
          </p>
        </GlassPanel>
      </div>
    </motion.div>
  );
}
