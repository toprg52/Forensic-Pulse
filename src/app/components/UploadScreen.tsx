import React, { useState } from 'react';
import { FileUp, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import clsx from 'clsx';
import { analyzeFile, type AnalysisResponse } from '../api';

interface UploadScreenProps {
  onAnalyze: (fileName: string, response: AnalysisResponse) => void;
}

export function UploadScreen({ onAnalyze }: UploadScreenProps) {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setError(null);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${((performance.now() / 1000)).toFixed(2)}s]  ${msg}`]);
  };

  const startAnalysis = async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    setLogs([]);

    addLog(`Uploading ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);

    try {
      addLog('Sending to analysis engine…');

      const result = await analyzeFile(file);

      // Show real results in logs
      const s = result.summary;
      addLog(`Parsed CSV — ${s.total_transactions} transactions`);
      addLog(`Built graph — ${s.total_nodes} nodes, ${s.total_edges} edges`);
      addLog(`Cycle detection — ${s.circular_loops_found} circular loops`);
      addLog(`Smurfing analysis — ${s.smurfing_patterns_found} patterns`);
      addLog(`Layering detection — ${s.layering_chains_found} shell chains`);
      addLog(`Flagged ${s.suspicious_accounts_flagged} suspicious accounts`);
      addLog(`Analysis complete in ${s.processing_time_seconds}s`);

      // Short delay for the user to see the logs animate before transitioning
      setTimeout(() => {
        onAnalyze(file.name, result);
      }, 800);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      addLog(`ERROR: ${message}`);
      setError(message);
      setProcessing(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-52px)] bg-[var(--color-bg-canvas)]">
      <div className="w-[480px] bg-[var(--color-bg-panel)] rounded-lg shadow-sm border border-[var(--color-border-subtle)] overflow-hidden">

        {!processing ? (
          <>
            <div className="p-8">
              <div className="flex items-center gap-2 mb-2 text-[var(--color-text-muted)]">
                <FileUp size={20} />
              </div>
              <h2 className="text-[15px] font-sans font-semibold text-[var(--color-text-primary)] mb-1">
                Upload Transaction Data
              </h2>
              <p className="text-[12px] text-[var(--color-text-secondary)] mb-6">
                Accepts CSV with transaction_id, sender_id, receiver_id, amount, timestamp columns
              </p>

              <div
                className={clsx(
                  "h-[140px] border-2 border-dashed rounded-md flex flex-col items-center justify-center transition-colors cursor-pointer mb-6",
                  dragActive ? "border-[var(--color-border-strong)] bg-[var(--color-bg-raised)]" : "border-[var(--color-border-medium)] bg-[var(--color-bg-raised)] hover:border-[var(--color-border-strong)]"
                )}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-upload')?.click()}
              >
                <input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  accept=".csv"
                  onChange={handleChange}
                />

                {file ? (
                  <div className="flex flex-col items-center">
                    <FileText size={32} className="text-[var(--color-text-primary)] mb-2" />
                    <span className="text-[13px] font-medium text-[var(--color-text-primary)]">{file.name}</span>
                    <span className="text-[11px] text-[var(--color-text-secondary)]">{(file.size / 1024).toFixed(1)} KB</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <FileUp size={32} className="text-[var(--color-text-muted)] mb-2" />
                    <span className="text-[13px] font-medium text-[var(--color-text-primary)] mb-1">Drop CSV file here</span>
                    <span className="text-[12px] text-[var(--color-accent)] underline">or click to browse</span>
                  </div>
                )}
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-[12px] text-red-700 font-mono">
                  {error}
                </div>
              )}

              {file ? (
                <button
                  onClick={startAnalysis}
                  className="w-full h-[40px] bg-[var(--color-accent)] text-white font-mono text-[12px] uppercase font-medium rounded hover:bg-blue-700 transition-colors"
                >
                  Analyze Transactions →
                </button>
              ) : (
                <div className="p-3 bg-[var(--color-bg-raised)] rounded border border-[var(--color-border-subtle)]">
                  <div className="flex justify-between text-[11px] font-mono text-[var(--color-text-muted)]">
                    <span>transaction_id</span>
                    <span>|</span>
                    <span>sender_id</span>
                    <span>|</span>
                    <span>receiver_id</span>
                    <span>|</span>
                    <span>amount</span>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 bg-[var(--color-bg-raised)] border-t border-[var(--color-border-subtle)] flex items-center justify-between">
              <div className="flex gap-4">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)]" />
                  <span className="text-[11px] text-[var(--color-text-muted)] font-sans">Circular Loops</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)]" />
                  <span className="text-[11px] text-[var(--color-text-muted)] font-sans">Smurfing Patterns</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)]" />
                  <span className="text-[11px] text-[var(--color-text-muted)] font-sans">Shell Chains</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="p-8">
            <h2 className="text-[15px] font-sans font-semibold text-[var(--color-text-primary)] mb-1">
              Analyzing Transactions
            </h2>
            <p className="text-[12px] font-mono text-[var(--color-text-muted)] mb-6">
              {file?.name}
            </p>

            <div className="bg-[var(--color-bg-raised)] rounded border border-[var(--color-border-subtle)] p-3 h-[160px] overflow-y-auto mb-4 font-mono text-[11px] leading-loose">
              <AnimatePresence>
                {logs.map((log, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={clsx(
                      log.includes('ERROR') ? "text-red-600" : "text-[var(--color-text-primary)]"
                    )}
                  >
                    <span className="text-[var(--color-text-muted)] mr-2">{log.split('  ')[0]}</span>
                    {log.split('  ')[1]}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="h-1 w-full bg-[var(--color-border-subtle)] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-[var(--color-accent)]"
                initial={{ width: 0 }}
                animate={{ width: error ? "0%" : "100%" }}
                transition={{ duration: 8, ease: "linear" }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
