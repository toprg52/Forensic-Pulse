"""
Financial Forensics Engine – FastAPI Backend
RIFT 2026 Hackathon
"""

import io
import json
from pathlib import Path
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import pandas as pd

from detection_engine import run_full_analysis
from simulator import simulate_transaction

app = FastAPI(
    title="Financial Forensics Engine",
    description="RIFT 2026 Hackathon – AML / Fraud Ring Detection API",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ──
class SimulationRequest(BaseModel):
    sender_id: str
    receiver_id: str
    amount: float
    timestamp: Optional[str] = None


# ── App state (persists between requests) ──
app.state.last_analysis_result = None
app.state.last_rings = None
app.state.last_all_nodes = set()


REQUIRED_COLUMNS = {"transaction_id", "sender_id", "receiver_id", "amount", "timestamp"}


# ─────────────────────────────────────────────────────────────
# CSV Auto-Sanitiser
# Fixes common upload issues before pandas ever sees the data:
#   1. Each row wrapped in outer quotes  →  "col1,col2,..."
#   2. Tab-separated instead of comma-separated
#   3. Semicolon-separated (European Excel export)
#   4. BOM (byte-order mark) at the start of the file
#   5. Windows line endings (\r\n)
#   6. Trailing whitespace / blank lines
# ─────────────────────────────────────────────────────────────

def sanitize_csv(raw: str) -> str:
    """Auto-detect and repair common CSV formatting issues."""
    # 1. Strip BOM if present
    raw = raw.lstrip("\ufeff")

    # 2. Normalise line endings
    raw = raw.replace("\r\n", "\n").replace("\r", "\n")

    lines = raw.split("\n")

    # 3. Drop blank lines
    lines = [l for l in lines if l.strip()]

    if not lines:
        return raw

    # 4. Strip wrapping quotes from every line  →  "col1,col2" → col1,col2
    #    Only strip if EVERY non-blank line starts AND ends with a quote
    #    (avoids damaging values that legitimately contain quotes)
    if all(l.startswith('"') and l.endswith('"') for l in lines):
        lines = [l[1:-1] for l in lines]

    # 5. Detect delimiter: comma, semicolon, or tab
    #    Use the header row to decide
    header = lines[0]
    comma_count     = header.count(",")
    semicolon_count = header.count(";")
    tab_count       = header.count("\t")

    if semicolon_count > comma_count and semicolon_count >= tab_count:
        # European Excel-style  →  replace ; with ,
        lines = [l.replace(";", ",") for l in lines]
    elif tab_count > comma_count:
        # TSV  →  replace tabs with commas
        lines = [l.replace("\t", ",") for l in lines]

    # 6. Strip leading/trailing whitespace from each line
    lines = [l.strip() for l in lines]

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────
# Health Check & Debug
# ─────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "Financial Forensics Engine", "version": "1.0.0"}


@app.get("/api/health")
def api_health():
    """Health check for API function testing."""
    return {"status": "ok", "service": "Financial Forensics Engine API"}


# ─────────────────────────────────────────────────────────────
# Main Analysis Endpoint
# ─────────────────────────────────────────────────────────────

@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Accept a CSV file and return full forensics analysis.

    Required CSV columns:
        transaction_id, sender_id, receiver_id, amount,
        timestamp (YYYY-MM-DD HH:MM:SS)
    """
    import traceback
    
    try:
        if not file.filename.endswith(".csv"):
            raise HTTPException(status_code=400, detail="Only CSV files are accepted.")

        contents = await file.read()

        # Decode – try UTF-8, fall back to latin-1 (covers Windows-1252 exports)
        try:
            raw_text = contents.decode("utf-8")
        except UnicodeDecodeError:
            raw_text = contents.decode("latin-1")

        # Auto-repair common formatting issues
        clean_text = sanitize_csv(raw_text)

        try:
            df = pd.read_csv(io.StringIO(clean_text))
        except Exception as e:
            raise HTTPException(status_code=422, detail=f"Could not parse CSV: {e}")

        # Normalise column names
        df.columns = [c.strip().lower() for c in df.columns]

        missing = REQUIRED_COLUMNS - set(df.columns)
        if missing:
            raise HTTPException(
                status_code=422,
                detail=f"Missing required columns: {sorted(missing)}"
            )

        if len(df) == 0:
            raise HTTPException(status_code=422, detail="CSV is empty.")

        print(f"Starting analysis on {len(df)} transactions...")
        result = run_full_analysis(df)
        print(f"Analysis complete!")
        return JSONResponse(content=result)
        
    except HTTPException:
        raise
    except Exception as e:
        error_msg = f"Analysis failed: {str(e)}"
        error_trace = traceback.format_exc()
        print(f"ERROR: {error_msg}\n{error_trace}")
        raise HTTPException(status_code=500, detail=error_msg)

    # Cache results for simulator
    app.state.last_analysis_result = result
    app.state.last_rings = result.get("fraud_rings", [])
    app.state.last_all_nodes = set(
        n["id"] for n in result.get("graph", {}).get("nodes", [])
    )

    return JSONResponse(content=result)


# ─────────────────────────────────────────────────────────────
# Sample / Demo Data Generator
# ─────────────────────────────────────────────────────────────

@app.get("/api/sample-csv")
def get_sample_csv():
    """Return a small sample CSV payload for UI demo purposes."""
    import random
    from datetime import datetime, timedelta

    random.seed(42)
    base_time = datetime(2025, 1, 1, 9, 0, 0)
    rows = []
    tid = 1

    accounts = [f"ACC_{i:03d}" for i in range(1, 31)]

    # Circular loop: A→B→C→A
    loop_nodes = ["ACC_001", "ACC_002", "ACC_003"]
    for s, r in zip(loop_nodes, loop_nodes[1:] + [loop_nodes[0]]):
        rows.append([f"TXN_{tid:05d}", s, r, 15000, base_time + timedelta(hours=tid)])
        tid += 1

    # Circular loop 4-hop: D→E→F→G→D
    loop4 = ["ACC_004", "ACC_005", "ACC_006", "ACC_007"]
    for s, r in zip(loop4, loop4[1:] + [loop4[0]]):
        rows.append([f"TXN_{tid:05d}", s, r, 8500, base_time + timedelta(hours=tid + 2)])
        tid += 1

    # Smurfing fan-in: 15 senders → ACC_010
    for i in range(15):
        sender = accounts[10 + i % len(accounts)]
        rows.append([f"TXN_{tid:05d}", sender, "ACC_010", random.uniform(900, 9900),
                     base_time + timedelta(hours=i * 3)])
        tid += 1

    # Smurfing fan-out: ACC_011 → 12 receivers
    for i in range(12):
        recv = accounts[(15 + i) % len(accounts)]
        rows.append([f"TXN_{tid:05d}", "ACC_011", recv, random.uniform(500, 4999),
                     base_time + timedelta(hours=i * 4)])
        tid += 1

    # Layering chain: ACC_020 → SHELL_1 → SHELL_2 → SHELL_3 → ACC_025
    shell_chain = ["ACC_020", "SH_001", "SH_002", "SH_003", "ACC_025"]
    for s, r in zip(shell_chain, shell_chain[1:]):
        rows.append([f"TXN_{tid:05d}", s, r, 22000, base_time + timedelta(hours=tid)])
        tid += 1
    # Only 2-3 txns for shell nodes
    rows.append([f"TXN_{tid:05d}", "SH_001", "SH_099", 100, base_time + timedelta(hours=tid)])
    tid += 1

    # Random legitimate transactions
    for _ in range(60):
        s = random.choice(accounts)
        r = random.choice(accounts)
        if s != r:
            rows.append([f"TXN_{tid:05d}", s, r, round(random.uniform(100, 50000), 2),
                         base_time + timedelta(hours=random.randint(0, 200))])
            tid += 1

    df = pd.DataFrame(rows, columns=["transaction_id", "sender_id", "receiver_id", "amount", "timestamp"])
    csv_str = df.to_csv(index=False)

    from fastapi.responses import Response
    return Response(
        content=csv_str,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=sample_transactions.csv"},
    )


# ─────────────────────────────────────────────────────────────
# What-If Transaction Simulator
# ─────────────────────────────────────────────────────────────

@app.post("/api/simulate")
async def simulate_endpoint(request: SimulationRequest):
    """Run a what-if simulation for a hypothetical transaction."""
    if app.state.last_analysis_result is None:
        raise HTTPException(
            status_code=400,
            detail="No analysis data in memory. Upload and analyze a CSV first.",
        )

    ts = request.timestamp or datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    result = simulate_transaction(
        hypothetical_tx={
            "sender_id": request.sender_id,
            "receiver_id": request.receiver_id,
            "amount": request.amount,
            "timestamp": ts,
        },
        existing_analysis=app.state.last_analysis_result,
        existing_rings=app.state.last_rings or [],
    )

    return JSONResponse(content=result)


@app.get("/api/accounts")
async def get_account_list():
    """Return all known account IDs (for frontend autocomplete)."""
    if not app.state.last_all_nodes:
        return {"accounts": []}
    return {"accounts": sorted(list(app.state.last_all_nodes))}


# ─────────────────────────────────────────────────────────────
# Serve React SPA (production build)
# When frontend/dist exists, FastAPI serves it directly so the
# whole app runs as a single service on any cloud platform.
# ─────────────────────────────────────────────────────────────

_dist = Path(__file__).parent.parent / "frontend" / "dist"

if _dist.exists():
    # Static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=str(_dist / "assets")), name="spa-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """SPA catch-all – return index.html for any unknown path."""
        return FileResponse(str(_dist / "index.html"))
