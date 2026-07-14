"""
GrabonGPT FastAPI backend — main entry point.
"""

import json
import logging
import sys
from pathlib import Path

import uvicorn
import asyncio
import uuid
import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import config
import cache
import coupon_tiers
import store_index
import vertical_classifier
import conversation as conv
import query_router
import retriever
import responder
import llm_logger
import postgres_db
from llm.factory import get_llm


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger(__name__)

app = FastAPI(title="GrabonGPT API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins     = config.CORS_ALLOWED_ORIGINS,
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


# ── Startup ────────────────────────────────────────────────────────────────────

async def cleanup_old_guest_sessions_loop() -> None:
    while True:
        try:
            await postgres_db.cleanup_old_guest_sessions()
        except Exception as e:
            log.error("Error in guest sessions cleanup loop: %s", e)
        await asyncio.sleep(24 * 3600)  # Sleep for 1 day

@app.on_event("startup")
async def startup() -> None:
    log.info("Starting GrabonGPT backend...")
    await postgres_db.init_db()
    asyncio.create_task(cleanup_old_guest_sessions_loop())
    cache.build()
    store_index.build()
    vertical_classifier.build()
    conv.start_eviction_loop()
    cache.start_refresh_loop()
    log.info("GrabonGPT backend ready.")



# ── Request / Response models ──────────────────────────────────────────────────

class ChatRequest(BaseModel):
    session_id: str
    message: str


class MigrateRequest(BaseModel):
    guest_token: str
    user_id: str



# ── SSE helpers ────────────────────────────────────────────────────────────────

def _sse(event: str, data: str) -> str:
    return f"event: {event}\ndata: {data}\n\n"


def _sse_text(chunk: str) -> str:
    # Hard-strip em/en dashes regardless of what the LLM outputs
    chunk = chunk.replace("—", " - ").replace("–", " - ")
    return _sse("text", json.dumps(chunk))


def _sse_coupons(coupons: list[dict]) -> str:
    import decimal
    def _default(obj):
        if isinstance(obj, decimal.Decimal):
            return float(obj)
        raise TypeError(f"Not serializable: {type(obj)}")
    return _sse("coupons", json.dumps(coupons, default=_default))


def _sse_meta(data: dict) -> str:
    return _sse("meta", json.dumps(data))


def _sse_error(msg: str) -> str:
    return _sse("error", json.dumps({"message": msg}))


def _sse_cross_sell(data: dict) -> str:
    return _sse("cross_sell", json.dumps(data))


def _sse_done() -> str:
    return _sse("done", "{}")


async def _stream_fallback_response(user_message: str, candidate_coupons: str | None = "none"):
    """Stream a reply using fallback_respond.txt — handles no-results, web search blocked, and irrelevant queries.

    Pass candidate_coupons=None for explicit web-search-block calls so the LLM
    doesn't see [CANDIDATE COUPONS: none] and fire the wrong rule.
    """
    system = (config.PROMPTS_DIR / "fallback_respond.txt").read_text(encoding="utf-8")
    llm = get_llm()
    content = (
        f"[CANDIDATE COUPONS: {candidate_coupons}]\n{user_message}"
        if candidate_coupons is not None
        else user_message
    )
    async for chunk in llm.generate(
        system_prompt = system,
        messages      = [{"role": "user", "content": content}],
        temperature   = 0.3,
        max_tokens    = 80,
    ):
        yield chunk
    llm_logger.log_call(
        model         = llm.model,
        prompt_file   = "fallback_respond.txt",
        function_name = "_stream_fallback_response",
        input_tokens  = llm.last_usage.get("input_tokens", 0),
        output_tokens = llm.last_usage.get("output_tokens", 0),
    )


# ── Fetch/quota tiers (search -> reveal redesign) ───────────────────────────────
# 1 item -> fetch 30, show 3. 2 items -> fetch 15 each, show 2 each.
# 3+ items -> fetch 10 each (floor), show 2 each.

def _fetch_limit_for_items(n_items: int) -> int:
    if n_items <= 1:
        return config.COUPON_FETCH_TIERS[1]
    if n_items == 2:
        return config.COUPON_FETCH_TIERS[2]
    return config.COUPON_FETCH_TIER_FLOOR


def _quota_for_items(n_items: int) -> int:
    return config.COUPON_PICK_SINGLE_ITEM if n_items <= 1 else config.COUPON_PICK_PER_ITEM


# ── Chat endpoint ──────────────────────────────────────────────────────────────

@app.post("/api/chat")
async def chat(req: ChatRequest, request: Request):
    session_id = req.session_id
    message    = req.message.strip()

    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    grabon_session = request.cookies.get(config.SESSION_COOKIE_NAME)
    x_guest_token = request.headers.get("x-guest-token")

    user_id = None
    guest_token = None

    if grabon_session:
        try:
            async with httpx.AsyncClient() as client:
                cookies = {config.SESSION_COOKIE_NAME: grabon_session}
                res = await client.get(config.AUTH_SESSION_ENDPOINT, cookies=cookies, timeout=5.0)
                if res.status_code == 200:
                    user_data = res.json()
                    user_id = user_data.get(config.USER_ID_FIELD)
                    if not user_id:
                        raise HTTPException(status_code=401, detail="User ID missing from session response")
                else:
                    raise HTTPException(status_code=401, detail="Session validation failed")
        except Exception as e:
            log.error("Auth validation exception: %s", e)
            raise HTTPException(status_code=401, detail="Authentication failed")
    elif x_guest_token:
        guest_token = x_guest_token
        guest = await postgres_db.get_guest_session(guest_token)
        if not guest:
            raise HTTPException(status_code=401, detail="Invalid guest token")
        if guest["chat_count"] >= 4:
            raise HTTPException(status_code=403, detail="GUEST_LIMIT_REACHED")
        
        await postgres_db.increment_guest_chat_count(guest_token)
    else:
        raise HTTPException(status_code=401, detail="No session or guest token provided")

    title = message[:255]
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="session_id must be a valid UUID")

    await postgres_db.ensure_session_exists(
        session_uuid,
        user_id=user_id,
        guest_token=guest_token,
        title=title
    )


    async def generate():
        try:
            route = await query_router.route(message, session_id)
            log.info("Route: type=%s store_ids=%s vertical_ids=%s pending=%r ambiguous=%s expl_web=%s expl_related=%s corrected=%r",
                     route.query_type, route.store_ids, route.vertical_ids,
                     route.pending_offer, route.is_ambiguous,
                     route.is_explicit_web, route.is_explicit_related,
                     route.corrected_query)

            # Tell the frontend up front whether this is a genuine coupon search
            # (type A = direct store match, type B = direct vertical match) so it
            # can show the search-loading UI only for real searches -- not for
            # "hi", "what are you", "tell me a joke", or any other conversational
            # turn that never touches the coupon database at all.
            yield _sse_meta({"isCouponSearch": route.query_type in ("A", "B")})

            # Shared across all paths that fetch coupons.
            # "Items" = distinct stores if store_ids not empty; otherwise distinct verticals
            # in a store-less multi-vertical ask; otherwise 1.
            if route.store_ids:
                _n_items = len(route.store_ids)
            elif route.vertical_ids:
                _n_items = len(route.vertical_ids)
            else:
                _n_items = 1

            if route.requested_count:
                # Fetch limit must stay generous even for a small requested count --
                # the same coupon often appears as several near-duplicate raw rows
                # (e.g. a sitewide offer re-issued under 3 separate CouponIDs), and
                # exact-match dedup collapses those down to one. Fetching exactly
                # "5" when the user asks for 5 codes can leave only 1-2 unique codes
                # after dedup; fetching a generous multiple gives dedup and tier-fill
                # enough real candidates to actually reach the requested count.
                limit  = min(max(route.requested_count * 10, config.COUPON_FETCH_TIERS[1]), 100)
                _quota = route.requested_count
            else:
                limit  = _fetch_limit_for_items(_n_items)
                _quota = _quota_for_items(_n_items)
            _coupons_pre_filtered = False  # True when coupons already verified by filter_brand_coupons
            _vertical_coupon_groups: dict[str, list[dict]] = {}  # populated for multi-vertical asks
            _store_coupon_groups: dict[str, list[dict]] = {}     # populated for multi-store asks
            _widened_from_store = False  # True when a store's own coupons were 0 and we substituted its vertical
            _empty_sids: list[int] = []   # stores that returned 0 coupons

            # ── System info question (what categories, what can you do, etc.) ──
            if route.query_type == "INFO":
                stats       = cache.get_stats()
                verticals   = vertical_classifier.get_verticals_list()
                cat_names   = sorted({v["name"] for v in verticals})
                store_names = cache.get_all_store_names()
                # Pass first 80 store names as a representative sample — enough for
                # the LLM to cite well-known ones without flooding the prompt
                sample_stores = store_names[:80]

                llm = get_llm()
                full_text = ""
                async for chunk in llm.generate(
                    system_prompt=(
                        f"You are GrabonGPT, GrabOn.in's coupon assistant. "
                        f"Answer the user's question about what you offer. "
                        f"Use only the data below — do not invent stores or categories.\n\n"
                        f"Stats: {stats['coupons_with_codes']} active coupon codes across "
                        f"{stats['stores']} stores and {stats['categories']} categories.\n\n"
                        f"All categories: {', '.join(cat_names)}.\n\n"
                        f"Sample of brands/stores (first 80 of {stats['stores']} total): "
                        f"{', '.join(sample_stores)}.\n\n"
                        f"Rules:\n"
                        f"- If asked about brands or stores: name a few well-known ones from the sample, "
                        f"mention the total count, and say there are many more.\n"
                        f"- If asked about categories: list them all from the categories data above.\n"
                        f"- If asked what you can do: give a warm 2-3 sentence overview.\n"
                        f"- Never use em dashes. Keep the response concise and friendly."
                    ),
                    messages=[{"role": "user", "content": message}],
                    temperature=0.3,
                    max_tokens=300,
                ):
                    yield _sse_text(chunk)
                    full_text += chunk
                llm_logger.log_call(
                    model         = llm.model,
                    prompt_file   = "inline: system_info",
                    function_name = "chat/INFO handler",
                    input_tokens  = llm.last_usage.get("input_tokens", 0),
                    output_tokens = llm.last_usage.get("output_tokens", 0),
                    session_id    = session_id,
                )
                await conv.add_message(session_id, conv.Message(role="user", content=message))
                await conv.add_message(session_id, conv.Message(role="assistant", content=full_text))
                yield _sse_done()
                return

            # ── Non-coupon question ────────────────────────────────────────────
            if route.is_non_coupon:
                full_text = ""
                async for chunk in _stream_fallback_response(message, candidate_coupons=None):
                    yield _sse_text(chunk)
                    full_text += chunk
                await conv.add_message(session_id, conv.Message(role="user", content=message))
                await conv.add_message(session_id, conv.Message(role="assistant", content=full_text))
                yield _sse_done()
                return

            # ── User explicitly said "search web" ─────────────────────────────
            if route.is_explicit_web and route.pending_offer:
                category = _extract_web_category(route.pending_offer)

                # Before hitting SearXNG: try CouponName LIKE search in DB.
                # Catches brands not in the store index (e.g. "Vivo coupon codes"
                # auto-routed to web search because LLM didn't extract store_names).
                # Skipped when the brand is a KNOWN store with zero live coupons
                # (e.g. Amazon) -- any LIKE hit there is guaranteed to belong to a
                # different store that just mentions the name in passing (e.g.
                # "Amazon Pay Offer" issued by an unrelated hotel-booking site).
                if not route.store_ids and not store_index.is_known_but_empty(category):
                    _like_hits = await retriever.get_coupons_by_brand_name(category)
                    log.info("is_explicit_web LIKE fallback for %r: %d hits", category, len(_like_hits))
                    if _like_hits:
                        _verified = await responder.filter_brand_coupons(category, _like_hits)
                        log.info("is_explicit_web LIKE after LLM filter: %d kept", len(_verified))
                        if _verified:
                            full_text = ""
                            _sent_coupons = []
                            async for chunk in responder.stream_coupon_response(
                                user_message = message,
                                session_id   = session_id,
                                coupons      = _verified,
                                quota        = _quota,
                                store_scoped = True,  # LLM-verified to genuinely be about this one brand
                            ):
                                if isinstance(chunk, str):
                                    yield _sse_text(chunk)
                                    full_text += chunk
                                else:
                                    _sent_coupons = chunk["data"]
                                    yield _sse_coupons(_sent_coupons)
                            await conv.add_message(session_id, conv.Message(role="user", content=message))
                            await conv.add_message(session_id, conv.Message(
                                role="assistant", content=full_text,
                                coupon_count=len(_sent_coupons),
                                coupons=_sent_coupons,
                            ))
                            yield _sse_done()
                            return

                brand = route.brand_name_hint or category
                full_text = ""
                async for chunk in responder.stream_unavailable_response(message, session_id, brand):
                    yield _sse_text(chunk)
                    full_text += chunk
                await conv.add_message(session_id, conv.Message(role="user", content=message))
                await conv.add_message(session_id, conv.Message(role="assistant", content=full_text))
                yield _sse_done()
                return

            # ── User affirmed a previous simple offer ──────────────────────────
            if route.is_affirmation and route.pending_offer:

                # User said yes to "want general flight/hotel deals?" offer
                if route.pending_offer.startswith("general_fallback:"):
                    gen_vids = [int(v) for v in route.pending_offer[17:].split(",") if v]
                    _fb_vnames = {v["id"]: v["name"] for v in vertical_classifier.get_verticals_list()}
                    _gen_fetch_limit = _fetch_limit_for_items(len(gen_vids))
                    _gen_quota       = _quota_for_items(len(gen_vids))

                    # Fetch per vertical and KEEP them grouped by name -- required so the
                    # tier-fill selector applies sitewide/relevant/synonym priority within
                    # each category separately instead of mixing them into one pool.
                    gen_groups: dict[str, list[dict]] = {}
                    for gvid in gen_vids:
                        c, _ = await retriever.get_coupons_for_verticals([gvid], limit=_gen_fetch_limit)
                        if c:
                            gen_groups[_fb_vnames.get(gvid, str(gvid))] = c

                    if not gen_groups:
                        reply = "No active coupons found for those categories right now."
                        yield _sse_text(reply)
                        await conv.add_message(session_id, conv.Message(role="user", content=message))
                        await conv.add_message(session_id, conv.Message(role="assistant", content=reply))
                        yield _sse_done()
                        return

                    _selected_by_gen = await responder.select_top_coupons_for_items(
                        gen_groups, message, quota_per_item=_gen_quota, store_scoped=False,
                    )
                    gen_coupons = [c for vname in gen_groups for c in _selected_by_gen.get(vname, [])]

                    # Write the intro text directly using the category names we know —
                    # do NOT call stream_coupon_response here because it only reads the
                    # top-3 stores for its summary and would say "hotel deals" even when
                    # food coupons are also included.
                    gen_names = list(gen_groups.keys())
                    intro     = f"Here are the general {' and '.join(gen_names)} deals:"
                    yield _sse_text(intro)
                    yield _sse_coupons(responder.serialise_coupons(gen_coupons))
                    await conv.add_message(session_id, conv.Message(role="user", content=message))
                    await conv.add_message(session_id, conv.Message(
                        role="assistant", content=intro,
                        matched_vertical_ids=gen_vids,
                        coupon_count=len(gen_coupons),
                        coupons=responder.serialise_coupons(gen_coupons),
                    ))
                    yield _sse_done()
                    return

                # Re-fetch DB coupons from prior context
                # Special case: user said yes to new-user fallback offer
                if route.pending_offer.startswith("new_user_fallback:"):
                    parts     = route.pending_offer.split("|")
                    sids_part = parts[0].replace("new_user_fallback:", "")
                    vids_part = parts[1].replace("vids:", "") if len(parts) > 1 else ""
                    fb_sids   = [int(x) for x in sids_part.split(",") if x]
                    fb_vids   = [int(x) for x in vids_part.split(",") if x]
                    if fb_sids:
                        coupons = await retriever.get_coupons_for_stores(fb_sids, limit=limit)
                        # Pick the store name that appears in the original user query (not blindly first)
                        # route.corrected_query carries the original store query even during affirmation
                        query_lower = (route.corrected_query or message).lower()
                        fb_store_name = next(
                            (cache.get_store_name(sid) for sid in fb_sids
                             if cache.get_store_name(sid) and cache.get_store_name(sid).lower() in query_lower),
                            None,
                        ) or next(
                            (cache.get_store_name(sid) for sid in fb_sids if cache.get_store_name(sid)),
                            None,
                        )
                    elif fb_vids:
                        coupons, _ = await retriever.get_coupons_for_verticals(fb_vids, limit=limit)
                        fb_store_name = None
                    else:
                        coupons = []
                        fb_store_name = None

                    if not coupons:
                        _subject = fb_store_name or _infer_category(message, route)
                        full_text = ""
                        async for chunk in responder.stream_unavailable_response(message, session_id, _subject):
                            yield _sse_text(chunk)
                            full_text += chunk
                        await conv.add_message(session_id, conv.Message(role="user", content=message))
                        await conv.add_message(session_id, conv.Message(role="assistant", content=full_text))
                        yield _sse_done()
                        return

                    # Use LLM to generate the response but reframe the message so it
                    # doesn't mention "first order" — tell the LLM it's a general offer query
                    label = fb_store_name or "these"
                    reframed = f"Show me the best active {label} coupons"
                    full_text = ""
                    _sent_coupons = []
                    async for chunk in responder.stream_coupon_response(
                        user_message = reframed,
                        session_id   = session_id,
                        coupons      = coupons,
                        quota        = _quota,
                        store_scoped = bool(fb_sids),
                    ):
                        if isinstance(chunk, str):
                            yield _sse_text(chunk)
                            full_text += chunk
                        else:
                            _sent_coupons = chunk["data"]
                            yield _sse_coupons(_sent_coupons)

                    await conv.add_message(session_id, conv.Message(role="user", content=message))
                    await conv.add_message(session_id, conv.Message(
                        role="assistant", content=full_text,
                        matched_vertical_ids=fb_vids,
                        store_ids=fb_sids,
                        coupon_count=len(_sent_coupons),
                        coupons=_sent_coupons,
                    ))
                    yield _sse_done()
                    return

                elif route.store_ids:
                    coupons = await retriever.get_coupons_for_stores(route.store_ids)
                elif route.vertical_ids:
                    coupons, _ = await retriever.get_coupons_for_verticals(route.vertical_ids)
                else:
                    coupons = []

                if not coupons:
                    full_text = ""
                    async for chunk in responder.stream_unavailable_response(
                        message, session_id, _infer_category(message, route)
                    ):
                        yield _sse_text(chunk)
                        full_text += chunk
                    await conv.add_message(session_id, conv.Message(role="user", content=message))
                    await conv.add_message(session_id, conv.Message(role="assistant", content=full_text))
                    yield _sse_done()
                    return

                full_text = ""
                _sent_coupons = []
                async for chunk in responder.stream_coupon_response(
                    user_message = message,
                    session_id   = session_id,
                    coupons      = coupons,
                    store_scoped = bool(route.store_ids),
                ):
                    if isinstance(chunk, str):
                        yield _sse_text(chunk)
                        full_text += chunk
                    else:
                        _sent_coupons = chunk["data"]
                        yield _sse_coupons(_sent_coupons)

                await conv.add_message(session_id, conv.Message(role="user", content=message))
                await conv.add_message(session_id, conv.Message(
                    role="assistant", content=full_text,
                    matched_vertical_ids=route.vertical_ids,
                    store_ids=route.store_ids,
                    coupon_count=len(_sent_coupons),
                    coupons=_sent_coupons,
                ))
                yield _sse_done()
                return

            # ── Affirmation with no pending context ───────────────────────────
            if route.is_affirmation:
                full_text = ""
                async for chunk in _stream_fallback_response(message):
                    yield _sse_text(chunk)
                    full_text += chunk
                await conv.add_message(session_id, conv.Message(role="user", content=message))
                await conv.add_message(session_id, conv.Message(role="assistant", content=full_text))
                yield _sse_done()
                return

            # ── User said no ───────────────────────────────────────────────────
            if route.is_negation:
                # If "no" follows a clarification question that had saved context,
                # treat it as "no, don't clarify — just show me what you have"
                _last = await conv.last_assistant_message(session_id)
                _ctx_sids = (_last.store_ids if _last else []) or []
                _ctx_vids = (_last.matched_vertical_ids if _last else []) or []
                if _last and _last.was_narrowing and (_ctx_sids or _ctx_vids):
                    # Fall through to coupon retrieval with the saved context
                    route.store_ids    = _ctx_sids
                    route.vertical_ids = _ctx_vids
                    # Continue — do NOT return here; falls through to retrieval below
                else:
                    reply = "No problem! What else can I help you find?"
                    yield _sse_text(reply)
                    await conv.add_message(session_id, conv.Message(role="user", content=message))
                    await conv.add_message(session_id, conv.Message(role="assistant", content=reply))
                    yield _sse_done()
                    return

            # ── Type C: vague query — ask narrowing question ───────────────────
            if route.query_type == "C":
                full_text = ""
                async for chunk in responder.stream_narrowing_question(
                    clarification_question = route.clarification_question,
                    user_message           = message,
                    session_id             = session_id,
                ):
                    yield _sse_text(chunk)
                    full_text += chunk

                await conv.add_message(session_id, conv.Message(role="user", content=message))
                # Save any partial context so affirmation/negation follow-ups can recover it
                await conv.add_message(session_id, conv.Message(
                    role="assistant", content=full_text,
                    was_narrowing=True,
                    store_ids=route.store_ids,
                    matched_vertical_ids=route.vertical_ids,
                    min_discount=route.min_discount,
                ))
                yield _sse_done()
                return

            # ── Retrieve coupons — copyable codes ONLY, never deal links ─────
            min_discount = route.min_discount

            # ── Location-aware path ───────────────────────────────────────────
            # When the LLM detected per-vertical location context (e.g. "hotel in Mumbai",
            # "flight from Hyderabad"), do a SQL LIKE search per vertical first.
            # Verticals with 0 specific results become a "want general ones?" offer.
            if route.location_keywords and route.vertical_ids and not route.store_ids:
                _vname_map = {v["id"]: v["name"] for v in vertical_classifier.get_verticals_list()}
                per_vid    = _fetch_limit_for_items(len(route.vertical_ids))
                # Total shown across all verticals combined -- the SQL LIKE fetch already
                # merges per-vertical results into one list, so this is a pragmatic single
                # bound rather than a true per-vertical tier-fill (same 2-per-item target).
                _loc_quota = _quota_for_items(len(route.vertical_ids)) * len(route.vertical_ids)

                loc_coupons, no_specific_vids = await retriever.get_coupons_for_verticals_with_location(
                    vertical_ids     = route.vertical_ids,
                    location_keywords = route.location_keywords,
                    min_discount     = min_discount,
                    limit_per_vertical = per_vid,
                )

                no_specific_names = [_vname_map.get(v, str(v)) for v in no_specific_vids]
                full_text = ""
                pending   = ""

                _sent_loc_coupons = []
                if loc_coupons and not no_specific_vids:
                    # All verticals returned specific results — normal LLM response
                    async for chunk in responder.stream_coupon_response(
                        user_message = message,
                        session_id   = session_id,
                        coupons      = loc_coupons,
                        quota        = _loc_quota,
                        store_scoped = False,  # location path only ever fires with store_ids empty
                    ):
                        if isinstance(chunk, str):
                            yield _sse_text(chunk)
                            full_text += chunk
                        else:
                            _sent_loc_coupons = chunk["data"]
                            yield _sse_coupons(_sent_loc_coupons)

                elif loc_coupons and no_specific_vids:
                    # Some verticals found, some didn't.
                    # Do NOT call stream_coupon_response — the LLM text would contradict
                    # the "no specific coupons" note. Write a clear fixed message instead.
                    found_names = [_vname_map.get(v, "") for v in route.vertical_ids if v not in no_specific_vids and _vname_map.get(v)]
                    names_str   = " and ".join(no_specific_names)
                    found_str   = " and ".join(n for n in found_names if n) or "some categories"

                    loc_coupons = await responder.select_top_coupons(
                        loc_coupons, message, quota=_loc_quota, store_scoped=False,
                    )
                    intro = f"Here are the {found_str} coupons I found for you:"
                    yield _sse_text(intro)
                    full_text += intro
                    yield _sse_coupons(responder.serialise_coupons(loc_coupons))

                    note = (
                        f"\n\nNo specific {names_str} coupons were found for your location. "
                        f"Would you like to see general {names_str} deals?"
                    )
                    yield _sse_text(note)
                    full_text += note
                    pending = f"general_fallback:{','.join(str(v) for v in no_specific_vids)}"

                else:
                    # Nothing found at all for any vertical
                    names_str = " and ".join(no_specific_names) if no_specific_names else "those categories"
                    note = (
                        f"No specific {names_str} coupons were found for your location. "
                        f"Would you like to see general {names_str} deals instead?"
                    )
                    yield _sse_text(note)
                    full_text = note
                    pending = f"general_fallback:{','.join(str(v) for v in (no_specific_vids or route.vertical_ids))}"

                await conv.add_message(session_id, conv.Message(role="user", content=message))
                await conv.add_message(session_id, conv.Message(
                    role="assistant", content=full_text,
                    matched_vertical_ids=route.vertical_ids,
                    coupon_count=len(loc_coupons) if no_specific_vids else len(_sent_loc_coupons),
                    pending_offer=pending,
                    coupons=responder.serialise_coupons(loc_coupons) if no_specific_vids else _sent_loc_coupons,
                ))
                yield _sse_done()
                return
            # ── End location-aware path ───────────────────────────────────────

            async def _fetch(store_ids=None, vertical_ids=None, min_disc=min_discount):
                if store_ids:
                    return (
                        await retriever.get_coupons_for_stores(
                            store_ids, limit=limit,
                            for_existing_user=None, min_discount=min_disc,
                        ),
                        [(sid, cache.get_store_name(sid)) for sid in store_ids],
                    )
                # Multi-vertical: `limit` is already the per-item tier size, so
                # each vertical gets the full amount (not divided across them).
                vids = vertical_ids or []
                if len(vids) <= 1:
                    return await retriever.get_coupons_for_verticals(
                        vids, limit=limit,
                        for_existing_user=None, min_discount=min_disc,
                    )
                per_vid = limit
                effective_limit = per_vid * len(vids)
                all_coupons: list[dict] = []
                all_stores: list[tuple] = []
                seen_sids: set[int] = set()
                for vid in vids:
                    c, s = await retriever.get_coupons_for_verticals(
                        [vid], limit=per_vid,
                        for_existing_user=None, min_discount=min_disc,
                    )
                    all_coupons.extend(c)
                    for entry in s:
                        if entry[0] not in seen_sids:
                            seen_sids.add(entry[0])
                            all_stores.append(entry)
                return all_coupons[:effective_limit], all_stores

            _empty_vids: list[int] = []   # verticals that returned 0 coupons

            if route.store_ids and route.vertical_ids:
                # User named a brand AND a category (e.g. "train coupons from MakeMyTrip").
                # The DB splits some brands by category: "MakeMyTrip" → "MakeMyTrip Train".
                # Check whether the matched store is already inside this vertical. If yes,
                # fetch directly. If not, look for other stores in the vertical whose name
                # starts with the same brand name (e.g. find "MakeMyTrip Train" for "train").
                _vert_stores = cache.get_stores_for_verticals(route.vertical_ids)
                _vert_sids   = {s[0] for s in _vert_stores}
                _brand_sid   = route.store_ids[0]

                if _brand_sid in _vert_sids:
                    # Brand's own store is in this vertical — fetch directly, no intersection.
                    coupons, stores_searched = await _fetch(store_ids=route.store_ids)
                else:
                    # Brand has separate per-category stores (like MakeMyTrip Train).
                    # Find them by prefix-matching the brand name inside the vertical.
                    _brand_raw    = (cache.get_store_name(_brand_sid) or "").lower()
                    _brand_prefix = _brand_raw[:min(len(_brand_raw), 10)]
                    _brand_vsids  = [
                        s[0] for s in _vert_stores
                        if _brand_prefix and _brand_prefix in (cache.get_store_name(s[0]) or "").lower()
                    ]
                    if _brand_vsids:
                        coupons = await retriever.get_coupons_for_stores(
                            _brand_vsids, limit=limit, min_discount=min_discount,
                        )
                        stores_searched = [(_sid, cache.get_store_name(_sid)) for _sid in _brand_vsids]
                    else:
                        # No brand-specific vertical stores found — use brand's own store.
                        # NEVER fall back to the full vertical here: user named a brand,
                        # so showing other brands' coupons is wrong.
                        coupons, stores_searched = await _fetch(store_ids=route.store_ids)
            elif route.store_ids:
                if len(route.store_ids) > 1:
                    # Multi-store query
                    coupons = []
                    stores_searched = []
                    for sid in route.store_ids:
                        sname = cache.get_store_name(sid)
                        sc, _ = await _fetch(store_ids=[sid])
                        if sc:
                            coupons.extend(sc)
                            _store_coupon_groups[sname] = sc
                            stores_searched.append((sid, sname))
                        else:
                            _empty_sids.append(sid)
                else:
                    # Single-store query — dual-path: store + keyword cross-store
                    if route.store_query_names:
                        coupons = await retriever.get_coupons_dual_path(
                            store_ids=route.store_ids,
                            brand_keywords=route.store_query_names,
                            limit=limit,
                            min_discount=min_discount,
                        )
                        seen_sids: set[int] = set()
                        stores_searched = []
                        for c in coupons:
                            sid = c.get("MerchantID")
                            sname = c.get("StoreName", "")
                            if sid and sname and sid not in seen_sids:
                                seen_sids.add(sid)
                                stores_searched.append((sid, sname))
                    else:
                        coupons, stores_searched = await _fetch(store_ids=route.store_ids)
                    # Requested store has zero live coupons at all. Only substitute
                    # sibling stores from the same vertical when that vertical is on
                    # the safe-to-widen list (Bus, Flight, Hotel, Cab, Recharge, Food
                    # Delivery, etc.) — never for product/manufacturer verticals
                    # (Electronics, Fashion, ...), where a different store means a
                    # genuinely different product (Apple must never become OPPO).
                    if (not coupons and route.vertical_ids
                            and coupon_tiers.vertical_allows_widening(route.vertical_ids)):
                        coupons, stores_searched = await _fetch(vertical_ids=route.vertical_ids)
                        _widened_from_store = bool(coupons)
            else:
                if len(route.vertical_ids) <= 1:
                    coupons, stores_searched = await _fetch(vertical_ids=route.vertical_ids)
                else:
                    # Per-item fetch — `limit` is already the per-item tier size
                    # (not a total to divide), so each vertical gets the full tier
                    # amount. Track which categories returned nothing, and keep
                    # coupons grouped by vertical for the per-item tier-selector.
                    _vname_map_fetch = {v["id"]: v["name"] for v in vertical_classifier.get_verticals_list()}
                    coupons = []
                    stores_searched = []
                    _seen_sids: set[int] = set()
                    for _vid in route.vertical_ids:
                        _vc, _vs = await retriever.get_coupons_for_verticals(
                            [_vid], limit=limit,
                            for_existing_user=None, min_discount=min_discount,
                        )
                        if _vc:
                            coupons.extend(_vc)
                            _vertical_coupon_groups[_vname_map_fetch.get(_vid, str(_vid))] = _vc
                            for _entry in _vs:
                                if _entry[0] not in _seen_sids:
                                    _seen_sids.add(_entry[0])
                                    stores_searched.append(_entry)
                        else:
                            _empty_vids.append(_vid)

            # ── Brand-name filter ─────────────────────────────────────────────
            # User explicitly named a brand (e.g. "Apple") that isn't in our store
            # index. We fetched the full vertical (Mobiles) but must not show other
            # brands (OPPO, Samsung). Filter coupons whose StoreName or CouponName
            # contains the brand. If nothing matches, offer web search instead.
            _initial_vertical_coupons = list(coupons) if coupons else []
            if route.brand_name_hint and coupons:
                # Split into tokens so "HP Omen" matches "HP Shopping" (via "hp") and
                # "Omen 16-ap0181ax" (via "omen") instead of looking for "hp omen" as
                # a combined substring which never appears in either field.
                _bh_tokens = [t for t in route.brand_name_hint.lower().split() if t]
                _brand_matches = [
                    c for c in coupons
                    if any(
                        tok in (c.get("StoreName") or "").lower()
                        or tok in (c.get("CouponName") or "").lower()
                        for tok in _bh_tokens
                    )
                ]
                if _brand_matches and len(_brand_matches) > 1:
                    _verified = await responder.filter_brand_coupons(
                        route.brand_name_hint, _brand_matches
                    )
                    if _verified:
                        _brand_matches = _verified
                if not _brand_matches:
                    # Vertical fetch didn't surface this brand — try LIKE fallback per token.
                    # "HP Omen" → try LIKE '%HP%' and LIKE '%Omen%' separately. Skip any
                    # token that's itself a known store with zero live coupons (e.g.
                    # "Amazon") -- see store_index.is_known_but_empty for why.
                    _like_hits = []
                    for _tok in [t for t in route.brand_name_hint.split() if len(t) >= 2]:
                        if store_index.is_known_but_empty(_tok):
                            continue
                        _tok_hits = await retriever.get_coupons_by_brand_name(_tok)
                        _like_hits.extend(_tok_hits)
                    if _like_hits:
                        _brand_matches = await responder.filter_brand_coupons(
                            route.brand_name_hint, _like_hits
                        )

                if _brand_matches:
                    coupons = _brand_matches
                    _coupons_pre_filtered = True
                else:
                    # No brand matches found!
                    # Prompt the user for general coupons fallback if they are available
                    if route.vertical_ids and _initial_vertical_coupons:
                        category = _infer_category(message, route)
                        category_lower = category.lower() if category else "general"
                        category_part = f" {category_lower}" if category_lower != "general" else ""
                        msg = f"The brand you asked for ({route.brand_name_hint}) is currently not available. Would you like to see general{category_part} coupon codes?"
                        yield _sse_text(msg)
                        
                        pending = f"general_fallback:{','.join(str(v) for v in route.vertical_ids)}"
                        
                        await conv.add_message(session_id, conv.Message(role="user", content=message))
                        await conv.add_message(session_id, conv.Message(
                            role="assistant", content=msg,
                            pending_offer=pending,
                            store_ids=route.store_ids,
                            matched_vertical_ids=route.vertical_ids,
                        ))
                        yield _sse_done()
                        return
                    else:
                        full_text = ""
                        async for chunk in responder.stream_unavailable_response(
                            message, session_id, route.brand_name_hint
                        ):
                            yield _sse_text(chunk)
                            full_text += chunk
                        await conv.add_message(session_id, conv.Message(role="user", content=message))
                        await conv.add_message(session_id, conv.Message(role="assistant", content=full_text))
                        yield _sse_done()
                        return

            # Brand named but vertical fetch found nothing — try LIKE per token.
            # e.g. "HP Omen" → vertical=Electronics returned empty, try LIKE '%HP%' and LIKE '%Omen%'
            if route.brand_name_hint and not coupons:
                _like_hits = []
                for _tok in [t for t in route.brand_name_hint.split() if len(t) >= 2]:
                    if store_index.is_known_but_empty(_tok):
                        continue
                    _tok_hits = await retriever.get_coupons_by_brand_name(_tok)
                    _like_hits.extend(_tok_hits)
                if _like_hits:
                    _filtered = await responder.filter_brand_coupons(route.brand_name_hint, _like_hits)
                    if _filtered:
                        coupons = _filtered
                        _coupons_pre_filtered = True
                
                if not coupons:
                    # Let's check if we can fetch general coupons for the vertical(s)
                    if route.vertical_ids:
                        _gen_coupons, _ = await _fetch(vertical_ids=route.vertical_ids)
                        if _gen_coupons:
                            category = _infer_category(message, route)
                            category_lower = category.lower() if category else "general"
                            category_part = f" {category_lower}" if category_lower != "general" else ""
                            msg = f"The brand you asked for ({route.brand_name_hint}) is currently not available. Would you like to see general{category_part} coupon codes?"
                            yield _sse_text(msg)
                            
                            pending = f"general_fallback:{','.join(str(v) for v in route.vertical_ids)}"
                            
                            await conv.add_message(session_id, conv.Message(role="user", content=message))
                            await conv.add_message(session_id, conv.Message(
                                role="assistant", content=msg,
                                pending_offer=pending,
                                store_ids=route.store_ids,
                                matched_vertical_ids=route.vertical_ids,
                            ))
                            yield _sse_done()
                            return

            # If previous offer was new_user_fallback and user is continuing that flow,
            # skip the new-user check entirely — just show the general coupons
            last_asst = await conv.last_assistant_message(session_id)
            _prev_pending = last_asst.pending_offer if last_asst else ""
            if _prev_pending.startswith("new_user_fallback:"):
                # User said something after the offer — treat as "show me those"
                # coupons are already fetched without new_user filter — stream them directly
                pass  # fall through to stream_coupon_response below

            # If user asked for new-user / first-order coupons:
            # keyword-filter by CouponName — ForExistingUser=0 in DB means "all users", not "new users only"
            elif route.is_new_user and coupons:
                _NEW_USER_KW = {
                    "new user", "new customer", "first order", "first time",
                    "first booking", "first purchase", "first ride", "first trip",
                    "welcome", "signup", "sign up", "register",
                }
                specific = [
                    c for c in coupons
                    if any(kw in (c.get("CouponName") or "").lower() for kw in _NEW_USER_KW)
                ]
                if specific:
                    # Found first-timer coupons — show only those
                    coupons = specific
                else:
                    # No first-timer specific coupons — ask before showing general ones
                    category = _infer_category(message, route)
                    pending  = (
                        f"new_user_fallback:{','.join(str(i) for i in route.store_ids)}"
                        f"|vids:{','.join(str(v) for v in route.vertical_ids)}"
                    )
                    msg = (
                        f"There are no first-timer specific coupons for {category} right now, "
                        f"but there are {len(coupons)} active {category} offers available. "
                        f"Would you like to see those?"
                    )
                    yield _sse_text(msg)
                    await conv.add_message(session_id, conv.Message(role="user", content=message))
                    await conv.add_message(session_id, conv.Message(
                        role="assistant", content=msg,
                        pending_offer=pending,
                        store_ids=route.store_ids,
                        matched_vertical_ids=route.vertical_ids,
                    ))
                    yield _sse_done()
                    return

            # If min_discount filter returned nothing, retry without it and tell user
            discount_fallback_msg = ""
            if not coupons and min_discount:
                if route.store_ids:
                    coupons, stores_searched = await _fetch(store_ids=route.store_ids, min_disc=None)
                else:
                    coupons, stores_searched = await _fetch(vertical_ids=route.vertical_ids, min_disc=None)
                if coupons:
                    best = max((c.get("Discount") or 0) for c in coupons)
                    discount_fallback_msg = (
                        f"We don't have {int(min_discount)}% off codes right now, "
                        f"but here are the best available (up to {int(best)}% off):"
                    )

            log.info("Retrieved %d coupons for store_ids=%s vertical_ids=%s",
                     len(coupons), route.store_ids, route.vertical_ids)

            # ── No results → for store queries, offer other active store coupons ─
            if not coupons and route.store_ids:
                # Check if the store has ANY active coded coupons (ignore today-specific filters)
                fallback_coupons = await retriever.get_coupons_for_stores(
                    route.store_ids, limit=limit, for_existing_user=None, min_discount=None
                )
                if not fallback_coupons:
                    # Store exists in index but has 0 coupons — try CouponName LIKE fallback.
                    # Use the LLM-extracted name (e.g. "Vivo") not the DB name (e.g. "Vivo India")
                    # so the LIKE pattern matches coupon names correctly.
                    _store_brand = (
                        route.store_query_names[0] if route.store_query_names
                        else cache.get_store_name(route.store_ids[0]) or ""
                    )
                    if _store_brand:
                        _like_hits = await retriever.get_coupons_by_brand_name(_store_brand)
                        log.info("Brand LIKE fallback for %r: %d hits", _store_brand, len(_like_hits))
                        if _like_hits:
                            _verified = await responder.filter_brand_coupons(_store_brand, _like_hits)
                            log.info("Brand LIKE fallback after LLM filter: %d kept", len(_verified))
                            if _verified:
                                coupons = _verified
                                _coupons_pre_filtered = True
                if fallback_coupons:
                    store_name = cache.get_store_name(route.store_ids[0]) or "this store"
                    fallback_msg = (
                        f"No new coupons matching exactly what you asked for, "
                        f"but {store_name} has {len(fallback_coupons)} active coupon codes available. "
                        f"Here are the best ones:"
                    )
                    yield _sse_text(fallback_msg + "\n\n")
                    full_text = fallback_msg + "\n\n"
                    _sent_coupons = []
                    async for chunk in responder.stream_coupon_response(
                        user_message = message,
                        session_id   = session_id,
                        coupons      = fallback_coupons,
                        quota        = _quota,
                        store_scoped = True,  # same store as route.store_ids, just filters relaxed
                    ):
                        if isinstance(chunk, str):
                            yield _sse_text(chunk)
                            full_text += chunk
                        else:
                            _sent_coupons = chunk["data"]
                            yield _sse_coupons(_sent_coupons)
                    await conv.add_message(session_id, conv.Message(role="user", content=message))
                    await conv.add_message(session_id, conv.Message(
                        role="assistant", content=full_text,
                        store_ids=route.store_ids,
                        coupon_count=len(_sent_coupons),
                        coupons=_sent_coupons,
                    ))
                    yield _sse_done()
                    return

            # ── No results anywhere reachable → dynamic, never-repeated apology ─
            # (store not in DB, or store+its widened vertical both empty). No
            # suggestions offered — just a natural "don't have that right now."
            if not coupons:
                full_text = ""
                if route.store_ids or route.vertical_ids:
                    # We know exactly what they asked for — name it warmly.
                    _subject = _infer_category(message, route)
                    async for chunk in responder.stream_unavailable_response(message, session_id, _subject):
                        yield _sse_text(chunk)
                        full_text += chunk
                else:
                    # No store or vertical was identified — the user sent a conversational
                    # message (fine/sure/go/etc.). Let the generic fallback prompt handle
                    # greetings, off-topic questions, and bare affirmations naturally.
                    async for chunk in _stream_fallback_response(message, candidate_coupons=None):
                        yield _sse_text(chunk)
                        full_text += chunk
                await conv.add_message(session_id, conv.Message(role="user", content=message))
                await conv.add_message(session_id, conv.Message(role="assistant", content=full_text))
                yield _sse_done()
                return

            # ── Stream LLM response with coupons ───────────────────────────────
            full_text = ""
            pending   = _infer_next_category(route)

            # Prepend discount fallback notice if we relaxed the filter
            if discount_fallback_msg:
                yield _sse_text(discount_fallback_msg + "\n\n")
                full_text += discount_fallback_msg + "\n\n"

            # Requested store had 0 coupons — we substituted its (safe-to-widen)
            # vertical. Say so plainly instead of silently showing another brand's
            # codes as if they were the one the user asked for.
            if _widened_from_store:
                _orig_store = cache.get_store_name(route.store_ids[0]) if route.store_ids else ""
                _widen_msg = (
                    f"{_orig_store or 'That store'} doesn't have active codes right now, "
                    f"so here are the best current deals in the same category:"
                )
                yield _sse_text(_widen_msg + "\n\n")
                full_text += _widen_msg + "\n\n"

            # Multi-item ask (bus+hotel+food, ...): tier-select per item first
            # (sitewide -> relevant -> synonym -> best-discount, capped to
            # `_quota` each), then flatten in vertical order. Re-running
            # selection on the merged list would wrongly apply one item's
            # tiering across all of them, so stream_coupon_response is told
            # the list is already final via already_selected=True.
            # store_scoped reflects the real routing decision: a store was
            # named AND we never had to widen out to sibling stores in its
            # vertical. Multi-vertical asks are never store-scoped -- each
            # "item" here is a category, not a store the user named.
            _store_scoped = bool(route.store_ids) and not _widened_from_store
            _already_selected = False
            if _store_coupon_groups:
                _selected_by_item = await responder.select_top_coupons_for_items(
                    _store_coupon_groups, message, quota_per_item=_quota, store_scoped=True,
                )
                coupons = [
                    c for _sname in _store_coupon_groups
                    for c in _selected_by_item.get(_sname, [])
                ]
                _already_selected = True
            elif _widened_from_store:
                _widen_query = f"{_infer_category(message, route)} coupons"
                coupons = await responder.select_top_coupons(
                    coupons, _widen_query, quota=_quota, store_scoped=False
                )
                _already_selected = True
            elif _vertical_coupon_groups:
                _selected_by_item = await responder.select_top_coupons_for_items(
                    _vertical_coupon_groups, message, quota_per_item=_quota, store_scoped=False,
                )
                coupons = [
                    c for _vname in _vertical_coupon_groups
                    for c in _selected_by_item.get(_vname, [])
                ]
                _already_selected = True

            # Product-keyword pre-filter: when user asks "kurti on AJIO" or
            # "shoes coupons on Myntra", narrow the coupon pool to those whose
            # CouponName mentions the product keyword BEFORE tier-fill runs.
            # Without this, sitewide coupons outrank product-relevant ones
            # (tier order: sitewide > relevant > synonym > catch-all), and
            # every cross-sell chip click returns the same top-3 sitewide set.
            # Falls back to the full pool when no keyword matches are found.
            if (route.store_ids and coupons
                    and not _widened_from_store and not _already_selected):
                _product_kws = _extract_product_keywords(
                    route.corrected_query or message,
                    route.store_query_names or [],
                )
                if _product_kws:
                    _kw_filtered = [
                        c for c in coupons
                        if any(kw in (c.get("CouponName") or "").lower() for kw in _product_kws)
                    ]
                    if _kw_filtered:
                        coupons = _kw_filtered

            # Fire cross-sell LLM call in parallel with the main response stream
            # so users don't see the ~1.5s delay after coupons load.
            _cs_task = None
            if coupons and not _widened_from_store and not pending:
                if route.store_ids and len(route.store_ids) == 1:
                    _cs_coupon_count = len(cache.get_coupons_for_merchant(route.store_ids[0]))
                    log.info("Cross-sell gate: store_id=%s coupon_count=%d", route.store_ids[0], _cs_coupon_count)
                    if _cs_coupon_count < 6:
                        log.info("Cross-sell skipped: store has fewer than 6 coupons")
                    else:
                        _cs_family = set()
                        for _vid in (route.vertical_ids or []):
                            _cs_family |= vertical_classifier.get_vertical_family(_vid)
                        _cs_raw_keywords = retriever.get_cross_sell_keywords(
                            store_id=route.store_ids[0],
                            user_query=route.corrected_query or message,
                            vertical_family=_cs_family,
                        )
                        log.info("Cross-sell keywords: %s", _cs_raw_keywords)
                        if _cs_raw_keywords:
                            _cs_store = cache.get_store_name(route.store_ids[0]) or "this store"

                            async def _fetch_store_cs():
                                r = await responder.get_cross_sell_suggestions(
                                    user_query=route.corrected_query or message,
                                    available_keywords=_cs_raw_keywords,
                                    store_name=_cs_store,
                                )
                                if r:
                                    for s in r["suggestions"]:
                                        s["store_id"] = route.store_ids[0]
                                        s["store_name"] = _cs_store
                                return r

                            _cs_task = asyncio.create_task(_fetch_store_cs())

                elif route.vertical_ids and not route.store_ids:
                    _siblings = vertical_classifier.get_sibling_verticals(route.vertical_ids)
                    if _siblings:
                        async def _fetch_vert_cs():
                            r = await responder.get_cross_sell_suggestions(
                                user_query=route.corrected_query or message,
                                sibling_verticals=_siblings,
                            )
                            if r:
                                for s in r["suggestions"]:
                                    s["store_id"] = 0
                                    s["store_name"] = ""
                            return r

                        _cs_task = asyncio.create_task(_fetch_vert_cs())

            _sent_coupons = []
            async for chunk in responder.stream_coupon_response(
                user_message     = message,
                session_id       = session_id,
                coupons          = coupons,
                pending_offer    = pending,
                quota            = _quota,
                already_selected = _already_selected,
                store_scoped     = _store_scoped,
            ):
                if isinstance(chunk, str):
                    yield _sse_text(chunk)
                    full_text += chunk
                else:
                    _sent_coupons = chunk["data"]
                    yield _sse_coupons(_sent_coupons)

            # Tell user which requested categories had no results
            if _empty_vids:
                _vname_map = {v["id"]: v["name"] for v in vertical_classifier.get_verticals_list()}
                _missing = ", ".join(_vname_map.get(v, str(v)) for v in _empty_vids)
                _note = f"\n\nNo active coupon codes found for {_missing} on GrabOn right now."
                yield _sse_text(_note)
                full_text += _note

            # Tell user which requested stores had no results
            if _empty_sids:
                _missing = ", ".join(cache.get_store_name(sid) or str(sid) for sid in _empty_sids)
                _note = f"\n\nNo active coupon codes found for {_missing} on GrabOn right now."
                yield _sse_text(_note)
                full_text += _note

            # Await the cross-sell result (already running in parallel)
            if _cs_task:
                try:
                    _cs_result = await _cs_task
                    if _cs_result:
                        yield _sse_cross_sell(_cs_result)
                except Exception as e:
                    log.warning("Cross-sell task failed: %s", e)

            await conv.add_message(session_id, conv.Message(role="user", content=message))
            await conv.add_message(session_id, conv.Message(
                role="assistant", content=full_text,
                matched_vertical_ids=route.vertical_ids,
                store_ids=route.store_ids or [s[0] for s in stores_searched],
                coupon_count=len(_sent_coupons),
                pending_offer=pending,
                coupons=_sent_coupons,
            ))
            yield _sse_done()

        except Exception as e:
            log.exception("Chat error: %s", e)
            yield _sse_error("Something went wrong. Please try again.")
            yield _sse_done()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


