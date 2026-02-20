# Forensic-Pulse

> AML & Money Muling Ring Detection powered by **NetworkX**, **FastAPI**, **React 18**, and **Cytoscape.js**

> 🔗 **Live Demo :**

> 🔗 **Live Website :** https://forensic-pulse.vercel.app/
---

## Project Title

**Financial Forensics Engine** — an interactive web application that ingests financial transaction data (CSV), constructs a directed money-flow graph, and automatically detects three categories of money muling rings: Circular Fund Routing, Smurfing (Fan-in / Fan-out), and Layered Shell Networks.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Python 3.13 · FastAPI 0.129 · Uvicorn |
| Graph Engine | NetworkX 3.6 (directed graph + SCC + Johnson's cycles) |
| Data Processing | Pandas 3.0 · NumPy |
| Frontend | React 18 · Vite 5 · Tailwind CSS 3 |
| Graph Visualisation | Cytoscape.js 3.29 |
| HTTP Client | Axios |
| Notifications | react-hot-toast |
| Export | Browser-native `Blob` download (JSON) |

---

## System Architecture

```
┌─────────────────────────────────────────────────┐
│                  Browser (React)                │
│  FileUpload → App.jsx → SummaryCards            │
│                       → GraphView (Cytoscape)   │
│                       → TableView               │
│                       → ExportButton            │
└────────────────────┬────────────────────────────┘
                     │  POST /analyze  (multipart CSV)
                     ▼
┌─────────────────────────────────────────────────┐
│             FastAPI Backend (Python)            │
│  main.py                                        │
│    └─ detection_engine.py                       │
│         ├─ build_graph()        DiGraph         │
│         ├─ detect_circular_loops()              │
│         ├─ detect_smurfing()                    │
│         ├─ detect_layering()                    │
│         ├─ calculate_suspicion_scores()         │
│         └─ run_full_analysis()  → JSON          │
└─────────────────────────────────────────────────┘
```

**Data flow:**
1. User uploads CSV → FastAPI reads into Pandas DataFrame
2. `build_graph()` creates a `nx.DiGraph` (nodes = accounts, edges = transactions)
3. Three detection algorithms run in parallel on the graph
4. `calculate_suspicion_scores()` assigns a 0–100 risk score per account
5. JSON response is returned → React renders graph + table + summary cards

---

## Folder Structure

```
MyCode/
├── backend/
│   ├── main.py               ← FastAPI app + /analyze, /health, /sample-csv
│   ├── detection_engine.py   ← All detection algorithms + scoring
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx            ← Root component, axios call
│   │   ├── components/
│   │   │   ├── Navbar.jsx
│   │   │   ├── FileUpload.jsx
│   │   │   ├── SummaryCards.jsx
│   │   │   ├── GraphView.jsx  ← Cytoscape.js interactive graph
│   │   │   ├── TableView.jsx  ← Fraud ring summary table
│   │   │   └── ExportButton.jsx ← Spec-compliant JSON export
│   │   └── index.css
│   ├── package.json
│   ├── vite.config.js         ← Proxy /analyze → :8000
│   └── tailwind.config.js
├── demo_transactions.csv      ← 10 K sample with planted fraud
├── 100K_demo.csv              ← 100 K stress-test dataset
├── render.yaml                ← One-click Render.com deployment
└── start.bat                  ← Windows one-click local startup
```

---

## Algorithm Approach & Complexity Analysis

### 1. Circular Fund Routing (Cycles of length 3–5)

- **Method:** Johnson's algorithm via `nx.simple_cycles()`, restricted to **Strongly Connected Components (SCCs)** with ≥ 3 nodes
- **Complexity:** O(V + E + C·N) where C = number of cycles found, N = SCC size
- **Optimisations:** SCC pre-filter eliminates acyclic subgraphs; `itertools.islice(300)` per SCC caps enumeration; 8-second hard wall-clock timeout prevents runaway

### 2. Smurfing — Fan-in / Fan-out

- **Method:** Per-hub sorted-timestamp two-pointer sliding window
- **Complexity:** O(E log E) — sort once, O(n) sweep per node
- **Trigger:** ≥ 10 in/out edges **and** ≥ 10 transactions in any 72-hour window
- **Optimisation:** Replaces the original O(n²) anchor-scan with numpy-sorted arrays; groupby pre-build means zero per-node DataFrame filters

### 3. Layered Shell Networks

- **Method:** Iterative DFS from entry nodes into shell-node subgraph
- **Complexity:** O(V + E) bounded DFS, capped at 300 chains
- **Shell node:** account with total degree 2–3 (passthrough account heuristic)

### Graph Construction

- **Complexity:** O(E log E) — groupby aggregation replaces O(E) iterrows
- Edges aggregated by (sender, receiver) pair; `total_amount` and `count` stored per edge

---

## Suspicion Score Methodology (0–100)

Each account receives a composite score:

| Component | Weight | Notes |
|-----------|--------|-------|
| Ring membership (avg ring risk) | 70 % | Only if account is in ≥1 detected ring |
| Degree anomaly | up to 30 pts | `(in_deg + out_deg) × 1.2`, capped at 30 |
| Transaction velocity | up to 15 pts | txns / active hour; only if > 0.5 txns/h |
| Round-number clustering | 10 pts | > 70 % of amounts divisible by 1000 |

**Merchant dampening** (false-positive control):

| Condition | Factor |
|-----------|--------|
| Volume > $5 M **or** (>500 txns + >100 counterparties) | × 0.25 |
| Volume > $1 M **or** (>200 txns + >50 counterparties) | × 0.50 |
| Volume > $200 K | × 0.75 |
| All others | × 1.00 |

All four components are multiplied by the merchant factor before summing, ensuring legitimate high-volume merchants or payroll accounts never cross the flagging threshold.

---

## Input Specification

CSV must have exactly these columns:

| Column | Type | Example |
|--------|------|---------|
| `transaction_id` | String | `TXN_00001` |
| `sender_id` | String | `ACC_042` |
| `receiver_id` | String | `ACC_007` |
| `amount` | Float | `15000.00` |
| `timestamp` | DateTime (YYYY-MM-DD HH:MM:SS) | `2025-01-15 09:30:00` |

---

## Output Format (exact spec)

```json
{
  "suspicious_accounts": [
    {
      "account_id": "ACC_00123",
      "suspicion_score": 87.5,
      "detected_patterns": ["cycle_length_3", "high_velocity"],
      "ring_id": "RING_001"
    }
  ],
  "fraud_rings": [
    {
      "ring_id": "RING_001",
      "member_accounts": ["ACC_00123"],
      "pattern_type": "cycle",
      "risk_score": 95.3
    }
  ],
  "summary": {
    "total_accounts_analyzed": 500,
    "suspicious_accounts_flagged": 15,
    "fraud_rings_detected": 4,
    "processing_time_seconds": 2.3
  }
}
```

---

# Installation & Setup

### Prerequisites
- Python 3.10+
- Node.js 18+

### Windows (one click)
```bat
start.bat
```

### Manual

**Backend**
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

**Frontend**
```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**

---

## Usage Instructions

1. Open the app in your browser
2. Click **Upload CSV** and select your transaction file (or click **Sample CSV** to download a demo)
3. Wait for analysis (≤ 30 s for 10 K rows)
4. **Summary Cards** — overview counts (rings, flagged accounts, total volume)
5. **Graph View** — interactive Cytoscape.js graph; suspicious nodes are highlighted red; hover for score/ring details; select layout from dropdown
6. **Fraud Ring Table** — each detected ring with Ring ID, Pattern Type, Member Count, Risk Score, and member Account IDs
7. **Export JSON** — downloads a spec-compliant JSON file for submission / audit

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/analyze` | Upload CSV → full analysis JSON |
| `GET` | `/sample-csv` | Download sample transactions CSV |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI (auto-generated) |

---

## Known Limitations

- **Very dense graphs (>50 K unique accounts):** Cycle detection is capped at 300 cycles/SCC and an 8-second budget; some long cycles may be missed under extreme graph density
- **Timestamp granularity:** Smurfing detection uses a 72-hour exact window; coordinated rings operating just outside this window may be missed
- **Shell node threshold:** Accounts with 2–3 total edges are classified as shells; legitimate low-activity personal accounts may occasionally match this heuristic
- **No persistent storage:** Analysis results are in-memory per request; there is no database or historical comparison
- **Single-file upload only:** Batch or streaming ingestion is not supported in the current version

---

## Team Members

| Name | Role |
|------|------|
| Shouraya Sharma | Backend Developer |
| Anchit Goel | Frontend Developer |
| Ryan Gupta | UI/UX Designs and Web dev |

---

## License

MIT
