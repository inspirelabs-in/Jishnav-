"""Tests for DELETE /api/entries/{id}/delivery — clearing delivery data.

Verifies that deleting delivery data clears all d_ fields, enforces
ownership, and handles missing entries.
"""
from tests.conftest import make_entry


class TestDeliveryDelete:
    """DELETE /api/entries/{id}/delivery clears delivery-team fields."""

    def test_delete_clears_all_d_fields(self, seeded_client):
        """Deleting delivery data nulls out d_clicks, d_sales, d_cr, d_gmv, d_revenue."""
        r = make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                       delivery_requested=True)
        entry_id = r.json()["id"]

        # Fill delivery data first
        seeded_client.post(f"/api/entries/{entry_id}/delivery", json={
            "clicks": 200, "sales": 20, "gmv": 10000, "revenue": 1000,
            "filled_by": "Delivery",
        })

        # Now delete it
        d = seeded_client.delete(f"/api/entries/{entry_id}/delivery",
                                 params={"filled_by": "Delivery"})
        assert d.status_code == 200, f"Delete failed: {d.text}"
        assert d.json()["deleted"] is True

        # Verify fields are cleared
        entries = seeded_client.get("/api/entries", params={"merchant": "Ajio"}).json()
        entry = next(e for e in entries if e["id"] == entry_id)
        assert entry["d_clicks"] is None, "d_clicks should be None after delete"
        assert entry["d_sales"] is None, "d_sales should be None after delete"
        assert entry["d_cr"] is None, "d_cr should be None after delete"
        assert entry["d_gmv"] is None, "d_gmv should be None after delete"
        assert entry["d_revenue"] is None, "d_revenue should be None after delete"
        assert entry["delivery_filled_by"] is None, "delivery_filled_by should be None"
        assert entry["delivery_filled_at"] is None, "delivery_filled_at should be None"

    def test_only_filler_can_delete(self, seeded_client):
        """Only the person who filled the delivery data can delete it (else 403)."""
        r = make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                       delivery_requested=True)
        entry_id = r.json()["id"]

        seeded_client.post(f"/api/entries/{entry_id}/delivery", json={
            "clicks": 200, "sales": 20, "gmv": 10000, "revenue": 1000,
            "filled_by": "Delivery",
        })

        # Try to delete as someone else
        d = seeded_client.delete(f"/api/entries/{entry_id}/delivery",
                                 params={"filled_by": "SomeoneElse"})
        assert d.status_code == 403, "Should reject delete by non-filler"

    def test_delete_nonexistent_entry_returns_404(self, seeded_client):
        """Deleting delivery data from a non-existent entry returns 404."""
        d = seeded_client.delete("/api/entries/99999/delivery",
                                 params={"filled_by": "Delivery"})
        assert d.status_code == 404, "Should return 404 for non-existent entry"
