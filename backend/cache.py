"""
In-memory vertical-to-store cache.
Built bottom-up at startup:
  coupons with codes → distinct store IDs → distinct category IDs
Only stores/categories that actually have coded coupons are indexed.
"""

import logging
import threading
import time

import yaml

import config
import db

log = logging.getLogger(__name__)

# vertical_id -> [(store_id, store_name, category_file_name), ...]
_vertical_to_stores: dict[int, list[tuple[int, str, str]]] = {}

# store_id -> store_name
_store_id_to_name: dict[int, str] = {}

# store_id -> website domain (e.g. "myntra.com")
_store_id_to_website: dict[int, str] = {}

# non-canonical vertical_id → canonical vertical_id
_merge_map: dict[int, int] = {}

# store IDs that have at least one coded coupon (used by store_index + vertical_classifier)
_valid_store_ids: set[int] = set()

# category IDs that map to at least one valid store (used by vertical_classifier)
_valid_category_ids: set[int] = set()

# snapshot counts for health check
_stats: dict[str, int] = {"categories": 0, "stores": 0, "coupons_with_codes": 0}

# store_id → deduplicated, rank-sorted list of coupon dicts (raw DB rows)
# Keyed by MerchantID so retriever lookups are O(1) per store.
_coupon_cache: dict[int, list[dict]] = {}

_lock = threading.Lock()


def _load_exclusions() -> tuple[set[int], list[tuple[int, int]]]:
    with open(config.EXCLUSIONS_FILE) as f:
        data = yaml.safe_load(f)
    excluded = set(data.get("excluded_vertical_ids", []))
    pairs = [(p["id_a"], p["id_b"]) for p in data.get("vertical_merge_pairs", [])]
    return excluded, pairs


def build() -> None:
    """
    Bottom-up cache build:
    1. Coupons with codes → distinct store IDs
    2. Store IDs → store rows + their category IDs (Breadcrumb1/2)
    3. Build category→store mapping (only for stores that have coded coupons)
    """
    log.info("Building cache (bottom-up)...")

    excluded_ids, merge_pairs = _load_exclusions()

    merge: dict[int, int] = {}
    for a, b in merge_pairs:
        canonical = min(a, b)
        merge[max(a, b)] = canonical

    # ── Step 1: find all store IDs that have at least one coded coupon ────────
    coupon_rows = db.query(f"""
        SELECT DISTINCT MerchantID
        FROM   {config.COUPONS_TABLE}
        WHERE  Status = 1
          AND  (EndDate >= GETDATE() OR EndDate IS NULL)
          AND  CouponCode IS NOT NULL
          AND  CouponCode != ''
    """)
    valid_stores: set[int] = {r["MerchantID"] for r in coupon_rows}
    count_rows   = db.query(f"""
        SELECT COUNT(*) AS cnt
        FROM   {config.COUPONS_TABLE}
        WHERE  Status = 1
          AND  (EndDate >= GETDATE() OR EndDate IS NULL)
          AND  CouponCode IS NOT NULL
          AND  CouponCode != ''
    """)
    coupon_count = count_rows[0]["cnt"] if count_rows else 0

    log.info("Step 1: %d stores have coded coupons", len(valid_stores))

    # ── Step 2: load only those stores from dbo.Category ─────────────────────
    if not valid_stores:
        log.warning("No stores with coded coupons found — cache will be empty")
        return

    placeholders = ",".join("?" * len(valid_stores))
    store_rows = db.query(
        f"""
        SELECT CategoryID, CategoryName, Breadcrumb1, Breadcrumb2, CategoryFileName, Website
        FROM   {config.CATEGORIES_TABLE}
        WHERE  CategoryTypeID = 1
          AND  Status = 1
          AND  CategoryID IN ({placeholders})
        """,
        tuple(valid_stores),
    )

    # ── Step 3: build vertical → store mapping ────────────────────────────────
    v2s: dict[int, list[tuple[int, str, str]]] = {}
    id2name: dict[int, str] = {}
    id2website: dict[int, str] = {}
    valid_cats: set[int] = set()

    for r in store_rows:
        sid   = r["CategoryID"]
        sname = (r["CategoryName"] or "").strip()
        sfile = r["CategoryFileName"] or ""
        id2name[sid] = sname
        website = (r.get("Website") or "").strip()
        if website:
            id2website[sid] = website

        for bc_field in ("Breadcrumb1", "Breadcrumb2"):
            vid = r.get(bc_field) or 0
            if vid == 0 or vid in excluded_ids:
                continue
            vid = merge.get(vid, vid)
            valid_cats.add(vid)
            v2s.setdefault(vid, [])
            entry = (sid, sname, sfile)
            if entry not in v2s[vid]:
                v2s[vid].append(entry)

    # ── Step 4: load ALL active coded coupons and index by MerchantID ─────────
    _COUPON_FIELDS = """
        CouponID, MerchantID, CouponName, CouponCode, CouponDescription,
        CouponTypeID, Discount, MinimumOrderAmount, MaximumDiscount,
        Verified, Exclusive, HotOffer, BestOffer, CouponVisits,
        CouponUrl, ForExistingUser, isRecommended, StartDate, EndDate
    """
    all_coupon_rows = db.query(f"""
        SELECT {_COUPON_FIELDS}
        FROM   {config.COUPONS_TABLE}
        WHERE  Status = 1
          AND  (EndDate >= GETDATE() OR EndDate IS NULL)
          AND  CouponCode IS NOT NULL
          AND  CouponCode != ''
    """)

    def _rank_key(r: dict) -> tuple:
        """Lower = better. Used for deduplication and sort."""
        return (
            0 if r.get("Verified") else 1,
            0 if r.get("BestOffer") else 1,
            0 if r.get("HotOffer") else 1,
            -(r.get("Discount") or 0),
        )

    # Deduplicate by (MerchantID, CouponCode) — keep the highest-ranked row
    # per pair. This mirrors the SQL ROW_NUMBER() PARTITION BY logic that
    # previously ran on every single user query.
    best: dict[tuple, dict] = {}
    for r in all_coupon_rows:
        key = (r["MerchantID"], r["CouponCode"])
        if key not in best or _rank_key(r) < _rank_key(best[key]):
            best[key] = r

    # Group by MerchantID, rank-sorted so callers can simply slice [:limit]
    new_coupon_cache: dict[int, list[dict]] = {}
    for r in best.values():
        new_coupon_cache.setdefault(r["MerchantID"], []).append(r)
    for lst in new_coupon_cache.values():
        lst.sort(key=_rank_key)

    log.info(
        "Step 4: %d distinct coupons across %d stores loaded into cache",
        len(best), len(new_coupon_cache),
    )

    with _lock:
        _vertical_to_stores.clear()
        _vertical_to_stores.update(v2s)
        _store_id_to_name.clear()
        _store_id_to_name.update(id2name)
        _store_id_to_website.clear()
        _store_id_to_website.update(id2website)
        _merge_map.clear()
        _merge_map.update(merge)
        _valid_store_ids.clear()
        _valid_store_ids.update(valid_stores)
        _valid_category_ids.clear()
        _valid_category_ids.update(valid_cats)
        _coupon_cache.clear()
        _coupon_cache.update(new_coupon_cache)
        _stats["categories"]         = len(v2s)
        _stats["stores"]             = len(id2name)
        _stats["coupons_with_codes"] = len(best)

    log.info(
        "Cache built: %d categories, %d stores, %d distinct coupons",
        len(v2s), len(id2name), len(best),
    )


