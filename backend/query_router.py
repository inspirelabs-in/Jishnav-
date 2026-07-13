"""
Query Router: classifies user message using LLM (gpt-4o-mini).

All intent detection (affirmation, negation, vagueness, typo correction, vertical matching)
is handled by vertical_classifier. This module orchestrates the result into a RouteResult.
"""

import logging

import cache
import store_index
import vertical_classifier
import conversation as conv

log = logging.getLogger(__name__)


class RouteResult:
    __slots__ = (
        "query_type", "store_ids", "vertical_ids", "corrected_query",
        "is_affirmation", "is_negation", "is_non_coupon",
        "is_ambiguous", "is_explicit_web", "is_explicit_related",
        "is_new_user", "requested_count", "min_discount",
        "needs_clarification", "clarification_question",
        "pending_offer", "location_keywords", "brand_name_hint",
        "store_query_names",
    )

    def __init__(self):
        self.query_type            = "B"
        self.store_ids             = []
        self.vertical_ids          = []
        self.corrected_query       = ""
        self.is_affirmation        = False
        self.is_negation           = False
        self.is_non_coupon         = False
        self.is_ambiguous          = False
        self.is_explicit_web       = False
        self.is_explicit_related   = False
        self.is_new_user           = False
        self.requested_count       = None
        self.min_discount          = None
        self.needs_clarification   = False
        self.clarification_question = ""
        self.pending_offer         = ""
        self.location_keywords     = {}
        self.brand_name_hint       = ""   # set when user named a brand not found in store index
        self.store_query_names     = []   # LLM-extracted brand/store names from the query


