"""
LLM-based vertical classifier — replaces embedding_index + classifier.

Calls gpt-4o-mini with the full vertical list and user query.
Returns structured intent: matched vertical IDs, clarification needs, typo correction, intent type.
"""

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path

import yaml
from openai import AsyncOpenAI

import config
import cache
import db
import llm_logger

log = logging.getLogger(__name__)

# vertical_id → vertical_name (loaded at startup, filtered)
_verticals: dict[int, str] = {}

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=config.OPENAI_API_KEY)
    return _client


def _load_exclusions() -> set[int]:
    with open(config.EXCLUSIONS_FILE) as f:
        data = yaml.safe_load(f)
    return set(data.get("excluded_vertical_ids", []))


def build() -> None:
    """
    Load only verticals that have at least one store with coded coupons.
    Depends on cache.build() having run first.
    """
    excluded        = _load_exclusions()
    valid_cat_ids   = cache.get_valid_category_ids()

    if not valid_cat_ids:
        log.warning("No valid category IDs from cache — vertical classifier will be empty")
        return

    placeholders = ",".join("?" * len(valid_cat_ids))
    rows = db.query(
        f"""
        SELECT CategoryID, CategoryName
        FROM   {config.CATEGORIES_TABLE}
        WHERE  CategoryTypeID = 2
          AND  Status = 1
          AND  CategoryID IN ({placeholders})
        """,
        tuple(valid_cat_ids),
    )

    v: dict[int, str] = {}
    for r in rows:
        vid  = r["CategoryID"]
        name = (r["CategoryName"] or "").strip()
        if vid not in excluded and name:
            v[vid] = name

    _verticals.clear()
    _verticals.update(v)
    log.info("Vertical classifier ready: %d categories (all have coded coupons)", len(_verticals))


def get_verticals_list() -> list[dict]:
    """Return verticals as [{"id": 45, "name": "Flights"}, ...]"""
    return [{"id": vid, "name": name} for vid, name in _verticals.items()]


@dataclass
class ClassifyResult:
    corrected_query: str              = ""
    intent: str                       = "coupon_search"   # coupon_search | affirmation | negation | web_search | grabon_related | system_info | non_coupon
    matched_ids: list[int]            = field(default_factory=list)
    store_names: list[str]            = field(default_factory=list)
    location_keywords: dict[int, list[str]] = field(default_factory=dict)

    is_new_user: bool                 = False
    requested_count: int | None       = None
    min_discount: float | None        = None
    needs_clarification: bool         = False
    clarification_question: str       = ""
    is_followup: bool                 = False


async def classify(
    user_message: str,
    history: list[dict],          # [{"role": "user"|"assistant", "content": "..."}, ...]
    pending_offer: str = "",
) -> ClassifyResult:
    """
    Call gpt-4o-mini to classify the user's intent and match verticals.
    Always uses OpenAI regardless of LLM_PROVIDER setting (speed + accuracy).
    """
    prompt_path = config.PROMPTS_DIR / "intent_classify.txt"
    prompt_template = prompt_path.read_text(encoding="utf-8")

    verticals_json = json.dumps(get_verticals_list(), ensure_ascii=False)
    system_prompt  = prompt_template.replace("{verticals_json}", verticals_json)

    # Build messages: last 6 turns of history + current message
    recent_history = history[-6:] if len(history) > 6 else history
    messages = list(recent_history)

    # Give the LLM context about any pending offer so it can interpret affirmations correctly
    if pending_offer:
        messages.append({
            "role": "system",
            "content": f"[Context: the previous assistant message had a pending offer: {pending_offer!r}]"
        })

    messages.append({"role": "user", "content": user_message})

    try:
        client = _get_client()
        resp = await client.chat.completions.create(
            model       = "gpt-4o-mini",
            messages    = [{"role": "system", "content": system_prompt}] + messages,
            temperature = 0.0,
            max_tokens  = 300,
            response_format={"type": "json_object"},
        )
        cached = getattr(getattr(resp.usage, "prompt_tokens_details", None), "cached_tokens", 0) or 0
        log.info("Classifier tokens — input: %d  cached: %d  output: %d",
                 resp.usage.prompt_tokens, cached, resp.usage.completion_tokens)

        llm_logger.log_call(
            model         = "gpt-4o-mini",
            prompt_file   = "intent_classify.txt",
            function_name = "classify",
            input_tokens  = resp.usage.prompt_tokens     or 0,
            output_tokens = resp.usage.completion_tokens or 0,
            session_id    = "",
        )

        raw = resp.choices[0].message.content or ""
        data = json.loads(raw)

        # Parse store_names — LLM extracts explicitly named stores
        raw_sn = data.get("store_names", [])
        store_names = [str(s).strip() for s in raw_sn if isinstance(s, str) and str(s).strip()] if isinstance(raw_sn, list) else []

        # Parse location_keywords — {vertical_id_str: [keyword, ...]}
        location_keywords: dict[int, list[str]] = {}
        raw_lk = data.get("location_keywords", {})
        if isinstance(raw_lk, dict):
            for k, v in raw_lk.items():
                try:
                    vid = int(k)
                    if vid in _verticals and isinstance(v, list):
                        kws = [str(kw).strip() for kw in v if str(kw).strip()]
                        if kws:
                            location_keywords[vid] = kws
                except (ValueError, TypeError):
                    pass

        result = ClassifyResult(
            corrected_query        = data.get("corrected_query", user_message).strip(),
            intent                 = data.get("intent", "coupon_search"),
            matched_ids            = [int(i) for i in data.get("matched_ids", []) if i in _verticals],
            store_names            = store_names,
            location_keywords      = location_keywords,

            is_new_user            = bool(data.get("is_new_user", False)),
            requested_count        = int(data["requested_count"]) if data.get("requested_count") else None,
            min_discount           = float(data["min_discount"]) if data.get("min_discount") else None,
            needs_clarification    = bool(data.get("needs_clarification", False)),
            clarification_question = data.get("clarification_question", "").strip(),
            is_followup            = bool(data.get("is_followup", False)),
        )
        log.info(
            "Classify: intent=%s matched=%s clarify=%s corrected=%r",
            result.intent, result.matched_ids, result.needs_clarification, result.corrected_query,
        )
        return result

    except Exception as e:
        log.error("vertical_classifier LLM call failed: %s", e)
        # Safe fallback: treat as coupon search, no verticals matched
        return ClassifyResult(
            corrected_query=user_message,
            intent="coupon_search",
            matched_ids=[],
            needs_clarification=False,
        )
