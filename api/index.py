"""
Vercel Serverless Function for FastAPI Backend
"""
import sys
import os
from pathlib import Path

# Get the absolute path to the backend directory
current_dir = Path(__file__).parent.absolute()
backend_path = current_dir.parent / "back-end" / "new-back"

# Ensure the backend directory is in the path
sys.path.insert(0, str(backend_path))

# Change to backend directory to ensure relative imports work
os.chdir(str(backend_path))

try:
    from main import app
except ImportError as e:
    # Fallback: Try importing modules directly
    print(f"Warning: Could not import from main.py: {e}")
    print(f"Backend path: {backend_path}")
    print(f"Files in backend path: {list(backend_path.glob('*.py'))}")
    raise

# Export the FastAPI app for Vercel
handler = app