def _infer_category(message: str, route) -> str:
    """Best-guess category name for messages to the user."""
    if route.store_ids:
        query_lower = (route.corrected_query or message).lower()
        # Prefer a store whose name actually appears in the user's message
        for sid in route.store_ids:
            name = cache.get_store_name(sid)
            if name and name.lower() in query_lower:
                return name
        # Fallback: first non-empty store name
        for sid in route.store_ids:
            name = cache.get_store_name(sid)
            if name:
                return name
    if route.vertical_ids:
        verticals = vertical_classifier.get_verticals_list()
        vid = route.vertical_ids[0]
        for v in verticals:
            if v["id"] == vid:
                return v["name"]
    return (route.corrected_query or message).strip().split("for")[-1].strip()[:30]


def _infer_next_category(route) -> str:
    """Guess what the assistant might offer next (for pending_offer metadata)."""
    return ""


def _extract_web_category(pending_offer: str) -> str:
    """Extract a clean brand/category name from a pending_offer string."""
    if "|" in pending_offer:
        web_part = pending_offer.split("|")[-1]
    else:
        web_part = pending_offer
    raw = web_part[4:] if web_part.startswith("web:") else web_part
    # Strip coupon-search noise words to get just the brand/category name
    noise = {"coupon", "coupons", "code", "codes", "deal", "deals",
             "offer", "offers", "promo", "discount", "off", "working", "free"}
    words = [w for w in raw.split() if w.lower() not in noise]
    return " ".join(words).strip() or raw


