import React, { useState } from 'react';
import { FraudRing, Account } from '../data/mockData';
import { ScoreBar } from './ScoreBar';
import { ChevronDown, ChevronRight, Search, Filter } from 'lucide-react';
import clsx from 'clsx';

interface RingsTableProps {
  rings: FraudRing[];
  accounts: Account[];
  onRingClick: (ringId: string) => void;
}

export function RingsTable({ rings, accounts, onRingClick }: RingsTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [filterPattern, setFilterPattern] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredRings = rings.filter(ring => {
    const matchesPattern = filterPattern === 'all' || ring.patternType === filterPattern;
    const matchesSearch = ring.id.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesPattern && matchesSearch;
  });

  const toggleRow = (id: string) => {
    setExpandedRow(expandedRow === id ? null : id);
  };

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-canvas)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-4 bg-[var(--color-bg-panel)] border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-3">
          <h2 className="text-[14px] font-semibold text-[var(--color-text-primary)] font-sans">FRAUD RINGS</h2>
          <span className="font-mono text-[12px] text-[var(--color-text-muted)]">[{rings.length} detected]</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <select 
              className="appearance-none bg-white border border-[var(--color-border-medium)] text-[12px] font-sans pl-3 pr-8 py-1.5 rounded focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              value={filterPattern}
              onChange={(e) => setFilterPattern(e.target.value)}
            >
              <option value="all">All Patterns</option>
              <option value="Circular Loop">Circular Loop</option>
              <option value="Smurfing Fan-in">Smurfing Fan-in</option>
              <option value="Smurfing Fan-out">Smurfing Fan-out</option>
              <option value="Shell Chain">Shell Chain</option>
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] pointer-events-none" />
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input 
              type="text" 
              placeholder="Search ring ID..." 
              className="pl-8 pr-3 py-1.5 border border-[var(--color-border-medium)] rounded text-[12px] font-mono focus:outline-none focus:border-[var(--color-accent)] transition-colors w-48"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1 bg-[var(--color-bg-panel)]">
        <table className="w-full border-collapse text-left">
          <thead className="bg-[var(--color-bg-canvas)] sticky top-0 z-10 border-b-2 border-[var(--color-border-strong)]">
            <tr>
              <th className="px-5 py-2.5 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.08em] w-[140px]">Ring ID</th>
              <th className="px-5 py-2.5 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.08em] w-[180px]">Pattern Type</th>
              <th className="px-5 py-2.5 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.08em] w-[100px] text-center">Members</th>
              <th className="px-5 py-2.5 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.08em] w-[180px]">Risk Score</th>
              <th className="px-5 py-2.5 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.08em]">Accounts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-subtle)]">
            {filteredRings.flatMap((ring) => {
              const isExpanded = expandedRow === ring.id;
              const rows = [];
              
              rows.push(
                <tr 
                  key={ring.id}
                  className={clsx(
                    "group cursor-pointer transition-colors h-[40px] hover:bg-[#F0EEE8]",
                    isExpanded ? "bg-[var(--color-bg-raised)] border-l-[3px] border-l-[var(--color-accent)]" : "bg-white even:bg-[var(--color-bg-raised)] border-l-[3px] border-l-transparent"
                  )}
                  onClick={() => toggleRow(ring.id)}
                >
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-2">
                       {isExpanded ? <ChevronDown size={14} className="text-[var(--color-text-secondary)]" /> : <ChevronRight size={14} className="text-[var(--color-text-secondary)]" />}
                       <span className="font-mono text-[12px] font-medium text-[var(--color-text-primary)]">{ring.id}</span>
                    </div>
                  </td>
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-2">
                      <div className={clsx("w-2 h-2 rounded-full", 
                        ring.patternType.includes('Loop') ? "bg-[var(--color-risk-critical)]" :
                        ring.patternType.includes('Smurfing') ? "bg-[var(--color-risk-high)]" : "bg-purple-600"
                      )} />
                      <span className="text-[12px] font-sans text-[var(--color-text-primary)]">{ring.patternType}</span>
                    </div>
                  </td>
                  <td className="px-5 py-2 text-center">
                    <span className="font-mono text-[13px] font-semibold text-[var(--color-text-primary)]">{ring.memberCount}</span>
                  </td>
                  <td className="px-5 py-2">
                    <div className="flex items-center gap-3">
                      <span className={clsx("font-mono text-[13px] font-semibold w-[40px]", 
                        ring.riskScore > 85 ? "text-[var(--color-risk-critical)]" : "text-[var(--color-risk-high)]"
                      )}>
                        {ring.riskScore.toFixed(1)}
                      </span>
                      <ScoreBar score={ring.riskScore} height={4} className="w-[80px]" />
                    </div>
                  </td>
                  <td className="px-5 py-2">
                    <div className="flex flex-wrap gap-1 items-center">
                      {ring.accountIds.slice(0, 3).map(id => (
                        <span key={id} className="font-mono text-[11px] text-[var(--color-text-secondary)]">{id},</span>
                      ))}
                      {ring.accountIds.length > 3 && (
                        <span className="text-[11px] font-medium text-[var(--color-accent)] ml-1">+{ring.accountIds.length - 3} more</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
              
              if (isExpanded) {
                rows.push(
                  <tr key={`${ring.id}-expanded`} className="bg-[var(--color-bg-raised)] border-l-[3px] border-l-[var(--color-accent)]">
                    <td colSpan={5} className="px-5 py-3 pl-[56px]">
                      <div className="flex flex-wrap gap-2">
                        {ring.accountIds.map(id => (
                          <button 
                            key={id}
                            className="px-2 py-0.5 border border-[var(--color-border-medium)] rounded bg-white font-mono text-[11px] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Handle account click if needed, maybe open drawer
                            }}
                          >
                            {id}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              }
              
              return rows;
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
