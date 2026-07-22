"""Tests for POST /api/entries — creating new entries."""
import pytest
from tests.conftest import make_entry


class TestEntryCreateBasic:
    """Happy-path creation and computed fields."""

    def test_create_revenue_entry_returns_id_and_cr(self, seeded_client):
        """Create a revenue entry with all fields; response contains id and computed CR."""
        resp = make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                          clicks=200, sales=14, gmv=7000, revenue=700)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "id" in data, "Response must contain entry id"
        assert "cr" in data, "Response must contain computed CR"

    def test_cr_is_sales_over_clicks_times_100_rounded(self, seeded_client):
        """CR = round(sales / clicks * 100, 2)."""
        resp = make_entry(seeded_client, clicks=300, sales=21)
        assert resp.status_code == 200
        expected_cr = round(21 / 300 * 100, 2)
        assert resp.json()["cr"] == expected_cr, (
            f"CR should be {expected_cr}, got {resp.json()['cr']}"
        )

    def test_entry_date_pinned_to_first_of_month(self, seeded_client):
        """Sending entry_date on the 15th should store it as the 1st."""
        payload = {
            "merchant_id": 9001,
            "entry_date": "2026-06-15",
            "clicks": 100, "sales": 10, "gmv": 5000, "revenue": 500,
            "entered_by": "Swati", "revenue_status": "Revenue",
        }
        resp = seeded_client.post("/api/entries", json=payload)
        assert resp.status_code == 200
        # Verify by fetching entries and checking the stored date
        entries = seeded_client.get("/api/entries", params={"merchant": "Ajio"}).json()
        stored_date = entries[0]["entry_date"]
        assert stored_date == "2026-06-01", (
            f"entry_date should be pinned to 1st, got {stored_date}"
        )

    def test_entry_month_and_year_derived_from_entry_date(self, seeded_client):
        """entry_month and entry_year are derived from the (normalised) entry_date."""
        payload = {
            "merchant_id": 9001,
            "entry_date": "2026-03-20",
            "clicks": 50, "sales": 5, "gmv": 2000, "revenue": 200,
            "entered_by": "Swati", "revenue_status": "Revenue",
        }
        resp = seeded_client.post("/api/entries", json=payload)
        assert resp.status_code == 200
        entries = seeded_client.get("/api/entries", params={"merchant": "Ajio"}).json()
        entry = entries[0]
        assert entry["entry_month"] == 3, f"entry_month should be 3, got {entry['entry_month']}"
        assert entry["entry_year"] == 2026, f"entry_year should be 2026, got {entry['entry_year']}"


class TestEntryCreateValidation:
    """Validation and error cases."""

    def test_missing_mandatory_fields_returns_422(self, seeded_client):
        """Revenue entry without clicks/sales/gmv/revenue returns 422."""
        payload = {
            "merchant_id": 9001,
            "entry_date": "2026-07-01",
            "entered_by": "Swati",
            "revenue_status": "Revenue",
            # clicks, sales, gmv, revenue all omitted
        }
        resp = seeded_client.post("/api/entries", json=payload)
        assert resp.status_code == 422, (
            f"Expected 422 for missing mandatory fields, got {resp.status_code}"
        )

    def test_non_revenue_entry_allows_null_metrics(self, seeded_client):
        """Non-revenue entry can have null clicks/sales/gmv/revenue."""
        payload = {
            "merchant_id": 9001,
            "entry_date": "2026-07-01",
            "entered_by": "Swati",
            "revenue_status": "Non-revenue",
        }
        resp = seeded_client.post("/api/entries", json=payload)
        assert resp.status_code == 200, (
            f"Non-revenue entry should succeed without metrics, got {resp.status_code}: {resp.text}"
        )

    def test_nonexistent_merchant_returns_404(self, seeded_client):
        """Posting an entry for a merchant_id that does not exist returns 404."""
        resp = make_entry(seeded_client, merchant_id=99999, entered_by="Swati")
        assert resp.status_code == 404, (
            f"Expected 404 for non-existent merchant, got {resp.status_code}"
        )

    def test_delivery_requested_flag_stored(self, seeded_client):
        """delivery_requested=True is persisted on the entry."""
        resp = make_entry(seeded_client, delivery_requested=True)
        assert resp.status_code == 200
        entries = seeded_client.get("/api/entries", params={"merchant": "Ajio"}).json()
        assert entries[0]["delivery_requested"] is True, (
            "delivery_requested flag should be True"
        )