def _extract_product_keywords(query: str, store_names: list[str]) -> list[str]:
    """Extract product-specific words from the query after removing store names and noise."""
    _NOISE = {
        "coupon", "coupons", "code", "codes", "deal", "deals", "offer", "offers",
        "promo", "discount", "off", "best", "show", "give", "me", "get", "find",
        "on", "for", "the", "a", "an", "in", "of", "with", "and", "or", "to",
        "from", "at", "by", "up", "is", "it", "i", "my", "any", "some", "top",
        "latest", "new", "working", "active", "today", "please", "want", "need",
        "looking", "search", "free",
    }
    q = query.lower()
    for name in store_names:
        q = q.replace(name.lower(), " ")
    words = q.split()
    return [w for w in words if w not in _NOISE and len(w) >= 3]


def _extract_related_vids(pending_offer: str) -> list[int]:
    """Extract related vertical IDs from a 'choice:vid1,vid2|web:...' pending_offer."""
    if not pending_offer.startswith("choice:"):
        return []
    choice_part = pending_offer.split("|")[0][7:]  # strip "choice:"
    try:
        return [int(v) for v in choice_part.split(",") if v]
    except ValueError:
        return []


# ── Admin endpoints ────────────────────────────────────────────────────────────

@app.post("/api/cache/refresh")
async def refresh_cache():
    cache.build()
    store_index.build()
    vertical_classifier.build()
    return {"status": "refreshed"}


