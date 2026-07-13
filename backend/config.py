"""Central settings — all values from environment variables or .env file."""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env", override=True)

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

# ── PostgreSQL Database ────────────────────────────────────────────────────────
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_DB   = os.getenv("POSTGRES_DB", "grabgpt")
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD", "postgres")

# ── Auth Config ────────────────────────────────────────────────────────────────
AUTH_SESSION_ENDPOINT = os.getenv("AUTH_SESSION_ENDPOINT", "http://localhost:8743/api/mock/auth-session")
AUTH_GOOGLE_ENDPOINT  = os.getenv("AUTH_GOOGLE_ENDPOINT", "http://localhost:8743/api/mock/auth-google")
SESSION_COOKIE_NAME   = os.getenv("SESSION_COOKIE_NAME", "grabon_session")
SESSION_COOKIE_DOMAIN = os.getenv("SESSION_COOKIE_DOMAIN", "localhost")
GOOGLE_CLIENT_ID      = os.getenv("GOOGLE_CLIENT_ID", "placeholder-google-client-id")
USER_ID_FIELD         = os.getenv("USER_ID_FIELD", "user_id")
MOCK_AUTH_ENABLED     = os.getenv("MOCK_AUTH_ENABLED", "true").lower() == "true"

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
API_PORT             = int(os.getenv("API_PORT", "8743"))

# ── Config file paths ──────────────────────────────────────────────────────────
CONFIG_DIR    = Path(__file__).parent / "config"
EXCLUSIONS_FILE      = CONFIG_DIR / "exclusions.yaml"
SETTINGS_FILE        = CONFIG_DIR / "settings.yaml"
WIDEN_VERTICALS_FILE = CONFIG_DIR / "widen_verticals.yaml"
PROMPTS_DIR      = Path(__file__).parent / "prompts"

# ── Coupon selection (search -> reveal redesign) ───────────────────────────────
# Fetch-size tiers by number of distinct items (stores/verticals) in one query.
# Index 0 unused; index N = coupons fetched per item when the query has N items.
COUPON_FETCH_TIERS = {1: 30, 2: 15}
COUPON_FETCH_TIER_FLOOR = 10  # 3+ items: 10 each

# How many coupons to surface per item in the final answer.
COUPON_PICK_SINGLE_ITEM = 3
COUPON_PICK_PER_ITEM    = 2  # when the query has 2+ items
