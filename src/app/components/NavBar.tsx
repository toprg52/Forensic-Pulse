import React from 'react';
import { Download } from 'lucide-react';
import type { AnalysisResponse } from '../api';

interface NavBarProps {
  isAnalyzed: boolean;
  onReset: () => void;
  fileName: string | null;
  ringCount: number;
  analysisResponse: AnalysisResponse | null;
}

export function NavBar({ isAnalyzed, onReset, fileName, ringCount, analysisResponse }: NavBarProps) {

  const handleExport = () => {
    if (!analysisResponse) return;

    const json = JSON.stringify(analysisResponse, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'forensics_report.json';
    document.body.appendChild(a);
    a.click();

    // Cleanup
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);

    // Success toast
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-5 right-5 bg-white border border-gray-200 shadow-lg rounded-md px-4 py-3 text-sm flex items-center gap-2 animate-in fade-in slide-in-from-bottom-5 duration-300 z-50';
    toast.innerHTML = `<span class="text-green-600">✓</span> <span class="text-gray-900 font-medium">forensics_report.json exported</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  };

  return (
    <nav className="h-[52px] bg-[var(--color-bg-panel)] border-b border-[var(--color-border-subtle)] flex items-center px-5 justify-between select-none">
      <div className="flex items-center gap-4">
        <h1 className="font-mono text-[13px] font-semibold tracking-[0.12em] text-[var(--color-text-primary)] uppercase">
          Forensic Pulse
        </h1>
        <div className="h-4 w-[1px] bg-[var(--color-border-medium)]" />
        <span className="text-[12px] text-[var(--color-text-secondary)] font-sans">
          Transaction Network Analysis Engine
        </span>
        {isAnalyzed && fileName && (
          <>
            <div className="w-1 h-1 rounded-full bg-[var(--color-border-medium)]" />
            <span className="font-mono text-[12px] text-[var(--color-text-secondary)]">
              {fileName}
            </span>
            <span className="text-[12px] text-[var(--color-text-muted)] ml-2">
              Analyzed {new Date().toLocaleTimeString()}
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-3">
        {isAnalyzed ? (
          <>
            <div className="bg-yellow-50 text-yellow-700 px-3 py-1 rounded-sm text-[11px] font-mono border border-yellow-200">
              {ringCount} ring{ringCount !== 1 ? 's' : ''} detected
            </div>
            <button
              onClick={onReset}
              className="px-3 py-1.5 border border-[var(--color-border-medium)] bg-white text-[12px] font-medium text-[var(--color-text-primary)] rounded hover:bg-[var(--color-bg-raised)] transition-colors"
            >
              New Analysis
            </button>
            <button
              className="px-3 py-1.5 bg-[var(--color-accent)] text-white text-[12px] font-medium rounded hover:bg-blue-700 transition-colors flex items-center gap-2"
              onClick={handleExport}
            >
              <Download size={14} />
              Export JSON
            </button>
          </>
        ) : (
          <span className="font-mono text-[11px] text-[var(--color-text-muted)]">v2.1.0</span>
        )}
      </div>
    </nav>
  );
}
