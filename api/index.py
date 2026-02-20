"""
Vercel Serverless Function - Main API Handler
"""
import sys
from pathlib import Path

# Setup path
backend_path = Path(__file__).parent.parent / "back-end" / "new-back"
sys.path.insert(0, str(backend_path))

# Try to import FastAPI app
app = None
try:
    from main import app
    print("[API] ✓ FastAPI app imported successfully")
except ImportError as e:
    print(f"[API] ✗ Failed to import FastAPI: {e}")
except Exception as e:
    print(f"[API] ✗ Error importing FastAPI: {e}")

# If import failed, create minimal ASGI stub
if app is None:
    print("[API] Creating minimal ASGI fallback...")
    async def app(scope, receive, send):
        """Minimal ASGI app for health checks"""
        if scope['type'] == 'http':
            path = scope.get('path', '/')
            
            if path == '/api/health':
                await send({
                    'type': 'http.response.start',
                    'status': 200,
                    'headers': [[b'content-type', b'application/json']],
                })
                await send({
                    'type': 'http.response.body',
                    'body': b'{"status": "ok"}',
                })
            else:
                await send({
                    'type': 'http.response.start',
                    'status': 404,
                    'headers': [[b'content-type', b'application/json']],
                })
                await send({
                    'type': 'http.response.body',
                    'body': b'{"error": "Not found"}',
                })



