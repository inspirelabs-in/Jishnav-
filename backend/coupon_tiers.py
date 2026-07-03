"""
Deterministic (no-LLM) coupon tier classification and vertical-widening rules.

The "search -> reveal" redesign picks coupons in strict priority order:
  1. sitewide      -- CouponName mentions "sitewide"/"site wide"
  2. relevant      -- LLM judges: does this coupon match what the user asked for?
  3. synonym       -- CouponName mentions a sitewide-equivalent phrase
  4. catch-all     -- anything else, best Discount first

Tiers 1 and 3 are plain keyword matches -- free, instant, always consistent.
Only tier 2 needs the LLM (see responder.select_top_coupons).
"""

import functools
import logging

import yaml

import config

log = logging.getLogger(__name__)

SITEWIDE_KEYWORDS = ("sitewide", "site wide")

SYNONYM_KEYWORDS = (
    "storewide", "store wide", "all categories", "all orders",
    "all products", "across the site", "entire store", "everything",
)


def classify_keyword_tier(coupon_name: str) -> str | None:
    """Return 'sitewide', 'synonym', or None based on plain text match."""
    name = (coupon_name or "").lower()
    if any(kw in name for kw in SITEWIDE_KEYWORDS):
        return "sitewide"
    if any(kw in name for kw in SYNONYM_KEYWORDS):
        return "synonym"
    return None


@functools.lru_cache(maxsize=1)
def _load_widen_ok_ids() -> frozenset[int]:
    try:
        with open(config.WIDEN_VERTICALS_FILE) as f:
            data = yaml.safe_load(f) or {}
        return frozenset(data.get("widen_ok_vertical_ids", []))
    except FileNotFoundError:
        log.warning("widen_verticals.yaml not found — cross-store widening disabled")
        return frozenset()


def vertical_allows_widening(vertical_ids: list[int]) -> bool:
    """True if ANY of the given vertical IDs is on the safe-to-substitute list."""
    widen_ok = _load_widen_ok_ids()
    return any(vid in widen_ok for vid in vertical_ids)
