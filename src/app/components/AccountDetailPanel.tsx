import React from 'react';
import { X, AlertTriangle, CheckCircle } from 'lucide-react';
import { Account } from '../data/mockData';
import { ScoreBar } from './ScoreBar';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'motion/react';

interface AccountDetailPanelProps {
  account: Account | null;
  onClose: () => void;
  onAccountLinkClick: (id: string) => void;
}

export function AccountDetailPanel({ account, onClose, onAccountLinkClick }: AccountDetailPanelProps) {
  if (!account) return null;

  return (
    <>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-[var(--color-bg-overlay)] z-40 backdrop-blur-[1px]"
      />
      <div className="fixed inset-y-0 right-0 w-[320px] bg-[var(--color-bg-panel)] border-l border-[var(--color-border-subtle)] shadow-xl z-50 overflow-y-auto flex flex-col">
        {/* Header */}

      <div className="p-5 border-b border-[var(--color-border-subtle)] flex-shrink-0">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-[10px] font-sans font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
            Account Detail
          </h3>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
            <X size={16} />
          </button>
        </div>
        
        <div className="font-mono text-[16px] font-semibold text-[var(--color-text-primary)] mb-4 break-all">
          {account.id}
        </div>

        <div>
          <div className="flex items-baseline gap-2 mb-1">
            <span className={clsx("font-mono text-[32px] font-bold leading-none", 
              account.suspicionScore > 70 ? "text-[var(--color-risk-critical)]" : 
              account.suspicionScore > 50 ? "text-[var(--color-risk-medium)]" : "text-[var(--color-risk-low)]"
            )}>
              {account.suspicionScore.toFixed(1)}
            </span>
            <span className="text-[10px] font-sans font-semibold text-[var(--color-text-muted)] uppercase">
              Suspicion Score
            </span>
          </div>
          <ScoreBar score={account.suspicionScore} height={6} className="w-full" />
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        
        {/* Status */}
        <div className="p-5 border-b border-[var(--color-border-subtle)]">
          {account.ringId ? (
            <div className="inline-flex items-center px-2.5 py-1 rounded bg-red-50 border border-red-200 text-red-700 mb-2">
              <span className="text-[10px] font-mono font-medium uppercase tracking-wide">Ring Member</span>
            </div>
          ) : account.suspicionScore > 50 ? (
            <div className="flex items-center gap-2 text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
              <AlertTriangle size={14} />
              <span className="text-[12px] font-medium">Potential smurfing activity</span>
            </div>
          ) : (
             <div className="flex items-center gap-2 text-green-700 bg-green-50 p-2 rounded border border-green-200">
              <CheckCircle size={14} />
              <span className="text-[12px] font-medium">Clear history</span>
            </div>
          )}
          {account.ringId && (
            <div className="mt-2 text-[11px] font-mono text-[var(--color-text-secondary)]">
              Ring ID: <span className="text-[var(--color-text-primary)] font-medium">{account.ringId}</span>
            </div>
          )}
        </div>

        {/* Patterns */}
        <div className="p-5 border-b border-[var(--color-border-subtle)]">
          <h4 className="text-[10px] font-sans font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            Detected Patterns
          </h4>
          <div className="flex flex-wrap gap-2">
            {account.patterns.length > 0 ? account.patterns.map(p => (
              <span 
                key={p} 
                className={clsx("border px-2.5 py-1 rounded-[3px] font-mono text-[11px]",
                  p.includes('cycle') ? "border-red-200 text-red-700" : 
                  p.includes('smurf') ? "border-orange-200 text-orange-700" : 
                  "border-blue-200 text-blue-700"
                )}
              >
                {p}
              </span>
            )) : <span className="text-[12px] text-[var(--color-text-muted)] italic">None detected</span>}
          </div>
        </div>

        {/* Behavioral DNA */}
        <div className="p-5 border-b border-[var(--color-border-subtle)]">
          <h4 className="text-[10px] font-sans font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            Behavioral DNA Vector
          </h4>
          <div className="space-y-3">
            {Object.entries(account.behavioralDna).map(([key, value]) => (
              <div key={key} className="flex items-center text-[11px]">
                <span className="w-[100px] text-[var(--color-text-secondary)] capitalize font-sans">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                <div className="flex-1 h-1.5 bg-[var(--color-border-subtle)] rounded-full overflow-hidden mr-3">
                   <div 
                     className={clsx("h-full rounded-full", 
                        value > 80 ? "bg-[var(--color-risk-critical)]" : 
                        value > 50 ? "bg-[var(--color-risk-medium)]" : "bg-[var(--color-text-muted)]"
                     )}
                     style={{ width: `${value}%` }} 
                   />
                </div>
                <span className="font-mono font-semibold w-[24px] text-right text-[var(--color-text-primary)]">{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Network Stats */}
        <div className="p-5 border-b border-[var(--color-border-subtle)]">
          <h4 className="text-[10px] font-sans font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            Network Stats
          </h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <StatBox label="In-Degree" value={account.inDegree.toString()} />
            <StatBox label="Out-Degree" value={account.outDegree.toString()} />
            <StatBox label="Total In" value={`$${(account.networkStats.totalIn / 1000).toFixed(1)}k`} />
            <StatBox label="Total Out" value={`$${(account.networkStats.totalOut / 1000).toFixed(1)}k`} />
            <StatBox label="Tx Count" value={account.networkStats.txCount.toString()} />
            <StatBox label="Avg Hold Time" value={`${account.networkStats.avgHoldTime}h`} />
          </div>
        </div>

        {/* Connections */}
        <div className="p-5 pb-10">
          <h4 className="text-[10px] font-sans font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
            Direct Connections
          </h4>
          <div className="space-y-0 divide-y divide-[var(--color-border-subtle)] border-t border-[var(--color-border-subtle)]">
            {account.connections.length > 0 ? account.connections.slice(0, 10).map((conn, i) => (
              <div 
                key={i} 
                className="py-2 flex items-center justify-between group cursor-pointer hover:bg-[var(--color-bg-raised)] px-2 -mx-2 rounded transition-colors"
                onClick={() => onAccountLinkClick(conn.targetId)}
              >
                <div className="flex items-center gap-2">
                  <span className={clsx("text-[10px]", conn.direction === 'in' ? "text-green-600" : "text-blue-600")}>
                     {conn.direction === 'in' ? '↓' : '↑'}
                  </span>
                  <span className="font-mono text-[11px] text-[var(--color-text-primary)] group-hover:text-[var(--color-accent)] transition-colors">
                    {conn.targetId.slice(0, 12)}...
                  </span>
                </div>
                <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
                  ${conn.amount.toFixed(0)}
                </span>
              </div>
            )) : <div className="py-2 text-[11px] text-[var(--color-text-muted)] italic">No direct connections</div>}
          </div>
        </div>
      </div>
      </div>
    </>
  );
}

function StatBox({ label, value }: { label: string, value: string }) {
  return (
    <div>
      <div className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wide mb-0.5">{label}</div>
      <div className="font-mono text-[14px] font-semibold text-[var(--color-text-primary)]">{value}</div>
    </div>
  );
}
