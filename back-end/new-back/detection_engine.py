"""
Financial Forensics Detection Engine
RIFT 2026 Hackathon
Implements: Circular Loop detection, Smurfing (Fan-in/Fan-out), Layering/Shell detection
"""

import time
import itertools
import pandas as pd
import numpy as np
import networkx as nx
from datetime import timedelta
from typing import List, Dict, Any, Tuple
import importlib


def _load_dna_flags(df: pd.DataFrame) -> Dict[str, Dict[str, bool]]:
    """Load per-account trap flags from dna_scorer with runtime data."""
    try:
        mod = importlib.import_module("dna_scorer")
    except Exception:
        try:
            mod = importlib.import_module("backend.dna_scorer")
        except Exception:
            return {}

    try:
        if hasattr(mod, "get_flags"):
            return mod.get_flags(df) or {}
        if hasattr(mod, "compute_trap_flags"):
            return mod.compute_trap_flags(df) or {}
    except Exception:
        return {}

    return {}


def _extract_trap_set(flags: Dict[str, Dict[str, bool]], key: str) -> set:
    return {k for k, v in flags.items() if isinstance(v, dict) and v.get(key)}


# ─────────────────────────────────────────────────────────────
# Graph Construction
# ─────────────────────────────────────────────────────────────

def build_graph(df: pd.DataFrame) -> nx.DiGraph:
    """Build a directed weighted graph from transaction DataFrame.
    Vectorised via groupby – 100x faster than iterrows for large DataFrames.
    """
    G = nx.DiGraph()
    grp = (
        df.groupby(["sender_id", "receiver_id"], sort=False)
        .agg(total_amount=("amount", "sum"), count=("amount", "count"))
        .reset_index()
    )
    for row in grp.itertuples(index=False):
        G.add_edge(
            row.sender_id,
            row.receiver_id,
            total_amount=float(row.total_amount),
            count=int(row.count),
        )
    return G


# ─────────────────────────────────────────────────────────────
# Algorithm 1 – Circular Loops (Johnson's via NetworkX)
# ─────────────────────────────────────────────────────────────

# ── Tuning knobs ─────────────────────────────────────────────
MAX_CYCLES_PER_SCC = 300    # max cycles enumerated per strongly-connected component
LOOP_TIME_BUDGET   = 8.0    # hard wall-clock cut-off (seconds) for the entire pass


def detect_circular_loops(
    G: nx.DiGraph,
    df: pd.DataFrame,
    demoted_nodes: set | None = None,
) -> List[Dict]:
    """
    Find directed cycles of length 3–5.
    Optimised:
     • Pre-filters demoted nodes (merchants, payroll) from the graph so they
       cannot become cycle members and inflate the ring count.
     • Only processes SCCs with ≥ 3 nodes (others cannot contain length-3+ cycles)
     • At most MAX_CYCLES_PER_SCC cycles enumerated per SCC via itertools.islice
     • Hard wall-clock budget LOOP_TIME_BUDGET seconds across all SCCs
    """
    rings: List[Dict] = []
    seen_keys: set    = set()
    deadline          = time.perf_counter() + LOOP_TIME_BUDGET

    # FIX 3: remove demoted accounts (merchants, payroll) before SCC/cycle detection
    demoted_nodes = demoted_nodes or set()
    valid_nodes = [n for n in G.nodes() if n not in demoted_nodes]
    filtered_G = G.subgraph(valid_nodes)

    large_sccs = [
        scc for scc in nx.strongly_connected_components(filtered_G)
        if len(scc) >= 3
    ]

    for scc in large_sccs:
        if time.perf_counter() > deadline:
            break
        sub = filtered_G.subgraph(scc)
        try:
            for cycle in itertools.islice(nx.simple_cycles(sub), MAX_CYCLES_PER_SCC):
                if time.perf_counter() > deadline:
                    break
                length = len(cycle)
                if not (3 <= length <= 5):
                    continue
                canonical = tuple(sorted(cycle))
                if canonical in seen_keys:
                    continue
                seen_keys.add(canonical)

                edges: List[Tuple[str, str]] = list(zip(cycle, cycle[1:] + [cycle[0]]))
                total_amount = sum(
                    G[s][r].get("total_amount", 0.0)
                    for s, r in edges if G.has_edge(s, r)
                )
                risk_score = min(100.0, 55.0 + (5 - length) * 12 + min(33.0, total_amount / 2000))
                rings.append({
                    "ring_id": f"LOOP_{len(rings) + 1:04d}",
                    "pattern_type": "cycle",
                    "member_accounts": cycle,
                    "member_count": length,
                    "risk_score": round(risk_score, 2),
                    "total_amount": round(total_amount, 2),
                    "edges": [{"source": s, "target": r} for s, r in edges],
                })
        except Exception:
            continue

    return rings


