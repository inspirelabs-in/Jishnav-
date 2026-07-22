"""Tests for DELETE /api/entries/{id} -- deleting entries."""
import pytest
from tests.conftest import make_entry


@pytest.fixture()
def entry_with_edit_log(seeded_client):
    """Create an entry, edit it (to produce an EditLog), and return the entry id."""
    resp = make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                      month="07", year="2026", clicks=100, sales=10,
                      gmv=5000, revenue=500)
    entry_id = resp.json()["id"]
    # Edit to create an EditLog
    seeded_client.put(f"/api/entries/{entry_id}", json={
        "entry_date": "2026-07-01",
        "clicks": 200,
        "sales": 10,
        "gmv": 5000,
        "revenue": 500,
        "edited_by": "Swati",
    })
    return entry_id


class TestDeleteEntry:
    """Deletion access control and cleanup."""

    def test_delete_own_entry_succeeds(self, seeded_client):
        """A handler can delete an entry they created."""
        resp = make_entry(seeded_client, merchant_id=9001, entered_by="Swati")
        entry_id = resp.json()["id"]
        del_resp = seeded_client.delete(
            f"/api/entries/{entry_id}", params={"entered_by": "Swati"}
        )
        assert del_resp.status_code == 200, (
            f"Expected 200 for deleting own entry, got {del_resp.status_code}"
        )
        assert del_resp.json()["deleted"] is True, "Response should confirm deletion"

    def test_delete_another_handlers_entry_returns_403(self, seeded_client):
        """A handler cannot delete another handler's entry."""
        resp = make_entry(seeded_client, merchant_id=9001, entered_by="Swati")
        entry_id = resp.json()["id"]
        del_resp = seeded_client.delete(
            f"/api/entries/{entry_id}", params={"entered_by": "Yamini"}
        )
        assert del_resp.status_code == 403, (
            f"Expected 403 when deleting another handler's entry, got {del_resp.status_code}"
        )

    def test_delete_nonexistent_entry_returns_404(self, seeded_client):
        """Deleting a non-existent entry returns 404."""
        del_resp = seeded_client.delete(
            "/api/entries/99999", params={"entered_by": "Swati"}
        )
        assert del_resp.status_code == 404, (
            f"Expected 404 for non-existent entry, got {del_resp.status_code}"
        )

    def test_delete_also_removes_edit_logs(self, seeded_client, entry_with_edit_log):
        """Deleting an entry also removes its associated edit logs."""
        entry_id = entry_with_edit_log
        # Confirm edit log exists before delete
        logs_before = seeded_client.get("/api/edit-logs").json()
        matching = [l for l in logs_before if l["entry_id"] == entry_id]
        assert len(matching) >= 1, "Edit log should exist before delete"
        # Delete the entry
        seeded_client.delete(
            f"/api/entries/{entry_id}", params={"entered_by": "Swati"}
        )
        # Confirm edit logs are gone
        logs_after = seeded_client.get("/api/edit-logs").json()
        matching_after = [l for l in logs_after if l["entry_id"] == entry_id]
        assert len(matching_after) == 0, (
            "Edit logs should be removed when the entry is deleted"
        )

    def test_entry_count_decreases_after_delete(self, seeded_client):
        """The total entry count decreases by one after a successful delete."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="05", clicks=100, sales=10, gmv=5000, revenue=500)
        resp2 = make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                           month="06", clicks=200, sales=20, gmv=10000, revenue=1000)
        entry_id = resp2.json()["id"]
        count_before = len(seeded_client.get("/api/entries").json())
        seeded_client.delete(
            f"/api/entries/{entry_id}", params={"entered_by": "Swati"}
        )
        count_after = len(seeded_client.get("/api/entries").json())
        assert count_after == count_before - 1, (
            f"Entry count should decrease by 1: was {count_before}, now {count_after}"
        )
