import React, { useState, useEffect, useMemo, useRef } from 'react';
import { X, AlertTriangle, AlertCircle, Eye, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'motion/react';
import {
    simulateTransaction,
    fetchAccounts,
    type SimulationResult,
} from '../api';

interface SimulatorPanelProps {
    isOpen: boolean;
    onClose: () => void;
    onSimulationResult: (result: SimulationResult | null) => void;
}

const VERDICT_CONFIG = {
    DANGEROUS: {
        bg: '#FEF2F2', border: 'var(--color-risk-critical)',
        Icon: AlertTriangle, label: 'DANGEROUS', color: 'var(--color-risk-critical)',
    },
    WARNING: {
        bg: '#FFFBEB', border: 'var(--color-risk-high)',
        Icon: AlertCircle, label: 'WARNING', color: 'var(--color-risk-high)',
    },
    SUSPICIOUS: {
        bg: '#FFF7ED', border: 'var(--color-risk-medium)',
        Icon: Eye, label: 'SUSPICIOUS', color: 'var(--color-risk-medium)',
    },
    CLEAN: {
        bg: '#F0FDF4', border: '#22c55e',
        Icon: CheckCircle, label: 'CLEAN', color: '#22c55e',
    },
};

interface HistoryEntry {
    sender: string;
    receiver: string;
    amount: number;
    result: SimulationResult;
}

export function SimulatorPanel({ isOpen, onClose, onSimulationResult }: SimulatorPanelProps) {
    const [sender, setSender] = useState('');
    const [receiver, setReceiver] = useState('');
    const [amount, setAmount] = useState('');
    const [timestamp, setTimestamp] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<SimulationResult | null>(null);
    const [accounts, setAccounts] = useState<string[]>([]);
    const [senderFocused, setSenderFocused] = useState(false);
    const [receiverFocused, setReceiverFocused] = useState(false);
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [expandedRing, setExpandedRing] = useState<string | null>(null);
    const resultRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            fetchAccounts().then(setAccounts).catch(() => { });
        }
    }, [isOpen]);

    const filteredSenderAccounts = useMemo(
        () => accounts.filter(a => a.toLowerCase().includes(sender.toLowerCase())).slice(0, 15),
        [accounts, sender]
    );
    const filteredReceiverAccounts = useMemo(
        () => accounts.filter(a => a.toLowerCase().includes(receiver.toLowerCase())).slice(0, 15),
        [accounts, receiver]
    );

    const canSubmit = sender.trim() && receiver.trim() && parseFloat(amount) > 0;

    const runSimulation = async () => {
        if (!canSubmit) return;
        setLoading(true);
        setError(null);
        try {
            const res = await simulateTransaction(
                sender.trim(),
                receiver.trim(),
                parseFloat(amount),
                timestamp || undefined
            );
            setResult(res);
            onSimulationResult(res);
            setHistory(prev => [
                { sender: sender.trim(), receiver: receiver.trim(), amount: parseFloat(amount), result: res },
                ...prev,
            ].slice(0, 5));
            setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Simulation failed');
        } finally {
            setLoading(false);
        }
    };

    const restoreHistory = (entry: HistoryEntry) => {
        setSender(entry.sender);
        setReceiver(entry.receiver);
        setAmount(entry.amount.toString());
        setResult(entry.result);
        onSimulationResult(entry.result);
    };

    const clearSimulation = () => {
        setResult(null);
        onSimulationResult(null);
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/40 z-40"
                onClick={onClose}
            />

            {/* Panel */}
            <motion.div
                initial={{ x: 480 }}
                animate={{ x: 0 }}
                exit={{ x: 480 }}
                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                className="fixed inset-y-0 right-0 w-[480px] bg-[var(--color-bg-panel)] border-l border-[var(--color-border-subtle)] shadow-2xl z-50 flex flex-col overflow-hidden"
            >
                {/* Header */}
                <div className="p-5 border-b border-[var(--color-border-subtle)] flex-shrink-0">
                    <div className="flex justify-between items-start">
                        <div>
                            <h2 className="font-mono text-[12px] font-semibold tracking-[0.12em] text-[var(--color-text-primary)] uppercase">
                                What-If Simulator
                            </h2>
                            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                                Model hypothetical transactions
                            </p>
                        </div>
                        <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {/* Section 1: Transaction Builder */}
                    <div className="p-5 border-b border-[var(--color-border-subtle)]">
                        <h3 className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-4">
                            Hypothetical Transaction
                        </h3>

                        {/* Sender → Receiver */}
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex-1 relative">
                                <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1 block">Sender</label>
                                <input
                                    value={sender}
                                    onChange={e => setSender(e.target.value)}
                                    onFocus={() => setSenderFocused(true)}
                                    onBlur={() => setTimeout(() => setSenderFocused(false), 200)}
                                    placeholder="ACC_..."
                                    className="w-full h-[36px] px-3 border border-[var(--color-border-medium)] rounded bg-[var(--color-bg-raised)] font-mono text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
                                />
                                {senderFocused && sender && (
                                    <Dropdown items={filteredSenderAccounts} typed={sender} accounts={accounts} onSelect={v => { setSender(v); setSenderFocused(false); }} />
                                )}
                            </div>
                            <span className="font-mono text-[16px] text-[var(--color-text-muted)] pt-4">→</span>
                            <div className="flex-1 relative">
                                <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1 block">Receiver</label>
                                <input
                                    value={receiver}
                                    onChange={e => setReceiver(e.target.value)}
                                    onFocus={() => setReceiverFocused(true)}
                                    onBlur={() => setTimeout(() => setReceiverFocused(false), 200)}
                                    placeholder="ACC_..."
                                    className="w-full h-[36px] px-3 border border-[var(--color-border-medium)] rounded bg-[var(--color-bg-raised)] font-mono text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
                                />
                                {receiverFocused && receiver && (
                                    <Dropdown items={filteredReceiverAccounts} typed={receiver} accounts={accounts} onSelect={v => { setReceiver(v); setReceiverFocused(false); }} />
                                )}
                            </div>
                        </div>

                        {/* Amount */}
                        <div className="mb-4">
                            <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1 block">Amount</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[12px] text-[var(--color-text-muted)]">$</span>
                                <input
                                    type="number"
                                    value={amount}
                                    onChange={e => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full h-[36px] pl-7 pr-3 border border-[var(--color-border-medium)] rounded bg-[var(--color-bg-raised)] font-mono text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)]"
                                />
                            </div>
                        </div>

                        {/* Timestamp */}
                        <div className="mb-5">
                            <label className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider mb-1 block">Timestamp (optional)</label>
                            <input
                                type="datetime-local"
                                value={timestamp}
                                onChange={e => setTimestamp(e.target.value)}
                                className="w-full h-[36px] px-3 border border-[var(--color-border-medium)] rounded bg-[var(--color-bg-raised)] font-mono text-[12px] text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
                            />
                            <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Defaults to current time if left blank</p>
                        </div>

                        {error && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-[12px] text-red-700 font-mono">
                                {error}
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            onClick={runSimulation}
                            disabled={!canSubmit || loading}
                            className={clsx(
                                "w-full h-[40px] font-mono text-[12px] uppercase tracking-[0.1em] font-medium rounded transition-colors flex items-center justify-center gap-2",
                                canSubmit && !loading
                                    ? "bg-[var(--color-accent)] text-white hover:bg-blue-700 cursor-pointer"
                                    : "bg-[var(--color-border-medium)] text-[var(--color-text-muted)] cursor-not-allowed"
                            )}
                        >
                            {loading ? (
                                <>
                                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                'Simulate Transaction →'
                            )}
                        </button>
                    </div>

                    {/* Section 2: Simulation Result */}
                    <AnimatePresence>
                        {result && (
                            <motion.div
                                ref={resultRef}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                            >
                                {/* Verdict Banner */}
                                {(() => {
                                    const cfg = VERDICT_CONFIG[result.verdict];
                                    const Icon = cfg.Icon;
                                    return (
                                        <div
                                            className="flex items-center gap-3 px-5 py-3"
                                            style={{ backgroundColor: cfg.bg, borderLeft: `4px solid ${cfg.border}` }}
                                        >
                                            <Icon size={16} style={{ color: cfg.color }} />
                                            <span className="text-[13px] font-semibold" style={{ color: cfg.color }}>
                                                {cfg.label} — {result.verdict === 'DANGEROUS' ? 'Creates New Fraud Pattern' :
                                                    result.verdict === 'WARNING' ? 'Escalates Existing Risk' :
                                                        result.verdict === 'SUSPICIOUS' ? 'Elevates Account Scores' :
                                                            'No Significant Impact Detected'}
                                            </span>
                                        </div>
                                    );
                                })()}

                                {/* Verdict Reason */}
                                <div className="px-5 py-3 text-[12px] text-[var(--color-text-secondary)] border-b border-[var(--color-border-subtle)]">
                                    {result.verdict_reason}
                                </div>

                                {/* New Cycles */}
                                {result.new_cycles_created.length > 0 && (
                                    <div className="px-5 py-4 border-b border-[var(--color-border-subtle)]">
                                        <div className="flex items-center gap-2 mb-3">
                                            <span className="text-[10px] font-semibold text-[var(--color-risk-critical)] uppercase tracking-wider">New Cycles Detected</span>
                                            <span className="font-mono text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{result.new_cycles_created.length}</span>
                                        </div>
                                        {result.new_cycles_created.map((cycle, i) => (
                                            <div key={i} className="mb-3">
                                                <div className="flex items-center gap-1 flex-wrap mb-1.5">
                                                    {cycle.cycle_members.map((m, j) => (
                                                        <React.Fragment key={j}>
                                                            <span
                                                                className={clsx(
                                                                    "font-mono text-[11px] px-2 py-1 rounded border",
                                                                    (m === result.hypothetical_tx.sender_id || m === result.hypothetical_tx.receiver_id)
                                                                        ? "border-[var(--color-risk-critical)] text-[var(--color-risk-critical)]"
                                                                        : "border-[var(--color-border-medium)] text-[var(--color-text-secondary)]"
                                                                )}
                                                            >
                                                                {m}
                                                            </span>
                                                            {j < cycle.cycle_members.length - 1 && (
                                                                <span className="text-[var(--color-text-muted)] text-[11px]">→</span>
                                                            )}
                                                        </React.Fragment>
                                                    ))}
                                                    <span className="text-[var(--color-text-muted)] text-[11px]">→ {cycle.cycle_members[0]}</span>
                                                </div>
                                                <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
                                                    Length: {cycle.cycle_length} | Risk: {cycle.cycle_risk_score}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Rings Affected */}
                                {result.rings_affected.length > 0 && (
                                    <div className="px-5 py-4 border-b border-[var(--color-border-subtle)]">
                                        <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider block mb-3">Rings Affected</span>
                                        {result.rings_affected.map((r) => (
                                            <div key={r.ring_id} className="mb-2">
                                                <button
                                                    onClick={() => setExpandedRing(expandedRing === r.ring_id ? null : r.ring_id)}
                                                    className="w-full flex items-center justify-between py-2 hover:bg-[var(--color-bg-raised)] rounded px-2 -mx-2 transition-colors"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {expandedRing === r.ring_id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                                        <span className="font-mono text-[12px] font-semibold">{r.ring_id}</span>
                                                        <span
                                                            className={clsx(
                                                                "text-[10px] font-mono uppercase px-2 py-0.5 rounded border",
                                                                r.impact_type === 'merges' ? "bg-red-50 border-[var(--color-risk-critical)] text-[var(--color-risk-critical)]" :
                                                                    r.impact_type === 'joins' ? "bg-yellow-50 border-yellow-600 text-yellow-700" :
                                                                        "bg-orange-50 border-orange-400 text-orange-600"
                                                            )}
                                                        >
                                                            {r.impact_type}
                                                        </span>
                                                    </div>
                                                    <span className={clsx("font-mono text-[12px] font-semibold", r.delta > 0 ? "text-[var(--color-risk-critical)]" : "text-green-600")}>
                                                        {r.delta > 0 ? '+' : ''}{r.delta.toFixed(1)}
                                                    </span>
                                                </button>
                                                {expandedRing === r.ring_id && (
                                                    <p className="text-[11px] text-[var(--color-text-secondary)] pl-6 pb-2">{r.description}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Score Changes */}
                                {result.score_deltas.length > 0 && (
                                    <div className="px-5 py-4 border-b border-[var(--color-border-subtle)]">
                                        <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider block mb-3">Suspicion Score Changes</span>
                                        <table className="w-full">
                                            <thead>
                                                <tr className="text-[10px] font-mono text-[var(--color-text-muted)] uppercase">
                                                    <th className="text-left py-1">Account</th>
                                                    <th className="text-right py-1">Before</th>
                                                    <th className="text-right py-1">After</th>
                                                    <th className="text-right py-1">Change</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {result.score_deltas.map(d => (
                                                    <tr key={d.account_id} className="border-t border-[var(--color-border-subtle)]">
                                                        <td className="font-mono text-[11px] py-1.5">{d.account_id}</td>
                                                        <td className="font-mono text-[11px] text-[var(--color-text-secondary)] text-right">{d.old_score.toFixed(1)}</td>
                                                        <td className="font-mono text-[11px] text-right" style={{ color: d.new_score > 70 ? 'var(--color-risk-critical)' : d.new_score > 50 ? 'var(--color-risk-medium)' : 'var(--color-text-primary)' }}>
                                                            {d.new_score.toFixed(1)}
                                                        </td>
                                                        <td className={clsx("font-mono text-[11px] font-semibold text-right", d.delta > 0 ? "text-[var(--color-risk-critical)]" : "text-green-600")}>
                                                            {d.delta > 0 ? '↑' : '↓'}{d.delta > 0 ? '+' : ''}{d.delta.toFixed(1)}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Processing Stats */}
                                <div className="px-5 py-3 border-b border-[var(--color-border-subtle)] flex items-center gap-4">
                                    <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
                                        Nodes analyzed: {result.subgraph_delta.nodes_affected}
                                    </span>
                                    <span className="text-[var(--color-border-medium)]">|</span>
                                    <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
                                        Time: {result.processing_time_ms.toFixed(1)}ms
                                    </span>
                                </div>

                                {/* Clear simulation */}
                                <div className="px-5 py-3 border-b border-[var(--color-border-subtle)]">
                                    <button
                                        onClick={clearSimulation}
                                        className="text-[11px] text-[var(--color-accent)] hover:underline"
                                    >
                                        Clear Simulation Result
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Section 4: History */}
                    {history.length > 0 && (
                        <div className="px-5 py-4">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-[10px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Simulation History</span>
                                <button onClick={() => setHistory([])} className="text-[11px] text-[var(--color-accent)] hover:underline">Clear</button>
                            </div>
                            {history.map((entry, i) => {
                                const v = entry.result.verdict;
                                const cfg = VERDICT_CONFIG[v];
                                return (
                                    <button
                                        key={i}
                                        onClick={() => restoreHistory(entry)}
                                        className="w-full flex items-center justify-between py-2 border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-bg-raised)] transition-colors text-left"
                                    >
                                        <span className="font-mono text-[11px] text-[var(--color-text-primary)]">
                                            {entry.sender.slice(0, 10)} → {entry.receiver.slice(0, 10)}
                                        </span>
                                        <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
                                            ${entry.amount.toLocaleString()}
                                        </span>
                                        <span className="text-[10px] font-mono font-semibold flex items-center gap-1" style={{ color: cfg.color }}>
                                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
                                            {v}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </motion.div>
        </>
    );
}

// ── Autocomplete Dropdown ──
function Dropdown({ items, typed, accounts, onSelect }: {
    items: string[];
    typed: string;
    accounts: string[];
    onSelect: (v: string) => void;
}) {
    const isNew = typed.trim().length > 0 && !accounts.includes(typed.trim());
    return (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[var(--color-bg-panel)] border border-[var(--color-border-medium)] rounded shadow-lg z-60 max-h-[200px] overflow-y-auto">
            {items.map(id => (
                <button
                    key={id}
                    onMouseDown={() => onSelect(id)}
                    className="w-full text-left px-3 py-2 font-mono text-[11px] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-raised)] transition-colors"
                >
                    {id}
                </button>
            ))}
            {isNew && (
                <button
                    onMouseDown={() => onSelect(typed.trim())}
                    className="w-full text-left px-3 py-2 font-mono text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-bg-raised)] transition-colors border-t border-[var(--color-border-subtle)]"
                >
                    + Add new account: {typed.trim()}
                </button>
            )}
            {items.length === 0 && !isNew && (
                <div className="px-3 py-2 text-[11px] text-[var(--color-text-muted)] italic">No matches</div>
            )}
        </div>
    );
}