@app.get("/api/health")
async def health():
    stats = cache.get_stats()
    return {
        "status":              "ok",
        "categories":          stats["categories"],
        "stores":              stats["stores"],
        "coupons_with_codes":  stats["coupons_with_codes"],
        "classifier":          "gpt-4o-mini (LLM)",
        "llm":                 config.LLM_PROVIDER,
        "model":               config.OLLAMA_MODEL if config.LLM_PROVIDER == "ollama" else config.OPENAI_MODEL,
    }


# ── Authentication and History Endpoints ────────────────────────────────────────

@app.get("/api/history")
async def get_chat_history(request: Request):
    grabon_session = request.cookies.get(config.SESSION_COOKIE_NAME)
    x_guest_token = request.headers.get("x-guest-token")

    if grabon_session:
        try:
            async with httpx.AsyncClient() as client:
                cookies = {config.SESSION_COOKIE_NAME: grabon_session}
                res = await client.get(config.AUTH_SESSION_ENDPOINT, cookies=cookies, timeout=5.0)
                if res.status_code == 200:
                    user_data = res.json()
                    user_id = user_data.get(config.USER_ID_FIELD)
                    if user_id:
                        history = await postgres_db.get_history_by_user(user_id)
                        return history
                    else:
                        raise HTTPException(status_code=401, detail="User ID missing from session response")
                else:
                    raise HTTPException(status_code=401, detail="Session invalid")
        except Exception as e:
            log.error("History auth check error: %s", e)
            raise HTTPException(status_code=401, detail="Authentication failed")
            
    elif x_guest_token:
        # Check if guest token exists
        guest = await postgres_db.get_guest_session(x_guest_token)
        if not guest:
            raise HTTPException(status_code=401, detail="Invalid guest token")
        history = await postgres_db.get_history_by_guest(x_guest_token)
        return history
    else:
        raise HTTPException(status_code=401, detail="Not authenticated")


