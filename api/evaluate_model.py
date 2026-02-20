"""
Model Evaluation Script for RIFT Hackathon
Calculates precision, recall, accuracy, and F1 score for fraud detection
"""
import pandas as pd
import json
from detection_engine import run_full_analysis
from datetime import datetime
import networkx as nx

def extract_ground_truth(csv_path):
    """
    Extract ground truth patterns from Official-DS.csv
    Based on account naming conventions and transaction structure
    """
    df = pd.read_csv(csv_path)
    
    ground_truth = {
        'cycles': [],
        'fan_in': [],
        'fan_out': [],
        'layering': [],
        'suspicious_accounts': set()
    }
    
    # Identify SMURF patterns (fan-in to SMURF accounts)
    # NOTE: TRUE smurfing requires both collection AND redistribution
    # Pure receivers (no outbound) are excluded as they're likely merchants
    smurf_accounts = df[df['receiver_id'].str.contains('SMURF_', na=False)]['receiver_id'].unique()
    for smurf in smurf_accounts:
        senders = df[df['receiver_id'] == smurf]['sender_id'].tolist()
        # Check if this account also sends money out (redistribution required for smurfing)
        outbound = df[df['sender_id'] == smurf]
        
        if len(senders) >= 10 and len(outbound) > 0:  # Must have both inbound cluster AND outbound
            ground_truth['fan_in'].append({
                'hub': smurf,
                'participants': senders + [smurf]
            })
            ground_truth['suspicious_accounts'].update(senders + [smurf])
    
    # Identify SHELL layering patterns
    shell_accounts = df[df['sender_id'].str.contains('SHELL_', na=False) | 
                       df['receiver_id'].str.contains('SHELL_', na=False)]
    shell_ids = set(shell_accounts['sender_id'].tolist() + shell_accounts['receiver_id'].tolist())
    shell_ids = [s for s in shell_ids if 'SHELL_' in s]
    
    if len(shell_ids) >= 2:
        # Build subgraph with shell accounts
        G = nx.DiGraph()
        for _, row in df.iterrows():
            G.add_edge(row['sender_id'], row['receiver_id'])
        
        # Find chains through shell accounts
        for shell in shell_ids:
            if G.has_node(shell):
                predecessors = list(G.predecessors(shell))
                successors = list(G.successors(shell))
                if predecessors and successors:
                    participants = predecessors + [shell] + successors
                    ground_truth['layering'].append({
                        'shells': [shell],
                        'participants': list(set(participants))
                    })
                    ground_truth['suspicious_accounts'].update(participants)
    
    # Identify circular loops (cycles)
    # Look for 3-node cycles in first ~20 transactions (known pattern from data inspection)
    cycles_data = df.head(50)  # Cycles are typically at the start
    G = nx.DiGraph()
    for _, row in cycles_data.iterrows():
        G.add_edge(row['sender_id'], row['receiver_id'])
    
    # Find simple cycles of length 3
    try:
        cycles = list(nx.simple_cycles(G))
        for cycle in cycles:
            if len(cycle) == 3:
                ground_truth['cycles'].append({
                    'nodes': sorted(cycle),
                    'participants': cycle
                })
                ground_truth['suspicious_accounts'].update(cycle)
    except:
        pass
    
    return ground_truth

def normalize_pattern(pattern_dict, pattern_type):
    """Normalize pattern dictionary for comparison"""
    if pattern_type == 'cycle':
        # Handle both 'nodes' (ground truth) and 'member_accounts' (detected)
        nodes = pattern_dict.get('nodes', pattern_dict.get('member_accounts', []))
        return frozenset(nodes)
    elif pattern_type in ['fan_in', 'fan_out']:
        hub = pattern_dict.get('hub', '')
        participants = set(pattern_dict.get('participants', []))
        return (hub, frozenset(participants))
    elif pattern_type == 'layering':
        shells = frozenset(pattern_dict.get('shells', []))
        return shells
    return None

