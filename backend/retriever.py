"""
Level 2 + 3 retrieval:
  2. vertical IDs → store IDs (cache lookup)
  3. store IDs → coupons (SQL Server live query, two-filter pipeline)
"""

import logging

import config
import cache
import validity

log = logging.getLogger(__name__)



def _enrich_and_filter_live(rows: list[dict]) -> list[dict]:
    """
    Shared post-processing for every fetch function: attach StoreName, run
    the validity heuristic, and drop expired rows. Also drops rows whose
    MerchantID doesn't resolve to any known StoreName -- an orphaned/inactive
    merchant reference (confirmed in production: two "Amazon Pay Offer"
    coupons pointed at MerchantIDs with no active Category row at all, so
    they rendered with a blank store name in the UI). A coupon we can't
    attribute to a real store should never reach the user regardless of
    which query surfaced it.
    """
    live = []
    for r in rows:
        r["StoreName"] = cache.get_store_name(r["MerchantID"])
        if not r["StoreName"]:
            continue
        r["FaviconUrl"] = cache.get_store_favicon(r["MerchantID"])
        validity.enrich_coupon(r)
        if r.get("validity_urgency") != "expired":
            live.append(r)
    return live


async def get_coupons_for_stores(
    store_ids: list[int],
    limit: int | None = None,
    for_existing_user: bool | None = None,
    min_discount: float | None = None,
) -> list[dict]:
    if not store_ids:
        return []

    limit = limit or config.COUPON_RETRIEVAL_LIMIT

    # Pull from in-memory cache (already deduplicated and rank-sorted at build time).
    # Each call to get_coupons_for_merchant returns shallow copies, so
    # _enrich_and_filter_live can safely mutate them without touching the cache.
    rows: list[dict] = []
    for sid in store_ids:
        rows.extend(cache.get_coupons_for_merchant(sid))

    # Apply optional filters — same logic previously expressed in SQL WHERE clauses.
    if for_existing_user is not None:
        want = 1 if for_existing_user else 0
        rows = [r for r in rows if r.get("ForExistingUser") == want]

    if min_discount is not None:
        # Pass flat-amount coupons (NULL / 0 Discount) through alongside percentage
        # matches, mirroring: (Discount IS NULL OR Discount = 0 OR Discount >= ?).
        rows = [
            r for r in rows
            if not r.get("Discount") or r["Discount"] >= min_discount
        ]

    # Re-sort across all merged store lists, then apply limit.
    rows.sort(key=lambda r: (
        0 if r.get("Verified") else 1,
        0 if r.get("BestOffer") else 1,
        0 if r.get("HotOffer") else 1,
        -(r.get("Discount") or 0),
    ))

    return _enrich_and_filter_live(rows[:limit])


async def get_coupons_for_verticals(
    vertical_ids: list[int],
    limit: int | None = None,
    for_existing_user: bool | None = None,
    min_discount: float | None = None,
) -> tuple[list[dict], list[tuple[int, str]]]:
    """Returns (coupons, stores_searched)."""
    stores = cache.get_stores_for_verticals(vertical_ids)
    if not stores:
        return [], []
    store_ids = [s[0] for s in stores]
    coupons = await get_coupons_for_stores(
        store_ids, limit=limit,
        for_existing_user=for_existing_user,
        min_discount=min_discount,
    )
    return coupons, stores


async def _get_coupons_with_like_filter(
    store_ids: list[int],
    keywords: list[str],
    min_discount: float | None,
    limit: int,
) -> list[dict]:
    """Filter cached coupons for the given stores where CouponName contains
    ALL location keywords (AND logic). Multiple keywords = route query
    (e.g. Hyderabad + Mumbai); single keyword = city query — same semantics
    as the original SQL LIKE clauses joined by AND."""
    if not store_ids or not keywords:
        return []

    # Gather from cache
    rows: list[dict] = []
    for sid in store_ids:
        rows.extend(cache.get_coupons_for_merchant(sid))

    # Keyword filter: every keyword must appear in CouponName (case-insensitive)
    kw_lower = [kw.lower() for kw in keywords]
    rows = [
        r for r in rows
        if all(kw in (r.get("CouponName") or "").lower() for kw in kw_lower)
    ]

    if min_discount is not None:
        rows = [
            r for r in rows
            if not r.get("Discount") or r["Discount"] >= min_discount
        ]

    rows.sort(key=lambda r: (
        0 if r.get("Verified") else 1,
        0 if r.get("BestOffer") else 1,
        0 if r.get("HotOffer") else 1,
        -(r.get("Discount") or 0),
    ))
    return _enrich_and_filter_live(rows[:limit])


