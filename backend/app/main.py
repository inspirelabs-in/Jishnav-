import json
from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import func, inspect, or_, text
from sqlalchemy.orm import Session

from . import models
from .database import Base, SessionLocal, engine, get_db
from .notifications import refresh_notifications, resolve_notifications_for_merchant
from .utils import merchant_url


def _run_migrations() -> None:
    """Non-destructive schema catch-up so an existing DB gains new columns/tables
    without a reseed (which would wipe hand-entered data)."""
    insp = inspect(engine)
    if insp.has_table("merchants"):
        cols = [c["name"] for c in insp.get_columns("merchants")]
        for col, ddl in [("url", "VARCHAR"), ("created_at", "DATETIME"), ("updated_at", "DATETIME")]:
            if col not in cols:
                with engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE merchants ADD COLUMN {col} {ddl}"))
        # Backfill via raw SQL (NOT the ORM) so this never SELECTs a model
        # column that the on-disk table hasn't gained yet — that ordering trap
        # is what crash-loops the server on an out-of-date DB.
        with engine.begin() as conn:
            rows = conn.execute(
                text("SELECT merchant_id, merchant_name FROM merchants WHERE url IS NULL")
            ).all()
            for mid, name in rows:
                conn.execute(
                    text("UPDATE merchants SET url = :u WHERE merchant_id = :id"),
                    {"u": merchant_url(name), "id": mid},
                )
            conn.execute(
                text("UPDATE merchants SET created_at = :now WHERE created_at IS NULL"),
                {"now": datetime.now()},
            )
    if insp.has_table("notifications"):
        ncols = [c["name"] for c in insp.get_columns("notifications")]
        if "escalation_level" not in ncols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE notifications ADD COLUMN escalation_level INTEGER DEFAULT 1"))
                conn.execute(text("DELETE FROM notifications"))
        if "user" in ncols and "handler" not in ncols:
            with engine.begin() as conn:
                conn.execute(text("ALTER TABLE notifications RENAME COLUMN user TO handler"))
    if insp.has_table("entries"):
        ecols = [c["name"] for c in insp.get_columns("entries")]
        adds = {
            "delivery_requested": "BOOLEAN DEFAULT 0",
            "d_clicks": "INTEGER", "d_sales": "INTEGER", "d_cr": "FLOAT",
            "d_gmv": "FLOAT", "d_revenue": "FLOAT",
            "delivery_filled_by": "VARCHAR", "delivery_filled_at": "DATETIME",
        }
        with engine.begin() as conn:
            for col, ddl in adds.items():
                if col not in ecols:
                    conn.execute(text(f"ALTER TABLE entries ADD COLUMN {col} {ddl}"))


_run_migrations()
Base.metadata.create_all(bind=engine)  # creates any missing tables (e.g. transfers)