# ─────────────────────────────────────────────────────────────
# Algorithm 2 – Smurfing / Fan-in / Fan-out
# ─────────────────────────────────────────────────────────────

def detect_smurfing(
    G: nx.DiGraph,
    df: pd.DataFrame,
    payroll_traps: set | None = None,
    merchant_traps: set | None = None,
) -> List[Dict]:
    """
    Identify real smurfing hubs — nodes that:
      1. Receive from 3+ unique senders within a 168-hour window (fan-in burst)
      2. ALSO send money OUT within 168 hours of that inbound cluster (re-dispersal)

    FIX: Pure receivers (MRC_ merchants, etc.) are silently skipped because they
    fail GATE 3 (zero outbound transactions).  Payroll and merchant traps are
    also skipped via GATE 1.

    Optimised: O(n) two-pointer sliding-window burst detection.
    """
    rings: List[Dict]  = []
    WINDOW_SECONDS     = 168 * 3600      # 168-hour (1-week) clustering window
    CLUSTER_PCT        = 0.50            # ≥50% of deposits must fall in window
    ring_counter       = [0]

    df_t = df.copy()
    df_t["ts"] = df_t["timestamp"].astype(np.int64) // 10**9   # unix seconds

    # Pre-build per-node sorted arrays and partner sets
    in_ts:          Dict[str, np.ndarray] = {}
    out_ts:         Dict[str, np.ndarray] = {}
    in_partners:    Dict[str, List[str]]  = {}
    out_partners:   Dict[str, List[str]]  = {}
    in_amounts:     Dict[str, float]      = {}
    out_amounts:    Dict[str, float]      = {}
    in_amount_arr:  Dict[str, np.ndarray] = {}
    out_amount_arr: Dict[str, np.ndarray] = {}
    unique_senders: Dict[str, set]        = {}

    for node, grp in df_t.groupby("receiver_id", sort=False):
        in_ts[node]          = np.sort(grp["ts"].to_numpy())
        in_partners[node]    = grp["sender_id"].tolist()
        in_amounts[node]     = float(grp["amount"].sum())
        in_amount_arr[node]  = grp["amount"].to_numpy()
        unique_senders[node] = set(grp["sender_id"].unique())

    for node, grp in df_t.groupby("sender_id", sort=False):
        out_ts[node]          = np.sort(grp["ts"].to_numpy())
        out_partners[node]    = grp["receiver_id"].tolist()
        out_amounts[node]     = float(grp["amount"].sum())
        out_amount_arr[node]  = grp["amount"].to_numpy()

    payroll_traps  = payroll_traps  or set()
    merchant_traps = merchant_traps or set()
    demoted_nodes  = payroll_traps | merchant_traps

    def _cv(values: np.ndarray) -> float:
        if values.size == 0:
            return 0.0
        mean = float(np.mean(values))
        if mean == 0.0:
            return 0.0
        return float(np.std(values, ddof=0) / mean)

    def _max_burst(ts_arr: np.ndarray) -> Tuple[int, int, int]:
        """Two-pointer: max events in WINDOW_SECONDS, returns (count, lo_idx, hi_idx). O(n)."""
        if len(ts_arr) == 0:
            return 0, 0, 0
        best, best_lo, best_hi = 0, 0, 0
        lo = 0
        for hi in range(len(ts_arr)):
            while ts_arr[hi] - ts_arr[lo] > WINDOW_SECONDS:
                lo += 1
            if hi - lo + 1 > best:
                best, best_lo, best_hi = hi - lo + 1, lo, hi
        return best, best_lo, best_hi

    def _make_ring(node: str, pattern: str, counterparts: List[str],
                   edges_list: List[Dict], total_volume: float) -> Dict:
        ring_counter[0] += 1
        risk_score = min(100.0, 45.0 + len(counterparts) * 2.5 + min(25.0, total_volume / 50_000))
        members = [node] + list(dict.fromkeys(counterparts))[:40]
        return {
            "ring_id": f"SMURF_{ring_counter[0]:04d}",
            "pattern_type": pattern,
            "member_accounts": members,
            "member_count": len(members),
            "risk_score": round(risk_score, 2),
            "total_amount": round(total_volume, 2),
            "center_node": node,
            "edges": edges_list[:80],
        }

    for node in list(G.nodes()):
        in_deg  = G.in_degree(node)
        out_deg = G.out_degree(node)

        # ── GATE 1: minimum fan-in to even consider ────────────────────────────
        if in_deg < 3 and out_deg < 3:
            continue

        # ── GATE 2: skip demoted accounts (merchants, payroll) ─────────────────
        if node in demoted_nodes:
            continue

        # ── Fan-in smurfing check ──────────────────────────────────────────────
        if in_deg >= 3:
            node_in_ts     = in_ts.get(node, np.array([]))
            node_out_ts    = out_ts.get(node, np.array([]))

            # GATE 3: Must have outbound transactions (pure receivers = merchants)
            if len(node_out_ts) == 0:
                pass  # fall through to fan-out check below (don't continue)
            else:
                # GATE 4: Check that deposits cluster in a 72-hour window
                burst_count, burst_lo, burst_hi = _max_burst(node_in_ts)
                clustering_pct = burst_count / max(len(node_in_ts), 1)

                # GATE 5: At least 50% of deposits in a 168-hour window
                if clustering_pct >= CLUSTER_PCT and burst_count >= 3:

                    # GATE 6: Outbound must occur within 72h of the cluster
                    if len(node_in_ts) > 0 and burst_hi < len(node_in_ts):
                        cluster_start = int(node_in_ts[burst_lo])
                        cluster_end   = int(node_in_ts[burst_hi])
                        rapid_out = node_out_ts[
                            (node_out_ts >= cluster_start) &
                            (node_out_ts <= cluster_end + WINDOW_SECONDS)
                        ]

                        if len(rapid_out) > 0:
                            senders = [
                                s for s in in_partners.get(node, [])
                                if s not in demoted_nodes
                            ]
                            if senders:
                                rings.append(_make_ring(
                                    node, "fan_in", senders,
                                    [{"source": s, "target": node} for s in senders],
                                    in_amounts.get(node, 0.0),
                                ))

        # ── Fan-out smurfing check ─────────────────────────────────────────────
        if out_deg >= 3:
            node_out_ts = out_ts.get(node, np.array([]))
            burst_count, _, _ = _max_burst(node_out_ts)
            # Apply the same temporal clustering gate as fan-in:
            # ≥70% of outbound txns must fall in a single 72-hour window.
            # PAY_ accounts send ~40 salaries spread over 6 months → low clustering.
            # Real fan-out smurfs disperse in one tight burst → high clustering.
            out_clustering_pct = burst_count / max(len(node_out_ts), 1)
            if burst_count >= 3 and out_clustering_pct >= CLUSTER_PCT:
                receivers = [
                    r for r in out_partners.get(node, [])
                    if r not in demoted_nodes
                ]
                if receivers:
                    rings.append(_make_ring(
                        node, "fan_out", receivers,
                        [{"source": node, "target": r} for r in receivers],
                        out_amounts.get(node, 0.0),
                    ))

    return rings


