"""Tests for POST /api/merchants -- creating new merchants."""
import pytest


class TestMerchantCreate:
    """Verify merchant creation, duplicate handling, auto-ID generation, and URL derivation."""

    def _new_merchant(self, **overrides):
        """Build a valid merchant payload, with optional overrides."""
        base = {
            "merchant_name": "TestBrand",
            "reporting": "Weekly",
            "payout": "4%",
            "deal_type": "Coupon based",
            "revenue_status": "Revenue",
            "owner": "Swati",
        }
        base.update(overrides)
        return base

    def test_create_with_all_fields_succeeds(self, seeded_client):
        """Creating a merchant with all required fields returns 200 and correct data."""
        payload = self._new_merchant(merchant_name="Myntra")
        resp = seeded_client.post("/api/merchants", json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["merchant_name"] == "Myntra"
        assert data["reporting"] == "Weekly"
        assert data["owner"] == "Swati"
        assert data["revenue_status"] == "Revenue"

    def test_create_with_auto_generated_id(self, seeded_client):
        """Omitting merchant_id auto-generates one (max existing + 1)."""
        payload = self._new_merchant(merchant_name="AutoIdBrand")
        resp = seeded_client.post("/api/merchants", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["merchant_id"] is not None, "Auto-generated ID should not be None"
        assert isinstance(data["merchant_id"], int), "merchant_id should be an integer"
        # With seeded data max ID is 9003, so auto-generated should be > 9003
        assert data["merchant_id"] > 9003, (
            f"Auto ID should be greater than max seed ID (9003), got {data['merchant_id']}"
        )

    def test_create_with_explicit_merchant_id(self, seeded_client):
        """Providing an explicit merchant_id uses that exact value."""
        payload = self._new_merchant(merchant_name="ExplicitIdBrand", merchant_id=7777)
        resp = seeded_client.post("/api/merchants", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["merchant_id"] == 7777, f"Expected merchant_id=7777, got {data['merchant_id']}"

    def test_duplicate_name_returns_409(self, seeded_client):
        """Creating a merchant with an already-existing name returns 409 Conflict."""
        payload = self._new_merchant(merchant_name="Ajio")
        resp = seeded_client.post("/api/merchants", json=payload)
        assert resp.status_code == 409, f"Expected 409 for duplicate name, got {resp.status_code}"

    def test_duplicate_name_is_case_insensitive(self, seeded_client):
        """Duplicate name check is case-insensitive: 'ajio' conflicts with 'Ajio'."""
        payload = self._new_merchant(merchant_name="ajio")
        resp = seeded_client.post("/api/merchants", json=payload)
        assert resp.status_code == 409, (
            f"Expected 409 for case-insensitive duplicate, got {resp.status_code}"
        )

    def test_duplicate_merchant_id_returns_409(self, seeded_client):
        """Creating a merchant with an already-taken merchant_id returns 409."""
        payload = self._new_merchant(merchant_name="UniqueName", merchant_id=9001)
        resp = seeded_client.post("/api/merchants", json=payload)
        assert resp.status_code == 409, (
            f"Expected 409 for duplicate merchant_id, got {resp.status_code}"
        )

    def test_url_is_auto_generated_from_name(self, seeded_client):
        """The url field is automatically derived from the merchant name."""
        payload = self._new_merchant(merchant_name="Urban Ladder")
        resp = seeded_client.post("/api/merchants", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["url"] is not None, "URL should be auto-generated"
        assert "urbanladder" in data["url"], (
            f"URL should contain 'urbanladder' slug, got {data['url']}"
        )

    def test_name_is_stripped_of_whitespace(self, seeded_client):
        """Leading/trailing whitespace in merchant_name is stripped."""
        payload = self._new_merchant(merchant_name="  SpaceBrand  ")
        resp = seeded_client.post("/api/merchants", json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["merchant_name"] == "SpaceBrand", (
            f"Name should be stripped, got '{data['merchant_name']}'"
        )
