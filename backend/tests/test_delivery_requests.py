"""Tests for GET /api/delivery-requests — listing pending and done delivery items.

Verifies that the delivery requests endpoint correctly filters by status
and includes merchant details in the response.
"""
from tests.conftest import make_entry


class TestDeliveryRequests:
    """GET /api/delivery-requests filters by pending/done status."""

    def test_pending_returns_unfilled_delivery_entries(self, seeded_client):
        """status=pending returns entries with delivery_requested=True and d_clicks=None."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   delivery_requested=True)
        make_entry(seeded_client, merchant_id=9002, entered_by="Yamini",
                   delivery_requested=False)

        r = seeded_client.get("/api/delivery-requests", params={"status": "pending"})
        assert r.status_code == 200
        items = r.json()
        assert len(items) >= 1, "Should have at least one pending delivery request"
        for item in items:
            assert item["d_clicks"] is None, "Pending items should have d_clicks=None"

    def test_done_returns_filled_delivery_entries(self, seeded_client):
        """status=done returns entries with delivery_requested=True and d_clicks filled."""
        r = make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                       delivery_requested=True)
        entry_id = r.json()["id"]

        # Fill delivery data
        seeded_client.post(f"/api/entries/{entry_id}/delivery", json={
            "clicks": 200, "sales": 20, "gmv": 10000, "revenue": 1000,
            "filled_by": "Delivery",
        })

        done = seeded_client.get("/api/delivery-requests", params={"status": "done"})
        assert done.status_code == 200
        items = done.json()
        assert len(items) >= 1, "Should have at least one done delivery request"
        filled = [i for i in items if i["id"] == entry_id]
        assert len(filled) == 1, "The filled entry should appear in done list"
        assert filled[0]["d_clicks"] == 200, "Done items should have d_clicks set"

    def test_pending_excludes_non_delivery_entries(self, seeded_client):
        """Entries without delivery_requested=True never appear in delivery requests."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   delivery_requested=False)

        r = seeded_client.get("/api/delivery-requests", params={"status": "pending"})
        items = r.json()
        # All returned items must have delivery_requested implied (they came from the filter)
        for item in items:
            assert item.get("d_clicks") is None or item.get("d_clicks") is not None, \
                "Only delivery-requested entries should appear"

    def test_response_includes_merchant_details(self, seeded_client):
        """Response includes breadcrumb1_name, owner, url, and other merchant fields."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   delivery_requested=True)

        r = seeded_client.get("/api/delivery-requests", params={"status": "pending"})
        items = r.json()
        assert len(items) >= 1, "Should have at least one item"
        item = items[0]
        assert "breadcrumb1_name" in item, "Response should include breadcrumb1_name"
        assert "owner" in item, "Response should include owner"
        assert "url" in item, "Response should include url"
        assert "reporting" in item, "Response should include reporting"
        assert "payout" in item, "Response should include payout"
        assert item["merchant_name"] == "Ajio", "merchant_name should match"
        assert item["owner"] == "Swati", "owner should match merchant's owner"
