/**
 * API service layer for the Financial Forensics Engine backend.
 */

// ── Backend response types (match detection_engine.py output exactly) ──

export interface ApiSummary {
    total_accounts_analyzed: number;
    suspicious_accounts_flagged: number;
    fraud_rings_detected: number;
    processing_time_seconds: number;
    total_transactions: number;
    total_nodes: number;
    total_edges: number;
    circular_loops_found: number;
    smurfing_patterns_found: number;
    layering_chains_found: number;
    total_fraud_rings: number;
    high_risk_accounts: number;
    medium_risk_accounts: number;
    total_flagged_amount: number;
}

export interface ApiSuspiciousAccount {
    account_id: string;
    suspicion_score: number;
    detected_patterns: string[];
    ring_id: string;
    in_degree: number;
    out_degree: number;
    total_volume: number;
    transaction_count: number;
    ring_count: number;
    pattern_types: string[];
    merchant_factor: number;
}

export interface ApiFraudRing {
    ring_id: string;
    pattern_type: string;  // "cycle" | "fan_in" | "fan_out" | "layering"
    member_accounts: string[];
    member_count: number;
    risk_score: number;
    total_amount: number;
    edges: { source: string; target: string }[];
    center_node?: string;
}

export interface ApiGraphNode {
    id: string;
    suspicious: boolean;
    suspicion_score: number;
    in_degree: number;
    out_degree: number;
    ring_ids: string[];
    total_volume: number;
    transaction_count: number;
}

export interface ApiGraphEdge {
    source: string;
    target: string;
    suspicious: boolean;
    total_amount: number;
    count: number;
}

export interface AnalysisResponse {
    suspicious_accounts: ApiSuspiciousAccount[];
    fraud_rings: ApiFraudRing[];
    summary: ApiSummary;
    graph: {
        nodes: ApiGraphNode[];
        edges: ApiGraphEdge[];
    };
}

// ── API call ──

export async function analyzeFile(file: File): Promise<AnalysisResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(err.detail || `Analysis failed (${response.status})`);
    }

    return response.json();
}

// ── Simulation types ──

export interface SimulationCycle {
    cycle_members: string[];
    cycle_length: number;
    cycle_risk_score: number;
}

export interface RingAffected {
    ring_id: string;
    impact_type: 'joins' | 'merges' | 'escalates';
    old_risk_score: number;
    new_risk_score: number;
    delta: number;
    description: string;
}

export interface RingMerged {
    ring_a: string;
    ring_b: string;
    merged_member_count: number;
    merged_risk_score: number;
}

export interface ScoreDelta {
    account_id: string;
    old_score: number;
    new_score: number;
    delta: number;
    delta_reason: string;
}

export interface SimulationResult {
    simulation_id: string;
    hypothetical_tx: {
        sender_id: string;
        receiver_id: string;
        amount: number;
        timestamp: string;
    };
    verdict: 'DANGEROUS' | 'WARNING' | 'SUSPICIOUS' | 'CLEAN';
    verdict_reason: string;
    new_cycles_created: SimulationCycle[];
    rings_affected: RingAffected[];
    rings_merged: RingMerged[];
    score_deltas: ScoreDelta[];
    new_smurfing_triggered: boolean;
    smurfing_account: string | null;
    new_shell_chain_extended: boolean;
    chain_extension_detail: string | null;
    subgraph_delta: {
        nodes_affected: number;
        edges_added: number;
        new_nodes_introduced: number;
    };
    processing_time_ms: number;
}

// ── Simulation API calls ──

export async function simulateTransaction(
    sender_id: string,
    receiver_id: string,
    amount: number,
    timestamp?: string
): Promise<SimulationResult> {
    const response = await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender_id, receiver_id, amount, timestamp }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(err.detail || `Simulation failed (${response.status})`);
    }

    return response.json();
}

export async function fetchAccounts(): Promise<string[]> {
    const response = await fetch('/api/accounts');
    if (!response.ok) return [];
    const data = await response.json();
    return data.accounts || [];
}
