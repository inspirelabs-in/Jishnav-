"""
Level 2 + 3 retrieval:
  2. vertical IDs → store IDs (cache lookup)
  3. store IDs → coupons (SQL Server live query, two-filter pipeline)
"""

import logging

import config
import cache
import db
import validity

log = logging.getLogger(__name__)

_COUPON_FIELDS = """
    CouponID, MerchantID, CouponName, CouponCode, CouponDescription,
    CouponTypeID, Discount, MinimumOrderAmount, MaximumDiscount,
    Verified, Exclusive, HotOffer, BestOffer, CouponVisits,
    CouponUrl, ForExistingUser, isRecommended, StartDate, EndDate
"""


async def get_coupons_for_stores(
    store_ids: list[int],
    limit: int | None = None,
    for_existing_user: bool | None = None,
    min_discount: float | None = None,
) -> list[dict]:
    if not store_ids:
        return []

    limit = limit or config.COUPON_RETRIEVAL_LIMIT
    placeholders = ",".join("?" * len(store_ids))

    extra_filter = ""
    params = list(store_ids)

    # Always return only copyable codes — never deal links
    extra_filter += " AND CouponCode IS NOT NULL AND CouponCode != ''"

    if for_existing_user is not None:
        extra_filter += " AND ForExistingUser = ?"
        params.append(1 if for_existing_user else 0)

    if min_discount is not None:
        # Include coupons that meet the percentage threshold OR have no percentage value
        # (flat-amount coupons like "Rs 500 OFF" store NULL in Discount — they can't be
        # compared by percentage and should always pass through alongside the filtered results).
        extra_filter += " AND (Discount IS NULL OR Discount = 0 OR Discount >= ?)"
        params.append(min_discount)

    sql = f"""
        SELECT TOP {limit} {_COUPON_FIELDS}
        FROM   {config.COUPONS_TABLE}
        WHERE  MerchantID IN ({placeholders})
          AND  Status = 1
          AND  (EndDate >= GETDATE() OR EndDate IS NULL)
          {extra_filter}
        ORDER BY
          CASE WHEN CouponCode IS NOT NULL AND CouponCode != '' THEN 0 ELSE 1 END,
          CASE WHEN Verified = 1 THEN 0 ELSE 1 END,
          CASE WHEN BestOffer = 1 THEN 0 ELSE 1 END,
          CASE WHEN HotOffer  = 1 THEN 0 ELSE 1 END,
          ISNULL(Discount, 0) DESC
    """

    rows = await db.async_query(sql, tuple(params))

    live = []
    for r in rows:
        r["StoreName"] = cache.get_store_name(r["MerchantID"])
        validity.enrich_coupon(r)
        if r.get("validity_urgency") != "expired":
            live.append(r)

    return live


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
    """Fetch coupons where CouponName contains at least one of the location keywords."""
    if not store_ids or not keywords:
        return []

    placeholders  = ",".join("?" * len(store_ids))
    # Multiple keywords = route query (Hyderabad + Mumbai) → require ALL to appear (AND).
    # Single keyword = city query (Mumbai) → just match that city (effectively OR of one).
    like_clauses  = " AND ".join(["CouponName LIKE ?" for _ in keywords])
    like_params   = [f"%{kw}%" for kw in keywords]

    extra_filter = ""
    extra_params: list = []
    if min_discount is not None:
        extra_filter = " AND (Discount IS NULL OR Discount = 0 OR Discount >= ?)"
        extra_params.append(min_discount)

    sql = f"""
        SELECT TOP {limit} {_COUPON_FIELDS}
        FROM   {config.COUPONS_TABLE}
        WHERE  MerchantID IN ({placeholders})
          AND  Status = 1
          AND  (EndDate >= GETDATE() OR EndDate IS NULL)
          AND  CouponCode IS NOT NULL AND CouponCode != ''
          AND  ({like_clauses})
          {extra_filter}
        ORDER BY
          CASE WHEN Verified  = 1 THEN 0 ELSE 1 END,
          CASE WHEN BestOffer = 1 THEN 0 ELSE 1 END,
          CASE WHEN HotOffer  = 1 THEN 0 ELSE 1 END,
          ISNULL(Discount, 0) DESC
    """

    rows = await db.async_query(sql, tuple(list(store_ids) + like_params + extra_params))
    live = []
    for r in rows:
        r["StoreName"] = cache.get_store_name(r["MerchantID"])
        validity.enrich_coupon(r)
        if r.get("validity_urgency") != "expired":
            live.append(r)
    return live


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
    Fallback brand search: CouponName LIKE '%brand%' across all active coded coupons.
    Strict expiry filter — same invariants as every other retrieval function.
    Only runs when the store-based lookup returns 0.
    """
    if not brand or not brand.strip():
        return []

    sql = f"""
        SELECT TOP {limit} {_COUPON_FIELDS}
        FROM   {config.COUPONS_TABLE}
        WHERE  Status = 1
          AND  (EndDate >= GETDATE() OR EndDate IS NULL)
          AND  CouponCode IS NOT NULL AND CouponCode != ''
          AND  CouponName LIKE ?
        ORDER BY
          CASE WHEN Verified  = 1 THEN 0 ELSE 1 END,
          CASE WHEN BestOffer = 1 THEN 0 ELSE 1 END,
          CASE WHEN HotOffer  = 1 THEN 0 ELSE 1 END,
          ISNULL(Discount, 0) DESC
    """

    rows = await db.async_query(sql, (f"%{brand.strip()}%",))

    live: list[dict] = []
    for r in rows:
        r["StoreName"] = cache.get_store_name(r["MerchantID"])
        validity.enrich_coupon(r)
        if r.get("validity_urgency") != "expired":
            live.append(r)
    return live