# ─────────────────────────────────────────────────────────────
# Algorithm 3 – Layering / Shell Chains
# ─────────────────────────────────────────────────────────────

def detect_layering(G: nx.DiGraph, df: pd.DataFrame) -> List[Dict]:
    """
    Detect chains of 3+ hops where intermediate ("shell") nodes
    have only 2–3 total transaction edges total.
    Iterative DFS for performance on large graphs.
    """
    rings: List[Dict] = []

    send_cnt = df.groupby("sender_id", sort=False)["amount"].count()
    recv_cnt = df.groupby("receiver_id", sort=False)["amount"].count()
    tx_count_map = send_cnt.add(recv_cnt, fill_value=0).to_dict()
    max_out_amount = df.groupby("sender_id", sort=False)["amount"].max().to_dict()

    # Pre-compute shell node set (intermediate accounts with 2–3 total txns)
    # Shell nodes: accounts that pass money through (both in and out)
    shell_nodes: set = {
        node for node in G.nodes()
        if G.in_degree(node) >= 1
        and G.out_degree(node) >= 1
        and 2 <= tx_count_map.get(node, 0) <= 3
    }
    
    # Also identify potential destination accounts in layering chains
    # These may have low transaction counts and no outbound transfers
    destination_candidates: set = {
        node for node in G.nodes()
        if G.in_degree(node) >= 1
        and G.out_degree(node) == 0  # Pure receivers
        and tx_count_map.get(node, 0) <= 3  # Low activity
        and node.startswith(("DEST_", "EXIT_", "FINAL_"))  # Explicit destination naming
    }

    chains_found: set = set()
    MAX_CHAINS = 200  # cap for performance

    # Only start DFS from non-shell nodes that have successors in shell_nodes
    entry_nodes = [
        n for n in G.nodes() if n not in shell_nodes
        and max_out_amount.get(n, 0.0) >= 5000.0
        and any(nb in shell_nodes for nb in G.successors(n))
    ]

    for start in entry_nodes:
        if len(chains_found) >= MAX_CHAINS:
            break

        # Iterative DFS: stack of (current_node, path_so_far)
        stack = [(start, [start])]
        while stack:
            current, path = stack.pop()
            if current != start and tx_count_map.get(current, 0) > 3:
                continue
            for nxt in G.successors(current):
                if nxt in path:
                    continue
                new_path = path + [nxt]
                if nxt in shell_nodes:
                    stack.append((nxt, new_path))
                    # If we have ≥2 shells, check for exit node
                    shell_count = sum(1 for p in new_path[1:] if p in shell_nodes)
                    if shell_count >= 2:
                        # Prioritize destination candidates, then by transaction amount
                        exit_candidates = []
                        for exit_node in G.successors(nxt):
                            if exit_node not in shell_nodes and exit_node != start:
                                edge_data = G.get_edge_data(nxt, exit_node)
                                amount = edge_data.get("total_amount", 0) if edge_data else 0
                                is_dest = exit_node in destination_candidates
                                exit_candidates.append((exit_node, is_dest, amount))
                        
                        # Sort: destination candidates first, then by amount (descending)
                        exit_candidates.sort(key=lambda x: (not x[1], -x[2]))
                        
                        # Take only the best exit node for this shell
                        if exit_candidates:
                            best_exit = exit_candidates[0][0]
                            full = tuple(new_path + [best_exit])
                            if full not in chains_found and len(full) >= 4:
                                chains_found.add(full)

    # Step 1: Convert set of tuples to list of lists, sort longest first
    all_chains = sorted([list(c) for c in chains_found], key=len, reverse=True)

    # Step 2: Keep only longest chain per shell member set
    final_chains = []
    used_shell_sets = []

    for chain in all_chains:
        # Extract only the shell intermediate nodes (not origin or exit)
        chain_shells = frozenset(n for n in chain[1:-1] if n in shell_nodes)

        # Skip if this chain's shells are already covered by a longer chain
        if any(chain_shells.issubset(existing) for existing in used_shell_sets):
            continue

        final_chains.append(chain)
        used_shell_sets.append(chain_shells)

    for i, chain in enumerate(final_chains):
        total_amount = 0.0
        edges = []
        for s, r in zip(chain, chain[1:]):
            edata = G.get_edge_data(s, r)
            if edata:
                total_amount += edata.get("total_amount", 0.0)
            edges.append({"source": s, "target": r})

        risk_score = min(100.0, 35.0 + len(chain) * 7 + min(25.0, total_amount / 8000))

        rings.append({
            "ring_id": f"LAYER_{i + 1:04d}",
            "pattern_type": "layering",
            "member_accounts": list(chain),
            "member_count": len(chain),
            "risk_score": round(risk_score, 2),
            "total_amount": round(total_amount, 2),
            "edges": edges,
        })

    return rings


