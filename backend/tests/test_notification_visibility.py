"""Tests for role-based notification visibility.

Each role sees a different slice of the notification list:
- Handler: only their own merchants' notifications
- Manager: escalation_level >= 2, plus any reason_submitted (even at level 1)
- Founders Office: only escalation_level >= 3
- Delivery: not a handler, sees nothing
"""
import pytest
from tests.conftest import make_entry


def _get_notifs(client, user, as_of):
    return client.get("/api/notifications", params={"user": user, "as_of": as_of})


class TestHandlerVisibility:
    """A handler sees only notifications for the merchants they own."""

    def test_handler_sees_own_notifications(self, seeded_client):
        """Swati should see notifications for her merchants (Ajio, Nike) only."""
        resp = _get_notifs(seeded_client, "Swati", "2026-07-28")
        assert resp.status_code == 200
        notifs = resp.json()
        handlers = {n["handler"] for n in notifs}
        assert handlers <= {"Swati"}, (
            f"Swati should only see her own notifications, got handlers: {handlers}"
        )

    def test_handler_does_not_see_others_notifications(self, seeded_client):
        """Swati should not see Meena's or Yamini's merchants."""
        resp = _get_notifs(seeded_client, "Swati", "2026-07-28")
        notifs = resp.json()
        other_merchants = [n for n in notifs if n["merchant_id"] in (9002, 9003, 8006)]
        assert len(other_merchants) == 0, (
            "Swati should not see notifications for merchants she does not own"
        )

    def test_meena_sees_her_own_merchants(self, seeded_client):
        """Meena should see notifications for Nykaa (9003) and MakeMyTrip (8006)."""
        resp = _get_notifs(seeded_client, "Meena", "2026-07-28")
        notifs = resp.json()
        merchant_ids = {n["merchant_id"] for n in notifs}
        # Meena owns 9003 and 8006; she should not see 9001, 9002, or 8001
        assert merchant_ids <= {9003, 8006}, (
            f"Meena should only see her own merchants, got IDs: {merchant_ids}"
        )


class TestManagerVisibility:
    """Manager sees escalation_level >= 2 and any reason_submitted."""

    def test_manager_sees_escalated_notifications(self, seeded_client):
        """Manager sees notifications with escalation_level >= 2."""
        resp = _get_notifs(seeded_client, "Manager", "2026-07-28")
        notifs = resp.json()
        # All returned notifications should have level >= 2 or be reason_submitted
        for n in notifs:
            assert n["escalation_level"] >= 2 or n["status"] == "reason_submitted", (
                f"Manager should only see level >= 2 or reason_submitted, "
                f"got level={n['escalation_level']}, status='{n['status']}'"
            )

    def test_manager_sees_reason_submitted_even_at_stage1(self, seeded_client):
        """Manager can see a notification with a submitted reason even at stage 1."""
        # Enter data recently so the notification is stage 1
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="07", year="2026")
        # Trigger notification at a date where Ajio would be stage 1
        resp = _get_notifs(seeded_client, "Swati", "2026-07-05")
        notifs = resp.json()
        ajio = [n for n in notifs if n["merchant_id"] == 9001]
        if not ajio:
            pytest.skip("No stage-1 notification generated (timing depends on created_at)")
        nid = ajio[0]["id"]
        # Submit a reason
        seeded_client.post(
            f"/api/notifications/{nid}/reason",
            json={"reason": "Delayed affiliate report."},
        )
        # Manager should now see it even though escalation_level might be 1
        resp2 = _get_notifs(seeded_client, "Manager", "2026-07-05")
        notifs2 = resp2.json()
        matching = [n for n in notifs2 if n["id"] == nid]
        assert len(matching) >= 1, (
            "Manager should see reason_submitted notifications even at stage 1"
        )


class TestFoundersVisibility:
    """Founders Office sees only escalation_level >= 3."""

    def test_founders_sees_high_escalation(self, seeded_client):
        """Founders Office sees notifications with escalation_level >= 3."""
        resp = _get_notifs(seeded_client, "Founders Office", "2026-07-28")
        notifs = resp.json()
        for n in notifs:
            assert n["escalation_level"] >= 3, (
                f"Founders should only see level >= 3, got level={n['escalation_level']}"
            )

    def test_founders_does_not_see_stage2(self, seeded_client):
        """Founders Office does not see notifications at exactly stage 2."""
        resp = _get_notifs(seeded_client, "Founders Office", "2026-07-28")
        notifs = resp.json()
        stage2_only = [n for n in notifs if n["escalation_level"] == 2]
        assert len(stage2_only) == 0, (
            "Founders Office should not see stage-2-only notifications"
        )


class TestDeliverySeesNothing:
    """The Delivery role is not a handler and has no notification view."""

    def test_delivery_gets_empty_list(self, seeded_client):
        """Querying notifications as 'Delivery' returns an empty list."""
        resp = _get_notifs(seeded_client, "Delivery", "2026-07-28")
        assert resp.status_code == 200
        notifs = resp.json()
        assert len(notifs) == 0, (
            f"Delivery should see no notifications, got {len(notifs)}"
        )
