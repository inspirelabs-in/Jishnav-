"""
Pytest configuration: add backend/ to sys.path so tests can import
main, query_router, etc. without installing the package.

The real .env at project root is loaded by config.py automatically.
"""
import sys
from pathlib import Path

BACKEND = Path(__file__).parent.parent
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))
