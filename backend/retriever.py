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
    Fallback brand search: scan all cached coupons for CouponName containing
    the brand string (case-insensitive). Only runs when the store-based
    lookup returns 0 results.
    """
    if not brand or not brand.strip():
        return []

    brand_lower = brand.strip().lower()
    rows = [
        r for r in cache.get_all_coupons_flat()
        if brand_lower in (r.get("CouponName") or "").lower()
    ]

    rows.sort(key=lambda r: (
        0 if r.get("Verified") else 1,
        0 if r.get("BestOffer") else 1,
        0 if r.get("HotOffer") else 1,
        -(r.get("Discount") or 0),
    ))
    return _enrich_and_filter_live(rows[:limit])