def get_stores_for_verticals(vertical_ids: list[int]) -> list[tuple[int, str]]:
    seen: set[int] = set()
    result: list[tuple[int, str]] = []
    with _lock:
        for vid in vertical_ids:
            canonical = _merge_map.get(vid, vid)
            for sid, sname, _ in _vertical_to_stores.get(canonical, []):
                if sid not in seen:
                    seen.add(sid)
                    result.append((sid, sname))
    return result


def get_store_name(store_id: int) -> str:
    with _lock:
        return _store_id_to_name.get(store_id, "")


def get_store_website(store_id: int) -> str:
    with _lock:
        return _store_id_to_website.get(store_id, "")


def get_valid_store_ids() -> set[int]:
    with _lock:
        return set(_valid_store_ids)


def get_valid_category_ids() -> set[int]:
    with _lock:
        return set(_valid_category_ids)


def get_stats() -> dict[str, int]:
    with _lock:
        return dict(_stats)


def get_all_store_names() -> list[str]:
    with _lock:
        return sorted(_store_id_to_name.values())


def get_coupons_for_merchant(merchant_id: int) -> list[dict]:
    """Return shallow copies of the cached coupon list for one store.
    Copies are safe for callers to mutate (e.g. _enrich_and_filter_live)
    without affecting the underlying cache."""
    with _lock:
        return [dict(r) for r in _coupon_cache.get(merchant_id, [])]


def get_all_coupons_flat() -> list[dict]:
    """Return a flat list of shallow-copy coupon dicts across all stores.
    Used for brand-name fallback search when no store ID is known."""
    with _lock:
        return [dict(r) for coupons in _coupon_cache.values() for r in coupons]


def start_refresh_loop() -> None:
    def _loop():
        while True:
            time.sleep(config.CACHE_REFRESH_INTERVAL_HOURS * 3600)
            try:
                build()
            except Exception as e:
                log.error("Cache refresh failed: %s", e)

    t = threading.Thread(target=_loop, daemon=True)
    t.start()
