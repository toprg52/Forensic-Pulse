import React, { useState } from 'react';
import { Account } from '../data/mockData';
import { ScoreBar } from './ScoreBar';
import { Search, ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';

interface AccountExplorerProps {
  accounts: Account[];
  onAccountClick: (accountId: string) => void;
}

type SortField = 'suspicionScore' | 'volume' | 'inDegree';
type FilterStatus = 'all' | 'high' | 'medium' | 'clean';

export function AccountExplorer({ accounts, onAccountClick }: AccountExplorerProps) {
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('suspicionScore');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const filteredAccounts = accounts
    .filter(acc => {
      const matchesSearch = acc.id.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchesSearch) return false;
      
      if (filterStatus === 'high') return acc.suspicionScore >= 70;
      if (filterStatus === 'medium') return acc.suspicionScore >= 50 && acc.suspicionScore < 70;
      if (filterStatus === 'clean') return acc.suspicionScore < 50;
      return true;
    })
    .sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      return sortDirection === 'asc' ? (valA > valB ? 1 : -1) : (valA < valB ? 1 : -1);
    });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  return (
    <div className="flex flex-col h-full bg-[var(--color-bg-canvas)]">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-4 bg-[var(--color-bg-panel)] border-b border-[var(--color-border-subtle)]">
        <div className="flex items-center gap-3">
          <h2 className="text-[14px] font-semibold text-[var(--color-text-primary)] font-sans">ACCOUNT EXPLORER</h2>
          <span className="font-mono text-[12px] text-[var(--color-text-muted)]">[{accounts.length} accounts]</span>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input 
              type="text" 
              placeholder="Search account ID..." 
              className="pl-8 pr-3 py-1.5 border border-[var(--color-border-medium)] rounded text-[12px] font-mono focus:outline-none focus:border-[var(--color-accent)] transition-colors w-56"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex bg-[var(--color-bg-raised)] p-0.5 rounded border border-[var(--color-border-subtle)]">
            {(['all', 'high', 'medium', 'clean'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilterStatus(status)}
                className={clsx(
                  "px-3 py-1 text-[11px] font-medium rounded transition-all capitalize",
                  filterStatus === status 
                    ? "bg-white shadow-sm text-[var(--color-text-primary)] border border-[var(--color-border-subtle)]" 
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                )}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1 bg-[var(--color-bg-panel)]">
        <table className="w-full border-collapse text-left">
          <thead className="bg-[var(--color-bg-canvas)] sticky top-0 z-10 border-b-2 border-[var(--color-border-strong)]">
            <tr>
              <th className="px-5 py-2.5 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.08em] w-[140px]">Account ID</th>
              <th 
                className="px-5 py-2.5 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.08em] cursor-pointer hover:bg-[var(--color-border-subtle)] transition-colors w-[180px]"
                onClick={() => handleSort('suspicionScore')}
              >
                <div className="flex items-center gap-1">
                  Susp. Score
                  {sortField === 'suspicionScore' && (sortDirection === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />)}
                </div>
              </th>
              <th 
                className="px-5 py-2.5 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.08em] cursor-pointer hover:bg-[var(--color-border-subtle)] transition-colors w-[120px]"
                onClick={() => handleSort('inDegree')}
              >
                In/Out Degree
              </th>
              <th 
                className="px-5 py-2.5 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.08em] cursor-pointer hover:bg-[var(--color-border-subtle)] transition-colors w-[140px]"
                onClick={() => handleSort('volume')}
              >
                Volume
              </th>
              <th className="px-5 py-2.5 text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-[0.08em]">Patterns</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-subtle)]">
            {filteredAccounts.map((acc) => (
              <tr 
                key={acc.id}
                className="group cursor-pointer hover:bg-[#F0EEE8] transition-colors h-[40px] even:bg-[var(--color-bg-raised)]"
                onClick={() => onAccountClick(acc.id)}
              >
                <td className="px-5 py-2">
                  <span className="font-mono text-[12px] font-medium text-[var(--color-text-primary)]">{acc.id}</span>
                </td>
                <td className="px-5 py-2">
                  <div className="flex flex-col gap-1 w-[120px]">
                    <div className="flex items-center justify-between">
                      <span className={clsx("font-mono text-[13px] font-semibold", 
                        acc.suspicionScore > 70 ? "text-[var(--color-risk-critical)]" : 
                        acc.suspicionScore > 50 ? "text-[var(--color-risk-medium)]" : "text-[var(--color-text-secondary)]"
                      )}>
                        {acc.suspicionScore.toFixed(1)}
                      </span>
                    </div>
                    <div className="h-1 bg-[var(--color-border-subtle)] rounded-full overflow-hidden w-full">
                      <div 
                        className={clsx("h-full rounded-full", 
                          acc.suspicionScore > 70 ? "bg-[var(--color-risk-critical)]" : 
                          acc.suspicionScore > 50 ? "bg-[var(--color-risk-medium)]" : "bg-[var(--color-risk-low)]"
                        )}
                        style={{ width: `${acc.suspicionScore}%` }}
                      />
                    </div>
                  </div>
                </td>
                <td className="px-5 py-2">
                  <div className="flex items-center gap-3 font-mono text-[11px] text-[var(--color-text-secondary)]">
                    <span className="flex items-center gap-0.5 text-green-700">
                      <span className="text-[10px]">IN</span> {acc.inDegree}
                    </span>
                    <span className="w-[1px] h-3 bg-[var(--color-border-medium)]" />
                    <span className="flex items-center gap-0.5 text-blue-700">
                      <span className="text-[10px]">OUT</span> {acc.outDegree}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-2">
                  <span className="font-mono text-[12px] text-[var(--color-text-primary)]">
                    ${acc.volume.toLocaleString()}
                  </span>
                </td>
                <td className="px-5 py-2">
                  <div className="flex flex-wrap gap-1">
                    {acc.patterns.slice(0, 2).map(p => (
                      <span 
                        key={p} 
                        className={clsx("border px-2 py-0.5 rounded-[3px] font-mono text-[10px]",
                          p.includes('cycle') ? "border-red-200 text-red-700 bg-red-50" : 
                          p.includes('smurf') ? "border-orange-200 text-orange-700 bg-orange-50" : 
                          "border-blue-200 text-blue-700 bg-blue-50"
                        )}
                      >
                        {p}
                      </span>
                    ))}
                    {acc.patterns.length > 2 && (
                       <span className="text-[10px] text-[var(--color-text-secondary)] font-medium self-center">+{acc.patterns.length - 2}</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
