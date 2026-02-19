import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
  LineChart, Line,
  Area, AreaChart,
} from 'recharts';
import { Account, FraudRing, Transaction } from '../data/mockData';

interface ChartsViewProps {
  accounts: Account[];
  rings: FraudRing[];
  transactions: Transaction[];
}

/* ——— Color palette matching theme.css ——— */
const COLORS = {
  critical: '#B91C1C',
  high: '#C2410C',
  medium: '#B45309',
  low: '#4B5563',
  safe: '#166534',
  accent: '#1D4ED8',
};

const PIE_COLORS = ['#B91C1C', '#C2410C', '#B45309', '#1D4ED8', '#166534'];

/* ——— Shared tooltip style ——— */
const tooltipStyle = {
  contentStyle: {
    backgroundColor: '#FFFFFF',
    border: '1px solid #E8E6DF',
    borderRadius: '8px',
    fontSize: '12px',
    fontFamily: "'Inter', sans-serif",
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    padding: '10px 14px',
  },
  itemStyle: { color: '#1C1C1E', fontFamily: "'Inter', sans-serif" },
  labelStyle: { color: '#6B6967', fontFamily: "'Inter', sans-serif", fontWeight: 600, marginBottom: 4 },
};

/* ——— Custom label for Pie chart ——— */
const renderPieLabel = ({ name, percent }: { name: string; percent: number }) =>
  `${name} ${(percent * 100).toFixed(0)}%`;

