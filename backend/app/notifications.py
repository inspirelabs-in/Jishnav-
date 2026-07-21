"""Overdue-entry detection with monthly escalation.

Runs whenever notifications are fetched. For every *Revenue* merchant, compare
the latest entry date against the expected reporting interval. Each missed
merchant-period is ONE case (a single Notification row owned by the handler).
As more periods pass unresolved, the case's escalation level rises and more
people can see and act on it:

    level 1  ->  Handler
    level 2  ->  Handler + Manager
    level 3+ ->  Handler + Manager + Founders Office

The handler can submit a reason; the Manager or Founders Office can approve it
(stops the case for good) or reject it (escalation keeps climbing). Non-revenue
merchants are never chased, so a parked brand goes quiet until it resumes.
"""
from datetime import date, datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Entry, Merchant, Notification

MANAGER = "Manager"
FOUNDERS = "Founders Office"

# reporting value -> max days allowed between entries (interval + small grace)
REPORTING_INTERVAL_DAYS = {
    "Live daily": 2,
    "2/week": 5,
    "3/week": 4,
    "Weekly": 9,
    "Monthly": 37,
    "60 days": 67,
    "90 days": 97,
}


def _period_label(last_entry: date | None, reporting: str) -> str:
    if last_entry is None:
        return "no data yet"
    if reporting in ("Monthly", "60 days", "90 days"):
        return f"since {last_entry.strftime('%B %Y')}"
    return f"since {last_entry.strftime('%d %b %Y')}"


def recipients_for_level(level: int, owner: str) -> list[str]:
    people = [owner]
    if level >= 2:
        people.append(MANAGER)
    if level >= 3:
        people.append(FOUNDERS)
    return people


def _message(level: int, m: Merchant, period: str) -> str:
    base = f"Data for {m.merchant_name} is overdue (reporting: {m.reporting}, {period})."
    if level <= 1:
        return f"{base} Please update it, or submit a reason for approval."
    if level == 2:
        return (
            f"{base} This is the 2nd missed period, so your Manager has also been "
            f"notified. Update it, or get a submitted reason approved."
        )
    return (
        f"{base} This is missed period #{level}. The Manager and Founders Office "
        f"have both been notified and it needs resolution."
    )


def refresh_notifications(db: Session, today: date | None = None) -> None:
    today = today or date.today()
    merchants = db.query(Merchant).filter(Merchant.revenue_status == "Revenue").all()

    latest_by_merchant = dict(
        db.query(Entry.merchant_id, func.max(Entry.entry_date)).group_by(Entry.merchant_id).all()
    )

    for m in merchants:
        max_days = REPORTING_INTERVAL_DAYS.get(m.reporting or "", None)
        if max_days is None or not m.owner:
            continue

        last = latest_by_merchant.get(m.merchant_id)
        if last is None:
            level = 1
        else:
            days_over = (today - last).days
            if days_over <= max_days:
                continue
            level = max(1, days_over // max_days)

        period = _period_label(last, m.reporting or "")
        existing = (
            db.query(Notification)
            .filter(
                Notification.merchant_id == m.merchant_id,
                Notification.period_label == period,
            )
            .order_by(Notification.id.desc())
            .first()
        )

        if existing:
            # Approved cases are closed for good; never re-open them.
            if existing.status == "approved":
                continue
            changed = False
            if level > (existing.escalation_level or 1):
                existing.escalation_level = level
                existing.message = _message(level, m, period)
                changed = True
            # A transferred merchant's open case follows its new handler.
            if existing.user != m.owner:
                existing.user = m.owner
                changed = True
            if changed:
                existing.updated_at = datetime.now()
        else:
            db.add(
                Notification(
                    merchant_id=m.merchant_id,
                    merchant_name=m.merchant_name,
                    user=m.owner,
                    message=_message(level, m, period),
                    period_label=period,
                    status="pending",
                    escalation_level=level,
                )
            )
    db.commit()


def resolve_notifications_for_merchant(db: Session, merchant_id: int) -> None:
    """Called after a new entry is saved: open cases are satisfied."""
    (
        db.query(Notification)
        .filter(
            Notification.merchant_id == merchant_id,
            Notification.status.in_(["pending", "reason_submitted", "rejected"]),
        )
        .update({"status": "resolved", "updated_at": datetime.now()}, synchronize_session=False)
    )
    db.commit()
