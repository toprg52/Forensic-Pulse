import React, { useState, useMemo, Suspense } from 'react';
import { NavBar } from './components/NavBar';
import { Sidebar } from './components/Sidebar';
import { RingsTable } from './components/RingsTable';
import { AccountExplorer } from './components/AccountExplorer';
import { AccountDetailPanel } from './components/AccountDetailPanel';
import { UploadScreen } from './components/UploadScreen';
import { ChartsView } from './components/ChartsView';
import { SimulatorPanel } from './components/SimulatorPanel';
import type { AnalysisResponse, SimulationResult } from './api';
import { mapApiToAccounts, mapApiToRings, mapApiToTransactions } from './data/mappers';

// Error boundary for graceful error handling
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
          <h1>⚠️ Application Error</h1>
          <p>The app encountered an error. Please refresh the page.</p>
          <details style={{ whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: '200px' }}>
            <summary>Error Details</summary>
            {this.state.error?.toString()}
          </details>
        </div>
      );
    }

    return this.props.children;
  }
}

// Lazy load NetworkGraph to isolate cytoscape dependency issues
const NetworkGraph = React.lazy(() =>
  import('./components/NetworkGraph').then(module => ({ default: module.NetworkGraph }))
);

function App() {
  const [hasAnalyzed, setHasAnalyzed] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'graph' | 'rings' | 'explorer' | 'charts'>('graph');
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [analysisResponse, setAnalysisResponse] = useState<AnalysisResponse | null>(null);

  // Simulator state
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);

  // Derive frontend data from API response
  const accounts = useMemo(
    () => analysisResponse ? mapApiToAccounts(analysisResponse) : [],
    [analysisResponse]
  );
  const rings = useMemo(
    () => analysisResponse ? mapApiToRings(analysisResponse) : [],
    [analysisResponse]
  );
  const transactions = useMemo(
    () => analysisResponse ? mapApiToTransactions(analysisResponse) : [],
    [analysisResponse]
  );

  const handleAnalyze = (file: string, response: AnalysisResponse) => {
    setFileName(file);
    setAnalysisResponse(response);
    setHasAnalyzed(true);
  };

  const handleReset = () => {
    setHasAnalyzed(false);
    setFileName(null);
    setCurrentView('graph');
    setSelectedAccountId(null);
    setAnalysisResponse(null);
    setSimulationResult(null);
    setSimulatorOpen(false);
  };

  const handleNodeClick = (accountId: string) => {
    setSelectedAccountId(accountId);
  };

  const handleRingClick = (ringId: string) => {
    setCurrentView('graph');
  };

  const selectedAccount = selectedAccountId
    ? accounts.find(a => a.id === selectedAccountId) || null
    : null;

  // Build sidebar metrics from real data
  const summary = analysisResponse?.summary;
  const sidebarMetrics = {
    accounts: summary?.total_accounts_analyzed ?? 0,
    suspicious: summary?.suspicious_accounts_flagged ?? 0,
    rings: summary?.fraud_rings_detected ?? 0,
    processingTime: summary?.processing_time_seconds ?? 0,
  };

  const sidebarPatterns = [
    { name: 'Circular Loops', count: summary?.circular_loops_found ?? 0 },
    { name: 'Smurfing Patterns', count: summary?.smurfing_patterns_found ?? 0 },
    { name: 'Shell Chains', count: summary?.layering_chains_found ?? 0 },
  ];

  return (
    <ErrorBoundary>
      <div className="h-screen w-screen flex flex-col bg-[var(--color-bg-canvas)] overflow-hidden font-sans text-[var(--color-text-primary)]">
        <NavBar
          isAnalyzed={hasAnalyzed}
          onReset={handleReset}
          fileName={fileName}
          ringCount={summary?.fraud_rings_detected ?? 0}
          analysisResponse={analysisResponse}
        />

        {!hasAnalyzed ? (
          <UploadScreen onAnalyze={handleAnalyze} />
        ) : (
          <div className="flex-1 flex overflow-hidden">
            <Sidebar
              view={currentView}
              setView={setCurrentView}
              metrics={sidebarMetrics}
              patterns={sidebarPatterns}
              onOpenSimulator={() => setSimulatorOpen(true)}
            />

            <main className="flex-1 relative bg-[var(--color-bg-canvas)]">
              {/* Simulation mode banner */}
              {simulationResult && currentView === 'graph' && (
                <div className="absolute top-0 left-0 right-0 z-20 bg-[#EFF6FF] border-b border-[#BFDBFE] px-4 py-2 flex justify-between items-center">
                  <span className="font-mono text-[11px] text-[#1D4ED8]">
                    SIMULATION MODE — Showing hypothetical: {simulationResult.hypothetical_tx.sender_id} → {simulationResult.hypothetical_tx.receiver_id} (${simulationResult.hypothetical_tx.amount.toLocaleString()})
                  </span>
                  <button
                    onClick={() => setSimulationResult(null)}
                    className="text-[11px] text-[#1D4ED8] hover:underline font-medium"
                  >
                    Clear Simulation ×
                  </button>
                </div>
              )}

              {currentView === 'graph' && (
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full w-full text-sm text-[var(--color-text-muted)] font-mono">
                    Loading Graph Visualization...
                  </div>
                }>
                  <NetworkGraph
                    accounts={accounts}
                    transactions={transactions}
                    rings={rings}
                    onNodeClick={handleNodeClick}
                    selectedAccountId={selectedAccountId || undefined}
                    simulationResult={simulationResult}
                  />
                </Suspense>
              )}

              {currentView === 'rings' && (
                <RingsTable
                  rings={rings}
                  accounts={accounts}
                  onRingClick={handleRingClick}
                />
              )}

              {currentView === 'explorer' && (
                <AccountExplorer
                  accounts={accounts}
                  onAccountClick={handleNodeClick}
                />
              )}

              {currentView === 'charts' && (
                <ChartsView
                  accounts={accounts}
                  rings={rings}
                  transactions={transactions}
                />
              )}

              {selectedAccount && (
                <AccountDetailPanel
                  account={selectedAccount}
                  onClose={() => setSelectedAccountId(null)}
                  onAccountLinkClick={handleNodeClick}
                />
              )}
            </main>

            {/* Simulator Panel */}
            <SimulatorPanel
              isOpen={simulatorOpen}
              onClose={() => setSimulatorOpen(false)}
              onSimulationResult={setSimulationResult}
            />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

export default App;