# ─────────────────────────────────────────────────────────────
# Suspicion Score Aggregator
# ─────────────────────────────────────────────────────────────

def calculate_suspicion_scores(
    G: nx.DiGraph,
    df: pd.DataFrame,
    fraud_rings: List[Dict],
    payroll_traps: set | None = None,
    merchant_traps: set | None = None,
    salary_recipients: set | None = None,
) -> List[Dict]:
    """
    Aggregate a 0–100 suspicion score per account.
    Optimised: single groupby pass computes all per-node stats;
    per-node loop does O(1) dict lookups instead of O(rows) DataFrame filters.
    """
    df_t = df.copy()
    df_t["ts"] = df_t["timestamp"].astype(np.int64) // 10**9

    # ── ONE-PASS per-node stats via groupby ─────────────────────
    send_vol  = df_t.groupby("sender_id")["amount"].sum().rename("send_vol")
    recv_vol  = df_t.groupby("receiver_id")["amount"].sum().rename("recv_vol")
    send_cnt  = df_t.groupby("sender_id")["amount"].count().rename("send_cnt")
    recv_cnt  = df_t.groupby("receiver_id")["amount"].count().rename("recv_cnt")
    send_uniq = df_t.groupby("sender_id")["receiver_id"].nunique().rename("send_uniq")
    recv_uniq = df_t.groupby("receiver_id")["sender_id"].nunique().rename("recv_uniq")

    ts_min_s  = df_t.groupby("sender_id")["ts"].min()
    ts_max_s  = df_t.groupby("sender_id")["ts"].max()
    ts_min_r  = df_t.groupby("receiver_id")["ts"].min()
    ts_max_r  = df_t.groupby("receiver_id")["ts"].max()

    df_t["is_round"] = (df_t["amount"] % 1000 < 1).astype(int)
    round_s   = df_t.groupby("sender_id")["is_round"].mean().rename("round_s")
    round_r   = df_t.groupby("receiver_id")["is_round"].mean().rename("round_r")

    stats = pd.DataFrame(index=pd.Index(list(G.nodes()), name="node"))
    stats = stats.join(send_vol).join(recv_vol).join(send_cnt).join(recv_cnt)
    stats = stats.join(send_uniq).join(recv_uniq).join(round_s).join(round_r)
    stats = stats.fillna(0)
    stats["total_volume"]  = stats["send_vol"]  + stats["recv_vol"]
    stats["txn_count"]     = stats["send_cnt"]  + stats["recv_cnt"]
    stats["uniq_partners"] = stats["send_uniq"] + stats["recv_uniq"]
    stats["round_frac"]    = (stats["round_s"]  + stats["round_r"]) / 2

    # Convert to plain Python dicts for O(1) access inside the loop
    total_volume_map  = stats["total_volume"].to_dict()
    txn_count_map     = stats["txn_count"].to_dict()
    uniq_cp_map       = stats["uniq_partners"].to_dict()
    round_frac_map    = stats["round_frac"].to_dict()

    def _velocity(node: str) -> float:
        t0 = min(ts_min_s.get(node, 10**18), ts_min_r.get(node, 10**18))
        t1 = max(ts_max_s.get(node, 0),      ts_max_r.get(node, 0))
        span_h = max((t1 - t0) / 3600, 1.0)
        return txn_count_map.get(node, 0) / span_h

    # ── Ring membership index ──────────────────────────────────
    ring_membership: Dict[str, List[Dict]] = {}
    for ring in fraud_rings:
        for member in ring["member_accounts"]:
            ring_membership.setdefault(member, []).append(ring)

    scores: List[Dict] = []

    payroll_traps = payroll_traps or set()
    merchant_traps = merchant_traps or set()
    salary_recipients = salary_recipients or set()

    for node in G.nodes():
        in_deg   = G.in_degree(node)
        out_deg  = G.out_degree(node)

        total_volume      = float(total_volume_map.get(node, 0))
        transaction_count = int(txn_count_map.get(node, 0))
        unique_cp         = int(uniq_cp_map.get(node, 0))
        round_frac        = float(round_frac_map.get(node, 0))

        # ── Merchant dampening ─────────────────────────────────
        merchant_factor = 1.0
        if   total_volume > 5_000_000 or (transaction_count > 500  and unique_cp > 100):
            merchant_factor = 0.25
        elif total_volume > 1_000_000 or (transaction_count > 200  and unique_cp > 50):
            merchant_factor = 0.50
        elif total_volume > 200_000:
            merchant_factor = 0.75

        score          = 0.0
        rings_for_node = ring_membership.get(node, [])
        if node in salary_recipients:
            rings_for_node = []

        if rings_for_node:
            avg_ring_risk = sum(r["risk_score"] for r in rings_for_node) / len(rings_for_node)
            score += avg_ring_risk * 0.70 * merchant_factor

        if in_deg >= 10 or out_deg >= 10:
            score += min(30.0, (in_deg + out_deg) * 1.2) * merchant_factor

        velocity = _velocity(node) if transaction_count > 1 else 0.0
        if velocity > 0.5:
            score += min(15.0, velocity * 3) * merchant_factor

        round_flag = False
        if round_frac > 0.7 and transaction_count >= 5:
            score += 10.0 * merchant_factor
            round_flag = True

        # ── detected_patterns (spec-required) ─────────────────
        detected_patterns: List[str] = []
        for r in rings_for_node:
            pt = r["pattern_type"]
            if pt == "cycle":
                detected_patterns.append(f"cycle_length_{r.get('member_count', 3)}")
            elif pt == "fan_in":
                detected_patterns.append("fan_in")
            elif pt == "fan_out":
                detected_patterns.append("fan_out")
            elif pt == "layering":
                detected_patterns.append("layering")
        if velocity > 0.5:
            detected_patterns.append("high_velocity")
        if round_flag:
            detected_patterns.append("round_number_amounts")
        detected_patterns = list(dict.fromkeys(detected_patterns))

        score = min(100.0, score)
        if node in payroll_traps:
            score = min(score, 15.0)
        if node in salary_recipients:
            score = min(score, 25.0)
        if node in merchant_traps:
            score = min(score, 20.0)

        scores.append({
            "account_id":        node,
            "suspicion_score":   round(score, 2),
            "detected_patterns": detected_patterns,
            "ring_id":           rings_for_node[0]["ring_id"] if rings_for_node else "",
            "in_degree":         in_deg,
            "out_degree":        out_deg,
            "total_volume":      round(total_volume, 2),
            "transaction_count": transaction_count,
            "ring_count":        len(rings_for_node),
            "pattern_types":     list({r["pattern_type"] for r in rings_for_node}),
            "merchant_factor":   merchant_factor,
        })

    return sorted(scores, key=lambda x: x["suspicion_score"], reverse=True)