export function ChartsView({ accounts, rings, transactions }: ChartsViewProps) {

  /* 1 ─ Suspicion Score Distribution (Bar) */
  const scoreDistribution = useMemo(() => {
    const buckets = [
      { range: '0–20', min: 0, max: 20, count: 0, fill: COLORS.safe },
      { range: '20–40', min: 20, max: 40, count: 0, fill: COLORS.low },
      { range: '40–60', min: 40, max: 60, count: 0, fill: COLORS.medium },
      { range: '60–80', min: 60, max: 80, count: 0, fill: COLORS.high },
      { range: '80–100', min: 80, max: 100, count: 0, fill: COLORS.critical },
    ];
    accounts.forEach(a => {
      const b = buckets.find(b => a.suspicionScore >= b.min && a.suspicionScore < b.max);
      if (b) b.count++;
      else if (a.suspicionScore === 100) buckets[4].count++;
    });
    return buckets;
  }, [accounts]);

  /* 2 ─ Fraud Pattern Breakdown (Pie) */
  const patternBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    rings.forEach(r => {
      counts[r.patternType] = (counts[r.patternType] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [rings]);

  /* 3 ─ Transaction Volume Over Time (Area/Line) */
  const volumeOverTime = useMemo(() => {
    // Simulate 24-hour timeline buckets
    const hourly: { hour: string; total: number; fraud: number }[] = [];
    for (let h = 0; h < 24; h++) {
      hourly.push({ hour: `${h.toString().padStart(2, '0')}:00`, total: 0, fraud: 0 });
    }
    transactions.forEach((tx, i) => {
      const bucket = i % 24;
      hourly[bucket].total += tx.amount;
      if (tx.isFraud) hourly[bucket].fraud += tx.amount;
    });
    // Round for display
    hourly.forEach(h => {
      h.total = Math.round(h.total);
      h.fraud = Math.round(h.fraud);
    });
    return hourly;
  }, [transactions]);

  /* 4 ─ Top 10 Suspicious Accounts (Horizontal Bar) */
  const topAccounts = useMemo(() => {
    return [...accounts]
      .sort((a, b) => b.suspicionScore - a.suspicionScore)
      .slice(0, 10)
      .map(a => ({
        id: a.id,
        score: a.suspicionScore,
        fill: a.suspicionScore >= 80 ? COLORS.critical
            : a.suspicionScore >= 60 ? COLORS.high
            : a.suspicionScore >= 40 ? COLORS.medium
            : COLORS.low,
      }));
  }, [accounts]);

  return (
    <div className="h-full w-full overflow-y-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)] tracking-tight">
          Analytics Overview
        </h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-1 font-mono">
          {accounts.length} accounts · {rings.length} fraud rings · {transactions.length} transactions
        </p>
      </div>

      {/* 2×2 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* ── Chart 1: Score Distribution (Bar) ── */}
        <ChartCard title="Suspicion Score Distribution" subtitle="Accounts by risk band">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={scoreDistribution} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
              <XAxis
                dataKey="range"
                tick={{ fontSize: 11, fill: '#6B6967', fontFamily: "'Inter', sans-serif" }}
                axisLine={{ stroke: '#E8E6DF' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6B6967', fontFamily: "'IBM Plex Mono', monospace" }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={tooltipStyle.contentStyle}
                itemStyle={tooltipStyle.itemStyle}
                labelStyle={tooltipStyle.labelStyle}
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              />
              <Bar dataKey="count" name="Accounts" radius={[6, 6, 0, 0]} animationDuration={800}>
                {scoreDistribution.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ── Chart 2: Fraud Pattern Breakdown (Pie) ── */}
        <ChartCard title="Fraud Ring Pattern Breakdown" subtitle="Distribution of detected patterns">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={patternBreakdown}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={3}
                dataKey="value"
                label={renderPieLabel}
                animationDuration={800}
                stroke="none"
              >
                {patternBreakdown.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle.contentStyle}
                itemStyle={tooltipStyle.itemStyle}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: 11, fontFamily: "'Inter', sans-serif", color: '#6B6967' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ── Chart 3: Transaction Volume Over Time (Area) ── */}
        <ChartCard title="Transaction Volume (24h)" subtitle="Total vs. fraudulent volume by hour">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={volumeOverTime}>
              <defs>
                <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={COLORS.accent} stopOpacity={0.02} />
                </linearGradient>
                <linearGradient id="gradFraud" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={COLORS.critical} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={COLORS.critical} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" vertical={false} />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 10, fill: '#6B6967', fontFamily: "'Inter', sans-serif" }}
                axisLine={{ stroke: '#E8E6DF' }}
                tickLine={false}
                interval={3}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#6B6967', fontFamily: "'IBM Plex Mono', monospace" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v.toString()}
              />
              <Tooltip
                contentStyle={tooltipStyle.contentStyle}
                itemStyle={tooltipStyle.itemStyle}
                labelStyle={tooltipStyle.labelStyle}
                formatter={(value: number) => [`$${value.toLocaleString()}`, undefined]}
              />
              <Area
                type="monotone"
                dataKey="total"
                name="Total Volume"
                stroke={COLORS.accent}
                strokeWidth={2}
                fill="url(#gradTotal)"
                animationDuration={800}
              />
              <Area
                type="monotone"
                dataKey="fraud"
                name="Fraud Volume"
                stroke={COLORS.critical}
                strokeWidth={2}
                fill="url(#gradFraud)"
                animationDuration={800}
              />
              <Legend
                iconType="line"
                iconSize={12}
                wrapperStyle={{ fontSize: 11, fontFamily: "'Inter', sans-serif", color: '#6B6967' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* ── Chart 4: Top Suspicious Accounts (Horizontal Bar) ── */}
        <ChartCard title="Top 10 Suspicious Accounts" subtitle="Highest suspicion scores">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={topAccounts} layout="vertical" barCategoryGap="16%">
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E6DF" horizontal={false} />
              <XAxis
                type="number"
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: '#6B6967', fontFamily: "'IBM Plex Mono', monospace" }}
                axisLine={{ stroke: '#E8E6DF' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="id"
                width={110}
                tick={{ fontSize: 10, fill: '#6B6967', fontFamily: "'IBM Plex Mono', monospace" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle.contentStyle}
                itemStyle={tooltipStyle.itemStyle}
                labelStyle={tooltipStyle.labelStyle}
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                formatter={(value: number) => [value.toFixed(1), 'Score']}
              />
              <Bar dataKey="score" name="Suspicion Score" radius={[0, 6, 6, 0]} animationDuration={800}>
                {topAccounts.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

/* ——— Reusable Chart Card wrapper ——— */
function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-bg-panel)] border border-[var(--color-border-subtle)] rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow duration-300">
      <div className="mb-4">
        <h3 className="text-[13px] font-semibold text-[var(--color-text-primary)] tracking-tight">{title}</h3>
        <p className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}
