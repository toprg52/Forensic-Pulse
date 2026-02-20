"""
Vercel Serverless Function for FastAPI Backend
"""
import sys
from pathlib import Path

# Add the backend directory to Python path
backend_path = Path(__file__).parent.parent / "back-end" / "new-back"
sys.path.insert(0, str(backend_path))

# Import FastAPI app
from main import app

# Expose as ASGI application for Vercel
# Vercel will automatically handle the ASGI adapter

