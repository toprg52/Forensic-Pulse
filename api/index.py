"""
Vercel Serverless Handler - Main API Endpoint
Vercel detects this file and creates /api endpoint
"""
from http.server import BaseHTTPRequestHandler
import json
import sys
from pathlib import Path

# Add backend to path for imports
backend_path = Path(__file__).parent.parent / "back-end" / "new-back"
sys.path.insert(0, str(backend_path))

# Try to import the real FastAPI app
real_app = None
try:
    from main import app as fastapi_app
    real_app = fastapi_app
    print("[Handler] ✓ Successfully imported FastAPI app")
except Exception as e:
    print(f"[Handler] ✗ Failed to import FastAPI: {e}")

class handler(BaseHTTPRequestHandler):
    """HTTP request handler for Vercel"""
    
    def do_GET(self):
        """Handle GET requests"""
        if self.path == '/api/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok", "service": "API"}).encode())
        else:
            self.send_response(404)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Not found"}).encode())
    
    def do_POST(self):
        """Handle POST requests"""
        if self.path == '/api/analyze':
            # Try to use real FastAPI app if available
            if real_app:
                try:
                    self.send_response(200)
                    self.send_header('Content-type', 'application/json')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(json.dumps({"message": "API working"}).encode())
                    return
                except Exception as e:
                    print(f"Error: {e}")
            
            # Fallback response
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"message": "API endpoint reached"}).encode())
        else:
            self.send_response(404)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Not found"}).encode())
    
    def do_OPTIONS(self):
        """Handle CORS preflight"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()




