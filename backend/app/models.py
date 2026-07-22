from datetime import date, datetime

from sqlalchemy import (
    Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Merchant(Base):
    __tablename__ = "merchants"

    merchant_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    merchant_name: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    breadcrumb1: Mapped[int | None] = mapped_column(Integer, nullable=True)
    breadcrumb1_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    breadcrumb2: Mapped[int | None] = mapped_column(Integer, nullable=True)
    breadcrumb2_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    affiliate_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    affiliate_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    reporting: Mapped[str | None] = mapped_column(String(50), nullable=True)
    payout: Mapped[str | None] = mapped_column(String(100), nullable=True)
    deal_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    revenue_status: Mapped[str] = mapped_column(String(20), default="Revenue")
    owner: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, onupdate=func.now())

    entries: Mapped[list["Entry"]] = relationship(
        back_populates="merchant", cascade="all, delete-orphan", passive_deletes=True,
    )


class Entry(Base):
    __tablename__ = "entries"
    __table_args__ = (
        Index("ix_entry_merchant_date", "merchant_id", "entry_date"),
        Index("ix_entry_year_month", "entry_year", "entry_month"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    merchant_id: Mapped[int] = mapped_column(
        ForeignKey("merchants.merchant_id", ondelete="CASCADE"), index=True,
    )
    entry_date: Mapped[date] = mapped_column(Date, index=True)
    entry_month: Mapped[int] = mapped_column(Integer, index=True)
    entry_year: Mapped[int] = mapped_column(Integer, index=True)
    clicks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sales: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cr: Mapped[float | None] = mapped_column(Float, nullable=True)
    gmv: Mapped[float | None] = mapped_column(Float, nullable=True)
    revenue: Mapped[float | None] = mapped_column(Float, nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    revenue_status: Mapped[str] = mapped_column(String(20), default="Revenue")
    entered_by: Mapped[str] = mapped_column(String(100), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, onupdate=func.now())

    delivery_requested: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    d_clicks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    d_sales: Mapped[int | None] = mapped_column(Integer, nullable=True)
    d_cr: Mapped[float | None] = mapped_column(Float, nullable=True)
    d_gmv: Mapped[float | None] = mapped_column(Float, nullable=True)
    d_revenue: Mapped[float | None] = mapped_column(Float, nullable=True)
    delivery_filled_by: Mapped[str | None] = mapped_column(String(100), nullable=True)
    delivery_filled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    merchant: Mapped["Merchant"] = relationship(back_populates="entries")


class EditLog(Base):
    __tablename__ = "edit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entry_id: Mapped[int] = mapped_column(
        ForeignKey("entries.id", ondelete="CASCADE"), index=True,
    )
    merchant_id: Mapped[int] = mapped_column(
        ForeignKey("merchants.merchant_id", ondelete="CASCADE"), index=True,
    )
    merchant_name: Mapped[str] = mapped_column(String(255))
    edited_by: Mapped[str] = mapped_column(String(100), index=True)
    edited_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    changes: Mapped[str] = mapped_column(Text)


class MerchantEditLog(Base):
    """Audit log of changes to a merchant's own fields (category, reporting,
    payout, deal type, etc.)."""
    __tablename__ = "merchant_edit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    merchant_id: Mapped[int] = mapped_column(
        ForeignKey("merchants.merchant_id", ondelete="CASCADE"), index=True,
    )
    merchant_name: Mapped[str] = mapped_column(String(255))
    edited_by: Mapped[str] = mapped_column(String(100), index=True)
    edited_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
    changes: Mapped[str] = mapped_column(Text)


class Transfer(Base):
    """Audit log of a merchant being reassigned from one handler to another."""
    __tablename__ = "transfers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    merchant_id: Mapped[int] = mapped_column(
        ForeignKey("merchants.merchant_id", ondelete="CASCADE"), index=True,
    )
    merchant_name: Mapped[str] = mapped_column(String(255))
    from_handler: Mapped[str | None] = mapped_column(String(100), nullable=True)
    to_handler: Mapped[str] = mapped_column(String(100))
    transferred_by: Mapped[str] = mapped_column(String(100))
    transferred_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notif_merchant_period", "merchant_id", "period_label"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    merchant_id: Mapped[int] = mapped_column(
        ForeignKey("merchants.merchant_id", ondelete="CASCADE"), index=True,
    )
    merchant_name: Mapped[str] = mapped_column(String(255))
    handler: Mapped[str] = mapped_column(String(100), index=True)
    message: Mapped[str] = mapped_column(Text)
    period_label: Mapped[str] = mapped_column(String(100))
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    escalation_level: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


# -------------------------------------------------- sales pipeline ----

class SalesLead(Base):
    __tablename__ = "sales_leads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    brand_name: Mapped[str] = mapped_column(String(255), index=True)
    category: Mapped[str | None] = mapped_column(String(255), nullable=True)
    website: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source: Mapped[str | None] = mapped_column(String(255), nullable=True)

    poc1_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    poc1_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    poc1_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    poc1_designation: Mapped[str | None] = mapped_column(String(255), nullable=True)
    poc2_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    poc2_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    poc2_phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    poc2_designation: Mapped[str | None] = mapped_column(String(255), nullable=True)

    stage: Mapped[str] = mapped_column(String(30), default="new_lead", index=True)
    priority: Mapped[str] = mapped_column(String(20), default="warm")
    assigned_to: Mapped[str] = mapped_column(String(100), index=True)
    last_contact_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    next_followup: Mapped[date | None] = mapped_column(Date, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, onupdate=func.now())

    activities: Mapped[list["SalesActivity"]] = relationship(
        back_populates="lead", cascade="all, delete-orphan", passive_deletes=True,
        order_by="SalesActivity.activity_date.desc()",
    )


class SalesActivity(Base):
    __tablename__ = "sales_activities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("sales_leads.id", ondelete="CASCADE"), index=True,
    )
    activity_type: Mapped[str] = mapped_column(String(30))
    activity_date: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(255), nullable=True)
    next_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    logged_by: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    lead: Mapped["SalesLead"] = relationship(back_populates="activities")