def calculate_metrics(detected, ground_truth):
    """
    Calculate precision, recall, accuracy, and F1 score
    """
    results = {}
    
    for pattern_type in ['cycle', 'fan_in', 'fan_out', 'layering']:
        # Get detected patterns of this type
        detected_patterns = [
            p for p in detected.get('fraud_rings', [])
            if p.get('pattern_type') == pattern_type
        ]
        
        # Get ground truth patterns
        gt_key = pattern_type + 's' if pattern_type == 'cycle' else pattern_type
        gt_patterns = ground_truth.get(gt_key, [])
        
        # Normalize patterns for comparison
        detected_set = set()
        for p in detected_patterns:
            norm = normalize_pattern(p, pattern_type)
            if norm:
                detected_set.add(norm)
        
        gt_set = set()
        for p in gt_patterns:
            norm = normalize_pattern(p, pattern_type)
            if norm:
                gt_set.add(norm)
        
        # Calculate metrics
        true_positives = len(detected_set & gt_set)
        false_positives = len(detected_set - gt_set)
        false_negatives = len(gt_set - detected_set)
        
        precision = true_positives / (true_positives + false_positives) if (true_positives + false_positives) > 0 else 0
        recall = true_positives / (true_positives + false_negatives) if (true_positives + false_negatives) > 0 else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
        
        results[pattern_type] = {
            'true_positives': true_positives,
            'false_positives': false_positives,
            'false_negatives': false_negatives,
            'precision': round(precision, 4),
            'recall': round(recall, 4),
            'f1_score': round(f1, 4),
            'detected_count': len(detected_set),
            'ground_truth_count': len(gt_set)
        }
    
    # Overall metrics
    total_tp = sum(r['true_positives'] for r in results.values())
    total_fp = sum(r['false_positives'] for r in results.values())
    total_fn = sum(r['false_negatives'] for r in results.values())
    
    overall_precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0
    overall_recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0
    overall_f1 = 2 * (overall_precision * overall_recall) / (overall_precision + overall_recall) if (overall_precision + overall_recall) > 0 else 0
    
    # Calculate accuracy (for account-level detection)
    detected_accounts = set(acc['account_id'] if isinstance(acc, dict) else acc 
                           for acc in detected.get('suspicious_accounts', []))
    gt_accounts = ground_truth.get('suspicious_accounts', set())
    
    all_accounts = set()
    df = pd.read_csv('Official-DS.csv')
    all_accounts.update(df['sender_id'].unique())
    all_accounts.update(df['receiver_id'].unique())
    
    account_tp = len(detected_accounts & gt_accounts)
    account_tn = len(all_accounts - detected_accounts - gt_accounts)
    account_fp = len(detected_accounts - gt_accounts)
    account_fn = len(gt_accounts - detected_accounts)
    
    accuracy = (account_tp + account_tn) / len(all_accounts) if len(all_accounts) > 0 else 0
    
    results['overall'] = {
        'precision': round(overall_precision, 4),
        'recall': round(overall_recall, 4),
        'f1_score': round(overall_f1, 4),
        'accuracy': round(accuracy, 4),
        'total_patterns_detected': sum(r['detected_count'] for r in results.values() if isinstance(r, dict)),
        'total_patterns_ground_truth': sum(r['ground_truth_count'] for r in results.values() if isinstance(r, dict))
    }
    
    results['account_level'] = {
        'true_positives': account_tp,
        'true_negatives': account_tn,
        'false_positives': account_fp,
        'false_negatives': account_fn,
        'accuracy': round(accuracy, 4),
        'total_accounts': len(all_accounts),
        'suspicious_detected': len(detected_accounts),
        'suspicious_ground_truth': len(gt_accounts)
    }
    
    return results

def main():
    print("=" * 80)
    print("RIFT HACKATHON - FRAUD DETECTION MODEL EVALUATION")
    print("=" * 80)
    print()
    
    csv_path = 'Official-DS.csv'
    
    # Step 1: Extract ground truth
    print("Step 1: Extracting ground truth patterns...")
    ground_truth = extract_ground_truth(csv_path)
    print(f"  - Cycles: {len(ground_truth['cycles'])}")
    print(f"  - Fan-in (Smurfing): {len(ground_truth['fan_in'])}")
    print(f"  - Fan-out: {len(ground_truth['fan_out'])}")
    print(f"  - Layering: {len(ground_truth['layering'])}")
    print(f"  - Suspicious Accounts: {len(ground_truth['suspicious_accounts'])}")
    print()
    
    # Step 2: Run detection
    print("Step 2: Running fraud detection engine...")
    df = pd.read_csv(csv_path)
    detected = run_full_analysis(df)
    print(f"  - Detected {len(detected['fraud_rings'])} fraud rings")
    print(f"  - Flagged {len(detected['suspicious_accounts'])} suspicious accounts")
    print()
    
    # Step 3: Calculate metrics
    print("Step 3: Calculating performance metrics...")
    metrics = calculate_metrics(detected, ground_truth)
    print()
    
    # Display results
    print("=" * 80)
    print("RESULTS BY PATTERN TYPE")
    print("=" * 80)
    print()
    
    for pattern_type in ['cycle', 'fan_in', 'fan_out', 'layering']:
        m = metrics[pattern_type]
        print(f"{pattern_type.upper().replace('_', '-')}:")
        print(f"  Detected: {m['detected_count']} | Ground Truth: {m['ground_truth_count']}")
        print(f"  TP: {m['true_positives']} | FP: {m['false_positives']} | FN: {m['false_negatives']}")
        print(f"  Precision: {m['precision']:.2%}")
        print(f"  Recall:    {m['recall']:.2%}")
        print(f"  F1 Score:  {m['f1_score']:.2%}")
        print()
    
    print("=" * 80)
    print("OVERALL PERFORMANCE")
    print("=" * 80)
    print()
    
    overall = metrics['overall']
    print(f"Pattern-Level Metrics:")
    print(f"  Precision: {overall['precision']:.2%}")
    print(f"  Recall:    {overall['recall']:.2%}")
    print(f"  F1 Score:  {overall['f1_score']:.2%}")
    print()
    
    account = metrics['account_level']
    print(f"Account-Level Metrics:")
    print(f"  Accuracy:  {account['accuracy']:.2%}")
    print(f"  TP: {account['true_positives']} | TN: {account['true_negatives']} | FP: {account['false_positives']} | FN: {account['false_negatives']}")
    print()
    
    # Save detailed results
    with open('evaluation_results.json', 'w') as f:
        # Convert sets to lists for JSON serialization
        gt_json = ground_truth.copy()
        gt_json['suspicious_accounts'] = list(gt_json['suspicious_accounts'])
        
        results = {
            'timestamp': datetime.now().isoformat(),
            'dataset': csv_path,
            'ground_truth': gt_json,
            'detected': detected,
            'metrics': metrics
        }
        json.dump(results, f, indent=2)
    
    print("Detailed results saved to: evaluation_results.json")
    print()
    print("=" * 80)
    
    return metrics

if __name__ == '__main__':
    main()