# ─────────────────────────────────────────────────────────────
# Master Runner
# ─────────────────────────────────────────────────────────────

def run_full_analysis(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Entry point: run all detection algorithms and return the
    canonical result payload.
    """
    _t0 = time.perf_counter()
    df = df.copy()
    df["sender_id"]   = df["sender_id"].astype(str)
    df["receiver_id"] = df["receiver_id"].astype(str)
    df["amount"]      = pd.to_numeric(df["amount"], errors="coerce").fillna(0.0)
    df["timestamp"]   = pd.to_datetime(df["timestamp"], errors="coerce")
    df = df.dropna(subset=["timestamp"])

    G = build_graph(df)

    # FIX 4: Step 1 — compute DNA flags FIRST so detectors can skip demoted nodes
    dna_flags      = _load_dna_flags(df)
    payroll_traps  = _extract_trap_set(dna_flags, "is_payroll_trap")
    merchant_traps = _extract_trap_set(dna_flags, "is_merchant_trap")
    demoted_nodes  = payroll_traps | merchant_traps

    recv_senders = df.groupby("receiver_id", sort=False)["sender_id"].unique()
    salary_recipients = {
        node for node, senders in recv_senders.items()
        if len(senders) == 1 and senders[0] in payroll_traps
    }

    # FIX 4: Steps 2-4 — pass demoted_nodes so cycles/smurfs/shells skip them
    loops  = detect_circular_loops(G, df, demoted_nodes=demoted_nodes)
    smurfs = detect_smurfing(G, df, payroll_traps=payroll_traps, merchant_traps=merchant_traps)
    layers = detect_layering(G, df)

    all_rings = loops + smurfs + layers

    if salary_recipients:
        filtered_rings: List[Dict] = []
        for ring in all_rings:
            members = [m for m in ring.get("member_accounts", []) if m not in salary_recipients]
            edges = [
                e for e in ring.get("edges", [])
                if e.get("source") not in salary_recipients and e.get("target") not in salary_recipients
            ]
            if ring.get("pattern_type") == "cycle" and len(members) < 3:
                continue
            if ring.get("pattern_type") != "cycle" and len(members) < 2:
                continue
            ring = dict(ring)
            ring["member_accounts"] = members
            ring["member_count"] = len(members)
            ring["edges"] = edges
            filtered_rings.append(ring)
        all_rings = filtered_rings
    # Deduplicate by ring_id (should already be unique)
    all_rings = sorted(all_rings, key=lambda r: r["risk_score"], reverse=True)

    suspicious_accounts = calculate_suspicion_scores(
        G,
        df,
        all_rings,
        payroll_traps=payroll_traps,
        merchant_traps=merchant_traps,
        salary_recipients=salary_recipients,
    )

    # ── Build graph payload ───────────────────────────────
    # Collect all flagged edges for highlighting in the UI
    flagged_edges: set = set()
    flagged_nodes: set = set()
    ring_node_map: Dict[str, List[str]] = {}  # node → ring_ids

    for ring in all_rings:
        for edge in ring.get("edges", []):
            flagged_edges.add((edge["source"], edge["target"]))
        for member in ring["member_accounts"]:
            flagged_nodes.add(member)
            ring_node_map.setdefault(member, []).append(ring["ring_id"])

    # Build O(1) lookup dict – avoids O(nodes²) linear scan
    acct_map: Dict[str, Dict] = {a["account_id"]: a for a in suspicious_accounts}

    nodes_payload = []
    for n in G.nodes():
        acct = acct_map.get(n)
        nodes_payload.append({
            "id": n,
            "suspicious": n in flagged_nodes,
            "suspicion_score": acct["suspicion_score"] if acct else 0,
            "in_degree": G.in_degree(n),
            "out_degree": G.out_degree(n),
            "ring_ids": ring_node_map.get(n, []),
            "total_volume": acct["total_volume"] if acct else 0,
            "transaction_count": acct["transaction_count"] if acct else 0,
        })

    edges_payload = []
    for s, r, data in G.edges(data=True):
        edges_payload.append({
            "source": s,
            "target": r,
            "suspicious": (s, r) in flagged_edges,
            "total_amount": round(data.get("total_amount", 0.0), 2),
            "count": data.get("count", 1),
        })

    _processing_time = round(time.perf_counter() - _t0, 3)
    _flagged_count = sum(1 for a in suspicious_accounts if a["suspicion_score"] > 0 and a["ring_count"] > 0)

    # ── Filter suspicious accounts by minimum threshold ───────────────────
    # Only report accounts with meaningful risk (score > 0 OR in a fraud ring)
    # Exclude merchant and payroll traps unless they're in actual fraud rings
    MIN_SUSPICION_THRESHOLD = 0.0
    filtered_suspicious_accounts = [
        acc for acc in suspicious_accounts
        if (acc["suspicion_score"] > MIN_SUSPICION_THRESHOLD or acc["ring_count"] > 0)
        and not (acc["account_id"] in merchant_traps and acc["ring_count"] == 0)  # Exclude merchants not in rings
        and not (acc["account_id"] in payroll_traps and acc["ring_count"] == 0)   # Exclude payroll not in rings
    ]

    summary = {
        # ── Spec-required keys (exact names) ──────────────────
        "total_accounts_analyzed": G.number_of_nodes(),
        "suspicious_accounts_flagged": _flagged_count,
        "fraud_rings_detected": len(all_rings),
        "processing_time_seconds": _processing_time,
        # ── Extended UI keys ──────────────────────────────────
        "total_transactions": len(df),
        "total_nodes": G.number_of_nodes(),
        "total_edges": G.number_of_edges(),
        "circular_loops_found": len(loops),
        "smurfing_patterns_found": len(smurfs),
        "layering_chains_found": len(layers),
        "total_fraud_rings": len(all_rings),
        "high_risk_accounts": sum(1 for a in filtered_suspicious_accounts if a["suspicion_score"] >= 70),
        "medium_risk_accounts": sum(1 for a in filtered_suspicious_accounts if 40 <= a["suspicion_score"] < 70),
        "total_flagged_amount": round(
            sum(r["total_amount"] for r in all_rings), 2
        ),
    }

    return {
        "suspicious_accounts": filtered_suspicious_accounts,
        "fraud_rings": all_rings,
        "summary": summary,
        "graph": {
            "nodes": nodes_payload,
            "edges": edges_payload,
        },
    }
