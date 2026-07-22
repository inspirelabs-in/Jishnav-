"""Tests for entry creation permission rules.

Handlers can only enter data for brands they own.  Manager / Founders Office
(anyone not in the HANDLERS list) can enter for any brand.
"""
import pytest
from tests.conftest import make_entry


class TestHandlerPermissions:
    """Handler-level access control on POST /api/entries."""

    def test_handler_can_enter_for_own_brand(self, seeded_client):
        """A handler entering data for a brand they own succeeds."""
        # Ajio (9001) is owned by Swati
        resp = make_entry(seeded_client, merchant_id=9001, entered_by="Swati")
        assert resp.status_code == 200, (
            f"Handler should be able to enter for own brand, got {resp.status_code}: {resp.text}"
        )

    def test_handler_cannot_enter_for_another_handlers_brand(self, seeded_client):
        """A handler entering data for another handler's brand gets 403."""
        # Flipkart (9002) is owned by Yamini; Swati should be blocked
        resp = make_entry(seeded_client, merchant_id=9002, entered_by="Swati")
        assert resp.status_code == 403, (
            f"Handler should get 403 for another handler's brand, got {resp.status_code}"
        )

    def test_manager_can_enter_for_any_brand(self, seeded_client):
        """Manager (not in HANDLERS) can enter data for any brand."""
        resp = make_entry(seeded_client, merchant_id=9002, entered_by="Manager")
        assert resp.status_code == 200, (
            f"Manager should be allowed to enter for any brand, got {resp.status_code}: {resp.text}"
        )

    def test_founders_can_enter_for_any_brand(self, seeded_client):
        """Founders Office (not in HANDLERS) can enter data for any brand."""
        resp = make_entry(seeded_client, merchant_id=9003, entered_by="Founders Office")
        assert resp.status_code == 200, (
            f"Founders should be allowed to enter for any brand, got {resp.status_code}: {resp.text}"
        )


class TestRevenueStatusTransitions:
    """Non-revenue toggle guard and comeback logic."""

    def test_non_revenue_on_already_non_revenue_returns_409(self, seeded_client):
        """Submitting Non-revenue when the merchant is already Non-revenue returns 409."""
        # First: mark Ajio as Non-revenue
        resp1 = make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                           clicks=None, sales=None, gmv=None, revenue=None,
                           revenue_status="Non-revenue")
        assert resp1.status_code == 200, (
            f"First non-revenue entry should succeed, got {resp1.status_code}: {resp1.text}"
        )
        # Second: try Non-revenue again -- should be blocked
        resp2 = seeded_client.post("/api/entries", json={
            "merchant_id": 9001,
            "entry_date": "2026-08-01",
            "entered_by": "Swati",
            "revenue_status": "Non-revenue",
        })
        assert resp2.status_code == 409, (
            f"Duplicate non-revenue entry should return 409, got {resp2.status_code}"
        )

    def test_revenue_entry_after_non_revenue_succeeds_and_flips_status(self, seeded_client):
        """A Revenue entry on a Non-revenue merchant (comeback) succeeds and
        flips the merchant status back to Revenue."""
        # Mark Nykaa as Non-revenue first
        make_entry(seeded_client, merchant_id=9003, entered_by="Meena",
                   clicks=None, sales=None, gmv=None, revenue=None,
                   revenue_status="Non-revenue")
        # Now submit a Revenue entry (comeback)
        resp = make_entry(seeded_client, merchant_id=9003, entered_by="Meena",
                          month="08", clicks=150, sales=12, gmv=6000, revenue=600)
        assert resp.status_code == 200, (
            f"Comeback revenue entry should succeed, got {resp.status_code}: {resp.text}"
        )
        # Verify merchant status flipped back to Revenue
        merchants = seeded_client.get("/api/merchants", params={"owner": "Meena"}).json()
        nykaa = [m for m in merchants if m["merchant_name"] == "Nykaa"][0]
        assert nykaa["revenue_status"] == "Revenue", (
            f"Merchant status should flip back to Revenue, got {nykaa['revenue_status']}"
        )
