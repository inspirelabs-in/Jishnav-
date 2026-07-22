"""Tests for GET /api/entries -- listing and filtering entries."""
import pytest
from tests.conftest import make_entry


@pytest.fixture()
def populated_client(seeded_client):
    """Seed several entries across merchants, handlers, and months."""
    make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
               month="05", year="2026", clicks=100, sales=10, gmv=5000, revenue=500)
    make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
               month="06", year="2026", clicks=200, sales=20, gmv=10000, revenue=1000)
    make_entry(seeded_client, merchant_id=9002, entered_by="Yamini",
               month="05", year="2026", clicks=300, sales=30, gmv=15000, revenue=1500)
    make_entry(seeded_client, merchant_id=9003, entered_by="Meena",
               month="06", year="2026", clicks=400, sales=40, gmv=20000, revenue=2000)
    return seeded_client


class TestListEntries:
    """Basic listing and ordering."""

    def test_list_all_entries(self, populated_client):
        """GET /api/entries with no filters returns all entries."""
        resp = populated_client.get("/api/entries")
        assert resp.status_code == 200
        entries = resp.json()
        assert len(entries) == 4, f"Expected 4 entries, got {len(entries)}"

    def test_results_ordered_by_created_at_desc(self, populated_client):
        """Entries are returned newest-first (created_at desc)."""
        entries = populated_client.get("/api/entries").json()
        # The last entry inserted (Meena/Nykaa/June) should appear first
        assert entries[0]["merchant_name"] == "Nykaa", (
            f"Most recent entry should be first, got {entries[0]['merchant_name']}"
        )


class TestListFilters:
    """Query-parameter filters."""

    def test_filter_by_merchant_name_partial(self, populated_client):
        """Filtering by partial merchant name returns only matching entries."""
        resp = populated_client.get("/api/entries", params={"merchant": "Aji"})
        entries = resp.json()
        assert len(entries) == 2, f"Expected 2 Ajio entries, got {len(entries)}"
        for e in entries:
            assert "Ajio" in e["merchant_name"], (
                f"All results should match 'Aji', got {e['merchant_name']}"
            )

    def test_filter_by_handler(self, populated_client):
        """Filtering by handler returns only that handler's entries."""
        resp = populated_client.get("/api/entries", params={"handler": "Yamini"})
        entries = resp.json()
        assert len(entries) == 1, f"Expected 1 Yamini entry, got {len(entries)}"
        assert entries[0]["entered_by"] == "Yamini", (
            f"Expected entered_by=Yamini, got {entries[0]['entered_by']}"
        )

    def test_filter_by_date_range(self, populated_client):
        """Filtering by date_from and date_to narrows results."""
        resp = populated_client.get("/api/entries", params={
            "date_from": "2026-06-01", "date_to": "2026-06-30",
        })
        entries = resp.json()
        assert len(entries) == 2, f"Expected 2 June entries, got {len(entries)}"
        for e in entries:
            assert e["entry_month"] == 6, (
                f"All entries should be in month 6, got {e['entry_month']}"
            )


class TestComebackFlag:
    """is_comeback flag logic."""

    def test_is_comeback_true_for_revenue_after_non_revenue(self, seeded_client):
        """is_comeback is True for a Revenue entry following a Non-revenue entry."""
        # Step 1: Normal revenue entry
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="04", clicks=100, sales=10, gmv=5000, revenue=500)
        # Step 2: Non-revenue entry
        seeded_client.post("/api/entries", json={
            "merchant_id": 9001,
            "entry_date": "2026-05-01",
            "entered_by": "Swati",
            "revenue_status": "Non-revenue",
        })
        # Step 3: Revenue comeback
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="06", clicks=150, sales=15, gmv=7500, revenue=750)
        entries = seeded_client.get("/api/entries", params={"merchant": "Ajio"}).json()
        # The June entry (comeback) should have is_comeback=True
        comeback_entries = [e for e in entries if e["is_comeback"] is True]
        assert len(comeback_entries) == 1, (
            f"Expected exactly 1 comeback entry, got {len(comeback_entries)}"
        )
        assert comeback_entries[0]["entry_month"] == 6, (
            "The comeback entry should be the June (month 6) entry"
        )
