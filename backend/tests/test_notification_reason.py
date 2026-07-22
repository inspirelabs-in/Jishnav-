"""Tests for the notification reason submit / approve / reject flow.

A handler submits a reason for overdue data. The Manager or Founders Office
can then approve (closes the case permanently) or reject (handler keeps the
reason box and escalation continues).
"""
import pytest
from tests.conftest import make_entry


def _get_notifs(client, user, as_of):
    return client.get("/api/notifications", params={"user": user, "as_of": as_of})


def _create_overdue_notification(client, as_of="2026-07-28"):
    """Trigger notification creation and return the first notification for Swati."""
    resp = _get_notifs(client, "Swati", as_of)
    notifs = resp.json()
    assert len(notifs) >= 1, "Expected at least one notification to test against"
    return notifs[0]


class TestSubmitReason:
    """POST /api/notifications/{id}/reason -- handler submits a reason."""

    def test_submit_reason_changes_status(self, seeded_client):
        """Submitting a reason changes status to 'reason_submitted'."""
        notif = _create_overdue_notification(seeded_client)
        resp = seeded_client.post(
            f"/api/notifications/{notif['id']}/reason",
            json={"reason": "Merchant delayed their reporting this month."},
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        assert resp.json()["status"] == "reason_submitted", (
            f"Status should be 'reason_submitted', got '{resp.json()['status']}'"
        )

    def test_submit_reason_on_nonexistent_returns_404(self, seeded_client):
        """Submitting a reason for a notification that does not exist returns 404."""
        resp = seeded_client.post(
            "/api/notifications/99999/reason",
            json={"reason": "Some reason"},
        )
        assert resp.status_code == 404, (
            f"Expected 404 for non-existent notification, got {resp.status_code}"
        )


class TestApproveReason:
    """POST /api/notifications/{id}/approve -- Manager/Founders approves."""

    def test_approve_changes_status(self, seeded_client):
        """Approving a submitted reason changes status to 'approved'."""
        notif = _create_overdue_notification(seeded_client)
        # First submit a reason
        seeded_client.post(
            f"/api/notifications/{notif['id']}/reason",
            json={"reason": "Affiliate network issue, data delayed."},
        )
        # Then approve it
        resp = seeded_client.post(f"/api/notifications/{notif['id']}/approve")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        assert resp.json()["status"] == "approved", (
            f"Status should be 'approved', got '{resp.json()['status']}'"
        )

    def test_approve_only_works_on_reason_submitted(self, seeded_client):
        """Approving a notification that is still 'pending' returns 422."""
        notif = _create_overdue_notification(seeded_client)
        # Try to approve without submitting a reason first
        resp = seeded_client.post(f"/api/notifications/{notif['id']}/approve")
        assert resp.status_code == 422, (
            f"Expected 422 when approving a pending notification, got {resp.status_code}"
        )

    def test_approve_nonexistent_returns_404(self, seeded_client):
        """Approving a non-existent notification returns 404."""
        resp = seeded_client.post("/api/notifications/99999/approve")
        assert resp.status_code == 404, (
            f"Expected 404, got {resp.status_code}"
        )


class TestRejectReason:
    """POST /api/notifications/{id}/reject -- Manager/Founders rejects."""

    def test_reject_changes_status(self, seeded_client):
        """Rejecting a submitted reason changes status to 'rejected'."""
        notif = _create_overdue_notification(seeded_client)
        seeded_client.post(
            f"/api/notifications/{notif['id']}/reason",
            json={"reason": "Merchant is on holiday."},
        )
        resp = seeded_client.post(f"/api/notifications/{notif['id']}/reject")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        assert resp.json()["status"] == "rejected", (
            f"Status should be 'rejected', got '{resp.json()['status']}'"
        )

    def test_reject_only_works_on_reason_submitted(self, seeded_client):
        """Rejecting a notification that is still 'pending' returns 422."""
        notif = _create_overdue_notification(seeded_client)
        resp = seeded_client.post(f"/api/notifications/{notif['id']}/reject")
        assert resp.status_code == 422, (
            f"Expected 422 when rejecting a pending notification, got {resp.status_code}"
        )

    def test_reject_nonexistent_returns_404(self, seeded_client):
        """Rejecting a non-existent notification returns 404."""
        resp = seeded_client.post("/api/notifications/99999/reject")
        assert resp.status_code == 404, (
            f"Expected 404, got {resp.status_code}"
        )


class TestApprovedNeverReopened:
    """Once approved, a notification stays closed permanently."""

    def test_approved_notification_stays_approved(self, seeded_client):
        """An approved notification is never re-created or re-opened by refresh."""
        notif = _create_overdue_notification(seeded_client)
        nid = notif["id"]
        # Submit reason and approve
        seeded_client.post(
            f"/api/notifications/{nid}/reason",
            json={"reason": "Merchant stopped operations."},
        )
        seeded_client.post(f"/api/notifications/{nid}/approve")
        # Fetch notifications again at an even later date -- the approved case
        # should remain approved, not be re-opened or duplicated.
        resp = _get_notifs(seeded_client, "Swati", "2026-08-15")
        notifs = resp.json()
        matching = [n for n in notifs if n["id"] == nid]
        # Approved notifications may or may not appear in the list (they are
        # closed), but if they do, they must still be approved.
        for n in matching:
            assert n["status"] == "approved", (
                f"Approved notification should stay approved, got '{n['status']}'"
            )
