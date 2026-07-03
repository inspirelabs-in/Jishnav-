"""
Case-insensitive store name lookup index.
Built at startup for Type A (direct store) query matching.
Supports fuzzy substring and alias matching.
"""

import difflib
import logging
import re

import config
import cache
import db

log = logging.getLogger(__name__)

# normalised_name_token → list of (store_id, canonical_name)
_index: dict[str, list[tuple[int, str]]] = {}

# store_id → canonical store name
_id_to_name: dict[int, str] = {}


def _normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def build() -> None:
    log.info("Building store name index...")

    valid_store_ids = cache.get_valid_store_ids()
    if not valid_store_ids:
        log.warning("No valid store IDs from cache — store index will be empty")
        return

    placeholders = ",".join("?" * len(valid_store_ids))
    rows = db.query(
        f"""
        SELECT CategoryID, CategoryName, Website, AlterNames
        FROM   {config.CATEGORIES_TABLE}
        WHERE  CategoryTypeID = 1
          AND  Status = 1
          AND  CategoryID IN ({placeholders})
        """,
        tuple(valid_store_ids),
    )

    idx: dict[str, list[tuple[int, str]]] = {}

    def _add(token: str, store_id: int, store_name: str) -> None:
        token = _normalise(token)
        if not token or len(token) < 2:
            return
        entry = (store_id, store_name)
        if entry not in idx.get(token, []):
            idx.setdefault(token, []).append(entry)

    id_to_name: dict[int, str] = {}

    for r in rows:
        sid   = r["CategoryID"]
        sname = (r["CategoryName"] or "").strip()
        if not sname:
            continue
        id_to_name[sid] = sname

        # Full normalised name (no spaces) — always indexed
        _add(sname, sid, sname)

        # Index individual words ONLY for single-word store names.
        # Multi-word stores (e.g. "Go First", "Big Basket") must not split into
        # individual tokens — "first", "big", "go" are too common in user queries
        # and cause false matches (e.g. "first order" → Go First).
        words = sname.split()
        if len(words) == 1:
            _add(words[0], sid, sname)

        # Website domain without TLD (e.g. "redbus" from "redbus.in")
        website = (r.get("Website") or "").lower().strip()
        if website:
            domain = website.split(".")[0].replace("www", "").strip()
            if domain:
                _add(domain, sid, sname)

        # AlterNames (comma-separated aliases)
        alters = r.get("AlterNames") or ""
        for alias in alters.split(","):
            alias = alias.strip()
            if alias:
                _add(alias, sid, sname)

    _index.clear()
    _index.update(idx)
    _id_to_name.clear()
    _id_to_name.update(id_to_name)

    log.info("Store index built: %d tokens, %d stores", len(idx), len(id_to_name))


def _escape_like(text: str) -> str:
    """Escape SQL LIKE wildcards so a brand name is matched literally."""
    return (
        text.replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")
            .replace("[", "\\[")
    )


async def find_stores_by_name_like(name: str) -> list[tuple[int, str]]:
    """
    Live DB fallback for store names the in-memory index missed — e.g. multi-word
    or stylized store names like "HP Shopping", "OnePlus India", "boAt Lifestyle"
    that are only indexed by their full joined name (never by individual words,
    per the "Go First" false-match fix).

    Only called for names the LLM already confirmed look like a brand
    (vertical_classifier's `store_names` field) — never for raw scanned query words.
    Matches CategoryName at WORD BOUNDARIES only (exact / starts-with / ends-with /
    surrounded-by-spaces) to avoid coincidental mid-word substring hits
    (e.g. "HP" inside an unrelated longer word).
    Scoped to stores that have at least one coded coupon.
    """
    name = (name or "").strip()
    if len(name) < 2:
        return []

    valid_ids = cache.get_valid_store_ids()
    if not valid_ids:
        return []

    esc = _escape_like(name)
    like_clause = (
        "(CategoryName LIKE ? ESCAPE '\\' OR "
        "CategoryName LIKE ? ESCAPE '\\' OR "
        "CategoryName LIKE ? ESCAPE '\\' OR "
        "CategoryName LIKE ? ESCAPE '\\')"
    )
    like_params = [esc, f"{esc} %", f"% {esc}", f"% {esc} %"]
    placeholders = ",".join("?" * len(valid_ids))

    sql = f"""
        SELECT CategoryID, CategoryName
        FROM   {config.CATEGORIES_TABLE}
        WHERE  CategoryTypeID = 1
          AND  Status = 1
          AND  {like_clause}
          AND  CategoryID IN ({placeholders})
    """
    params = tuple(like_params) + tuple(valid_ids)

    rows = await db.async_query(sql, params)
    return [
        (r["CategoryID"], (r["CategoryName"] or "").strip())
        for r in rows if r.get("CategoryName")
    ]


