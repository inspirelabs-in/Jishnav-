"""Tests for GET /api/edit-logs — entry edit audit trail.

Verifies that edit logs are created when entries are edited and that
all filters (edited_by, merchant, owner, date range) work correctly.
"""
from datetime import date, timedelta

from tests.conftest import make_entry


class TestEditLogs:
    """GET /api/edit-logs returns the audit trail of entry edits."""

    def _create_and_edit_entry(self, client, merchant_id=9001, entered_by="Swati",
                               edited_by="Swati", new_clicks=200):
        """Helper: create an entry then edit it, returning the entry id."""
        r = make_entry(client, merchant_id=merchant_id, entered_by=entered_by,
                       month="06", year="2026", clicks=100, sales=10, gmv=5000,
                       revenue=500)
        assert r.status_code == 200, f"Entry creation failed: {r.text}"
        entry_id = r.json()["id"]

        edit_r = client.put(f"/api/entries/{entry_id}", json={
            "entry_date": "2026-06-01",
            "clicks": new_clicks, "sales": 10, "gmv": 5000, "revenue": 500,
            "edited_by": edited_by,
        })
        assert edit_r.status_code == 200, f"Edit failed: {edit_r.text}"
        return entry_id

    def test_edit_logs_appear_after_edit(self, seeded_client):
        """An edit to an entry creates an edit log record."""
        self._create_and_edit_entry(seeded_client)

        r = seeded_client.get("/api/edit-logs")
        assert r.status_code == 200
        logs = r.json()
        assert len(logs) >= 1, "Should have at least one edit log"
        log = logs[0]
        assert "changes" in log, "Log should include changes"
        assert "edited_by" in log, "Log should include edited_by"
        assert "merchant_name" in log, "Log should include merchant_name"

    def test_filter_by_edited_by(self, seeded_client):
        """Filtering by edited_by returns only logs from that editor."""
        self._create_and_edit_entry(seeded_client, merchant_id=9001,
                                    entered_by="Swati", edited_by="Swati")
        # Yamini edits her own merchant
        self._create_and_edit_entry(seeded_client, merchant_id=9002,
                                    entered_by="Yamini", edited_by="Yamini")

        r = seeded_client.get("/api/edit-logs", params={"edited_by": "Swati"})
        logs = r.json()
        assert len(logs) >= 1, "Should have logs for Swati"
        assert all(l["edited_by"] == "Swati" for l in logs), \
            "All logs should be by Swati when filtered"

    def test_filter_by_merchant_name(self, seeded_client):
        """Filtering by merchant name narrows logs to that brand."""
        self._create_and_edit_entry(seeded_client, merchant_id=9001,
                                    entered_by="Swati", edited_by="Swati")

        r = seeded_client.get("/api/edit-logs", params={"merchant": "Ajio"})
        logs = r.json()
        assert len(logs) >= 1, "Should have logs for Ajio"
        assert all("Ajio" in l["merchant_name"] for l in logs), \
            "All logs should be for Ajio when filtered by merchant name"

    def test_filter_by_owner(self, seeded_client):
        """Filtering by owner scopes logs to merchants owned by that handler."""
        self._create_and_edit_entry(seeded_client, merchant_id=9001,
                                    entered_by="Swati", edited_by="Swati")
        self._create_and_edit_entry(seeded_client, merchant_id=9002,
                                    entered_by="Yamini", edited_by="Yamini")

        r = seeded_client.get("/api/edit-logs", params={"owner": "Swati"})
        logs = r.json()
        # Swati owns Ajio (9001) and Nike (8001), so only those should appear
        for log in logs:
            assert log["merchant_id"] in (9001, 8001), \
                f"Owner=Swati filter should only show Swati's merchants, got {log['merchant_id']}"

    def test_filter_by_date_range(self, seeded_client):
        """Filtering by date range narrows logs to edits within that window."""
        self._create_and_edit_entry(seeded_client)

        today = date.today()
        r = seeded_client.get("/api/edit-logs", params={
            "date_from": (today - timedelta(days=1)).isoformat(),
            "date_to": (today + timedelta(days=1)).isoformat(),
        })
        logs = r.json()
        assert len(logs) >= 1, "Should find logs within today's date range"

        # A date range in the far past should return nothing
        r2 = seeded_client.get("/api/edit-logs", params={
            "date_from": "2020-01-01",
            "date_to": "2020-01-02",
        })
        assert len(r2.json()) == 0, "No logs should exist in the year 2020"

    def test_logs_include_correct_changes_json(self, seeded_client):
        """Edit log changes JSON contains old and new values for modified fields."""
        self._create_and_edit_entry(seeded_client, new_clicks=999)

        r = seeded_client.get("/api/edit-logs")
        logs = r.json()
        assert len(logs) >= 1
        changes = logs[0]["changes"]
        assert "clicks" in changes, "Changes should include the 'clicks' field"
        assert changes["clicks"]["old"] == 100, "Old clicks should be 100"
        assert changes["clicks"]["new"] == 999, "New clicks should be 999"
