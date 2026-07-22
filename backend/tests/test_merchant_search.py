"""Tests for GET /api/merchants/search?q= -- merchant search endpoint."""
import pytest


class TestMerchantSearch:
    """Verify search behaviour: exact matching, partial matching, case and space
    insensitivity, and error handling."""

    def test_exact_name_returns_exact_match_true(self, seeded_client):
        """Searching the exact merchant name sets exact_match=True."""
        resp = seeded_client.get("/api/merchants/search", params={"q": "Flipkart"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["exact_match"] is True, "exact_match should be True for an exact name"
        assert len(data["results"]) == 1
        assert data["results"][0]["merchant_name"] == "Flipkart"

    def test_partial_name_returns_matches(self, seeded_client):
        """A partial query like 'Ny' matches 'Nykaa'."""
        resp = seeded_client.get("/api/merchants/search", params={"q": "Ny"})
        assert resp.status_code == 200
        data = resp.json()
        names = [r["merchant_name"] for r in data["results"]]
        assert "Nykaa" in names, "Partial search 'Ny' should match 'Nykaa'"

    def test_search_is_case_insensitive(self, seeded_client):
        """Searching 'flipkart' (lowercase) still finds 'Flipkart'."""
        resp = seeded_client.get("/api/merchants/search", params={"q": "flipkart"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["exact_match"] is True, "Case-insensitive exact match should still be True"
        assert len(data["results"]) >= 1
        assert data["results"][0]["merchant_name"] == "Flipkart"

    def test_search_ignores_spaces(self, seeded_client):
        """'make my trip' (with spaces) matches 'MakeMyTrip' (no spaces)."""
        resp = seeded_client.get("/api/merchants/search", params={"q": "make my trip"})
        assert resp.status_code == 200
        data = resp.json()
        names = [r["merchant_name"] for r in data["results"]]
        assert "MakeMyTrip" in names, "'make my trip' should match 'MakeMyTrip'"
        assert data["exact_match"] is True, "Space-normalized exact match should be True"

    def test_no_results_returns_empty_and_exact_match_false(self, seeded_client):
        """Searching a term that matches nothing returns an empty list and exact_match=False."""
        resp = seeded_client.get("/api/merchants/search", params={"q": "ZzzNonExistent"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["results"] == [], "No results expected for a non-existent query"
        assert data["exact_match"] is False, "exact_match should be False when nothing matches"

    def test_missing_q_parameter_returns_422(self, seeded_client):
        """Omitting the required q parameter triggers a 422 validation error."""
        resp = seeded_client.get("/api/merchants/search")
        assert resp.status_code == 422, f"Expected 422 for missing q, got {resp.status_code}"