@app.delete("/api/history/{session_id}")
async def delete_chat_history(session_id: str, request: Request):
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid session ID format")

    grabon_session = request.cookies.get(config.SESSION_COOKIE_NAME)
    x_guest_token = request.headers.get("x-guest-token")

    if grabon_session:
        try:
            async with httpx.AsyncClient() as client:
                cookies = {config.SESSION_COOKIE_NAME: grabon_session}
                res = await client.get(config.AUTH_SESSION_ENDPOINT, cookies=cookies, timeout=5.0)
                if res.status_code == 200:
                    user_data = res.json()
                    user_id = user_data.get(config.USER_ID_FIELD)
                    if user_id:
                        await postgres_db.delete_session(session_uuid, user_id=user_id, guest_token=None)
                        return {"status": "deleted"}
                    else:
                        raise HTTPException(status_code=401, detail="User ID missing from session response")
                else:
                    raise HTTPException(status_code=401, detail="Session invalid")
        except HTTPException:
            raise
        except Exception as e:
            log.error("Delete session auth check error: %s", e)
            raise HTTPException(status_code=401, detail="Authentication failed")
            
    elif x_guest_token:
        # Check if guest token exists
        guest = await postgres_db.get_guest_session(x_guest_token)
        if not guest:
            raise HTTPException(status_code=401, detail="Invalid guest token")
        await postgres_db.delete_session(session_uuid, user_id=None, guest_token=x_guest_token)
        return {"status": "deleted"}
    else:
        raise HTTPException(status_code=401, detail="Not authenticated")


