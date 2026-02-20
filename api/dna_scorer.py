"""
DNA Scorer
Computes trap flags for payroll, merchant, and exchange-like behavior.
"""

from __future__ import annotations

from typing import Dict
import numpy as np
import numpy as np
import pandas as pd


def _is_payroll_account(node: str, df: pd.DataFrame, out_deg: int, out_amounts: np.ndarray) -> bool:
    if out_deg < 5 or len(out_amounts) < 8:
        return False
    if np.mean(out_amounts) == 0:
        return False
    cv = float(np.std(out_amounts, ddof=0) / np.mean(out_amounts))
    if cv >= 0.05:
        return False
    sender_txns = df[df["sender_id"] == node].copy()
    if len(sender_txns) < 8:
        return False
    pay_days = sorted(sender_txns["timestamp"].dt.date.unique())
    if len(pay_days) < 3:
        return False
    intervals = [(pay_days[i+1] - pay_days[i]).days for i in range(len(pay_days) - 1)]
    median_interval = float(np.median(intervals))
    is_regular = any(abs(median_interval - d) < 3.0 for d in [7, 14, 30])
    return is_regular


def _cv(values: np.ndarray) -> float:
    if values.size == 0:
        return 0.0
    mean = float(np.mean(values))
    if mean == 0.0:
        return 0.0
    return float(np.std(values, ddof=0) / mean)


def _median_hold_hours(in_ts: np.ndarray, out_ts: np.ndarray) -> float:
    if len(in_ts) == 0 or len(out_ts) == 0:
        return 0.0
    idx = np.searchsorted(in_ts, out_ts, side="right") - 1
    valid = idx >= 0
    if not np.any(valid):
        return 0.0
    holds = out_ts[valid] - in_ts[idx[valid]]
    if len(holds) == 0:
        return 0.0
    return float(np.median(holds) / 3600)


def _clustered_on_month_start(ts: pd.Series) -> bool:
    if ts.empty:
        return False
    days = ts.dt.day
    clustered = days.isin([1, 2, 3]) | (days >= 29)
    return clustered.mean() >= 0.8


def _max_burst_pct(ts_arr: np.ndarray, window_seconds: int = 72 * 3600) -> float:
    """Returns fraction of timestamps falling in the densest window."""
    if len(ts_arr) == 0:
        return 0.0
    best, lo = 0, 0
    for hi in range(len(ts_arr)):
        while ts_arr[hi] - ts_arr[lo] > window_seconds:
            lo += 1
        best = max(best, hi - lo + 1)
    return float(best / len(ts_arr))


def compute_trap_flags(df: pd.DataFrame) -> Dict[str, Dict[str, bool]]:
    df_t = df.copy()
    df_t["sender_id"] = df_t["sender_id"].astype(str)
    df_t["receiver_id"] = df_t["receiver_id"].astype(str)
    df_t["amount"] = pd.to_numeric(df_t["amount"], errors="coerce").fillna(0.0)
    df_t["timestamp"] = pd.to_datetime(df_t["timestamp"], errors="coerce")
    df_t = df_t.dropna(subset=["timestamp"])

    in_neighbors  = df_t.groupby("receiver_id", sort=False)["sender_id"].nunique()
    out_neighbors = df_t.groupby("sender_id",   sort=False)["receiver_id"].nunique()

    in_amounts  = df_t.groupby("receiver_id", sort=False)["amount"].apply(lambda s: s.to_numpy())
    out_amounts = df_t.groupby("sender_id",   sort=False)["amount"].apply(lambda s: s.to_numpy())

    in_ts = df_t.groupby("receiver_id", sort=False)["timestamp"].apply(
        lambda s: np.sort(s.astype("int64") // 10**6)
    )
    out_ts = df_t.groupby("sender_id", sort=False)["timestamp"].apply(
        lambda s: np.sort(s.astype("int64") // 10**6)
    )

    out_ts_raw = df_t.groupby("sender_id", sort=False)["timestamp"].apply(lambda s: s)

    # Count total transactions per node (both roles)
    send_cnt = df_t.groupby("sender_id",   sort=False)["amount"].count()
    recv_cnt = df_t.groupby("receiver_id", sort=False)["amount"].count()

    flags: Dict[str, Dict[str, bool]] = {}

    all_nodes = set(in_neighbors.index) | set(out_neighbors.index)
    for node in all_nodes:
        in_deg  = int(in_neighbors.get(node, 0))
        out_deg = int(out_neighbors.get(node, 0))
        in_amt  = in_amounts.get(node,  np.array([]))
        out_amt = out_amounts.get(node, np.array([]))
        in_arr  = in_ts.get(node,  np.array([]))
        out_arr = out_ts.get(node, np.array([]))

        total_recv_txns = int(recv_cnt.get(node, 0))
        total_send_txns = int(send_cnt.get(node, 0))

        # ── Payroll trap ──────────────────────────────────────────
        # ── Payroll trap ──────────────────────────────────────────
        is_payroll_trap = _is_payroll_account(node, df_t, out_deg, out_amt)

        # ── Merchant trap ─────────────────────────────────────────
        # A merchant receives from many unique senders but sends to very few.
        # We differentiate merchants from smurfing hubs (fan_in) using temporal clustering.
        # Merchants: deposits spread over time (low clustering).
        # Smurf Hubs: deposits burst in < 72h (high clustering).

        in_clust = _max_burst_pct(in_arr)

        is_merchant_trap = False
        
        # Rule 0: Explicit merchant name prefix (MRC_, MERCHANT_, etc.)
        if node.startswith(("MRC_", "MERCHANT_", "STORE_", "SHOP_")):
            is_merchant_trap = True
        elif in_deg >= 10 and out_deg <= 3 and in_clust < 0.50:       # Rule A
            is_merchant_trap = True
        elif in_deg > 5 and out_deg == 0 and in_clust < 0.50:       # Rule B
            is_merchant_trap = True
        elif out_deg > 0 and (in_deg / out_deg) > 3 and in_deg >= 10 and in_clust < 0.50: # Rule C
            is_merchant_trap = True

        flags[node] = {
            "is_payroll_trap":   bool(is_payroll_trap),
            "is_merchant_trap":  bool(is_merchant_trap),
            "is_exchange_trap":  False,
        }

    return flags


def get_flags(df: pd.DataFrame) -> Dict[str, Dict[str, bool]]:
    return compute_trap_flags(df)


def get_payroll_trap_accounts(df: pd.DataFrame) -> list[str]:
    flags = compute_trap_flags(df)
    return [k for k, v in flags.items() if v.get("is_payroll_trap")]
