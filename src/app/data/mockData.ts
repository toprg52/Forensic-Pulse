// Type-only exports — all mock data generation has been removed.
// Real data comes from the backend API via mappers.ts.

export type PatternType = 'Circular Loop' | 'Smurfing Fan-in' | 'Smurfing Fan-out' | 'Layering';

export interface Account {
  id: string;
  suspicionScore: number; // 0-100
  inDegree: number;
  outDegree: number;
  volume: number;
  patterns: string[];
  status: 'active' | 'frozen' | 'investigation';
  ringId?: string;
  behavioralDna: {
    velocity: number;
    amtVariance: number;
    fanSymmetry: number;
    temporalCluster: number;
    hopDepth: number;
    amtDecay: number;
  };
  networkStats: {
    totalIn: number;
    totalOut: number;
    txCount: number;
    avgHoldTime: number; // in hours
  };
  connections: {
    targetId: string;
    direction: 'in' | 'out';
    amount: number;
  }[];
}

export interface FraudRing {
  id: string;
  patternType: PatternType;
  memberCount: number;
  riskScore: number;
  accountIds: string[];
}

export interface Transaction {
  id: string;
  source: string;
  target: string;
  amount: number;
  timestamp: string;
  isFraud: boolean;
}
