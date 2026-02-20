"""
Vercel Serverless Function for FastAPI Backend
"""
import sys
import os
from pathlib import Path

# Add the backend directory to Python path
backend_path = Path(__file__).parent.parent / "back-end" / "new-back"
sys.path.insert(0, str(backend_path))

print(f"[API] Backend path: {backend_path}")
print(f"[API] Backend exists: {backend_path.exists()}")
print(f"[API] Files in backend: {list(backend_path.glob('*.py'))}")

try:
    # Import FastAPI app
    from main import app
    print("[API] Successfully imported FastAPI app from main.py")
except ImportError as e:
    print(f"[API] Failed to import main.py: {e}")
    import traceback
    traceback.print_exc()
    raise
except Exception as e:
    print(f"[API] Unexpected error importing main.py: {e}")
    import traceback
    traceback.print_exc()
    raise

# Expose as ASGI application for Vercel
# Vercel will automatically handle the ASGI adapter
