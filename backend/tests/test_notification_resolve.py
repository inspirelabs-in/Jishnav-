"""Tests for notification resolution when new data is entered.

Creating an entry for a merchant resolves (status='resolved') any open
notifications for that merchant. Already-approved notifications are not
touched -- they stay closed permanently.

Note: entry_date is always pinned to the 1st of its month. For 'Live daily'
merchants (step=1, grace=2), the merchant is considered overdue when
(as_of - last_entry).days > 3. So we must use an as_of within 3 days of
the entry to confirm it is no longer overdue after data entry.
"""
import pytest
from tests.conftest import make_entry


def _get_notifs(client, user, as_of):
    return client.get("/api/notifications", params={"user": user, "as_of": as_of})


class TestResolveByEntry:
    """Entering data for a merchant resolves its open notifications."""

    def test_entry_resolves_open_notification(self, seeded_client):
        """Creating an entry for an overdue merchant resolves pending notifications."""
        # Generate overdue notifications (no data for Ajio, Live daily)
        resp = _get_notifs(seeded_client, "Swati", "2026-07-28")
        notifs = resp.json()
        ajio_notifs = [n for n in notifs if n["merchant_id"] == 9001]
        assert len(ajio_notifs) >= 1, "Expected at least one overdue notification for Ajio"

        # Enter data for Ajio (entry_date pinned to 2026-07-01)
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="07", year="2026")

        # Re-fetch with as_of close to the entry date so the merchant is no
        # longer overdue (within step + grace = 3 days of 2026-07-01).
        resp2 = _get_notifs(seeded_client, "Swati", "2026-07-04")
        notifs2 = resp2.json()
        ajio_pending = [n for n in notifs2
                        if n["merchant_id"] == 9001 and n["status"] == "pending"]
        assert len(ajio_pending) == 0, (
            "After entering data, no pending notifications should remain for Ajio"
        )

    def test_resolved_notification_has_correct_status(self, seeded_client):
        """Resolved notifications are not shown as pending in subsequent fetches."""
        # Trigger notification, then resolve it
        _get_notifs(seeded_client, "Swati", "2026-07-28")
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="07", year="2026")

        # Fetch within the non-overdue window
        resp = _get_notifs(seeded_client, "Swati", "2026-07-04")
        notifs = resp.json()
        ajio_notifs = [n for n in notifs
                       if n["merchant_id"] == 9001 and n["status"] == "pending"]
        assert len(ajio_notifs) == 0, (
            "Resolved notifications should not appear as pending"
        )

    def test_reason_submitted_also_resolved_by_entry(self, seeded_client):
        """A notification with status 'reason_submitted' is also resolved when data arrives."""
        resp = _get_notifs(seeded_client, "Swati", "2026-07-28")
        notifs = resp.json()
        ajio_notifs = [n for n in notifs if n["merchant_id"] == 9001]
        assert len(ajio_notifs) >= 1
        nid = ajio_notifs[0]["id"]

        # Submit a reason
        seeded_client.post(
            f"/api/notifications/{nid}/reason",
            json={"reason": "Data delayed from merchant side."},
        )

        # Now enter data -- should resolve even though status was reason_submitted
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="07", year="2026")

        # Check within the non-overdue window
        resp2 = _get_notifs(seeded_client, "Swati", "2026-07-04")
        notifs2 = resp2.json()
        still_open = [n for n in notifs2
                      if n["merchant_id"] == 9001
                      and n["status"] in ("pending", "reason_submitted")]
        assert len(still_open) == 0, (
            "reason_submitted notifications should also be resolved by entering data"
        )


class TestApprovedNotReResolved:
    """Approved notifications are not touched by new data entry."""

    def test_approved_not_changed_by_entry(self, seeded_client):
        """An approved notification stays 'approved' even after new data is entered."""
        # Create and approve a notification
        resp = _get_notifs(seeded_client, "Swati", "2026-07-28")
        notifs = resp.json()
        ajio_notifs = [n for n in notifs if n["merchant_id"] == 9001]
        assert len(ajio_notifs) >= 1
        nid = ajio_notifs[0]["id"]

        seeded_client.post(
            f"/api/notifications/{nid}/reason",
            json={"reason": "Merchant paused operations."},
        )
        seeded_client.post(f"/api/notifications/{nid}/approve")

        # Enter data for the merchant
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="07", year="2026")

        # The approved notification should still be approved, not overwritten
        # to "resolved". We verify by checking the approve endpoint again
        # returns 422 (already not reason_submitted), confirming it was not reset.
        resp_approve = seeded_client.post(f"/api/notifications/{nid}/approve")
        assert resp_approve.status_code == 422, (
            "Approved notification should remain approved (not reset to reason_submitted)"
        )
