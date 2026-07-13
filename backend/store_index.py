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

# normalised_name_token → list of (store_id, canonical_name), for EVERY active
# Category row regardless of whether it currently has live coupons -- lets us
# tell "this brand isn't in our catalog at all" apart from "this brand is a
# real, known store that simply has zero live codes right now" (e.g. Amazon).
_known_names: dict[str, list[tuple[int, str]]] = {}


def _normalise(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


# Subdomain labels that carry no brand meaning (generic hosting/section
# prefixes seen in this data set: "in.musafir.com", "shop.samsung.com",
# "store.acer.com", "health.drmorepen.com"). Stripped before taking the
# brand label so they never get indexed as if they were the store name.
_NON_BRAND_SUBDOMAINS = {"www", "in", "shop", "store", "health", "m"}


def _extract_domain_token(website: str) -> str:
    """
    Pull the brand label out of a raw Website field value, tolerating the
    inconsistent formats actually present in the data: bare domains
    ("redbus.in"), full URLs with scheme ("https://www.mcdelivery.co.in/"),
    and generic-prefixed subdomains ("shop.samsung.com"). Naively splitting
    on "." (the old approach) turned "https://www.foo.com" into the token
    "https" and "shop.samsung.com" into "shop" -- both indexed as if they
    were store names, so a query containing that generic word matched every
    store that happened to share it.
    """
    host = website.lower().strip()
    if not host:
        return ""
    host = re.sub(r"^[a-z]+://", "", host)   # strip scheme
    host = host.split("/", 1)[0]             # strip path/query
    labels = [l for l in host.split(".") if l]
    while labels and labels[0] in _NON_BRAND_SUBDOMAINS:
        labels.pop(0)
    return labels[0].strip() if labels else ""


def build() -> None:
    log.info("Building store name index...")

    valid_store_ids = cache.get_valid_store_ids()
    if not valid_store_ids:
        log.warning("No valid store IDs from cache — store index will be empty")
        return

    # Fetch every active store regardless of live-coupon status (not just
    # CategoryID IN valid_store_ids) so _known_names below can distinguish a
    # real, catalogued brand with zero current codes from one that was never
    # in the catalog to begin with -- see is_known_but_empty().
    rows = db.query(
        f"""
        SELECT CategoryID, CategoryName, Website, AlterNames
        FROM   {config.CATEGORIES_TABLE}
        WHERE  CategoryTypeID = 1
          AND  Status = 1
        """
    )

    idx: dict[str, list[tuple[int, str]]] = {}
    known: dict[str, list[tuple[int, str]]] = {}

    def _add_known(token: str, store_id: int, store_name: str) -> None:
        token = _normalise(token)
        if not token or len(token) < 2:
            return
        entry = (store_id, store_name)
        if entry not in known.get(token, []):
            known.setdefault(token, []).append(entry)

    def _add(token: str, store_id: int, store_name: str) -> None:
        token = _normalise(token)
        if not token or len(token) < 2:
            return
        entry = (store_id, store_name)
        if entry not in idx.get(token, []):
            idx.setdefault(token, []).append(entry)

    id_to_name: dict[int, str] = {}

    # Tokens that ARE some store's own exact single-word name are "reserved" —
    # a different store's domain or alias must never be allowed to claim them.
    # Fixes cases like "redrail" (a distinct single-word store whose website
    # happens to be a subpath of the unrelated "Redbus" store's own domain,
    # "redbus.in/railways"): without this guard, "redrail" would silently
    # inject itself into every plain "redbus" search.
    reserved_names = {
        _normalise(sname)
        for r in rows
        if (sname := (r["CategoryName"] or "").strip()) and len(sname.split()) == 1
    }

    def _add_secondary(token: str, store_id: int, store_name: str) -> None:
        norm = _normalise(token)
        if norm in reserved_names and norm != _normalise(store_name):
            return
        _add(token, store_id, store_name)

    for r in rows:
        sid   = r["CategoryID"]
        sname = (r["CategoryName"] or "").strip()
        if not sname:
            continue

        # Known-to-exist index: every active Category row, live coupons or not.
        words = sname.split()
        _add_known(sname, sid, sname)
        if len(words) == 1:
            _add_known(words[0], sid, sname)
        alters = r.get("AlterNames") or ""
        for alias in alters.split(","):
            alias = alias.strip()
            if alias:
                _add_known(alias, sid, sname)

        if sid not in valid_store_ids:
            continue  # everything below is for the live, routable index only

        id_to_name[sid] = sname

        # Full normalised name (no spaces) — always indexed
        _add(sname, sid, sname)

        # Index individual words ONLY for single-word store names.
        # Multi-word stores (e.g. "Go First", "Big Basket") must not split into
        # individual tokens — "first", "big", "go" are too common in user queries
        # and cause false matches (e.g. "first order" → Go First).
        if len(words) == 1:
            _add(words[0], sid, sname)

        # Website domain without TLD (e.g. "redbus" from "redbus.in").
        # Restricted to single-word store names, mirroring the word-split rule
        # above: multi-word sub-brand storefronts (e.g. "Flipkart Flight",
        # "Flipkart Health Plus") share the parent brand's root domain
        # ("flipkart.com/travel/flights"), so indexing their domain would
        # collide with the flagship single-word store's own entry.
        if len(words) == 1:
            domain = _extract_domain_token(r.get("Website") or "")
            if domain:
                _add_secondary(domain, sid, sname)

        # AlterNames (comma-separated aliases)
        for alias in alters.split(","):
            alias = alias.strip()
            if alias:
                _add_secondary(alias, sid, sname)

    _index.clear()
    _index.update(idx)
    _id_to_name.clear()
    _id_to_name.update(id_to_name)
    _known_names.clear()
    _known_names.update(known)

    log.info("Store index built: %d tokens, %d stores (%d known incl. zero-code)",
              len(idx), len(id_to_name), len(known))


def is_known_but_empty(name: str) -> str | None:
    """
    Returns the canonical store name if `name` matches a real, catalogued
    store that currently has ZERO live coupons (e.g. "Amazon") -- as opposed
    to a name that isn't in our catalog at all.

    Why this matters: callers use this to decide whether to run a loose
    CouponName-LIKE search as a recovery fallback. That fallback makes sense
    for a genuinely unrecognised brand (a naming/indexing gap). It does NOT
    make sense here -- if the store is already known-and-empty, ANY LIKE hit
    is guaranteed to belong to a DIFFERENT store that merely mentions this
    brand's name in passing. Confirmed in production: "Amazon" has zero live
    coupons of its own, and a "amazon coupons" search fell back to a LIKE
    search that surfaced "Amazon Pay Offer" (issued by a hotel-booking site
    accepting Amazon Pay as a payment method) and "Amazon Giftcards" (issued
    by a third-party gift-card reseller) -- neither is an Amazon coupon.
    """
    norm = _normalise(name)
    if not norm:
        return None
    valid_ids = cache.get_valid_store_ids()
    for sid, sname in _known_names.get(norm, []):
        if sid not in valid_ids:
            return sname
    return None


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
    #    Threshold 0.82 catches 1-char typos and doubled-letter differences
    #    (e.g. "livepure" → "livpure", "rev" → "revv", "flipkar" → "flipkart")
    #    while rejecting unrelated words.
    #    Minimum token length 3 (not 5) so short brand names like "rev", "ola",
    #    "oyo", "jio", "mmt", "fbb" are not silently skipped before reaching
    #    this step. At 0.82 cutoff a 3-char token only matches keys that differ
    #    by at most 1 character — common query words won't false-match.
    index_keys = list(_index.keys())
    for word in re.split(r"[\s,]+", query):
        w_norm = _normalise(word)
        if w_norm in _QUERY_STOPWORDS or len(w_norm) < 3:
            continue
        matches = difflib.get_close_matches(w_norm, index_keys, n=1, cutoff=0.82)
        if matches:
            matched_key = matches[0]
            log.debug("Fuzzy match: %r → %r", w_norm, matched_key)
            for sid, sname in _index[matched_key]:
                if sid not in seen:
                    seen.add(sid)
                    results.append((sid, sname))

    return results
