"""Tests for GET /api/merchants -- listing and filtering merchants."""
import pytest

from tests.conftest import make_entry


class TestListMerchants:
    """Verify the merchant listing endpoint returns correct data and filters."""

    def test_list_all_merchants_returns_correct_count(self, seeded_client):
        """GET /api/merchants with no filters returns all 5 seeded merchants."""
        resp = seeded_client.get("/api/merchants")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 5, f"Expected 5 merchants, got {len(data)}"

    def test_filter_by_owner_returns_only_that_owners_brands(self, seeded_client):
        """Filtering by owner=Swati returns only Ajio and Nike (both owned by Swati)."""
        resp = seeded_client.get("/api/merchants", params={"owner": "Swati"})
        assert resp.status_code == 200
        data = resp.json()
        names = [m["merchant_name"] for m in data]
        assert len(data) == 2, f"Expected 2 merchants for Swati, got {len(data)}"
        assert "Ajio" in names, "Ajio should be in Swati's brands"
        assert "Nike" in names, "Nike should be in Swati's brands"

    def test_owner_all_returns_everything(self, seeded_client):
        """owner=All is treated the same as no filter -- returns all merchants."""
        resp = seeded_client.get("/api/merchants", params={"owner": "All"})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 5, f"Expected 5 merchants for owner=All, got {len(data)}"

    def test_nonexistent_owner_returns_empty_list(self, seeded_client):
        """Filtering by an owner that has no merchants returns an empty list."""
        resp = seeded_client.get("/api/merchants", params={"owner": "NoSuchPerson"})
        assert resp.status_code == 200
        data = resp.json()
        assert data == [], f"Expected empty list for non-existent owner, got {data}"

    def test_merchants_sorted_alphabetically(self, seeded_client):
        """Merchants are returned sorted by name alphabetically."""
        resp = seeded_client.get("/api/merchants")
        data = resp.json()
        names = [m["merchant_name"] for m in data]
        assert names == sorted(names), "Merchants should be sorted alphabetically by name"

    def test_merchant_fields_present(self, seeded_client):
        """Each merchant in the response has all expected fields."""
        resp = seeded_client.get("/api/merchants")
        data = resp.json()
        required_fields = {
            "merchant_id", "merchant_name", "breadcrumb1", "breadcrumb1_name",
            "breadcrumb2", "breadcrumb2_name", "affiliate_id", "affiliate_name",
            "url", "reporting", "payout", "deal_type", "revenue_status", "owner",
        }
        for m in data:
            missing = required_fields - set(m.keys())
            assert not missing, f"Merchant {m.get('merchant_name')} missing fields: {missing}"
