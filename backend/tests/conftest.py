"""Shared fixtures for all CR Portal tests.

Every test file gets a fresh in-memory SQLite database with seeded merchants.
The FastAPI TestClient talks to this isolated DB, so tests never touch the
real cr_portal.db and can run in any order without side effects.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, get_db
from app.main import app
from app.models import Merchant
from app.utils import merchant_url


# --------------- in-memory database engine shared across a test session ------

@pytest.fixture()
def db_engine():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    engine.dispose()


@pytest.fixture()
def db_session(db_engine):
    Session = sessionmaker(bind=db_engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture()
def client(db_engine):
    """FastAPI TestClient wired to the in-memory DB."""
    Session = sessionmaker(bind=db_engine)

    def _override():
        session = Session()
        try:
            yield session
        finally:
            session.close()

    app.dependency_overrides[get_db] = _override
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


# --------------- seed helpers -----------------------------------------------

SEED_MERCHANTS = [
    {"merchant_id": 9001, "merchant_name": "Ajio", "breadcrumb1": 1, "breadcrumb1_name": "Fashion",
     "breadcrumb2": 0, "affiliate_id": 0,
     "reporting": "Live daily", "payout": "5%", "deal_type": "Coupon and Link based",
     "revenue_status": "Revenue", "owner": "Swati"},
    {"merchant_id": 9002, "merchant_name": "Flipkart", "breadcrumb1": 2, "breadcrumb1_name": "E-Commerce",
     "breadcrumb2": 0, "affiliate_id": 0,
     "reporting": "Live daily", "payout": "3%", "deal_type": "Coupon and Link based",
     "revenue_status": "Revenue", "owner": "Yamini"},
    {"merchant_id": 9003, "merchant_name": "Nykaa", "breadcrumb1": 3, "breadcrumb1_name": "Beauty and Personal Care",
     "breadcrumb2": 0, "affiliate_id": 0,
     "reporting": "2/week", "payout": "7%", "deal_type": "Coupon based",
     "revenue_status": "Revenue", "owner": "Meena"},
    {"merchant_id": 8001, "merchant_name": "Nike", "breadcrumb1": 1, "breadcrumb1_name": "Fashion",
     "breadcrumb2": 0, "affiliate_id": 0,
     "reporting": "Live daily", "payout": "6%", "deal_type": "Coupon and Link based",
     "revenue_status": "Revenue", "owner": "Swati"},
    {"merchant_id": 8006, "merchant_name": "MakeMyTrip", "breadcrumb1": 4, "breadcrumb1_name": "Travel",
     "breadcrumb2": 0, "affiliate_id": 0,
     "reporting": "Weekly", "payout": "2%", "deal_type": "Coupon and Link based",
     "revenue_status": "Revenue", "owner": "Meena"},
]


@pytest.fixture()
def seeded_db(db_session):
    """Populate the in-memory DB with a small set of test merchants."""
    for m in SEED_MERCHANTS:
        db_session.add(Merchant(
            merchant_id=m["merchant_id"],
            merchant_name=m["merchant_name"],
            breadcrumb1=m.get("breadcrumb1", 0),
            breadcrumb1_name=m.get("breadcrumb1_name"),
            breadcrumb2=m.get("breadcrumb2", 0),
            affiliate_id=m.get("affiliate_id", 0),
            reporting=m.get("reporting"),
            payout=m.get("payout"),
            deal_type=m.get("deal_type"),
            revenue_status=m.get("revenue_status", "Revenue"),
            owner=m.get("owner"),
            url=merchant_url(m["merchant_name"]),
        ))
    db_session.commit()
    return db_session


@pytest.fixture()
def seeded_client(seeded_db, client):
    """A TestClient with merchants already in the DB."""
    return client


def make_entry(client, merchant_id=9001, entered_by="Swati", month="07", year="2026",
               clicks=100, sales=10, gmv=5000, revenue=500, **extra):
    """Helper to create an entry via the API."""
    payload = {
        "merchant_id": merchant_id,
        "entry_date": f"{year}-{month}-01",
        "clicks": clicks,
        "sales": sales,
        "gmv": gmv,
        "revenue": revenue,
        "entered_by": entered_by,
        "revenue_status": "Revenue",
        **extra,
    }
    return client.post("/api/entries", json=payload)
