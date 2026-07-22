"""Tests for overdue notification creation.

Verifies that the notification system correctly detects when merchant data
is overdue and creates notification rows with the right fields. Uses the
`as_of` query parameter to simulate time advancement.
"""
import pytest
from tests.conftest import make_entry, SEED_MERCHANTS


def _get_notifs(client, user, as_of):
    """Fetch notifications for a user at a simulated date."""
    return client.get("/api/notifications", params={"user": user, "as_of": as_of})


class TestNoNotificationsWhenUpToDate:
    """When a merchant's data is current, no notifications should appear."""

    def test_no_notifications_when_data_is_fresh(self, seeded_client):
        """A handler with recent data for all merchants sees no notifications."""
        # Enter data for Ajio (owned by Swati, reporting=Live daily)
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="07", year="2026")
        # Check notifications as of the same day -- data is fresh
        resp = _get_notifs(seeded_client, "Swati", "2026-07-02")
        assert resp.status_code == 200
        notifs = resp.json()
        ajio_notifs = [n for n in notifs if n["merchant_id"] == 9001]
        assert len(ajio_notifs) == 0, (
            "No notifications expected when data is up to date"
        )


class TestNotificationCreatedWhenOverdue:
    """Notifications appear when data is past the reporting interval."""

    def test_notification_created_for_overdue_daily_merchant(self, seeded_client):
        """A 'Live daily' merchant with no data becomes overdue after step + grace days."""
        # All seeded merchants have no entries. Ajio is Live daily (step=1, grace=2).
        # With no data, days_over = (as_of - created_at).days. The merchant was
        # just created, so 5 days out should be well past the threshold.
        resp = _get_notifs(seeded_client, "Swati", "2026-07-28")
        assert resp.status_code == 200
        notifs = resp.json()
        ajio_notifs = [n for n in notifs if n["merchant_id"] == 9001]
        assert len(ajio_notifs) >= 1, (
            "Overdue daily merchant should generate at least one notification"
        )

    def test_notification_created_for_overdue_weekly_merchant(self, seeded_client):
        """A 'Weekly' merchant (step=7, grace=2) with no data is overdue after 9+ days."""
        # MakeMyTrip (8006) is Weekly, owned by Meena
        resp = _get_notifs(seeded_client, "Meena", "2026-08-05")
        assert resp.status_code == 200
        notifs = resp.json()
        mmt_notifs = [n for n in notifs if n["merchant_id"] == 8006]
        assert len(mmt_notifs) >= 1, (
            "Overdue weekly merchant should generate a notification"
        )


class TestNonRevenueNoNotifications:
    """Non-revenue merchants are never chased for data."""

    def test_non_revenue_merchant_generates_no_notification(self, seeded_client):
        """After marking a merchant Non-revenue, it should not generate notifications."""
        # Mark Ajio as Non-revenue by creating a non-revenue entry
        payload = {
            "merchant_id": 9001,
            "entry_date": "2026-07-01",
            "entered_by": "Swati",
            "revenue_status": "Non-revenue",
        }
        seeded_client.post("/api/entries", json=payload)
        # Even far in the future, no notification for Ajio
        resp = _get_notifs(seeded_client, "Swati", "2026-09-01")
        assert resp.status_code == 200
        notifs = resp.json()
        ajio_notifs = [n for n in notifs if n["merchant_id"] == 9001]
        assert len(ajio_notifs) == 0, (
            "Non-revenue merchants should never generate notifications"
        )


class TestNotificationFields:
    """Newly created notifications have the correct handler, name, and status."""

    def test_notification_has_correct_handler(self, seeded_client):
        """The notification's handler field matches the merchant's owner."""
        resp = _get_notifs(seeded_client, "Swati", "2026-07-28")
        notifs = resp.json()
        ajio_notifs = [n for n in notifs if n["merchant_id"] == 9001]
        assert len(ajio_notifs) >= 1, "Expected at least one notification for Ajio"
        assert ajio_notifs[0]["handler"] == "Swati", (
            f"Handler should be 'Swati', got '{ajio_notifs[0]['handler']}'"
        )

    def test_notification_has_correct_merchant_name(self, seeded_client):
        """The notification's merchant_name matches the merchant."""
        resp = _get_notifs(seeded_client, "Swati", "2026-07-28")
        notifs = resp.json()
        ajio_notifs = [n for n in notifs if n["merchant_id"] == 9001]
        assert len(ajio_notifs) >= 1
        assert ajio_notifs[0]["merchant_name"] == "Ajio", (
            f"merchant_name should be 'Ajio', got '{ajio_notifs[0]['merchant_name']}'"
        )

    def test_notification_status_is_pending(self, seeded_client):
        """A newly created notification has status='pending'."""
        resp = _get_notifs(seeded_client, "Swati", "2026-07-28")
        notifs = resp.json()
        ajio_notifs = [n for n in notifs if n["merchant_id"] == 9001]
        assert len(ajio_notifs) >= 1
        assert ajio_notifs[0]["status"] == "pending", (
            f"New notification status should be 'pending', got '{ajio_notifs[0]['status']}'"
        )


class TestNoDuplicateNotifications:
    """Each merchant-period combination should produce exactly one row."""

    def test_same_merchant_period_not_duplicated(self, seeded_client):
        """Fetching notifications twice for the same as_of does not create duplicates."""
        _get_notifs(seeded_client, "Swati", "2026-07-28")
        resp = _get_notifs(seeded_client, "Swati", "2026-07-28")
        notifs = resp.json()
        ajio_notifs = [n for n in notifs if n["merchant_id"] == 9001]
        # There should be exactly one notification per period for Ajio
        period_labels = [n["period_label"] for n in ajio_notifs]
        assert len(period_labels) == len(set(period_labels)), (
            f"Duplicate period labels found: {period_labels}"
        )
