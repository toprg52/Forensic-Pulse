"""
What-If Transaction Simulator
Allows investigators to model hypothetical transactions and see their
impact on the fraud detection graph before they occur.
"""

import copy
import time
import networkx as nx
from datetime import datetime
from typing import Dict, List, Any, Optional, Set, Tuple

_sim_counter = 0


def _get_sim_id() -> str:
    global _sim_counter
    _sim_counter += 1
    return f"SIM_{_sim_counter:03d}"


def simulate_transaction(
    hypothetical_tx: dict,
    existing_analysis: dict,
    existing_rings: list,
) -> dict:
    """
    Run a what-if simulation for a hypothetical transaction.

    Parameters
    ----------
    hypothetical_tx : dict with sender_id, receiver_id, amount, timestamp
    existing_analysis : the full result dict from run_full_analysis()
        Contains: suspicious_accounts, fraud_rings, summary, graph{nodes, edges}
    existing_rings : list of ring dicts from the last analysis

    Returns
    -------
    SimulationResult dict
    """
    t0 = time.perf_counter()

    sender = str(hypothetical_tx["sender_id"])
    receiver = str(hypothetical_tx["receiver_id"])
    amount = float(hypothetical_tx.get("amount", 0))
    timestamp = hypothetical_tx.get("timestamp") or datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # ── Step 1: Clone and Inject ────────────────────────────────────
    graph_data = existing_analysis.get("graph", {})
    nodes_list = graph_data.get("nodes", [])
    edges_list = graph_data.get("edges", [])

    # Rebuild NetworkX graph from the analysis payload
    G_orig = nx.DiGraph()
    node_map: Dict[str, dict] = {}
    for n in nodes_list:
        nid = n["id"]
        G_orig.add_node(nid)
        node_map[nid] = n

    for e in edges_list:
        G_orig.add_edge(
            e["source"], e["target"],
            total_amount=e.get("total_amount", 0),
            count=e.get("count", 1),
            suspicious=e.get("suspicious", False),
        )

    # Clone the graph
    G_sim = G_orig.copy()

    # Track new nodes
    new_nodes_introduced = 0
    if sender not in G_sim:
        G_sim.add_node(sender)
        new_nodes_introduced += 1
    if receiver not in G_sim:
        G_sim.add_node(receiver)
        new_nodes_introduced += 1

    # Add the hypothetical edge
    if G_sim.has_edge(sender, receiver):
        ed = G_sim[sender][receiver]
        ed["total_amount"] = ed.get("total_amount", 0) + amount
        ed["count"] = ed.get("count", 0) + 1
    else:
        G_sim.add_edge(sender, receiver, total_amount=amount, count=1, suspicious=False)

    # ── Step 2: Compute affected nodes and score deltas ─────────────
    affected_nodes: Set[str] = {sender, receiver}
    # Add 1-hop neighbors
    for n in [sender, receiver]:
        if G_sim.has_node(n):
            affected_nodes.update(G_sim.successors(n))
            affected_nodes.update(G_sim.predecessors(n))

    # Build account score map from existing analysis
    acct_scores: Dict[str, dict] = {}
    for acct in existing_analysis.get("suspicious_accounts", []):
        acct_scores[acct["account_id"]] = acct

    # Compute simple score deltas for affected nodes
    score_deltas: List[dict] = []
    for nid in affected_nodes:
        old_acct = acct_scores.get(nid)
        old_score = old_acct["suspicion_score"] if old_acct else 0.0

        # Estimate new score based on structural changes
        in_deg = G_sim.in_degree(nid)
        out_deg = G_sim.out_degree(nid)
        old_in = G_orig.in_degree(nid) if G_orig.has_node(nid) else 0
        old_out = G_orig.out_degree(nid) if G_orig.has_node(nid) else 0

        delta = 0.0
        reason_parts = []

        # Fan-in/fan-out change
        if in_deg > old_in:
            delta += (in_deg - old_in) * 3.5
            reason_parts.append(f"fan-in +{in_deg - old_in}")
        if out_deg > old_out:
            delta += (out_deg - old_out) * 3.5
            reason_parts.append(f"fan-out +{out_deg - old_out}")

        # Large amount contribution
        if amount > 10000:
            delta += min(8.0, amount / 10000)
            reason_parts.append("high amount")
        elif amount > 5000:
            delta += min(5.0, amount / 5000)
            reason_parts.append("moderate amount")

        new_score = min(100.0, old_score + delta)

        if abs(delta) > 2.0:
            score_deltas.append({
                "account_id": nid,
                "old_score": round(old_score, 2),
                "new_score": round(new_score, 2),
                "delta": round(delta, 2),
                "delta_reason": ", ".join(reason_parts) if reason_parts else "structural change",
            })

    score_deltas.sort(key=lambda x: abs(x["delta"]), reverse=True)

    # ── Step 3: Cycle Check on Affected Subgraph ────────────────────
    # Extract subgraph around affected nodes + 1-hop neighbors
    subgraph_nodes = set(affected_nodes)
    for n in list(affected_nodes):
        if G_sim.has_node(n):
            subgraph_nodes.update(G_sim.successors(n))
            subgraph_nodes.update(G_sim.predecessors(n))

    sub_sim = G_sim.subgraph(subgraph_nodes)

    # Find cycles in the simulation subgraph
    new_cycles: List[dict] = []
    try:
        import itertools
        for cycle in itertools.islice(nx.simple_cycles(sub_sim), 200):
            if len(cycle) < 3 or len(cycle) > 6:
                continue
            # Check if this cycle involves the hypothetical edge
            cycle_set = set(cycle)
            if sender not in cycle_set and receiver not in cycle_set:
                continue  # Not related to our hypothetical tx

            # Check if this cycle is truly NEW (didn't exist in original graph)
            is_new = False
            for i, node in enumerate(cycle):
                next_node = cycle[(i + 1) % len(cycle)]
                if (node == sender and next_node == receiver) or \
                   (not G_orig.has_edge(node, next_node)):
                    is_new = True
                    break

            if is_new:
                # Check it's not already in existing rings
                canonical = frozenset(cycle)
                already_in_ring = False
                for ring in existing_rings:
                    if canonical.issubset(set(ring.get("member_accounts", []))):
                        already_in_ring = True
                        break

                if not already_in_ring:
                    cycle_len = len(cycle)
                    risk = min(100.0, 55.0 + (5 - cycle_len) * 12 + min(33.0, amount / 2000))
                    new_cycles.append({
                        "cycle_members": cycle,
                        "cycle_length": cycle_len,
                        "cycle_risk_score": round(risk, 2),
                    })
    except Exception:
        pass

    # ── Step 4: Ring Impact Analysis ────────────────────────────────
    rings_affected: List[dict] = []
    rings_merged: List[dict] = []
    sender_rings: List[dict] = []
    receiver_rings: List[dict] = []

    for ring in existing_rings:
        members = set(ring.get("member_accounts", []))
        sender_in = sender in members
        receiver_in = receiver in members

        if sender_in:
            sender_rings.append(ring)
        if receiver_in:
            receiver_rings.append(ring)

        if sender_in and not receiver_in:
            # Receiver JOINS this ring
            old_risk = ring.get("risk_score", 0)
            new_risk = min(100.0, old_risk + min(8.0, amount / 5000) + 3.0)
            rings_affected.append({
                "ring_id": ring["ring_id"],
                "impact_type": "joins",
                "old_risk_score": round(old_risk, 2),
                "new_risk_score": round(new_risk, 2),
                "delta": round(new_risk - old_risk, 2),
                "description": f"Account {receiver} would be pulled into ring {ring['ring_id']} via transaction from {sender}.",
            })
        elif receiver_in and not sender_in:
            # Sender JOINS this ring
            old_risk = ring.get("risk_score", 0)
            new_risk = min(100.0, old_risk + min(8.0, amount / 5000) + 3.0)
            rings_affected.append({
                "ring_id": ring["ring_id"],
                "impact_type": "joins",
                "old_risk_score": round(old_risk, 2),
                "new_risk_score": round(new_risk, 2),
                "delta": round(new_risk - old_risk, 2),
                "description": f"Account {sender} would be pulled into ring {ring['ring_id']} via transaction to {receiver}.",
            })
        elif sender_in and receiver_in:
            # Escalates this ring
            old_risk = ring.get("risk_score", 0)
            new_risk = min(100.0, old_risk + min(12.0, amount / 3000) + 5.0)
            rings_affected.append({
                "ring_id": ring["ring_id"],
                "impact_type": "escalates",
                "old_risk_score": round(old_risk, 2),
                "new_risk_score": round(new_risk, 2),
                "delta": round(new_risk - old_risk, 2),
                "description": f"Transaction between two existing members ({sender} → {receiver}) strengthens ring {ring['ring_id']}.",
            })

    # Check ring merges: sender in ring_A, receiver in ring_B
    if sender_rings and receiver_rings:
        sender_ring_ids = {r["ring_id"] for r in sender_rings}
        for r_b in receiver_rings:
            if r_b["ring_id"] not in sender_ring_ids:
                r_a = sender_rings[0]
                merged_members = set(r_a.get("member_accounts", [])) | set(r_b.get("member_accounts", []))
                merged_risk = min(100.0, max(r_a.get("risk_score", 0), r_b.get("risk_score", 0)) + 15.0)
                rings_merged.append({
                    "ring_a": r_a["ring_id"],
                    "ring_b": r_b["ring_id"],
                    "merged_member_count": len(merged_members),
                    "merged_risk_score": round(merged_risk, 2),
                })

    # ── Step 5: Smurfing and Shell Re-check ─────────────────────────
    new_smurfing = False
    smurfing_account: Optional[str] = None

    # Fan-in check for receiver
    receiver_in_deg = G_sim.in_degree(receiver)
    old_receiver_in = G_orig.in_degree(receiver) if G_orig.has_node(receiver) else 0
    if receiver_in_deg >= 10 and old_receiver_in < 10:
        new_smurfing = True
        smurfing_account = receiver

    # Fan-out check for sender
    sender_out_deg = G_sim.out_degree(sender)
    old_sender_out = G_orig.out_degree(sender) if G_orig.has_node(sender) else 0
    if sender_out_deg >= 10 and old_sender_out < 10:
        new_smurfing = True
        smurfing_account = sender

    # Shell chain extension check
    new_shell_chain = False
    chain_detail: Optional[str] = None

    # Check if the hypothetical edge extends a layering chain
    for ring in existing_rings:
        if ring.get("pattern_type") != "layering":
            continue
        members = ring.get("member_accounts", [])
        if len(members) < 2:
            continue
        last_member = members[-1]
        first_member = members[0]

        if sender == last_member and receiver not in members:
            new_shell_chain = True
            chain_detail = f"Extends layering chain {ring['ring_id']} by one hop: {sender} → {receiver}"
            break
        if receiver == first_member and sender not in members:
            new_shell_chain = True
            chain_detail = f"Prepends to layering chain {ring['ring_id']}: {sender} → {receiver}"
            break

    # ── Determine Verdict ───────────────────────────────────────────
    if new_cycles or rings_merged:
        verdict = "DANGEROUS"
        if new_cycles:
            c = new_cycles[0]
            verdict_reason = (
                f"This transaction completes a {c['cycle_length']}-node cycle "
                f"between {', '.join(c['cycle_members'][:3])}{'...' if len(c['cycle_members']) > 3 else ''}. "
                f"Estimated cycle risk: {c['cycle_risk_score']}."
            )
        else:
            m = rings_merged[0]
            verdict_reason = (
                f"This transaction merges ring {m['ring_a']} and ring {m['ring_b']} "
                f"into a single {m['merged_member_count']}-member ring with risk score {m['merged_risk_score']}."
            )
    elif any(r["impact_type"] in ("joins", "escalates") for r in rings_affected) or new_smurfing:
        verdict = "WARNING"
        parts = []
        if rings_affected:
            r = rings_affected[0]
            parts.append(f"{'Joins' if r['impact_type'] == 'joins' else 'Escalates'} ring {r['ring_id']} (risk +{r['delta']}).")
        if new_smurfing:
            parts.append(f"Triggers smurfing threshold for {smurfing_account}.")
        verdict_reason = " ".join(parts)
    elif score_deltas and any(d["delta"] > 5 for d in score_deltas):
        verdict = "SUSPICIOUS"
        top = score_deltas[0]
        verdict_reason = (
            f"Elevates suspicion score of {top['account_id']} by +{top['delta']} "
            f"(from {top['old_score']} to {top['new_score']}). Primary factor: {top['delta_reason']}."
        )
    else:
        verdict = "CLEAN"
        verdict_reason = "This transaction has no significant impact on the fraud detection graph."

    processing_ms = round((time.perf_counter() - t0) * 1000, 2)

    return {
        "simulation_id": _get_sim_id(),
        "hypothetical_tx": {
            "sender_id": sender,
            "receiver_id": receiver,
            "amount": amount,
            "timestamp": timestamp,
        },
        "verdict": verdict,
        "verdict_reason": verdict_reason,
        "new_cycles_created": new_cycles,
        "rings_affected": rings_affected,
        "rings_merged": rings_merged,
        "score_deltas": score_deltas,
        "new_smurfing_triggered": new_smurfing,
        "smurfing_account": smurfing_account,
        "new_shell_chain_extended": new_shell_chain,
        "chain_extension_detail": chain_detail,
        "subgraph_delta": {
            "nodes_affected": len(affected_nodes),
            "edges_added": 1,
            "new_nodes_introduced": new_nodes_introduced,
        },
        "processing_time_ms": processing_ms,
    }


