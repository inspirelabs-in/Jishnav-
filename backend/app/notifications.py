"""Overdue-entry detection with month-by-month escalation.

Runs whenever notifications are fetched. For every *Revenue* merchant we compare
what data exists against the expected reporting cadence. Each overdue brand is
ONE case (a single Notification row owned by the handler). As more reporting
periods pass with the data still missing, the case's stage rises and more people
are brought in:

    stage 1  ->  Handler                       (1st missed period)
    stage 2  ->  Handler + Manager             (2nd missed period)
    stage 3+ ->  Handler + Manager + Founders  (3rd+ missed period)

Visibility is cumulative: the handler always keeps seeing their own open cases.
The handler can submit a reason; the Manager (or Founders Office) approves it
(closes the case for good) or rejects it (the handler sees "Rejected", keeps the
reason box to try again, and the stage keeps climbing each further period).
Entering the data resolves the case. Non-revenue merchants are never chased.

`today` is injectable so a dev "time machine" can preview the flow across months.
"""
from datetime import date, datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Entry, Merchant, Notification

MANAGER = "Manager"
FOUNDERS = "Founders Office"

# Month-cadence reporting: step is measured in whole months.
MONTH_STEP = {"Monthly": 1, "60 days": 2, "90 days": 3}
# Day-cadence reporting: step is measured in days.
DAY_STEP = {"Live daily": 1, "2/week": 3, "3/week": 2, "Weekly": 7}
DAY_GRACE = 2  # small slack before a day-cadence brand counts as overdue


def _prev_month(d: date) -> date:
    """First day of the month before d's month."""
    if d.month == 1:
        return date(d.year - 1, 12, 1)
    return date(d.year, d.month - 1, 1)


def _months_between(a: date, b: date) -> int:
    return (b.year - a.year) * 12 + (b.month - a.month)


def _stage_and_period(
    reporting: str, last: date | None, created: date, today: date
) -> tuple[int, str]:
    """How many reporting periods are missing as of `today`, and a period label.

    Returns (0, "") when the brand is not overdue yet.
    """
    if reporting in MONTH_STEP:
        step = MONTH_STEP[reporting]
        expected = _prev_month(today)  # last completed reporting month
        if last is not None:
            base = date(last.year, last.month, 1)
            gap = _months_between(base, expected)
            period = f"since {base.strftime('%B %Y')}"
        else:
            base = date(created.year, created.month, 1)
            # A never-filled brand owes from its onboarding month onward.
            gap = _months_between(base, expected) + 1
            period = "no data yet"
        if gap < step:
            return 0, ""
        return gap // step, period

    if reporting in DAY_STEP:
        step = DAY_STEP[reporting]
        anchor = last if last is not None else created
        days_over = (today - anchor).days
        if days_over <= step + DAY_GRACE:
            return 0, ""
        period = f"since {last.strftime('%d %b %Y')}" if last is not None else "no data yet"
        return max(1, days_over // step), period

    return 0, ""


def recipients_for_stage(stage: int, owner: str) -> list[str]:
    people = [owner]
    if stage >= 2:
        people.append(MANAGER)
    if stage >= 3:
        people.append(FOUNDERS)
    return people


def _message(stage: int, m: Merchant, period: str, handler: str) -> str:
    base = f"Data for {m.merchant_name} is overdue (reporting: {m.reporting}, {period})."
    if stage <= 1:
        return f"{base} Please update it, or submit a reason for approval."
    if stage == 2:
        return (
            f"{base} {handler} was notified last period but the data is still "
            f"missing, so it has now been escalated to the Manager."
        )
    return (
        f"{base} Still missing after the Manager was looped in — it has now "
        f"reached the Founders Office and needs resolution."
    )


def refresh_notifications(db: Session, today: date | None = None) -> set[tuple[int, str]]:
    """Create/update overdue cases as of `today`. Returns the set of
    (merchant_id, period_label) currently overdue so the caller can hide stale
    pending cases (e.g. from stepping the time machine back) WITHOUT deleting
    them — deleting churns row ids and breaks reason submission by id."""
    today = today or date.today()
    merchants = db.query(Merchant).filter(Merchant.revenue_status == "Revenue").all()

    latest_by_merchant = dict(
        db.query(Entry.merchant_id, func.max(Entry.entry_date)).group_by(Entry.merchant_id).all()
    )

    # (merchant_id, period_label) genuinely overdue as of `today`.
    overdue_keys: set[tuple[int, str]] = set()

    for m in merchants:
        if not m.owner or not m.reporting:
            continue
        created = (m.created_at or datetime.now()).date()
        last = latest_by_merchant.get(m.merchant_id)

        stage, period = _stage_and_period(m.reporting, last, created, today)
        if stage <= 0:
            continue
        overdue_keys.add((m.merchant_id, period))

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
            # Closed for good: never re-open or re-stage.
            if existing.status in ("approved", "resolved"):
                continue
            changed = False
            # Stage tracks the current date (can move up or, under the time
            # machine, back down) so the preview is reversible.
            if existing.escalation_level != stage:
                existing.escalation_level = stage
                changed = True
            new_msg = _message(stage, m, period, existing.handler)
            if existing.message != new_msg:
                existing.message = new_msg
                changed = True
            # A transferred merchant's open case follows its new handler.
            if existing.handler != m.owner:
                existing.handler = m.owner
                changed = True
            if changed:
                existing.updated_at = datetime.now()
        else:
            db.add(
                Notification(
                    merchant_id=m.merchant_id,
                    merchant_name=m.merchant_name,
                    handler=m.owner,
                    message=_message(stage, m, period, m.owner),
                    period_label=period,
                    status="pending",
                    escalation_level=stage,
                    # Stamp the case with the (possibly simulated) date it opened.
                    created_at=datetime.combine(today, datetime.now().time()),
                )
            )

    db.commit()
    return overdue_keys


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
