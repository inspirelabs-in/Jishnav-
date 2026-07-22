"""Tests for GET /api/analytics?mode=category_comparison — category-level analytics."""
from tests.conftest import make_entry


class TestAnalyticsCategoryComparison:
    """Analytics in category_comparison mode groups merchants by breadcrumb1_name."""

    def test_category_groups_merchants(self, seeded_client):
        """Entries for merchants in the same category should be aggregated together."""
        # Ajio (9001) and Nike (8001) are both in Fashion
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="06", year="2026", clicks=100, sales=10, gmv=5000, revenue=500)
        make_entry(seeded_client, merchant_id=8001, entered_by="Swati",
                   month="06", year="2026", clicks=150, sales=15, gmv=7500, revenue=750)

        resp = seeded_client.get("/api/analytics", params={
            "mode": "category_comparison",
            "categories": "Fashion",
            "date_from": "2026-06-01",
            "date_to": "2026-06-30",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["series"]) == 1, "Should have one series for Fashion"
        assert data["series"][0]["name"] == "Fashion"
        assert data["totals"]["clicks"] == 250, "Fashion total clicks = 100 + 150"
        assert data["totals"]["revenue"] == 1250, "Fashion total revenue = 500 + 750"

    def test_owner_filter_narrows_to_handler(self, seeded_client):
        """Owner filter should restrict results to that handler's brands within the category."""
        # Both Ajio (Swati) and Nike (Swati) are Fashion; add an entry for only Ajio
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="06", year="2026", clicks=100, sales=10, gmv=5000, revenue=500)
        make_entry(seeded_client, merchant_id=8001, entered_by="Swati",
                   month="06", year="2026", clicks=200, sales=20, gmv=10000, revenue=1000)

        # Filter to Swati -- both merchants are Swati's, so both should appear
        resp = seeded_client.get("/api/analytics", params={
            "mode": "category_comparison",
            "categories": "Fashion",
            "owner": "Swati",
            "date_from": "2026-06-01",
            "date_to": "2026-06-30",
        })
        data = resp.json()
        assert data["totals"]["clicks"] == 300, "Both Swati brands should be included"

        # Filter to Yamini -- no Fashion brands belong to Yamini
        resp2 = seeded_client.get("/api/analytics", params={
            "mode": "category_comparison",
            "categories": "Fashion",
            "owner": "Yamini",
            "date_from": "2026-06-01",
            "date_to": "2026-06-30",
        })
        data2 = resp2.json()
        assert data2["totals"]["clicks"] == 0, "Yamini owns no Fashion brands; clicks should be 0"

    def test_no_categories_param_returns_422(self, seeded_client):
        """Omitting the categories parameter in category mode should return 422."""
        resp = seeded_client.get("/api/analytics", params={
            "mode": "category_comparison",
            "date_from": "2026-06-01",
            "date_to": "2026-06-30",
        })
        assert resp.status_code == 422, f"Expected 422 when categories is missing, got {resp.status_code}"
