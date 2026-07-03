"""Compute validity labels and urgency for coupons based on EndDate."""

from datetime import datetime, timezone, timedelta


def _today() -> datetime:
    return datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def compute_validity_label(end_date: datetime | None) -> tuple[str, str]:
    """
    Returns (label, urgency) where urgency is one of:
      'expired_today' | 'expires_soon' | 'valid' | 'no_expiry'
    """
    if end_date is None:
        return "No expiry date", "no_expiry"

    if end_date.tzinfo is None:
        end_date = end_date.replace(tzinfo=timezone.utc)

    today = _today()
    delta = (end_date.date() - today.date()).days

    if delta < 0:
        # Should not appear (filtered in DB query) but handle defensively
        return "Expired", "expired"
    elif delta == 0:
        return "Expires today — use it now!", "expires_today"
    elif delta <= 3:
        return f"Expires in {delta} day{'s' if delta > 1 else ''} ({end_date.strftime('%d %b')})", "expires_soon"
    else:
        return f"Valid until {end_date.strftime('%d %b %Y')}", "valid"


def build_discount_display(coupon: dict) -> str:
    type_id  = coupon.get("CouponTypeID")
    discount = coupon.get("Discount") or 0
    name     = coupon.get("CouponName", "")

    if type_id == 1:
        return f"Rs {int(discount)} OFF" if discount else name
    elif type_id == 2:
        return f"{int(discount)}% OFF" if discount else name
    elif type_id == 4:
        return "Buy 1 Get 1 Free"
    elif type_id == 17:
        return "Deal — no code needed"
    else:
        return name


def enrich_coupon(coupon: dict) -> dict:
    label, urgency = compute_validity_label(coupon.get("EndDate"))
    coupon["validity_label"]   = label
    coupon["validity_urgency"] = urgency
    coupon["discount_display"] = build_discount_display(coupon)
    return coupon
