"""Tests for PUT /api/entries/{id} -- editing existing entries."""
import json
import pytest
from tests.conftest import make_entry


@pytest.fixture()
def entry_id(seeded_client):
    """Create a single entry and return its id."""
    resp = make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                      month="07", year="2026", clicks=100, sales=10,
                      gmv=5000, revenue=500)
    return resp.json()["id"]


class TestEditEntry:
    """Editing fields and computed values."""

    def test_edit_clicks_sales_recomputes_cr(self, seeded_client, entry_id):
        """Editing clicks or sales recomputes CR."""
        resp = seeded_client.put(f"/api/entries/{entry_id}", json={
            "entry_date": "2026-07-01",
            "clicks": 200,
            "sales": 30,
            "gmv": 5000,
            "revenue": 500,
            "edited_by": "Swati",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["updated"] is True, "Entry should be marked as updated"
        expected_cr = round(30 / 200 * 100, 2)
        assert data["cr"] == expected_cr, (
            f"CR should be recomputed to {expected_cr}, got {data['cr']}"
        )

    def test_edit_creates_edit_log(self, seeded_client, entry_id):
        """An edit creates an EditLog entry with old and new values."""
        seeded_client.put(f"/api/entries/{entry_id}", json={
            "entry_date": "2026-07-01",
            "clicks": 250,
            "sales": 10,
            "gmv": 5000,
            "revenue": 500,
            "edited_by": "Swati",
        })
        logs = seeded_client.get("/api/edit-logs").json()
        assert len(logs) >= 1, "At least one edit log should exist"
        log = logs[0]
        assert log["entry_id"] == entry_id, "Edit log should reference the edited entry"
        changes = log["changes"]
        assert "clicks" in changes, "changes should record the clicks field"
        assert changes["clicks"]["old"] == 100, (
            f"Old clicks should be 100, got {changes['clicks']['old']}"
        )
        assert changes["clicks"]["new"] == 250, (
            f"New clicks should be 250, got {changes['clicks']['new']}"
        )

    def test_edit_entry_date_updates_month_and_year(self, seeded_client, entry_id):
        """Editing entry_date updates entry_month and entry_year."""
        seeded_client.put(f"/api/entries/{entry_id}", json={
            "entry_date": "2026-03-15",
            "clicks": 100,
            "sales": 10,
            "gmv": 5000,
            "revenue": 500,
            "edited_by": "Swati",
        })
        entries = seeded_client.get("/api/entries", params={"merchant": "Ajio"}).json()
        entry = entries[0]
        assert entry["entry_month"] == 3, (
            f"entry_month should update to 3, got {entry['entry_month']}"
        )
        assert entry["entry_year"] == 2026, (
            f"entry_year should remain 2026, got {entry['entry_year']}"
        )
        # Date should also be pinned to 1st
        assert entry["entry_date"] == "2026-03-01", (
            f"entry_date should be pinned to 1st, got {entry['entry_date']}"
        )

    def test_no_changes_returns_updated_false(self, seeded_client, entry_id):
        """Submitting the same values returns updated=False and creates no EditLog."""
        resp = seeded_client.put(f"/api/entries/{entry_id}", json={
            "entry_date": "2026-07-01",
            "clicks": 100,
            "sales": 10,
            "gmv": 5000,
            "revenue": 500,
            "edited_by": "Swati",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["updated"] is False, "No-change edit should return updated=False"
        logs = seeded_client.get("/api/edit-logs").json()
        assert len(logs) == 0, "No EditLog should be created for a no-op edit"

    def test_edit_nonexistent_entry_returns_404(self, seeded_client):
        """Editing a non-existent entry returns 404."""
        resp = seeded_client.put("/api/entries/99999", json={
            "entry_date": "2026-07-01",
            "clicks": 100,
            "sales": 10,
            "gmv": 5000,
            "revenue": 500,
            "edited_by": "Swati",
        })
        assert resp.status_code == 404, (
            f"Expected 404 for non-existent entry, got {resp.status_code}"
        )
