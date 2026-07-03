"""Central settings — all values from environment variables or .env file."""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

def _req(key: str) -> str:
    v = os.getenv(key)
    if not v:
        raise RuntimeError(f"Required env var {key!r} is not set")
    return v

# ── Database ───────────────────────────────────────────────────────────────────
DB_SERVER   = _req("DB_SERVER")
DB_NAME     = _req("DB_NAME")
DB_USER     = _req("DB_USER")
DB_PASSWORD = _req("DB_PASSWORD")
DB_DRIVER   = os.getenv("DB_DRIVER", "ODBC Driver 17 for SQL Server")
DB_ENCRYPT  = os.getenv("DB_ENCRYPT", "yes")

CATEGORIES_TABLE = os.getenv("CATEGORIES_TABLE", "dbo.Category")
COUPONS_TABLE    = os.getenv("COUPONS_TABLE", "dbo.Coupon")

# ── LLM ───────────────────────────────────────────────────────────────────────
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "ollama")

OLLAMA_URL   = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL   = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

LLM_RESPOND_TEMPERATURE = float(os.getenv("LLM_RESPOND_TEMPERATURE", "0.3"))
LLM_MAX_TOKENS          = int(os.getenv("LLM_MAX_TOKENS", "500"))

# ── Retrieval ──────────────────────────────────────────────────────────────────
COUPON_RETRIEVAL_LIMIT      = int(os.getenv("COUPON_RETRIEVAL_LIMIT", "10"))
COUPON_PER_VERTICAL_MIN     = int(os.getenv("COUPON_PER_VERTICAL_MIN", "4"))
CACHE_REFRESH_INTERVAL_HOURS = int(os.getenv("CACHE_REFRESH_INTERVAL_HOURS", "6"))

# ── Conversation ───────────────────────────────────────────────────────────────
MAX_CONVERSATION_TURNS  = int(os.getenv("MAX_CONVERSATION_TURNS", "6"))
SESSION_TIMEOUT_MINUTES = int(os.getenv("SESSION_TIMEOUT_MINUTES", "30"))

# ── Server ─────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS", "*").split(",")
API_HOST             = os.getenv("API_HOST", "0.0.0.0")
API_PORT             = int(os.getenv("API_PORT", "8000"))

# ── SearXNG ────────────────────────────────────────────────────────────────────
SEARXNG_URL             = os.getenv("SEARXNG_URL", "http://localhost:8080")
SEARXNG_TIMEOUT_SECONDS = int(os.getenv("SEARXNG_TIMEOUT_SECONDS", "10"))

# ── Feature flags ──────────────────────────────────────────────────────────────
# v0: Web search is disabled for the demo — set WEB_SEARCH_ENABLED=true in .env
# for v1 once SearXNG is verified running at SEARXNG_URL.
WEB_SEARCH_ENABLED = os.getenv("WEB_SEARCH_ENABLED", "false").lower() == "true"

# ── Config file paths ──────────────────────────────────────────────────────────
CONFIG_DIR    = Path(__file__).parent / "config"
EXCLUSIONS_FILE  = CONFIG_DIR / "exclusions.yaml"
SETTINGS_FILE    = CONFIG_DIR / "settings.yaml"
PROMPTS_DIR      = Path(__file__).parent / "prompts"