async def route(message: str, session_id: str) -> RouteResult:
    """
    Classify the user message and return a RouteResult.
    Now async — calls gpt-4o-mini for intent + vertical classification.
    """
    r = RouteResult()

    history      = await conv.get_history(session_id)
    last_asst    = await conv.last_assistant_message(session_id)

    pending      = last_asst.pending_offer if last_asst else ""
    history_dicts = [{"role": m.role, "content": m.content} for m in history]

    # LLM classifies everything: intent, verticals, typos, vagueness
    result = await vertical_classifier.classify(
        user_message  = message,
        history       = history_dicts,
        pending_offer = pending,
    )

    r.corrected_query = result.corrected_query or message

    # ── General-fallback override ──────────────────────────────────────────────
    # If the last assistant message offered general deals (pending="general_fallback:...")
    # and the user hasn't clearly redirected (negation / web search / new topic),
    # treat the reply as affirmation — even if the LLM re-extracted coupon_search
    # from the travel history in the conversation context.
    _REDIRECT_INTENTS = {"negation", "non_coupon", "web_search", "system_info", "grabon_related"}
    if (pending.startswith("general_fallback:")
            and result.intent not in _REDIRECT_INTENTS
            and (result.intent == "affirmation" or len(message.split()) <= 5)):
        r.is_affirmation = True
        r.query_type     = "D"
        r.pending_offer  = pending
        return r

    # ── Map LLM intent to route flags ─────────────────────────────────────────

    if result.intent == "system_info":
        r.query_type    = "INFO"
        r.is_non_coupon = False
        return r

    if result.intent == "non_coupon":
        r.is_non_coupon = True
        return r

    if result.intent == "negation":
        r.is_negation = True
        r.query_type  = "D"
        return r

    if result.intent == "affirmation":
        r.is_affirmation = True
        r.query_type     = "D"
        r.pending_offer  = pending
        if last_asst:
            r.store_ids    = last_asst.store_ids
            r.vertical_ids = last_asst.matched_vertical_ids
        # "yes" when two options were on the table → ambiguous
        if pending.startswith("choice:"):
            r.is_affirmation = False
            r.is_ambiguous   = True
        return r

    if result.intent == "web_search":
        r.is_explicit_web = True
        r.query_type      = "D"
        r.pending_offer   = pending or f"web:{result.corrected_query}"
        return r

    if result.intent == "grabon_related":
        r.is_explicit_related = True
        r.query_type          = "D"
        r.pending_offer       = pending
        return r

    # ── coupon_search intent ──────────────────────────────────────────────────
    r.is_new_user        = result.is_new_user
    r.requested_count    = result.requested_count
    r.min_discount       = result.min_discount
    r.location_keywords  = result.location_keywords

    # Hard fallback: if the LLM didn't carry min_discount from history and the previous
    # assistant turn was a narrowing question that saved one, recover it here.
    if r.min_discount is None and last_asst and last_asst.was_narrowing and last_asst.min_discount:
        r.min_discount = last_asst.min_discount

    # Store lookup: ONLY use store names the LLM explicitly extracted.
    # No word-scanning the full query — that caused "and" → AND fashion brand false matches.
    #
    # Each name is resolved INDEPENDENTLY (not as one joined string). Resolving a
    # joined string meant that as soon as ONE brand matched (e.g. "Zomato"), the lookup
    # returned immediately and silently dropped any other named brand that didn't also
    # match (e.g. "HP Shopping") — including never attempting the fuzzy/DB fallback for it.
    # Per-name resolution also lets each name fall back independently to a live DB
    # substring search for multi-word/stylized store names the in-memory index misses
    # (e.g. "HP" → "HP Shopping").
    if result.store_names:
        r.store_query_names = result.store_names  # save LLM-extracted names before DB lookup
        stores: list[tuple[int, str]] = []
        seen_ids: set[int] = set()
        for name in result.store_names:
            hits = store_index.find_stores(name)
            if not hits:
                hits = await store_index.find_stores_by_name_like(name)
            if not hits:
                log.info("Store name %r from LLM did not resolve to any store", name)
                continue
            for sid, sname in hits:
                if sid not in seen_ids:
                    seen_ids.add(sid)
                    stores.append((sid, sname))

        if stores:
            r.query_type   = "A"
            r.store_ids    = [s[0] for s in stores]
            r.vertical_ids = result.matched_ids
            return r

        # None of the named brand(s) resolved to any store in the index.
        # Last resort: check the coupon keyword index — other stores may
        # have coupons mentioning this brand (e.g. PhonePe's "KFC Orders",
        # Nearbuy's "KFC Gift Cards"). This catches brands that don't have
        # their own store page but appear in coupon names across the DB.
        _kw_store_ids: set[int] = set()
        for name in result.store_names:
            for token in name.lower().split():
                if len(token) >= 2:
                    _kw_store_ids |= cache.get_store_ids_for_keyword(token)
        if _kw_store_ids:
            r.query_type       = "A"
            r.store_ids        = list(_kw_store_ids)
            r.vertical_ids     = result.matched_ids
            r.brand_name_hint  = " ".join(result.store_names)
            log.info("Keyword-index fallback for %r found %d stores", result.store_names, len(_kw_store_ids))
            return r

        # Save as hint so main.py can filter vertical coupons by brand name
        # and offer web search if nothing matches.
        r.brand_name_hint = " ".join(result.store_names)

    # Type B: clear vertical match
    if result.matched_ids and not result.needs_clarification:
        r.query_type   = "B"
        r.vertical_ids = result.matched_ids
        return r

    # LLM flagged genuine ambiguity (e.g. "I need coupons" with no context) → ask
    if result.needs_clarification:
        r.query_type             = "C"
        r.needs_clarification    = True
        r.clarification_question = result.clarification_question or (
            "I'd love to help! What are you looking to save on? "
            "For example: food, travel, fashion, or electronics?"
        )
        r.vertical_ids = result.matched_ids
        return r

    # No store and no vertical match.
    # Guard: short conversational words (yes, ok, hmm) must never trigger a web search.
    # They land here only if all earlier intent checks missed — ask for clarification instead.
    if not result.matched_ids:
        _VAGUE = {"yes", "ok", "okay", "sure", "hmm", "fine", "alright",
                  "right", "yep", "yeah", "yup", "great", "cool", "good"}
        _q = r.corrected_query.strip().lower()
        if _q in _VAGUE or len(_q.split()) <= 2:
            r.query_type             = "C"
            r.needs_clarification    = True
            r.clarification_question = (
                "What would you like coupons for? "
                "Tell me a store, category, or what you're looking to save on."
            )
            return r
        # Real unrecognised product/category — ask what they actually want
        # instead of silently firing a web search that returns "no coupons".
        r.query_type             = "C"
        r.needs_clarification    = True
        r.clarification_question = (
            "I couldn't find a matching category for that. "
            "Could you tell me more about what you're looking for? "
            "For example: fashion, electronics, food, travel, or a specific store?"
        )
        return r

    # Matched verticals exist (and LLM did NOT flag clarification)
    r.query_type   = "B"
    r.vertical_ids = result.matched_ids
    return r
