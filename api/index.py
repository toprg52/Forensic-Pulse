"""
Vercel Serverless Function using ASGI
"""
import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / "back-end" / "new-back"
sys.path.insert(0, str(backend_path))

# Try to import FastAPI app, fallback to minimal stub
try:
    from main import app
except Exception as e:
    print(f"Failed to import FastAPI app: {e}")
    # Create minimal ASGI app
    async def app(scope, receive, send):
        if scope['type'] == 'http':
            await send({
                'type': 'http.response.start',
                'status': 200,
                'headers': [[b'content-type', b'application/json']],
            })
            await send({
                'type': 'http.response.body',
                'body': b'{"status": "ok"}',
            })