# ── Smoke Tests ─────────────────────────────────────────────────────
if __name__ == "__main__":

    def _build_test_graph():
        """A→B→C, no cycle"""
        return {
            "suspicious_accounts": [
                {"account_id": "ACC_A", "suspicion_score": 20, "detected_patterns": [], "ring_id": "", "in_degree": 0, "out_degree": 1, "total_volume": 5000, "transaction_count": 1, "ring_count": 0, "pattern_types": [], "merchant_factor": 1.0},
                {"account_id": "ACC_B", "suspicion_score": 15, "detected_patterns": [], "ring_id": "", "in_degree": 1, "out_degree": 1, "total_volume": 10000, "transaction_count": 2, "ring_count": 0, "pattern_types": [], "merchant_factor": 1.0},
                {"account_id": "ACC_C", "suspicion_score": 10, "detected_patterns": [], "ring_id": "", "in_degree": 1, "out_degree": 0, "total_volume": 5000, "transaction_count": 1, "ring_count": 0, "pattern_types": [], "merchant_factor": 1.0},
            ],
            "fraud_rings": [],
            "summary": {},
            "graph": {
                "nodes": [
                    {"id": "ACC_A", "suspicious": False, "suspicion_score": 20, "in_degree": 0, "out_degree": 1, "ring_ids": [], "total_volume": 5000, "transaction_count": 1},
                    {"id": "ACC_B", "suspicious": False, "suspicion_score": 15, "in_degree": 1, "out_degree": 1, "ring_ids": [], "total_volume": 10000, "transaction_count": 2},
                    {"id": "ACC_C", "suspicious": False, "suspicion_score": 10, "in_degree": 1, "out_degree": 0, "ring_ids": [], "total_volume": 5000, "transaction_count": 1},
                ],
                "edges": [
                    {"source": "ACC_A", "target": "ACC_B", "suspicious": False, "total_amount": 5000, "count": 1},
                    {"source": "ACC_B", "target": "ACC_C", "suspicious": False, "total_amount": 5000, "count": 1},
                ],
            },
        }

    # Test 1: Cycle creation (C→A completes A→B→C→A)
    result = simulate_transaction(
        hypothetical_tx={"sender_id": "ACC_C", "receiver_id": "ACC_A", "amount": 9000, "timestamp": "2024-01-10 10:00:00"},
        existing_analysis=_build_test_graph(),
        existing_rings=[],
    )
    assert result["verdict"] == "DANGEROUS", f"Expected DANGEROUS, got {result['verdict']}"
    assert len(result["new_cycles_created"]) >= 1, "Expected at least one new cycle"
    print(f"✅ Test 1 PASSED: Cycle creation → verdict={result['verdict']}, cycles={len(result['new_cycles_created'])}")

    # Test 2: Clean transaction (D→E, isolated)
    result2 = simulate_transaction(
        hypothetical_tx={"sender_id": "ACC_D", "receiver_id": "ACC_E", "amount": 100, "timestamp": "2024-01-10 11:00:00"},
        existing_analysis=_build_test_graph(),
        existing_rings=[],
    )
    assert result2["verdict"] == "CLEAN", f"Expected CLEAN, got {result2['verdict']}"
    print(f"✅ Test 2 PASSED: Clean transaction → verdict={result2['verdict']}")

    # Test 3: Ring escalation
    ring_graph = _build_test_graph()
    ring_graph["graph"]["edges"].append({"source": "ACC_C", "target": "ACC_A", "suspicious": True, "total_amount": 4000, "count": 1})
    existing_ring = {
        "ring_id": "LOOP_0001",
        "pattern_type": "cycle",
        "member_accounts": ["ACC_A", "ACC_B", "ACC_C"],
        "member_count": 3,
        "risk_score": 65.0,
        "total_amount": 14000,
        "edges": [{"source": "ACC_A", "target": "ACC_B"}, {"source": "ACC_B", "target": "ACC_C"}, {"source": "ACC_C", "target": "ACC_A"}],
    }
    result3 = simulate_transaction(
        hypothetical_tx={"sender_id": "NEW_ACTOR", "receiver_id": "ACC_A", "amount": 50000, "timestamp": "2024-01-10 12:00:00"},
        existing_analysis=ring_graph,
        existing_rings=[existing_ring],
    )
    assert any(r["ring_id"] == "LOOP_0001" for r in result3["rings_affected"]), "Expected ring LOOP_0001 to be affected"
    print(f"✅ Test 3 PASSED: Ring join → verdict={result3['verdict']}, affected={[r['ring_id'] for r in result3['rings_affected']]}")

    print("\n🎉 Simulator smoke tests COMPLETE")
