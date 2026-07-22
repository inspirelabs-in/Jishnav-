"""Tests for GET /api/analytics?mode=brand — single-brand analytics."""
import pytest
from tests.conftest import make_entry


class TestAnalyticsBrand:
    """Analytics in brand mode returns time-series data for a single merchant."""

    def test_single_brand_returns_one_series_item(self, seeded_client):
        """A query for one brand should produce exactly one series entry."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="06", year="2026", clicks=200, sales=20, gmv=10000, revenue=1000)

        resp = seeded_client.get("/api/analytics", params={
            "mode": "brand",
            "brands": "Ajio",
            "date_from": "2026-06-01",
            "date_to": "2026-06-30",
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert len(data["series"]) == 1, "Should have exactly one series for a single brand"
        assert data["series"][0]["name"] == "Ajio"

    def test_returns_correct_totals(self, seeded_client):
        """Totals should be the sum of clicks, sales, gmv, and revenue across entries."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="06", year="2026", clicks=100, sales=10, gmv=5000, revenue=500)
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="07", year="2026", clicks=200, sales=20, gmv=10000, revenue=1000)

        resp = seeded_client.get("/api/analytics", params={
            "mode": "brand",
            "brands": "Ajio",
            "date_from": "2026-06-01",
            "date_to": "2026-07-31",
        })
        data = resp.json()
        assert data["totals"]["clicks"] == 300, "Total clicks should be 300"
        assert data["totals"]["sales"] == 30, "Total sales should be 30"
        assert data["totals"]["gmv"] == 15000, "Total GMV should be 15000"
        assert data["totals"]["revenue"] == 1500, "Total revenue should be 1500"

    def test_date_range_filters_entries(self, seeded_client):
        """Entries outside the date range should be excluded from results."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="05", year="2026", clicks=100, sales=10, gmv=5000, revenue=500)
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="07", year="2026", clicks=200, sales=20, gmv=10000, revenue=1000)

        resp = seeded_client.get("/api/analytics", params={
            "mode": "brand",
            "brands": "Ajio",
            "date_from": "2026-07-01",
            "date_to": "2026-07-31",
        })
        data = resp.json()
        assert data["totals"]["clicks"] == 200, "Only July entry should be counted"
        assert data["totals"]["revenue"] == 1000, "Only July revenue should be counted"

    def test_no_brands_param_returns_422(self, seeded_client):
        """Omitting the brands parameter in brand mode should return 422."""
        resp = seeded_client.get("/api/analytics", params={
            "mode": "brand",
            "date_from": "2026-06-01",
            "date_to": "2026-06-30",
        })
        assert resp.status_code == 422, f"Expected 422 when brands is missing, got {resp.status_code}"

    def test_returns_prev_totals_for_delta(self, seeded_client):
        """When date_from and date_to are given, prev_totals should cover the preceding window.

        The analytics endpoint computes prev_totals over the same-length window
        immediately before the requested range.  For a range of June 1 to July 31
        (61 days), the previous window is approx April 1 to May 31, which captures
        an entry on May 1.
        """
        # Previous window entry (May)
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="05", year="2026", clicks=50, sales=5, gmv=2500, revenue=250)
        # Current window entries (June-July)
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="06", year="2026", clicks=100, sales=10, gmv=5000, revenue=500)
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="07", year="2026", clicks=100, sales=10, gmv=5000, revenue=500)

        resp = seeded_client.get("/api/analytics", params={
            "mode": "brand",
            "brands": "Ajio",
            "date_from": "2026-06-01",
            "date_to": "2026-07-31",
        })
        data = resp.json()
        assert data["prev_totals"] is not None, "prev_totals should be present when date range is given"
        assert data["prev_totals"]["clicks"] == 50, "Previous window clicks should be 50"
        assert data["prev_totals"]["revenue"] == 250, "Previous window revenue should be 250"
