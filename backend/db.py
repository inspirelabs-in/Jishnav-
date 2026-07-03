"""SQL Server connection pool (thread-local connections, one per thread)."""

import asyncio
import threading
import pyodbc
import config

# One connection per thread — eliminates blocking when multiple requests run concurrently.
_local = threading.local()


def _build_conn_string() -> str:
    base = (
        f"DRIVER={{{config.DB_DRIVER}}};"
        f"SERVER={config.DB_SERVER};"
        f"DATABASE={config.DB_NAME};"
        f"UID={config.DB_USER};"
        f"PWD={config.DB_PASSWORD};"
    )
    # Encrypt / TrustServerCertificate are only supported by ODBC Driver 17/18,
    # not by the legacy "SQL Server" driver (which uses DBNETLIB).
    if "ODBC Driver" in config.DB_DRIVER:
        base += f"Encrypt={config.DB_ENCRYPT};TrustServerCertificate=yes;"
    return base


def get_conn() -> pyodbc.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = pyodbc.connect(_build_conn_string(), autocommit=True, timeout=15)
        _local.conn = conn
    else:
        try:
            conn.execute("SELECT 1")
        except Exception:
            conn = pyodbc.connect(_build_conn_string(), autocommit=True, timeout=15)
            _local.conn = conn
    return conn


def query(sql: str, params: tuple = ()) -> list[dict]:
    """Synchronous query — used by cache.py, store_index.py, vertical_classifier.py at startup."""
    conn = get_conn()
    cursor = conn.cursor()
    cursor.execute(sql, params)
    cols = [c[0] for c in cursor.description]
    return [dict(zip(cols, row)) for row in cursor.fetchall()]


async def async_query(sql: str, params: tuple = ()) -> list[dict]:
    """Async query for use inside async request handlers — offloads to thread pool."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, query, sql, params)
