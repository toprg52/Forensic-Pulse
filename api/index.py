"""
Vercel Serverless Function for FastAPI Backend
"""
import sys
from pathlib import Path

# Add the backend directory to Python path for imports
backend_path = Path(__file__).parent.parent / "back-end" / "new-back"
sys.path.insert(0, str(backend_path))

# Import and expose the FastAPI app for Vercel
from main import app

# Vercel Python serverless functions export the app directly
# This allows Vercel to route HTTPS requests to the ASGI app

