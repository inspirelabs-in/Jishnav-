"""Tests for GET /api/analytics?mode=brand_comparison — multi-brand analytics."""
from tests.conftest import make_entry


class TestAnalyticsBrandComparison:
    """Analytics in brand_comparison mode returns series data for multiple brands."""

    def test_multiple_brands_return_multiple_series(self, seeded_client):
        """Querying two brands should produce two series items."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="06", year="2026", clicks=100, sales=10, gmv=5000, revenue=500)
        make_entry(seeded_client, merchant_id=9002, entered_by="Yamini",
                   month="06", year="2026", clicks=200, sales=20, gmv=10000, revenue=1000)

        resp = seeded_client.get("/api/analytics", params={
            "mode": "brand_comparison",
            "brands": ["Ajio", "Flipkart"],
            "date_from": "2026-06-01",
            "date_to": "2026-06-30",
        })
        assert resp.status_code == 200
        data = resp.json()
        names = [s["name"] for s in data["series"]]
        assert "Ajio" in names, "Series should include Ajio"
        assert "Flipkart" in names, "Series should include Flipkart"
        assert len(data["series"]) == 2, "Should have exactly two series"

    def test_each_series_has_own_points(self, seeded_client):
        """Each brand's series should contain its own data points, not mixed."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="06", year="2026", clicks=100, sales=10, gmv=5000, revenue=500)
        make_entry(seeded_client, merchant_id=9002, entered_by="Yamini",
                   month="06", year="2026", clicks=300, sales=30, gmv=15000, revenue=1500)

        resp = seeded_client.get("/api/analytics", params={
            "mode": "brand_comparison",
            "brands": ["Ajio", "Flipkart"],
            "date_from": "2026-06-01",
            "date_to": "2026-06-30",
        })
        data = resp.json()
        by_name = {s["name"]: s for s in data["series"]}

        ajio_point = by_name["Ajio"]["points"][0]
        assert ajio_point["clicks"] == 100, "Ajio clicks should be 100"

        flipkart_point = by_name["Flipkart"]["points"][0]
        assert flipkart_point["clicks"] == 300, "Flipkart clicks should be 300"

    def test_totals_are_sum_across_all_brands(self, seeded_client):
        """Totals should aggregate across all queried brands."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="06", year="2026", clicks=100, sales=10, gmv=5000, revenue=500)
        make_entry(seeded_client, merchant_id=9002, entered_by="Yamini",
                   month="06", year="2026", clicks=200, sales=20, gmv=10000, revenue=1000)

        resp = seeded_client.get("/api/analytics", params={
            "mode": "brand_comparison",
            "brands": ["Ajio", "Flipkart"],
            "date_from": "2026-06-01",
            "date_to": "2026-06-30",
        })
        data = resp.json()
        assert data["totals"]["clicks"] == 300, "Total clicks should be sum of both brands"
        assert data["totals"]["sales"] == 30, "Total sales should be sum of both brands"
        assert data["totals"]["gmv"] == 15000, "Total GMV should be sum of both brands"
        assert data["totals"]["revenue"] == 1500, "Total revenue should be sum of both brands"
