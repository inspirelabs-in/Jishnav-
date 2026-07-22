"""Tests for PUT /api/merchants/{id} -- updating merchant fields and audit logging."""
import json

import pytest


class TestMerchantUpdate:
    """Verify merchant updates write correct data and create MerchantEditLog entries."""

    def test_update_reporting_creates_edit_log(self, seeded_client):
        """Changing reporting creates a MerchantEditLog with the correct change."""
        resp = seeded_client.put("/api/merchants/9001", json={
            "reporting": "Weekly",
            "edited_by": "Swati",
        })
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert data["reporting"] == "Weekly", "Reporting should be updated to 'Weekly'"

        # Verify the edit log was created
        logs = seeded_client.get("/api/merchant-edit-logs").json()
        assert len(logs) >= 1, "At least one edit log should exist"
        latest = logs[0]
        assert latest["merchant_id"] == 9001
        assert latest["edited_by"] == "Swati"
        assert "reporting" in latest["changes"], "changes should include 'reporting'"
        assert latest["changes"]["reporting"]["old"] == "Live daily"
        assert latest["changes"]["reporting"]["new"] == "Weekly"

    def test_update_multiple_fields_at_once(self, seeded_client):
        """Changing multiple fields records all changes in a single edit log entry."""
        resp = seeded_client.put("/api/merchants/9002", json={
            "reporting": "Monthly",
            "payout": "10%",
            "deal_type": "Link based",
            "edited_by": "Yamini",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["reporting"] == "Monthly"
        assert data["payout"] == "10%"
        assert data["deal_type"] == "Link based"

        logs = seeded_client.get("/api/merchant-edit-logs").json()
        # Find the log for merchant 9002
        log_9002 = [l for l in logs if l["merchant_id"] == 9002]
        assert len(log_9002) >= 1, "Edit log for Flipkart should exist"
        changes = log_9002[0]["changes"]
        assert "reporting" in changes, "changes should include 'reporting'"
        assert "payout" in changes, "changes should include 'payout'"
        assert "deal_type" in changes, "changes should include 'deal_type'"

    def test_update_with_no_changes_creates_no_log(self, seeded_client):
        """Sending the same values as already stored creates no edit log entry."""
        # First, get the current reporting value
        merchants = seeded_client.get("/api/merchants").json()
        ajio = [m for m in merchants if m["merchant_id"] == 9001][0]
        current_reporting = ajio["reporting"]

        # Count existing logs
        logs_before = seeded_client.get("/api/merchant-edit-logs").json()
        count_before = len(logs_before)

        # Send an update with the same value
        resp = seeded_client.put("/api/merchants/9001", json={
            "reporting": current_reporting,
            "edited_by": "Swati",
        })
        assert resp.status_code == 200

        # Verify no new log was created
        logs_after = seeded_client.get("/api/merchant-edit-logs").json()
        assert len(logs_after) == count_before, (
            f"No new log should be created for no-op update; "
            f"had {count_before}, now {len(logs_after)}"
        )

    def test_update_nonexistent_merchant_returns_404(self, seeded_client):
        """Updating a merchant ID that does not exist returns 404."""
        resp = seeded_client.put("/api/merchants/99999", json={
            "reporting": "Daily",
            "edited_by": "Swati",
        })
        assert resp.status_code == 404, f"Expected 404, got {resp.status_code}"

    def test_changes_dict_has_correct_old_new_values(self, seeded_client):
        """The changes dict in the edit log accurately records old and new values."""
        # Update owner from Meena to Swati
        resp = seeded_client.put("/api/merchants/9003", json={
            "owner": "Swati",
            "edited_by": "Manager",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["owner"] == "Swati"

        logs = seeded_client.get("/api/merchant-edit-logs").json()
        log_9003 = [l for l in logs if l["merchant_id"] == 9003]
        assert len(log_9003) >= 1, "Edit log for Nykaa should exist"
        changes = log_9003[0]["changes"]
        assert "owner" in changes, "changes should include 'owner'"
        assert changes["owner"]["old"] == "Meena", (
            f"Old owner should be 'Meena', got '{changes['owner']['old']}'"
        )
        assert changes["owner"]["new"] == "Swati", (
            f"New owner should be 'Swati', got '{changes['owner']['new']}'"
        )
