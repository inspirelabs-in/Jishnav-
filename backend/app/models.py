from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Merchant(Base):
    __tablename__ = "merchants"

    merchant_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    merchant_name: Mapped[str] = mapped_column(String, unique=True, index=True)
    breadcrumb1: Mapped[int] = mapped_column(Integer, default=0)
    breadcrumb1_name: Mapped[str | None] = mapped_column(String, nullable=True)
    breadcrumb2: Mapped[int] = mapped_column(Integer, default=0)
    breadcrumb2_name: Mapped[str | None] = mapped_column(String, nullable=True)
    affiliate_id: Mapped[int] = mapped_column(Integer, default=0)
    affiliate_name: Mapped[str | None] = mapped_column(String, nullable=True)
    url: Mapped[str | None] = mapped_column(String, nullable=True)
    # Portal-managed fields
    reporting: Mapped[str | None] = mapped_column(String, nullable=True)
    payout: Mapped[str | None] = mapped_column(String, nullable=True)
    deal_type: Mapped[str | None] = mapped_column(String, nullable=True)
    revenue_status: Mapped[str] = mapped_column(String, default="Revenue")
    owner: Mapped[str | None] = mapped_column(String, nullable=True, index=True)

    entries: Mapped[list["Entry"]] = relationship(back_populates="merchant")


class Entry(Base):
    __tablename__ = "entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    merchant_id: Mapped[int] = mapped_column(ForeignKey("merchants.merchant_id"), index=True)
    # entry_date stays day-precise: notifications (daily/weekly cadence) and
    # analytics (day-level bucketing on short ranges) both need the exact day.
    # entry_month/entry_year are derived, stored columns kept in step with it
    # so the DB itself carries Month/Year as first-class fields for reporting.
    entry_date: Mapped[date] = mapped_column(Date, index=True)
    entry_month: Mapped[int] = mapped_column(Integer, index=True)
    entry_year: Mapped[int] = mapped_column(Integer, index=True)
    clicks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sales: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cr: Mapped[float | None] = mapped_column(Float, nullable=True)
    gmv: Mapped[float | None] = mapped_column(Float, nullable=True)
    revenue: Mapped[float | None] = mapped_column(Float, nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    revenue_status: Mapped[str] = mapped_column(String, default="Revenue")
    entered_by: Mapped[str] = mapped_column(String, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    # Delivery-team contribution, entered separately from the CS-team figures
    # above. Requested via a toggle on the entry form; filled in by the
    # Delivery team from their queue.
    delivery_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    d_clicks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    d_sales: Mapped[int | None] = mapped_column(Integer, nullable=True)
    d_cr: Mapped[float | None] = mapped_column(Float, nullable=True)
    d_gmv: Mapped[float | None] = mapped_column(Float, nullable=True)
    d_revenue: Mapped[float | None] = mapped_column(Float, nullable=True)
    delivery_filled_by: Mapped[str | None] = mapped_column(String, nullable=True)
    delivery_filled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    merchant: Mapped["Merchant"] = relationship(back_populates="entries")


class EditLog(Base):
    __tablename__ = "edit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entry_id: Mapped[int] = mapped_column(ForeignKey("entries.id"), index=True)
    merchant_id: Mapped[int] = mapped_column(Integer)
    merchant_name: Mapped[str] = mapped_column(String)
    edited_by: Mapped[str] = mapped_column(String)
    edited_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    # JSON string: {"clicks": {"old": 100, "new": 120}, ...}
    changes: Mapped[str] = mapped_column(Text)


class Transfer(Base):
    """Audit log of a merchant being reassigned from one handler to another."""
    __tablename__ = "transfers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    merchant_id: Mapped[int] = mapped_column(Integer, index=True)
    merchant_name: Mapped[str] = mapped_column(String)
    from_handler: Mapped[str | None] = mapped_column(String, nullable=True)
    to_handler: Mapped[str] = mapped_column(String)
    transferred_by: Mapped[str] = mapped_column(String)
    transferred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    merchant_id: Mapped[int] = mapped_column(ForeignKey("merchants.merchant_id"), index=True)
    merchant_name: Mapped[str] = mapped_column(String)
    user: Mapped[str] = mapped_column(String, index=True)  # handler who owes the data
    message: Mapped[str] = mapped_column(Text)
    period_label: Mapped[str] = mapped_column(String)  # e.g. "June 2026" / "week of Jul 07"
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # pending -> reason_submitted -> approved | rejected ; resolved = data entered
    status: Mapped[str] = mapped_column(String, default="pending", index=True)
    # 1 = handler only, 2 = + manager, 3+ = + founders office
    escalation_level: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
