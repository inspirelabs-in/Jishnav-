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

# non-canonical vertical_id → canonical vertical_id
_merge_map: dict[int, int] = {}

# store IDs that have at least one coded coupon (used by store_index + vertical_classifier)
_valid_store_ids: set[int] = set()

# category IDs that map to at least one valid store (used by vertical_classifier)
_valid_category_ids: set[int] = set()

# snapshot counts for health check
_stats: dict[str, int] = {"categories": 0, "stores": 0, "coupons_with_codes": 0}

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
        SELECT CategoryID, CategoryName, Breadcrumb1, Breadcrumb2, CategoryFileName
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
    valid_cats: set[int] = set()

    for r in store_rows:
        sid   = r["CategoryID"]
        sname = (r["CategoryName"] or "").strip()
        sfile = r["CategoryFileName"] or ""
        id2name[sid] = sname

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

    with _lock:
        _vertical_to_stores.clear()
        _vertical_to_stores.update(v2s)
        _store_id_to_name.clear()
        _store_id_to_name.update(id2name)
        _merge_map.clear()
        _merge_map.update(merge)
        _valid_store_ids.clear()
        _valid_store_ids.update(valid_stores)
        _valid_category_ids.clear()
        _valid_category_ids.update(valid_cats)
        _stats["categories"]        = len(v2s)
        _stats["stores"]            = len(id2name)
        _stats["coupons_with_codes"] = coupon_count

    log.info(
        "Cache built: %d categories, %d stores, %d coupons with codes",
        len(v2s), len(id2name), coupon_count,
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