async def get_coupons_for_verticals_with_location(
    vertical_ids: list[int],
    location_keywords: dict[int, list[str]],
    min_discount: float | None = None,
    limit_per_vertical: int = 5,
) -> tuple[list[dict], list[int]]:
    """
    Location-aware retrieval. For each vertical:
    - If it has location keywords → SQL LIKE search on CouponName.
      If 0 results → add to no_specific_vids (caller handles messaging).
    - If no location keywords → normal fetch.
    Returns (all_coupons, no_specific_vertical_ids).
    """
    all_coupons: list[dict] = []
    no_specific_vids: list[int] = []

    for vid in vertical_ids:
        stores = cache.get_stores_for_verticals([vid])
        if not stores:
            continue
        store_ids = [s[0] for s in stores]
        keywords  = location_keywords.get(vid, [])

        if keywords:
            specific = await _get_coupons_with_like_filter(
                store_ids, keywords, min_discount, limit_per_vertical
            )
            if specific:
                all_coupons.extend(specific)
            else:
                no_specific_vids.append(vid)
        else:
            general = await get_coupons_for_stores(
                store_ids, limit=limit_per_vertical, min_discount=min_discount
            )
            all_coupons.extend(general)

    return all_coupons, no_specific_vids


async def get_coupons_by_brand_name(brand: str, limit: int = 20) -> list[dict]:
    """
    Brand search using the keyword index (O(1) store lookup) instead of
    scanning all 10K cached coupons. Finds coupons whose CouponName
    contains the brand string, across all stores in the index.
    """
    if not brand or not brand.strip():
        return []

    brand_lower = brand.strip().lower()
    tokens = brand_lower.split()

    store_ids: set[int] = set()
    for tok in tokens:
        store_ids |= cache.get_store_ids_for_keyword(tok)

    if not store_ids:
        return []

    rows: list[dict] = []
    for sid in store_ids:
        for r in cache.get_coupons_for_merchant(sid):
            if brand_lower in (r.get("CouponName") or "").lower():
                rows.append(r)

    rows.sort(key=lambda r: (
        0 if r.get("Verified") else 1,
        0 if r.get("BestOffer") else 1,
        0 if r.get("HotOffer") else 1,
        -(r.get("Discount") or 0),
    ))
    return _enrich_and_filter_live(rows[:limit])


async def get_coupons_dual_path(
    store_ids: list[int],
    brand_keywords: list[str],
    limit: int = 30,
    min_discount: float | None = None,
) -> list[dict]:
    """
    Dual-path retrieval: fetch from the matched store(s) AND from other
    stores whose coupons mention the brand keyword. Merges and ranks
    the combined results so the user sees the best deals regardless of
    which store they're on.
    """
    store_coupons = await get_coupons_for_stores(
        store_ids, limit=limit, min_discount=min_discount,
    )

    existing_ids = {c.get("CouponID") for c in store_coupons}
    excluded = set(store_ids)
    kw_rows: list[dict] = []

    for kw in brand_keywords:
        kw_lower = kw.lower()
        kw_store_ids = cache.get_store_ids_for_keyword(kw_lower) - excluded
        for sid in kw_store_ids:
            for r in cache.get_coupons_for_merchant(sid):
                cid = r.get("CouponID")
                if cid not in existing_ids and kw_lower in (r.get("CouponName") or "").lower():
                    kw_rows.append(r)
                    existing_ids.add(cid)

    kw_enriched = _enrich_and_filter_live(kw_rows)

    all_coupons = store_coupons + kw_enriched
    all_coupons.sort(key=lambda r: (
        0 if r.get("Verified") else 1,
        0 if r.get("BestOffer") else 1,
        0 if r.get("HotOffer") else 1,
        -(r.get("Discount") or 0),
    ))
    return all_coupons[:limit]


_CROSS_SELL_STOPWORDS = frozenset({
    "the", "and", "for", "with", "from", "this", "that", "your", "you",
    "all", "any", "are", "can", "has", "have", "was", "were", "its", "our",
    "on", "in", "at", "to", "of", "by", "an", "or", "is", "it", "no", "not",
    "get", "up", "off", "rs", "upto", "flat", "above", "below", "min",
    "use", "using", "via", "per", "also", "only", "just", "now", "new",
    "code", "codes", "coupon", "coupons", "offer", "offers", "deal", "deals",
    "discount", "discounts", "promo", "save", "savings", "extra", "best",
    "top", "free", "buy", "order", "orders", "online", "app", "site",
    "today", "valid", "till", "price", "prices", "cashback", "more",
    "max", "minimum", "maximum", "worth", "value", "pay", "payment",
    "select", "selected", "products", "items", "purchase", "every",
})

def get_cross_sell_keywords(
    store_id: int,
    user_query: str,
    vertical_family: set[int],
) -> list[str]:
    """
    Find product keywords for cross-sell suggestions.
    Checks: same store + same vertical family + has active coupons.
    Returns up to 5 meaningful keywords sorted by frequency.
    """
    store_verticals = cache.get_verticals_for_store(store_id)
    if vertical_family and not (store_verticals & vertical_family):
        return []

    kw_counts = cache.get_store_keyword_counts(store_id)
    if not kw_counts:
        return []

    total_coupons = len(cache.get_coupons_for_merchant(store_id))
    if total_coupons == 0:
        return []

    query_words = set(user_query.lower().split())

    meaningful: list[tuple[str, int]] = []
    for kw, count in kw_counts.items():
        if kw in query_words:
            continue
        if kw.isdigit():
            continue
        if kw in _CROSS_SELL_STOPWORDS:
            continue
        if len(kw) < 3:
            continue
        if count > total_coupons * 0.8:
            continue
        if count < 2:
            continue
        meaningful.append((kw, count))

    meaningful.sort(key=lambda x: -x[1])
    return [kw for kw, _ in meaningful[:5]]
