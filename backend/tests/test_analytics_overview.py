"""Tests for GET /api/analytics/overview — portfolio-level analytics dashboard."""
from tests.conftest import make_entry


class TestAnalyticsOverview:
    """The overview endpoint returns monthly aggregates, totals, and per-brand breakdown."""

    def test_returns_aggregate_totals_and_breakdown(self, seeded_client):
        """Response should include aggregate, totals, and by_merchant keys."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="06", year="2026", clicks=100, sales=10, gmv=5000, revenue=500)

        resp = seeded_client.get("/api/analytics/overview", params={
            "date_from": "2026-06-01",
            "date_to": "2026-06-30",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "aggregate" in data, "Response should include 'aggregate'"
        assert "totals" in data, "Response should include 'totals'"
        assert "by_merchant" in data, "Response should include 'by_merchant'"
        assert data["totals"]["clicks"] == 100, "Total clicks should be 100"
        assert data["totals"]["revenue"] == 500, "Total revenue should be 500"

    def test_owner_filter_shows_only_handlers_portfolio(self, seeded_client):
        """Filtering by owner should restrict to that handler's brands."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="06", year="2026", clicks=100, sales=10, gmv=5000, revenue=500)
        make_entry(seeded_client, merchant_id=9002, entered_by="Yamini",
                   month="06", year="2026", clicks=200, sales=20, gmv=10000, revenue=1000)

        resp = seeded_client.get("/api/analytics/overview", params={
            "owner": "Swati",
            "date_from": "2026-06-01",
            "date_to": "2026-06-30",
        })
        data = resp.json()
        merchant_names = [m["merchant"] for m in data["by_merchant"]]
        assert "Ajio" in merchant_names, "Swati's brand Ajio should appear"
        assert "Flipkart" not in merchant_names, "Yamini's brand Flipkart should not appear"
        assert data["totals"]["clicks"] == 100, "Only Swati's clicks should be counted"

    def test_month_keys_are_correct(self, seeded_client):
        """The months list should contain the correct completed months for the range."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="05", year="2026", clicks=100, sales=10, gmv=5000, revenue=500)
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="06", year="2026", clicks=200, sales=20, gmv=10000, revenue=1000)

        resp = seeded_client.get("/api/analytics/overview", params={
            "date_from": "2026-05-01",
            "date_to": "2026-06-30",
        })
        data = resp.json()
        assert "2026-05" in data["months"], "Month keys should include 2026-05"
        assert "2026-06" in data["months"], "Month keys should include 2026-06"

    def test_prev_totals_covers_preceding_window(self, seeded_client):
        """prev_totals should aggregate entries from the window before the main range."""
        # Previous window: April-May
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="04", year="2026", clicks=50, sales=5, gmv=2500, revenue=250)
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="05", year="2026", clicks=60, sales=6, gmv=3000, revenue=300)
        # Current window: June-July
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="06", year="2026", clicks=100, sales=10, gmv=5000, revenue=500)
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="07", year="2026", clicks=200, sales=20, gmv=10000, revenue=1000)

        resp = seeded_client.get("/api/analytics/overview", params={
            "date_from": "2026-06-01",
            "date_to": "2026-07-31",
        })
        data = resp.json()
        assert data["prev_totals"] is not None, "prev_totals should be present"
        # Prev window spans April and May
        assert data["prev_totals"]["clicks"] == 110, "Prev clicks = 50 + 60"
        assert data["prev_totals"]["revenue"] == 550, "Prev revenue = 250 + 300"

    def test_cr_calculated_as_sales_over_clicks(self, seeded_client):
        """CR should be calculated as (sales / clicks) * 100."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="06", year="2026", clicks=200, sales=10, gmv=5000, revenue=500)

        resp = seeded_client.get("/api/analytics/overview", params={
            "date_from": "2026-06-01",
            "date_to": "2026-06-30",
        })
        data = resp.json()
        expected_cr = round(10 / 200 * 100, 2)
        assert data["totals"]["cr"] == expected_cr, (
            f"CR should be {expected_cr}, got {data['totals']['cr']}"
        )
