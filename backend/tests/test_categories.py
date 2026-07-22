"""Tests for GET /api/categories — distinct category listing."""


class TestCategories:
    """The categories endpoint returns sorted, non-null breadcrumb1_name values."""

    def test_returns_distinct_categories_sorted(self, seeded_client):
        """Should return distinct breadcrumb1_name values in alphabetical order."""
        resp = seeded_client.get("/api/categories")
        assert resp.status_code == 200
        data = resp.json()
        # Seeded merchants have: Beauty and Personal Care, E-Commerce, Fashion, Travel
        assert data == sorted(data), "Categories should be sorted alphabetically"
        assert len(data) == len(set(data)), "Categories should be distinct"
        expected = ["Beauty and Personal Care", "E-Commerce", "Fashion", "Travel"]
        assert data == expected, f"Expected {expected}, got {data}"

    def test_no_null_categories(self, seeded_client):
        """None/null values should be excluded from the category list."""
        resp = seeded_client.get("/api/categories")
        data = resp.json()
        assert None not in data, "Null categories should not be in the list"
        assert "" not in data, "Empty string categories should not be in the list"
