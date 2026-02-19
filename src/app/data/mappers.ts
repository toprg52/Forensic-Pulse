/**
 * Mappers: convert backend AnalysisResponse → frontend Account / FraudRing / Transaction types.
 */

import type { Account, FraudRing, Transaction, PatternType } from './mockData';
import type { AnalysisResponse, ApiGraphEdge } from '../api';

// ── Pattern type mapping ──

const PATTERN_MAP: Record<string, PatternType> = {
    cycle: 'Circular Loop',
    fan_in: 'Smurfing Fan-in',
    fan_out: 'Smurfing Fan-out',
    layering: 'Layering',
};

function mapPatternType(backendType: string): PatternType {
    return PATTERN_MAP[backendType] || (backendType as PatternType);
}

// ── Map to Account[] ──

export function mapApiToAccounts(response: AnalysisResponse): Account[] {
    const { suspicious_accounts, graph } = response;
    const accountScoreMap = new Map(
        suspicious_accounts.map(a => [a.account_id, a])
    );

    // Build per-node connection lists from graph edges
    const connectionsMap = new Map<string, Account['connections']>();
    for (const edge of graph.edges) {
        // Outgoing connection for source
        if (!connectionsMap.has(edge.source)) connectionsMap.set(edge.source, []);
        connectionsMap.get(edge.source)!.push({
            targetId: edge.target,
            direction: 'out',
            amount: edge.total_amount,
        });
        // Incoming connection for target
        if (!connectionsMap.has(edge.target)) connectionsMap.set(edge.target, []);
        connectionsMap.get(edge.target)!.push({
            targetId: edge.source,
            direction: 'in',
            amount: edge.total_amount,
        });
    }

    // Build ring membership lookup: nodeId → first ring_id
    const nodeRingMap = new Map<string, string>();
    for (const ring of response.fraud_rings) {
        for (const memberId of ring.member_accounts) {
            if (!nodeRingMap.has(memberId)) {
                nodeRingMap.set(memberId, ring.ring_id);
            }
        }
    }

    return graph.nodes.map(node => {
        const acct = accountScoreMap.get(node.id);
        const connections = connectionsMap.get(node.id) || [];

        // Compute total in/out from connections
        const totalIn = connections
            .filter(c => c.direction === 'in')
            .reduce((sum, c) => sum + c.amount, 0);
        const totalOut = connections
            .filter(c => c.direction === 'out')
            .reduce((sum, c) => sum + c.amount, 0);

        const score = acct?.suspicion_score ?? node.suspicion_score;

        return {
            id: node.id,
            suspicionScore: score,
            inDegree: node.in_degree,
            outDegree: node.out_degree,
            volume: node.total_volume,
            patterns: acct?.detected_patterns ?? [],
            status: 'active' as const,
            ringId: nodeRingMap.get(node.id),
            behavioralDna: {
                velocity: Math.min(100, Math.round((node.transaction_count / Math.max(1, node.in_degree + node.out_degree)) * 20)),
                amtVariance: Math.min(100, Math.round((node.total_volume / 10000) % 100)),
                fanSymmetry: node.in_degree + node.out_degree > 0
                    ? Math.round(Math.abs(node.in_degree - node.out_degree) / (node.in_degree + node.out_degree) * 100)
                    : 0,
                temporalCluster: Math.min(100, Math.round(score * 0.8)),
                hopDepth: Math.min(100, (node.ring_ids.length > 0 ? 60 + Math.round(score * 0.4) : Math.round(score * 0.3))),
                amtDecay: Math.min(100, Math.round(node.total_volume > 0 ? (totalOut / Math.max(1, node.total_volume)) * 100 : 0)),
            },
            networkStats: {
                totalIn: Math.round(totalIn),
                totalOut: Math.round(totalOut),
                txCount: node.transaction_count,
                avgHoldTime: Number((Math.random() * 24 + 1).toFixed(1)), // not available from backend
            },
            connections,
        } satisfies Account;
    });
}

// ── Map to FraudRing[] ──

export function mapApiToRings(response: AnalysisResponse): FraudRing[] {
    return response.fraud_rings.map(ring => ({
        id: ring.ring_id,
        patternType: mapPatternType(ring.pattern_type),
        memberCount: ring.member_count,
        riskScore: ring.risk_score,
        accountIds: ring.member_accounts,
    }));
}

// ── Map to Transaction[] ──

export function mapApiToTransactions(response: AnalysisResponse): Transaction[] {
    return response.graph.edges.map((edge: ApiGraphEdge, i: number) => ({
        id: `TX_${i.toString().padStart(6, '0')}`,
        source: edge.source,
        target: edge.target,
        amount: edge.total_amount,
        timestamp: new Date().toISOString(), // backend aggregates so no per-tx timestamp
        isFraud: edge.suspicious,
    }));
}
