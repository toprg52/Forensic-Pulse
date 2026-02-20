import os
import sys

# Bulletproof path resolution for Vercel's serverless environment
possible_paths = [
    os.path.join(os.getcwd(), 'back-end', 'new-back'),
    os.path.join(os.path.dirname(__file__), '..', 'back-end', 'new-back'),
    os.path.join(os.path.dirname(__file__), 'back-end', 'new-back')
]

for p in possible_paths:
    if os.path.exists(p):
        sys.path.insert(0, p)
        break

from main import app