# Words that appear in user queries but are NOT store names.
# Prevents "me" in "give me X" from matching stores like "Reward Me".
_QUERY_STOPWORDS = {
    # Query phrasing words
    "give", "me", "show", "find", "get", "best", "top", "latest", "new",
    "some", "any", "all", "my", "i", "want", "need", "looking", "for",
    "please", "can", "you", "do", "have", "has", "are", "is", "was",
    "what", "which", "where", "how", "much", "many", "there",
    # Coupon-related common words (not store names)
    "codes", "code", "coupon", "coupons", "deals", "deal", "discount",
    "discounts", "offer", "offers", "promo", "promos", "voucher", "vouchers",
    # Time words (commonly in situational queries — "next week", "tomorrow")
    "today", "tomorrow", "now", "next", "last", "week", "month", "year",
    "day", "night", "morning", "evening", "soon", "later",
    # Planning/action verbs often in natural language queries
    "planning", "going", "booking", "buying", "order", "ordering",
    "visit", "visiting", "travel", "travelling", "traveling",
    "fly", "flying", "trip", "around",
}


def find_stores(query: str) -> list[tuple[int, str]]:
    """
    Return (store_id, store_name) for any store names found in the query.
    Prefers full-name exact matches over partial word matches.
    """
    q_norm = _normalise(query)
    seen: set[int] = set()
    results: list[tuple[int, str]] = []

    # 1. Try full query as a single token (catches "myntra", "redbus", etc.)
    for sid, sname in _index.get(q_norm, []):
        if sid not in seen:
            seen.add(sid)
            results.append((sid, sname))

    # 2. Try each word token — skip query stopwords and short tokens
    words = re.split(r"[\s,]+", query)
    for word in words:
        w_norm = _normalise(word)
        if w_norm in _QUERY_STOPWORDS or len(w_norm) < 3:
            continue
        for sid, sname in _index.get(w_norm, []):
            if sid not in seen:
                seen.add(sid)
                results.append((sid, sname))

    # 3. Word-set scan for compound names typed as one token (e.g. "makemytrip").
    #    Build the set of normalised individual words from the query and match against it.
    #    This avoids substring false-positives like "light" inside "flight".
    q_words = {_normalise(w) for w in re.split(r"[\s,]+", query) if _normalise(w)}
    for token, entries in _index.items():
        if len(token) >= 5 and token in q_words and token not in _QUERY_STOPWORDS:
            for sid, sname in entries:
                if sid not in seen:
                    seen.add(sid)
                    results.append((sid, sname))

    if results:
        return results

    # 4. Fuzzy fallback — only runs when all exact lookups above returned nothing.
    #    Compares each query token against every index key using difflib similarity.
    #    Threshold 0.85 catches 1-2 char typos (e.g. "livepure" → "livpure")
    #    while rejecting unrelated words.
    index_keys = list(_index.keys())
    for word in re.split(r"[\s,]+", query):
        w_norm = _normalise(word)
        if w_norm in _QUERY_STOPWORDS or len(w_norm) < 5:
            continue
        matches = difflib.get_close_matches(w_norm, index_keys, n=1, cutoff=0.85)
        if matches:
            matched_key = matches[0]
            log.debug("Fuzzy match: %r → %r", w_norm, matched_key)
            for sid, sname in _index[matched_key]:
                if sid not in seen:
                    seen.add(sid)
                    results.append((sid, sname))

    return results