_guest_rate_limit = {}  # ip -> list of timestamps

def check_guest_rate_limit(ip: str) -> bool:
    import time
    now = time.time()
    # filter timestamps in the last 60 seconds
    timestamps = [t for t in _guest_rate_limit.get(ip, []) if now - t < 60]
    if len(timestamps) >= 5:
        return False
    timestamps.append(now)
    _guest_rate_limit[ip] = timestamps
    return True


@app.post("/api/auth/guest")
async def start_guest_session(request: Request):
    ip = request.client.host
    if not check_guest_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Too many requests. Limit is 5 per minute.")
        
    user_agent = request.headers.get("user-agent", "")
    import hashlib
    fingerprint_hash = hashlib.sha256(f"{ip}:{user_agent}".encode("utf-8")).hexdigest()
    
    existing_token = await postgres_db.get_guest_by_fingerprint(fingerprint_hash)
    if existing_token:
        return {"guest_token": existing_token}
        
    new_token = "guest_" + str(uuid.uuid4())
    await postgres_db.create_guest_session(new_token, fingerprint_hash)
    return {"guest_token": new_token}


@app.post("/api/auth/migrate")
async def migrate_guest_session(req: MigrateRequest, response: Response):
    await postgres_db.migrate_guest(req.guest_token, req.user_id)
    response.delete_cookie("guest_token")
    return {"status": "ok"}