app = FastAPI(title="CR Portal API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

HANDLERS = ["Swati", "Yamini", "Meena"]
MANAGER = "Manager"
FOUNDERS = "Founders Office"
DELIVERY = "Delivery"


# ---------------------------------------------------------------- schemas ---

class MerchantOut(BaseModel):
    merchant_id: int
    merchant_name: str
    breadcrumb1: int
    breadcrumb1_name: str | None
    breadcrumb2: int
    breadcrumb2_name: str | None
    affiliate_id: int
    affiliate_name: str | None
    url: str | None
    reporting: str | None
    payout: str | None
    deal_type: str | None
    revenue_status: str
    owner: str | None

    class Config:
        from_attributes = True


class MerchantCreate(BaseModel):
    merchant_id: int | None = None  # optional; auto-generated when omitted
    merchant_name: str
    breadcrumb1: int = 0
    breadcrumb1_name: str | None = None
    breadcrumb2: int = 0
    breadcrumb2_name: str | None = None
    affiliate_id: int = 0
    affiliate_name: str | None = None
    reporting: str
    payout: str
    deal_type: str
    revenue_status: str
    owner: str


class MerchantUpdate(BaseModel):
    category: str | None = None
    sub_category: str | None = None
    reporting: str | None = None
    payout: str | None = None
    deal_type: str | None = None
    owner: str | None = None
    edited_by: str | None = None


class EntryCreate(BaseModel):
    merchant_id: int
    entry_date: date
    clicks: int | None = None
    sales: int | None = None
    gmv: float | None = None
    revenue: float | None = None
    remarks: str | None = None
    revenue_status: str = "Revenue"
    entered_by: str
    delivery_requested: bool = False


class DeliveryFill(BaseModel):
    clicks: int | None = None
    sales: int | None = None
    gmv: float | None = None
    revenue: float | None = None
    filled_by: str


class EntryUpdate(BaseModel):
    entry_date: date
    clicks: int | None = None
    sales: int | None = None
    gmv: float | None = None
    revenue: float | None = None
    remarks: str | None = None
    edited_by: str


class EntryOut(BaseModel):
    id: int
    merchant_id: int
    merchant_name: str
    entry_date: date
    entry_month: int
    entry_year: int
    clicks: int | None
    sales: int | None
    cr: float | None
    gmv: float | None
    revenue: float | None
    remarks: str | None
    revenue_status: str
    entered_by: str
    created_at: datetime
    updated_at: datetime | None
    # True only for the first Revenue entry that follows a Non-revenue one:
    # the "back to revenue" moment, highlighted green exactly once.
    is_comeback: bool = False
    # Delivery-team block
    delivery_requested: bool = False
    d_clicks: int | None = None
    d_sales: int | None = None
    d_cr: float | None = None
    d_gmv: float | None = None
    d_revenue: float | None = None
    delivery_filled_by: str | None = None
    delivery_filled_at: datetime | None = None


class ReasonIn(BaseModel):
    reason: str


def _compute_cr(clicks: int | None, sales: int | None) -> float | None:
    if clicks and sales is not None:
        return round(sales / clicks * 100, 2)
    return None


# -------------------------------------------------------------- merchants ---

@app.get("/api/merchants/search")
def search_merchants(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    q_norm = q.replace(" ", "")
    rows = (
        db.query(models.Merchant)
        .filter(
            func.replace(func.lower(models.Merchant.merchant_name), " ", "").contains(
                q_norm.lower()
            )
        )
        .order_by(models.Merchant.merchant_name)
        .limit(10)
        .all()
    )
    exact = any(r.merchant_name.replace(" ", "").lower() == q_norm.lower() for r in rows)
    return {
        "results": [MerchantOut.model_validate(r).model_dump() for r in rows],
        "exact_match": exact,
    }


@app.get("/api/merchants")
def list_merchants(owner: str | None = None, db: Session = Depends(get_db)):
    q = db.query(models.Merchant)
    if owner and owner != "All":
        q = q.filter(models.Merchant.owner == owner)
    rows = q.order_by(models.Merchant.merchant_name).all()
    return [MerchantOut.model_validate(r).model_dump() for r in rows]


@app.get("/api/categories")
def list_categories(db: Session = Depends(get_db)):
    rows = (
        db.query(models.Merchant.breadcrumb1_name)
        .filter(models.Merchant.breadcrumb1_name.isnot(None))
        .distinct()
        .order_by(models.Merchant.breadcrumb1_name)
        .all()
    )
    return [r[0] for r in rows]


@app.get("/api/handlers")
def list_handlers():
    return HANDLERS


@app.post("/api/merchants")
def create_merchant(payload: MerchantCreate, db: Session = Depends(get_db)):
    existing = (
        db.query(models.Merchant)
        .filter(func.lower(models.Merchant.merchant_name) == payload.merchant_name.strip().lower())
        .first()
    )
    if existing:
        raise HTTPException(409, f"Merchant '{payload.merchant_name}' already exists")

    data = payload.model_dump()
    given_id = data.pop("merchant_id", None)
    if given_id:
        if db.get(models.Merchant, given_id):
            raise HTTPException(409, f"Merchant ID {given_id} is already taken")
        new_id = given_id
    else:
        new_id = (db.query(func.max(models.Merchant.merchant_id)).scalar() or 0) + 1
    m = models.Merchant(merchant_id=new_id, **data)
    m.merchant_name = payload.merchant_name.strip()
    m.url = merchant_url(m.merchant_name)
    db.add(m)
    db.commit()
    db.refresh(m)
    return MerchantOut.model_validate(m).model_dump()


@app.put("/api/merchants/{merchant_id}")
def update_merchant(merchant_id: int, payload: MerchantUpdate, db: Session = Depends(get_db)):
    m = db.get(models.Merchant, merchant_id)
    if not m:
        raise HTTPException(404, "Merchant not found")
    # Map incoming fields to merchant columns; skip any left unset (None).
    incoming = [
        ("breadcrumb1_name", payload.category),
        ("breadcrumb2_name", payload.sub_category),
        ("reporting", payload.reporting),
        ("payout", payload.payout),
        ("deal_type", payload.deal_type),
        ("owner", payload.owner),
    ]
    changes: dict[str, dict] = {}
    for attr, raw in incoming:
        if raw is None:
            continue  # field not part of this update
        new = raw or None
        old = getattr(m, attr)
        if old != new:
            changes[attr] = {"old": old, "new": new}
            setattr(m, attr, new)
    if changes:
        db.add(models.MerchantEditLog(
            merchant_id=m.merchant_id, merchant_name=m.merchant_name,
            edited_by=payload.edited_by or "Unknown",
            edited_at=datetime.now(), changes=json.dumps(changes),
        ))
    db.commit()
    db.refresh(m)
    return MerchantOut.model_validate(m).model_dump()


@app.get("/api/merchant-edit-logs")
def list_merchant_edit_logs(
    owner: str | None = None,
    merchant: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    q = db.query(models.MerchantEditLog)
    if merchant:
        q = q.filter(models.MerchantEditLog.merchant_name.ilike(f"%{merchant}%"))
    if owner and owner != "All":
        owned = db.query(models.Merchant.merchant_id).filter(models.Merchant.owner == owner)
        q = q.filter(models.MerchantEditLog.merchant_id.in_(owned))
    if date_from:
        q = q.filter(models.MerchantEditLog.edited_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(models.MerchantEditLog.edited_at <= datetime.combine(date_to, datetime.max.time()))
    rows = q.order_by(models.MerchantEditLog.edited_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id, "merchant_id": r.merchant_id, "merchant_name": r.merchant_name,
            "edited_by": r.edited_by, "edited_at": r.edited_at, "changes": json.loads(r.changes),
        }
        for r in rows
    ]


# ---------------------------------------------------------------- entries ---

@app.post("/api/entries")
def create_entry(payload: EntryCreate, db: Session = Depends(get_db)):
    merchant = db.get(models.Merchant, payload.merchant_id)
    if not merchant:
        raise HTTPException(404, "Merchant not found")

    # A handler may only enter data for the brands they own. Manager / Founders
    # Office (not in HANDLERS) can enter for anyone.
    if payload.entered_by in HANDLERS and merchant.owner != payload.entered_by:
        raise HTTPException(
            403,
            f"{merchant.merchant_name} is handled by {merchant.owner}. "
            f"You can only enter data for your own brands.",
        )

    # A merchant is parked with ONE non-revenue log the day it stops. Saving
    # non-revenue again while it is already parked is meaningless, so block it:
    # the next valid entry is the Revenue "comeback" when it resumes.
    if payload.revenue_status == "Non-revenue" and merchant.revenue_status == "Non-revenue":
        raise HTTPException(
            409,
            f"{merchant.merchant_name} is already marked non-revenue. Switch it back "
            f"to Revenue and enter data when it resumes.",
        )

    if payload.revenue_status == "Revenue":
        missing = [
            f for f, v in [
                ("clicks", payload.clicks), ("sales", payload.sales),
                ("gmv", payload.gmv), ("revenue", payload.revenue),
            ] if v is None
        ]
        if missing:
            raise HTTPException(422, f"Mandatory fields missing: {', '.join(missing)}")

    # Data is kept by month only: pin every entry to the 1st of its month so no
    # day-level information is ever stored, whatever the client sends.
    entry_date = payload.entry_date.replace(day=1)
    entry = models.Entry(
        merchant_id=payload.merchant_id,
        entry_date=entry_date,
        entry_month=entry_date.month,
        entry_year=entry_date.year,
        clicks=payload.clicks,
        sales=payload.sales,
        cr=_compute_cr(payload.clicks, payload.sales),
        gmv=payload.gmv,
        revenue=payload.revenue,
        remarks=payload.remarks,
        revenue_status=payload.revenue_status,
        entered_by=payload.entered_by,
        delivery_requested=payload.delivery_requested,
    )
    db.add(entry)

    # The entry-form toggle drives the merchant's revenue status: flipping to
    # Non-revenue pauses data expectations (no more overdue notifications)
    # until it is flipped back.
    if merchant.revenue_status != payload.revenue_status:
        merchant.revenue_status = payload.revenue_status
    db.commit()

    resolve_notifications_for_merchant(db, payload.merchant_id)
    db.refresh(entry)
    return {"id": entry.id, "cr": entry.cr}


@app.get("/api/entries")
def list_entries(
    merchant: str | None = None,
    handler: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    q = db.query(models.Entry, models.Merchant.merchant_name).join(models.Merchant)
    if merchant:
        q = q.filter(models.Merchant.merchant_name.ilike(f"%{merchant}%"))
    if handler and handler != "All":
        q = q.filter(models.Entry.entered_by == handler)
    if date_from:
        q = q.filter(models.Entry.entry_date >= date_from)
    if date_to:
        q = q.filter(models.Entry.entry_date <= date_to)
    rows = q.order_by(models.Entry.created_at.desc(), models.Entry.id.desc()).limit(limit).all()

    # Flag "comeback" entries from each merchant's FULL history (not just the
    # filtered page), so a Revenue row still lights up green even when the
    # preceding Non-revenue row sits in a month the filter hides.
    comeback_ids: set[int] = set()
    merchant_ids = {e.merchant_id for e, _ in rows}
    if merchant_ids:
        history = (
            db.query(
                models.Entry.id,
                models.Entry.merchant_id,
                models.Entry.revenue_status,
            )
            .filter(models.Entry.merchant_id.in_(merchant_ids))
            .order_by(models.Entry.merchant_id, models.Entry.entry_date, models.Entry.id)
            .all()
        )
        prev_status: dict[int, str] = {}
        for eid, mid, status in history:
            if status == "Revenue" and prev_status.get(mid) == "Non-revenue":
                comeback_ids.add(eid)
            prev_status[mid] = status

    return [
        EntryOut(
            id=e.id, merchant_id=e.merchant_id, merchant_name=name,
            entry_date=e.entry_date, entry_month=e.entry_month, entry_year=e.entry_year,
            clicks=e.clicks, sales=e.sales, cr=e.cr,
            gmv=e.gmv, revenue=e.revenue, remarks=e.remarks,
            revenue_status=e.revenue_status, entered_by=e.entered_by,
            created_at=e.created_at, updated_at=e.updated_at,
            is_comeback=e.id in comeback_ids,
            delivery_requested=e.delivery_requested,
            d_clicks=e.d_clicks, d_sales=e.d_sales, d_cr=e.d_cr,
            d_gmv=e.d_gmv, d_revenue=e.d_revenue,
            delivery_filled_by=e.delivery_filled_by, delivery_filled_at=e.delivery_filled_at,
        ).model_dump()
        for e, name in rows
    ]


@app.put("/api/entries/{entry_id}")
def update_entry(entry_id: int, payload: EntryUpdate, db: Session = Depends(get_db)):
    entry = db.get(models.Entry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")

    # Month-only model: normalise the incoming date to the 1st of its month.
    payload.entry_date = payload.entry_date.replace(day=1)

    changes: dict[str, dict] = {}
    for field in ["entry_date", "clicks", "sales", "gmv", "revenue", "remarks"]:
        old = getattr(entry, field)
        new = getattr(payload, field)
        if old != new:
            changes[field] = {
                "old": old.isoformat() if isinstance(old, date) else old,
                "new": new.isoformat() if isinstance(new, date) else new,
            }
            setattr(entry, field, new)
            if field == "entry_date":
                entry.entry_month = new.month
                entry.entry_year = new.year

    if not changes:
        return {"updated": False}

    old_cr = entry.cr
    entry.cr = _compute_cr(entry.clicks, entry.sales)
    if entry.cr != old_cr:
        changes["cr"] = {"old": old_cr, "new": entry.cr}
    entry.updated_at = datetime.now()

    merchant = db.get(models.Merchant, entry.merchant_id)
    db.add(models.EditLog(
        entry_id=entry.id,
        merchant_id=entry.merchant_id,
        merchant_name=merchant.merchant_name if merchant else "",
        edited_by=payload.edited_by,
        changes=json.dumps(changes),
    ))
    db.commit()
    return {"updated": True, "cr": entry.cr}


@app.delete("/api/entries/{entry_id}")
def delete_entry(
    entry_id: int,
    entered_by: str | None = None,
    db: Session = Depends(get_db),
):
    entry = db.get(models.Entry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    # Only the handler who entered a row may delete it.
    if entered_by and entry.entered_by != entered_by:
        raise HTTPException(403, "Only the handler who entered this data can delete it")
    # Drop the row's edit-log trail too, so nothing dangles.
    db.query(models.EditLog).filter(models.EditLog.entry_id == entry_id).delete(
        synchronize_session=False
    )
    db.delete(entry)
    db.commit()
    return {"deleted": True}


# ---------------------------------------------------------------- delivery ---

@app.get("/api/delivery-requests")
def list_delivery_requests(status: str = "pending", db: Session = Depends(get_db)):
    """Entries a handler flagged for the Delivery team.

    status=pending -> still needs delivery numbers; status=done -> already filled.
    """
    q = (
        db.query(models.Entry, models.Merchant)
        .join(models.Merchant)
        .filter(models.Entry.delivery_requested.is_(True))
    )
    if status == "pending":
        q = q.filter(models.Entry.d_clicks.is_(None))
    elif status == "done":
        q = q.filter(models.Entry.d_clicks.isnot(None))
    rows = q.order_by(models.Entry.created_at.desc()).limit(200).all()
    return [
        {
            "id": e.id, "merchant_id": e.merchant_id, "merchant_name": m.merchant_name,
            "entry_date": e.entry_date, "entry_month": e.entry_month, "entry_year": e.entry_year,
            "requested_by": e.entered_by, "created_at": e.created_at,
            "clicks": e.clicks, "sales": e.sales, "cr": e.cr,
            "gmv": e.gmv, "revenue": e.revenue, "remarks": e.remarks,
            "d_clicks": e.d_clicks, "d_sales": e.d_sales, "d_cr": e.d_cr,
            "d_gmv": e.d_gmv, "d_revenue": e.d_revenue,
            "delivery_filled_by": e.delivery_filled_by, "delivery_filled_at": e.delivery_filled_at,
            # merchant details, so the delivery view can show the full record
            "breadcrumb1_name": m.breadcrumb1_name, "breadcrumb2_name": m.breadcrumb2_name,
            "reporting": m.reporting, "payout": m.payout, "deal_type": m.deal_type,
            "owner": m.owner, "url": m.url,
        }
        for e, m in rows
    ]


@app.post("/api/entries/{entry_id}/delivery")
def fill_delivery(entry_id: int, payload: DeliveryFill, db: Session = Depends(get_db)):
    entry = db.get(models.Entry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    if not entry.delivery_requested:
        raise HTTPException(422, "This entry did not request delivery-team data")
    entry.d_clicks = payload.clicks
    entry.d_sales = payload.sales
    entry.d_cr = _compute_cr(payload.clicks, payload.sales)
    entry.d_gmv = payload.gmv
    entry.d_revenue = payload.revenue
    entry.delivery_filled_by = payload.filled_by
    entry.delivery_filled_at = datetime.now()
    db.commit()
    return {"id": entry.id, "d_cr": entry.d_cr}


@app.put("/api/entries/{entry_id}/delivery")
def update_delivery(entry_id: int, payload: DeliveryFill, db: Session = Depends(get_db)):
    entry = db.get(models.Entry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    if not entry.delivery_requested:
        raise HTTPException(422, "This entry did not request delivery-team data")
    entry.d_clicks = payload.clicks
    entry.d_sales = payload.sales
    entry.d_cr = _compute_cr(payload.clicks, payload.sales)
    entry.d_gmv = payload.gmv
    entry.d_revenue = payload.revenue
    entry.delivery_filled_by = payload.filled_by
    entry.delivery_filled_at = datetime.now()
    db.commit()
    return {"id": entry.id, "d_cr": entry.d_cr}


@app.delete("/api/entries/{entry_id}/delivery")
def delete_delivery(entry_id: int, filled_by: str = "", db: Session = Depends(get_db)):
    entry = db.get(models.Entry, entry_id)
    if not entry:
        raise HTTPException(404, "Entry not found")
    if entry.delivery_filled_by and entry.delivery_filled_by != filled_by:
        raise HTTPException(403, f"Only {entry.delivery_filled_by} can remove this delivery data")
    entry.d_clicks = None
    entry.d_sales = None
    entry.d_cr = None
    entry.d_gmv = None
    entry.d_revenue = None
    entry.delivery_filled_by = None
    entry.delivery_filled_at = None
    db.commit()
    return {"deleted": True}


# ------------------------------------------------------------ status history ---

@app.get("/api/status-history")
def status_history(
    owner: str | None = None,
    merchant: str | None = None,
    db: Session = Depends(get_db),
):
    """Revenue <-> Non-revenue transitions, derived from the entry timeline."""
    q = db.query(models.Entry, models.Merchant).join(models.Merchant)
    if owner and owner != "All":
        q = q.filter(models.Merchant.owner == owner)
    if merchant:
        q = q.filter(models.Merchant.merchant_name.ilike(f"%{merchant}%"))
    rows = q.order_by(
        models.Entry.merchant_id, models.Entry.entry_date, models.Entry.id
    ).all()

    prev: dict[int, str] = {}
    events = []
    for e, m in rows:
        was = prev.get(e.merchant_id)
        if was is not None and was != e.revenue_status:
            events.append({
                "merchant_id": m.merchant_id,
                "merchant_name": m.merchant_name,
                "owner": m.owner,
                "from_status": was,
                "to_status": e.revenue_status,
                "date": e.entry_date,
                "changed_by": e.entered_by,
            })
        prev[e.merchant_id] = e.revenue_status

    events.sort(key=lambda x: x["date"], reverse=True)
    return events


@app.get("/api/edit-logs")
def list_edit_logs(
    owner: str | None = None,
    edited_by: str | None = None,
    merchant: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
):
    q = db.query(models.EditLog)
    if merchant:
        q = q.filter(models.EditLog.merchant_name.ilike(f"%{merchant}%"))
    if edited_by and edited_by != "All":
        q = q.filter(models.EditLog.edited_by == edited_by)
    if owner and owner != "All":
        # Scope to the merchants this handler currently owns.
        owned = db.query(models.Merchant.merchant_id).filter(models.Merchant.owner == owner)
        q = q.filter(models.EditLog.merchant_id.in_(owned))
    # Filter on when the edit was made (edited_at), inclusive of both bounds.
    if date_from:
        q = q.filter(models.EditLog.edited_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to:
        q = q.filter(models.EditLog.edited_at <= datetime.combine(date_to, datetime.max.time()))
    rows = q.order_by(models.EditLog.edited_at.desc()).limit(limit).all()
    return [
        {
            "id": r.id, "entry_id": r.entry_id, "merchant_id": r.merchant_id,
            "merchant_name": r.merchant_name, "edited_by": r.edited_by,
            "edited_at": r.edited_at, "changes": json.loads(r.changes),
        }
        for r in rows
    ]


# ---------------------------------------------------------- notifications ---

@app.get("/api/notifications")
def get_notifications(user: str, as_of: str | None = None, db: Session = Depends(get_db)):
    # `as_of` (YYYY-MM-DD) drives the dev time machine: notifications are
    # recomputed as if that were today, so the escalation flow can be previewed.
    today = None
    if as_of:
        try:
            today = date.fromisoformat(as_of)
        except ValueError:
            raise HTTPException(422, "as_of must be YYYY-MM-DD")
    overdue = refresh_notifications(db, today=today)
    q = db.query(models.Notification)
    if user == MANAGER:
        # A 2nd-period escalation reaches the Manager; they can also act on any
        # reason a handler submits, even at stage 1.
        q = q.filter(
            (models.Notification.escalation_level >= 2)
            | (models.Notification.status == "reason_submitted")
        )
    elif user == FOUNDERS:
        # The Founders Office only sees cases that reached the 3rd period.
        q = q.filter(models.Notification.escalation_level >= 3)
    else:
        q = q.filter(models.Notification.handler == user)
    rows = q.order_by(models.Notification.created_at.desc()).limit(100).all()
    # Hide (don't delete) still-pending cases that aren't overdue as of `today` —
    # e.g. left over from stepping the time machine back. Rows are never deleted,
    # so their ids stay stable and reason/approve-by-id keep working.
    rows = [
        r for r in rows
        if r.status != "pending" or (r.merchant_id, r.period_label) in overdue
    ]
    return [
        {
            "id": r.id, "merchant_id": r.merchant_id, "merchant_name": r.merchant_name,
            "handler": r.handler, "message": r.message,
            "period_label": r.period_label, "reason": r.reason, "status": r.status,
            "escalation_level": r.escalation_level or 1,
            "created_at": r.created_at, "updated_at": r.updated_at,
        }
        for r in rows
    ]


@app.post("/api/notifications/{notif_id}/reason")
def submit_reason(notif_id: int, payload: ReasonIn, db: Session = Depends(get_db)):
    n = db.get(models.Notification, notif_id)
    if not n:
        raise HTTPException(404, "Notification not found")
    n.reason = payload.reason
    n.status = "reason_submitted"
    n.updated_at = datetime.now()
    db.commit()
    return {"status": n.status}


@app.post("/api/notifications/{notif_id}/approve")
def approve_reason(notif_id: int, db: Session = Depends(get_db)):
    n = db.get(models.Notification, notif_id)
    if not n:
        raise HTTPException(404, "Notification not found")
    if n.status != "reason_submitted":
        raise HTTPException(422, "Only a submitted reason can be approved")
    # Approval closes the case for good: it is a single row, so no further
    # escalation is generated for this merchant-period.
    n.status = "approved"
    n.updated_at = datetime.now()
    db.commit()
    return {"status": n.status}


@app.post("/api/notifications/{notif_id}/reject")
def reject_reason(notif_id: int, db: Session = Depends(get_db)):
    n = db.get(models.Notification, notif_id)
    if not n:
        raise HTTPException(404, "Notification not found")
    if n.status != "reason_submitted":
        raise HTTPException(422, "Only a submitted reason can be rejected")
    # Rejected: the case stays open and keeps escalating each further period
    # until data is entered or a new reason is approved.
    n.status = "rejected"
    n.updated_at = datetime.now()
    db.commit()
    return {"status": n.status}


# --------------------------------------------------------------- transfers ---

class TransferIn(BaseModel):
    merchant_id: int
    to_handler: str
    by: str


@app.post("/api/transfers")
def transfer_merchant(payload: TransferIn, db: Session = Depends(get_db)):
    m = db.get(models.Merchant, payload.merchant_id)
    if not m:
        raise HTTPException(404, "Merchant not found")
    if payload.to_handler not in HANDLERS:
        raise HTTPException(422, f"'{payload.to_handler}' is not a handler")
    if m.owner == payload.to_handler:
        raise HTTPException(409, f"{m.merchant_name} is already handled by {payload.to_handler}")

    from_handler = m.owner
    m.owner = payload.to_handler
    db.add(models.Transfer(
        merchant_id=m.merchant_id,
        merchant_name=m.merchant_name,
        from_handler=from_handler,
        to_handler=payload.to_handler,
        transferred_by=payload.by,
    ))
    # Open reminders follow the merchant to its new handler.
    (
        db.query(models.Notification)
        .filter(
            models.Notification.merchant_id == m.merchant_id,
            models.Notification.status.in_(["pending", "reason_submitted"]),
            models.Notification.handler == from_handler,
        )
        .update({"handler": payload.to_handler}, synchronize_session=False)
    )
    db.commit()
    return {
        "merchant_id": m.merchant_id,
        "merchant_name": m.merchant_name,
        "from_handler": from_handler,
        "to_handler": payload.to_handler,
    }


@app.get("/api/transfers")
def list_transfers(limit: int = 100, db: Session = Depends(get_db)):
    rows = (
        db.query(models.Transfer)
        .order_by(models.Transfer.transferred_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": r.id, "merchant_id": r.merchant_id, "merchant_name": r.merchant_name,
            "from_handler": r.from_handler, "to_handler": r.to_handler,
            "transferred_by": r.transferred_by, "transferred_at": r.transferred_at,
        }
        for r in rows
    ]


# --------------------------------------------------------------- analytics ---

@app.get("/api/analytics")
def analytics(
    mode: str,
    brands: list[str] = Query(default=[]),
    categories: list[str] = Query(default=[]),
    owner: str = "All",
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db),
):
    merchant_conds = []
    average_over = 0
    if mode == "overview":
        # Average across a handler's whole book (or every brand for All).
        merchant_conds.append(models.Merchant.revenue_status == "Revenue")
        if owner != "All":
            merchant_conds.append(models.Merchant.owner == owner)
        group_key = lambda m: "All brands (average)"  # noqa: E731
        group_names = ["All brands (average)"]
        average_over = (
            db.query(func.count(models.Merchant.merchant_id))
            .filter(*merchant_conds)
            .scalar()
            or 0
        )
        if average_over == 0:
            return {
                "granularity": "day", "series": [],
                "totals": {"clicks": 0, "sales": 0, "gmv": 0, "revenue": 0},
                "prev_totals": None, "merchants_included": [],
            }
    elif mode in ("brand", "brand_comparison"):
        if not brands:
            raise HTTPException(422, "Select at least one brand")
        merchant_conds.append(models.Merchant.merchant_name.in_(brands))
        group_key = lambda m: m.merchant_name  # noqa: E731
        group_names = brands
    elif mode in ("category", "category_comparison"):
        if not categories:
            raise HTTPException(422, "Select at least one category")
        merchant_conds.append(models.Merchant.breadcrumb1_name.in_(categories))
        if owner != "All":
            merchant_conds.append(models.Merchant.owner == owner)
        group_key = lambda m: m.breadcrumb1_name  # noqa: E731
        group_names = categories
    else:
        raise HTTPException(422, f"Unknown mode: {mode}")

    q = db.query(models.Entry, models.Merchant).join(models.Merchant)
    for cond in merchant_conds:
        q = q.filter(cond)
    if date_from:
        q = q.filter(models.Entry.entry_date >= date_from)
    if date_to:
        q = q.filter(models.Entry.entry_date <= date_to)
    rows = q.all()

    # Totals for the window immediately before, same length, for delta chips.
    prev_totals = None
    if date_from and date_to:
        span = (date_to - date_from).days + 1
        pq = db.query(
            func.coalesce(func.sum(models.Entry.clicks), 0),
            func.coalesce(func.sum(models.Entry.sales), 0),
            func.coalesce(func.sum(models.Entry.gmv), 0),
            func.coalesce(func.sum(models.Entry.revenue), 0),
        ).join(models.Merchant)
        for cond in merchant_conds:
            pq = pq.filter(cond)
        pq = pq.filter(
            models.Entry.entry_date >= date_from - timedelta(days=span),
            models.Entry.entry_date <= date_from - timedelta(days=1),
        )
        pc, ps, pg, pr = pq.one()
        if average_over:
            pc, ps, pg, pr = (v / average_over for v in (pc, ps, pg, pr))
        prev_totals = {
            "clicks": round(pc, 2), "sales": round(ps, 2),
            "gmv": round(pg, 2), "revenue": round(pr, 2),
        }

    # Bucket by day for short ranges, by month for long ones.
    span_days = (date_to - date_from).days if (date_from and date_to) else 9999
    monthly = span_days > 62

    def bucket(d: date) -> str:
        return d.strftime("%Y-%m") if monthly else d.isoformat()

    agg: dict[str, dict[str, dict[str, float]]] = defaultdict(
        lambda: defaultdict(lambda: {"clicks": 0, "sales": 0, "gmv": 0, "revenue": 0})
    )
    totals = {"clicks": 0, "sales": 0, "gmv": 0, "revenue": 0}
    merchants_included: set[str] = set()

    for e, m in rows:
        key = group_key(m)
        b = bucket(e.entry_date)
        merchants_included.add(m.merchant_name)
        for metric, val in [
            ("clicks", e.clicks), ("sales", e.sales), ("gmv", e.gmv), ("revenue", e.revenue),
        ]:
            if val is not None:
                agg[key][b][metric] += val
                totals[metric] += val

    divisor = average_over or 1

    series = []
    for name in group_names:
        buckets = agg.get(name, {})
        points = [
            {"date": b, **{k: round(v / divisor, 2) for k, v in vals.items()}}
            for b, vals in sorted(buckets.items())
        ]
        series.append({"name": name, "points": points})

    return {
        "granularity": "month" if monthly else "day",
        "series": series,
        "totals": {k: round(v / divisor, 2) for k, v in totals.items()},
        "prev_totals": prev_totals,
        "merchants_included": sorted(merchants_included),
        "averaged_over": average_over or None,
    }


def _month_key(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}"


def _months_back(year: int, month: int, n: int) -> tuple[int, int]:
    """The (year, month) that is n whole months before the given one."""
    idx = year * 12 + (month - 1) - n
    y, m0 = divmod(idx, 12)
    return y, m0 + 1


def _months_between(d_from: date, d_to: date) -> list[str]:
    """Ordered month keys ("YYYY-MM") from d_from's month to d_to's month."""
    keys: list[str] = []
    y, m = d_from.year, d_from.month
    while (y, m) <= (d_to.year, d_to.month):
        keys.append(_month_key(y, m))
        y, m = _months_back(y, m, -1)
    return keys[-36:]  # soft cap so an extreme range can't explode the table


def _completed_window(months: int) -> tuple[date, date, list[str]]:
    """The last `months` FULLY COMPLETED months (the in-progress current month
    is excluded, since its data is only known once the month closes).

    Returns (start_date, end_date, ordered month keys oldest->newest)."""
    today = date.today()
    first_of_current = today.replace(day=1)
    end = first_of_current - timedelta(days=1)  # last day of the previous month
    keys: list[str] = []
    y, m = end.year, end.month
    for _ in range(months):
        keys.append(_month_key(y, m))
        y, m = _months_back(y, m, 1)
    keys.reverse()
    sy, sm = int(keys[0][:4]), int(keys[0][5:7])
    return date(sy, sm, 1), end, keys


@app.get("/api/analytics/overview")
def analytics_overview(
    owner: str = "All",
    months: int = 3,
    date_from: date | None = None,
    date_to: date | None = None,
    merchant: str | None = None,
    brands: list[str] | None = Query(None),
    categories: list[str] | None = Query(None),
    handlers: list[str] | None = Query(None),
    db: Session = Depends(get_db),
):
    """Portfolio overview: monthly totals across a handler's whole book (or every
    brand for "All"), plus a per-brand month-by-month breakdown for the table.

    With no date range this defaults to the last `months` completed months (the
    in-progress month is excluded). An explicit date_from/date_to picks any span
    of months. `merchant` narrows the breakdown to matching brand names. The
    graph line is the portfolio TOTAL each month (CR = total sales / total
    clicks)."""
    if date_from and date_to:
        start = date_from.replace(day=1)
        end = date_to
        month_keys = _months_between(start, end)
        if not month_keys:  # inverted range: fall back to the single from-month
            month_keys = _months_between(start, start)
            end = start
    else:
        months = max(1, min(months, 24))
        start, end, month_keys = _completed_window(months)

    mq = db.query(models.Merchant)
    # Handler filter: an explicit list wins; else the single `owner` (legacy).
    if handlers:
        mq = mq.filter(models.Merchant.owner.in_(handlers))
    elif owner and owner != "All":
        mq = mq.filter(models.Merchant.owner == owner)
    # Category filter: brand must sit in one of the chosen categories.
    if categories:
        mq = mq.filter(models.Merchant.breadcrumb1_name.in_(categories))
    # Brand filter: name matches ANY of the chosen brand terms; else legacy single.
    if brands:
        mq = mq.filter(or_(*[models.Merchant.merchant_name.ilike(f"%{b}%") for b in brands]))
    elif merchant:
        mq = mq.filter(models.Merchant.merchant_name.ilike(f"%{merchant}%"))
    merchants = mq.order_by(models.Merchant.merchant_name).all()
    merchant_ids = [m.merchant_id for m in merchants]

    def cr(sales: float, clicks: float) -> float:
        return round(sales / clicks * 100, 2) if clicks else 0.0

    # Accumulate per (merchant, month).
    per: dict[tuple[int, str], dict[str, float]] = defaultdict(
        lambda: {"clicks": 0.0, "sales": 0.0, "gmv": 0.0, "revenue": 0.0}
    )
    key_set = set(month_keys)
    if merchant_ids:
        rows = (
            db.query(models.Entry)
            .filter(
                models.Entry.merchant_id.in_(merchant_ids),
                models.Entry.entry_date >= start,
                models.Entry.entry_date <= end,
            )
            .all()
        )
        for e in rows:
            mk = _month_key(e.entry_year, e.entry_month)
            if mk not in key_set:
                continue
            acc = per[(e.merchant_id, mk)]
            for metric, val in [
                ("clicks", e.clicks), ("sales", e.sales),
                ("gmv", e.gmv), ("revenue", e.revenue),
            ]:
                if val is not None:
                    acc[metric] += val

    # Portfolio totals per month (the graph line).
    aggregate = []
    for mk in month_keys:
        t = {"clicks": 0.0, "sales": 0.0, "gmv": 0.0, "revenue": 0.0}
        for mid in merchant_ids:
            a = per.get((mid, mk))
            if a:
                for k in t:
                    t[k] += a[k]
        aggregate.append({
            "month": mk,
            "clicks": round(t["clicks"], 2), "sales": round(t["sales"], 2),
            "cr": cr(t["sales"], t["clicks"]),
            "gmv": round(t["gmv"], 2), "revenue": round(t["revenue"], 2),
        })

    # Window totals for the KPI tiles.
    tot = {"clicks": 0.0, "sales": 0.0, "gmv": 0.0, "revenue": 0.0}
    for a in aggregate:
        for k in tot:
            tot[k] += a[k]
    totals = {
        "clicks": round(tot["clicks"], 2), "sales": round(tot["sales"], 2),
        "cr": cr(tot["sales"], tot["clicks"]),
        "gmv": round(tot["gmv"], 2), "revenue": round(tot["revenue"], 2),
    }

    # The equally-long window immediately before, for the delta chips.
    prev_totals = None
    if merchant_ids:
        span = len(month_keys)
        prev_end = start - timedelta(days=1)
        py, pm = _months_back(prev_end.year, prev_end.month, span - 1)
        prev_start = date(py, pm, 1)
        pc, ps, pg, pr = (
            db.query(
                func.coalesce(func.sum(models.Entry.clicks), 0),
                func.coalesce(func.sum(models.Entry.sales), 0),
                func.coalesce(func.sum(models.Entry.gmv), 0),
                func.coalesce(func.sum(models.Entry.revenue), 0),
            )
            .filter(
                models.Entry.merchant_id.in_(merchant_ids),
                models.Entry.entry_date >= prev_start,
                models.Entry.entry_date <= prev_end,
            )
            .one()
        )
        prev_totals = {
            "clicks": round(pc, 2), "sales": round(ps, 2), "cr": cr(ps, pc),
            "gmv": round(pg, 2), "revenue": round(pr, 2),
        }

    # Per-brand breakdown: one row per owned brand, a cell per completed month.
    by_merchant = []
    for m in merchants:
        cells: dict[str, dict[str, float]] = {}
        for mk in month_keys:
            a = per.get((m.merchant_id, mk))
            if a and (a["clicks"] or a["sales"] or a["gmv"] or a["revenue"]):
                cells[mk] = {
                    "clicks": round(a["clicks"], 2), "sales": round(a["sales"], 2),
                    "cr": cr(a["sales"], a["clicks"]),
                    "gmv": round(a["gmv"], 2), "revenue": round(a["revenue"], 2),
                }
        by_merchant.append({"merchant": m.merchant_name, "months": cells})

    return {
        "months": month_keys,
        "aggregate": aggregate,
        "totals": totals,
        "prev_totals": prev_totals,
        "by_merchant": by_merchant,
    }


# ---------------------------------------------------------- sales pipeline ---

SALES_TEAM = ["Sales1", "Sales2"]

SALES_STAGES = [
    "new_lead", "contacted", "no_response", "responded", "negotiating",
    "closed_won", "closed_lost", "parked",
]

SALES_PRIORITIES = ["hot", "warm", "cold"]

ACTIVITY_TYPES = ["call", "email_sent", "reply_received", "meeting", "whatsapp", "note"]

LEAD_SOURCES = ["Cold outreach", "Referral", "Inbound", "Event", "LinkedIn", "Other"]


class LeadCreate(BaseModel):
    brand_name: str
    category: str | None = None
    website: str | None = None
    source: str | None = None
    poc1_name: str | None = None
    poc1_email: str | None = None
    poc1_phone: str | None = None
    poc1_designation: str | None = None
    poc2_name: str | None = None
    poc2_email: str | None = None
    poc2_phone: str | None = None
    poc2_designation: str | None = None
    stage: str = "new_lead"
    priority: str = "warm"
    assigned_to: str
    next_followup: date | None = None


class LeadUpdate(BaseModel):
    brand_name: str | None = None
    category: str | None = None
    website: str | None = None
    source: str | None = None
    poc1_name: str | None = None
    poc1_email: str | None = None
    poc1_phone: str | None = None
    poc1_designation: str | None = None
    poc2_name: str | None = None
    poc2_email: str | None = None
    poc2_phone: str | None = None
    poc2_designation: str | None = None
    stage: str | None = None
    priority: str | None = None
    assigned_to: str | None = None
    next_followup: date | None = None


class ActivityCreate(BaseModel):
    activity_type: str
    activity_date: datetime | None = None
    summary: str | None = None
    outcome: str | None = None
    next_action: str | None = None
    next_followup: date | None = None
    logged_by: str


def _lead_out(lead: models.SalesLead) -> dict:
    activity_count = len(lead.activities) if lead.activities else 0
    return {
        "id": lead.id,
        "brand_name": lead.brand_name,
        "category": lead.category,
        "website": lead.website,
        "source": lead.source,
        "poc1_name": lead.poc1_name,
        "poc1_email": lead.poc1_email,
        "poc1_phone": lead.poc1_phone,
        "poc1_designation": lead.poc1_designation,
        "poc2_name": lead.poc2_name,
        "poc2_email": lead.poc2_email,
        "poc2_phone": lead.poc2_phone,
        "poc2_designation": lead.poc2_designation,
        "stage": lead.stage,
        "priority": lead.priority,
        "assigned_to": lead.assigned_to,
        "last_contact_date": lead.last_contact_date,
        "next_followup": lead.next_followup,
        "touchpoints": activity_count,
        "created_at": lead.created_at,
        "updated_at": lead.updated_at,
    }


@app.get("/api/sales/leads")
def list_leads(
    assigned_to: str | None = None,
    stage: str | None = None,
    priority: str | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(models.SalesLead)
    if assigned_to and assigned_to != "All":
        q = q.filter(models.SalesLead.assigned_to == assigned_to)
    if stage and stage != "all":
        q = q.filter(models.SalesLead.stage == stage)
    if priority and priority != "all":
        q = q.filter(models.SalesLead.priority == priority)
    if search:
        q = q.filter(
            or_(
                models.SalesLead.brand_name.ilike(f"%{search}%"),
                models.SalesLead.poc1_name.ilike(f"%{search}%"),
                models.SalesLead.poc2_name.ilike(f"%{search}%"),
            )
        )
    rows = q.order_by(models.SalesLead.updated_at.desc().nullslast(), models.SalesLead.created_at.desc()).all()
    return [_lead_out(r) for r in rows]


@app.post("/api/sales/leads")
def create_lead(payload: LeadCreate, db: Session = Depends(get_db)):
    lead = models.SalesLead(
        brand_name=payload.brand_name,
        category=payload.category,
        website=payload.website,
        source=payload.source,
        poc1_name=payload.poc1_name,
        poc1_email=payload.poc1_email,
        poc1_phone=payload.poc1_phone,
        poc1_designation=payload.poc1_designation,
        poc2_name=payload.poc2_name,
        poc2_email=payload.poc2_email,
        poc2_phone=payload.poc2_phone,
        poc2_designation=payload.poc2_designation,
        stage=payload.stage,
        priority=payload.priority,
        assigned_to=payload.assigned_to,
        next_followup=payload.next_followup,
        # This DB's sales_leads.created_at has no server default (SQLite quirk),
        # so set it explicitly - otherwise the insert hits a NOT NULL violation.
        created_at=datetime.now(),
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return _lead_out(lead)


@app.put("/api/sales/leads/{lead_id}")
def update_lead(lead_id: int, payload: LeadUpdate, db: Session = Depends(get_db)):
    lead = db.get(models.SalesLead, lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(lead, field, value)
    lead.updated_at = datetime.now()
    db.commit()
    db.refresh(lead)
    return _lead_out(lead)


@app.delete("/api/sales/leads/{lead_id}")
def delete_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = db.get(models.SalesLead, lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found")
    db.query(models.SalesActivity).filter(models.SalesActivity.lead_id == lead_id).delete()
    db.delete(lead)
    db.commit()
    return {"deleted": True}


@app.get("/api/sales/leads/{lead_id}/activities")
def list_activities(lead_id: int, db: Session = Depends(get_db)):
    lead = db.get(models.SalesLead, lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found")
    rows = (
        db.query(models.SalesActivity)
        .filter(models.SalesActivity.lead_id == lead_id)
        .order_by(models.SalesActivity.activity_date.desc())
        .all()
    )
    return [
        {
            "id": a.id,
            "lead_id": a.lead_id,
            "activity_type": a.activity_type,
            "activity_date": a.activity_date,
            "summary": a.summary,
            "outcome": a.outcome,
            "next_action": a.next_action,
            "logged_by": a.logged_by,
            "created_at": a.created_at,
        }
        for a in rows
    ]


@app.post("/api/sales/leads/{lead_id}/activities")
def create_activity(lead_id: int, payload: ActivityCreate, db: Session = Depends(get_db)):
    lead = db.get(models.SalesLead, lead_id)
    if not lead:
        raise HTTPException(404, "Lead not found")
    if payload.activity_type not in ACTIVITY_TYPES:
        raise HTTPException(422, f"Unknown activity type: {payload.activity_type}")
    activity = models.SalesActivity(
        lead_id=lead_id,
        activity_type=payload.activity_type,
        activity_date=payload.activity_date or datetime.now(),
        summary=payload.summary,
        outcome=payload.outcome,
        next_action=payload.next_action,
        logged_by=payload.logged_by,
        created_at=datetime.now(),
    )
    db.add(activity)
    lead.last_contact_date = activity.activity_date
    if payload.next_followup:
        lead.next_followup = payload.next_followup

    # Auto-advance the pipeline from the activity itself, so a lead you've
    # actually reached shows up under "Contacted" without a manual stage change.
    # This only ever moves a lead FORWARD - it never pulls one back.
    OUTREACH = {"call", "email_sent", "whatsapp", "meeting"}
    if payload.activity_type == "reply_received" and lead.stage in (
        "new_lead", "contacted", "no_response"
    ):
        # They wrote back - that's a response, wherever they were before.
        lead.stage = "responded"
    elif payload.activity_type in OUTREACH and lead.stage in ("new_lead", "no_response"):
        # First real outreach (or a fresh attempt after silence) = contacted.
        lead.stage = "contacted"

    lead.updated_at = datetime.now()
    db.commit()
    db.refresh(activity)
    return {
        "id": activity.id,
        "lead_id": activity.lead_id,
        "activity_type": activity.activity_type,
        "activity_date": activity.activity_date,
        "summary": activity.summary,
        "outcome": activity.outcome,
        "next_action": activity.next_action,
        "logged_by": activity.logged_by,
        "created_at": activity.created_at,
        "stage": lead.stage,
    }


@app.get("/api/sales/team")
def sales_team():
    return SALES_TEAM


@app.get("/api/sales/sources")
def sales_sources():
    return LEAD_SOURCES
