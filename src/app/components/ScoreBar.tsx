import React from 'react';
import clsx from 'clsx';

interface ScoreBarProps {
  score: number;
  className?: string;
  height?: number;
  showValue?: boolean;
}

export function ScoreBar({ score, className, height = 4, showValue = false }: ScoreBarProps) {
  const getRiskColor = (s: number) => {
    if (s >= 85) return 'bg-[var(--color-risk-critical)]';
    if (s >= 70) return 'bg-[var(--color-risk-high)]';
    if (s >= 50) return 'bg-[var(--color-risk-medium)]';
    return 'bg-[var(--color-risk-low)]';
  };

  return (
    <div className={clsx("flex items-center gap-2", className)}>
      <div className="flex-1 bg-[var(--color-border-subtle)] rounded-full overflow-hidden" style={{ height }}>
        <div 
          className={clsx("h-full rounded-full transition-all duration-500", getRiskColor(score))} 
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      {showValue && (
        <span className={clsx("font-mono text-xs font-semibold", getRiskColor(score).replace('bg-', 'text-'))}>
          {score.toFixed(1)}
        </span>
      )}
    </div>
  );
}