@app.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie(
        config.SESSION_COOKIE_NAME,
        domain=config.SESSION_COOKIE_DOMAIN,
    )
    return {"status": "ok"}


# ── Mock Authentication (gated by MOCK_AUTH_ENABLED) ───────────────────────────

@app.get("/api/mock/auth-session")
async def mock_auth_session(request: Request):
    if not config.MOCK_AUTH_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")
    
    cookie_val = request.cookies.get(config.SESSION_COOKIE_NAME)
    if cookie_val:
        return {
            config.USER_ID_FIELD: "mock-user-123",
            "email": "mockuser@example.com",
            "name": "Mock User"
        }
    raise HTTPException(status_code=401, detail="not authenticated")


@app.post("/api/mock/auth-google")
async def mock_auth_google(req: dict, response: Response):
    if not config.MOCK_AUTH_ENABLED:
        raise HTTPException(status_code=404, detail="Not found")
    
    code = req.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Missing auth code")
    
    session_id = "mock-sess-" + str(uuid.uuid4())
    response.set_cookie(
        key=config.SESSION_COOKIE_NAME,
        value=session_id,
        domain=config.SESSION_COOKIE_DOMAIN,
        httponly=False,
        samesite="lax",
    )
    return {
        "session_id": session_id,
        "user": {
            config.USER_ID_FIELD: "mock-user-123",
            "email": "mockuser@example.com",
            "name": "Mock User"
        }
    }


# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host    = config.API_HOST,
        port    = config.API_PORT,
        reload  = False,
        workers = 1,
    )

