"""Tests for POST /api/entries/{id}/delivery — Delivery team data fill flow.

Verifies that the delivery team can fill in d_clicks, d_sales, d_cr, d_gmv,
d_revenue on entries that were flagged with delivery_requested=True.
"""
import pytest
from tests.conftest import make_entry


class TestDeliveryFill:
    """POST /api/entries/{id}/delivery fills delivery-team fields."""

    def test_fill_sets_all_delivery_fields(self, seeded_client):
        """Filling delivery data sets d_clicks, d_sales, d_cr, d_gmv, d_revenue."""
        r = make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                       delivery_requested=True)
        assert r.status_code == 200, f"Entry creation failed: {r.text}"
        entry_id = r.json()["id"]

        fill = seeded_client.post(f"/api/entries/{entry_id}/delivery", json={
            "clicks": 200, "sales": 20, "gmv": 10000, "revenue": 1000,
            "filled_by": "Delivery",
        })
        assert fill.status_code == 200, f"Delivery fill failed: {fill.text}"

        # Verify via the entries list
        entries = seeded_client.get("/api/entries", params={"merchant": "Ajio"}).json()
        entry = next(e for e in entries if e["id"] == entry_id)
        assert entry["d_clicks"] == 200, "d_clicks not set correctly"
        assert entry["d_sales"] == 20, "d_sales not set correctly"
        assert entry["d_gmv"] == 10000, "d_gmv not set correctly"
        assert entry["d_revenue"] == 1000, "d_revenue not set correctly"

    def test_fill_computes_d_cr(self, seeded_client):
        """d_cr is auto-computed as (d_sales / d_clicks * 100)."""
        r = make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                       delivery_requested=True)
        entry_id = r.json()["id"]

        fill = seeded_client.post(f"/api/entries/{entry_id}/delivery", json={
            "clicks": 400, "sales": 20, "gmv": 5000, "revenue": 500,
            "filled_by": "Delivery",
        })
        assert fill.status_code == 200
        d_cr = fill.json()["d_cr"]
        expected_cr = round(20 / 400 * 100, 2)
        assert d_cr == expected_cr, f"Expected d_cr={expected_cr}, got {d_cr}"

    def test_fill_rejects_non_delivery_requested_entry(self, seeded_client):
        """Filling delivery data on an entry without delivery_requested=True returns 422."""
        r = make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                       delivery_requested=False)
        entry_id = r.json()["id"]

        fill = seeded_client.post(f"/api/entries/{entry_id}/delivery", json={
            "clicks": 100, "sales": 10, "gmv": 5000, "revenue": 500,
            "filled_by": "Delivery",
        })
        assert fill.status_code == 422, "Should reject fill on non-delivery-requested entry"

    def test_fill_nonexistent_entry_returns_404(self, seeded_client):
        """Filling delivery data on a non-existent entry returns 404."""
        fill = seeded_client.post("/api/entries/99999/delivery", json={
            "clicks": 100, "sales": 10, "gmv": 5000, "revenue": 500,
            "filled_by": "Delivery",
        })
        assert fill.status_code == 404, "Should return 404 for non-existent entry"

    def test_fill_sets_filled_by_and_filled_at(self, seeded_client):
        """delivery_filled_by and delivery_filled_at are set after fill."""
        r = make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                       delivery_requested=True)
        entry_id = r.json()["id"]

        seeded_client.post(f"/api/entries/{entry_id}/delivery", json={
            "clicks": 100, "sales": 10, "gmv": 5000, "revenue": 500,
            "filled_by": "Delivery",
        })

        entries = seeded_client.get("/api/entries", params={"merchant": "Ajio"}).json()
        entry = next(e for e in entries if e["id"] == entry_id)
        assert entry["delivery_filled_by"] == "Delivery", "delivery_filled_by not set"
        assert entry["delivery_filled_at"] is not None, "delivery_filled_at should be set"
