"""Tests for GET /api/transfers — listing transfer history.

Verifies that transfer history is returned in reverse chronological order
and includes the expected fields.
"""
import time


class TestTransferList:
    """GET /api/transfers returns transfer audit trail."""

    def test_list_returns_transfers_ordered_by_date_desc(self, seeded_client):
        """Transfer history is ordered by transferred_at descending (newest first)."""
        # Create two transfers with a small gap
        seeded_client.post("/api/transfers", json={
            "merchant_id": 9001, "to_handler": "Yamini", "by": "Manager",
        })
        seeded_client.post("/api/transfers", json={
            "merchant_id": 9002, "to_handler": "Swati", "by": "Manager",
        })

        r = seeded_client.get("/api/transfers")
        assert r.status_code == 200
        transfers = r.json()
        assert len(transfers) >= 2, "Should have at least two transfer records"

        # Verify descending order by transferred_at
        dates = [t["transferred_at"] for t in transfers]
        assert dates == sorted(dates, reverse=True), \
            "Transfers should be ordered newest first"

    def test_transfer_history_includes_required_fields(self, seeded_client):
        """Each transfer record includes from_handler, to_handler, transferred_by."""
        seeded_client.post("/api/transfers", json={
            "merchant_id": 9001, "to_handler": "Meena", "by": "Manager",
        })

        r = seeded_client.get("/api/transfers")
        transfers = r.json()
        assert len(transfers) >= 1
        t = transfers[0]

        assert "from_handler" in t, "Transfer should include from_handler"
        assert "to_handler" in t, "Transfer should include to_handler"
        assert "transferred_by" in t, "Transfer should include transferred_by"
        assert "merchant_id" in t, "Transfer should include merchant_id"
        assert "merchant_name" in t, "Transfer should include merchant_name"
        assert "transferred_at" in t, "Transfer should include transferred_at"

        assert t["from_handler"] == "Swati"
        assert t["to_handler"] == "Meena"
        assert t["transferred_by"] == "Manager"
        assert t["merchant_name"] == "Ajio"

    def test_empty_transfer_list(self, seeded_client):
        """When no transfers have occurred, the list is empty."""
        r = seeded_client.get("/api/transfers")
        assert r.status_code == 200
        assert r.json() == [], "Should return empty list when no transfers exist"
