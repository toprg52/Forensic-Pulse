import React from 'react';
import { Share2, Table, Search, AlertCircle, FileText, Activity, BarChart3, Zap } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'motion/react';

interface SidebarProps {
  view: 'graph' | 'rings' | 'explorer' | 'charts';
  setView: (view: 'graph' | 'rings' | 'explorer' | 'charts') => void;
  metrics: {
    accounts: number;
    suspicious: number;
    rings: number;
    processingTime: number;
  };
  patterns: { name: string; count: number; }[];
  onOpenSimulator: () => void;
}

export function Sidebar({ view, setView, metrics, patterns, onOpenSimulator }: SidebarProps) {
  const totalRings = metrics.rings || 1;
  // Compute critical/high/medium/low from suspicious count heuristic
  const criticalCount = Math.round(metrics.suspicious * 0.15);
  const highCount = Math.round(metrics.suspicious * 0.3);
  const mediumCount = Math.round(metrics.suspicious * 0.35);
  const lowCount = Math.max(0, metrics.suspicious - criticalCount - highCount - mediumCount);
  const riskData = [
    { name: 'Critical', value: criticalCount, color: 'var(--color-risk-critical)' },
    { name: 'High', value: highCount, color: 'var(--color-risk-high)' },
    { name: 'Medium', value: mediumCount, color: 'var(--color-risk-medium)' },
    { name: 'Low', value: lowCount, color: 'var(--color-risk-low)' },
  ];
  const riskTotal = riskData.reduce((s, d) => s + d.value, 0) || 1;

  return (
    <aside className="w-[280px] bg-[var(--color-bg-panel)] border-r border-[var(--color-border-subtle)] h-full flex flex-col overflow-y-auto">

      {/* Summary Metrics */}
      <div className="p-5 border-b border-[var(--color-border-subtle)]">
        <h3 className="text-[10px] font-sans font-semibold text-[var(--color-text-muted)] tracking-[0.1em] mb-4 uppercase">
          Analysis Summary
        </h3>

        <div className="space-y-0 divide-y divide-[var(--color-border-subtle)] border-t border-b border-[var(--color-border-subtle)]">
          <MetricRow label="Accounts Analyzed" value={metrics.accounts.toString()} />
          <MetricRow label="Suspicious Flagged" value={metrics.suspicious.toString()} color="text-[var(--color-risk-medium)]" />
          <MetricRow label="Fraud Rings" value={metrics.rings.toString()} color="text-[var(--color-risk-critical)]" />
          <MetricRow label="Processing Time" value={`${metrics.processingTime}s`} />
        </div>
      </div>

      {/* Risk Distribution */}
      <div className="p-5 border-b border-[var(--color-border-subtle)]">
        <h3 className="text-[10px] font-sans font-semibold text-[var(--color-text-muted)] tracking-[0.1em] mb-4 uppercase">
          Ring Risk Distribution
        </h3>

        <div className="h-2 w-full flex rounded-full overflow-hidden mb-4 bg-[var(--color-bg-raised)]">
          {riskData.map((d, i) => (
            <div
              key={i}
              className="h-full"
              style={{
                width: `${(d.value / riskTotal) * 100}%`,
                backgroundColor: d.color
              }}
            />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-y-2">
          {riskData.map((d) => (
            <div key={d.name} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-[11px] font-mono text-[var(--color-text-secondary)]">
                {d.name} <span className="text-[var(--color-text-muted)]">({d.value})</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Patterns */}
      <div className="p-5 border-b border-[var(--color-border-subtle)] flex-1">
        <h3 className="text-[10px] font-sans font-semibold text-[var(--color-text-muted)] tracking-[0.1em] mb-4 uppercase">
          Detected Patterns
        </h3>

        <div className="space-y-4">
          {patterns.map((p) => (
            <div key={p.name} className="group">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[12px] font-medium text-[var(--color-text-primary)]">{p.name}</span>
                <span className="font-mono text-[13px] font-semibold text-[var(--color-text-primary)]">{p.count}</span>
              </div>
              <div className="h-1 bg-[var(--color-bg-raised)] w-full rounded-full overflow-hidden">
                <div
                  className="h-full bg-[var(--color-text-secondary)] rounded-full group-hover:bg-[var(--color-accent)] transition-colors"
                  style={{ width: `${(p.count / Math.max(...patterns.map(x => x.count), 1)) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* View Controls */}
      <div className="p-5 mt-auto bg-[var(--color-bg-panel)]">
        <h3 className="text-[10px] font-sans font-semibold text-[var(--color-text-muted)] tracking-[0.1em] mb-3 uppercase">
          Views
        </h3>
        <nav className="space-y-1">
          <ViewButton
            active={view === 'graph'}
            onClick={() => setView('graph')}
            icon={<Share2 size={16} />}
            label="Network Graph"
          />
          <ViewButton
            active={view === 'rings'}
            onClick={() => setView('rings')}
            icon={<Table size={16} />}
            label="Fraud Rings Table"
          />
          <ViewButton
            active={view === 'explorer'}
            onClick={() => setView('explorer')}
            icon={<Search size={16} />}
            label="Account Explorer"
          />
          <ViewButton
            active={view === 'charts'}
            onClick={() => setView('charts')}
            icon={<BarChart3 size={16} />}
            label="Analytics Charts"
          />
        </nav>

        {/* Simulator */}
        <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)]">
          <button
            onClick={onOpenSimulator}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 text-left text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-raised)] hover:text-[var(--color-text-primary)] border-l-2 border-transparent"
          >
            <span className="text-[var(--color-text-muted)]">
              <Zap size={16} />
            </span>
            <span className="text-[13px]">What-If Simulator</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function MetricRow({ label, value, color = "text-[var(--color-text-primary)]" }: { label: string, value: string, color?: string }) {
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-col">
        <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-muted)] mb-1">
          {label}
        </span>
        <span className={clsx("font-mono text-[22px] font-semibold leading-tight", color)}>
          {value}
        </span>
      </div>
    </div>
  );
}

function ViewButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "w-full flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 text-left",
        active
          ? "bg-[var(--color-bg-raised)] text-[var(--color-text-primary)] border-l-2 border-[var(--color-accent)] font-semibold shadow-sm"
          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-raised)] hover:text-[var(--color-text-primary)] border-l-2 border-transparent"
      )}
    >
      <span className={clsx(active ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]")}>
        {icon}
      </span>
      <span className="text-[13px]">{label}</span>
    </button>
  );
}
