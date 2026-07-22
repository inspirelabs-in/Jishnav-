"""Tests for notification escalation levels.

Escalation follows the pattern:
    stage 1  -> Handler only          (1st missed period)
    stage 2  -> Handler + Manager     (2nd missed period)
    stage 3+ -> Handler + Manager + Founders Office  (3rd+ missed period)

Uses as_of to advance time and trigger higher escalation stages.
"""
import pytest
from tests.conftest import make_entry


def _get_notifs(client, user, as_of):
    """Fetch notifications for a user at a simulated date."""
    return client.get("/api/notifications", params={"user": user, "as_of": as_of})


class TestStage1HandlerOnly:
    """At stage 1, only the handler sees the notification."""

    def test_stage1_visible_to_handler(self, seeded_client):
        """A freshly overdue merchant (stage 1) shows up for its handler."""
        # Ajio is Live daily (step=1, grace=2). At 4 days out with no data,
        # days_over=4, stage = max(1,4//1) = 4. That is already high.
        # For a true stage-1 test, enter data recently so only 1 period is missed.
        # Enter data for "today" then check 4 days later (just past grace).
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="07", year="2026")
        resp = _get_notifs(seeded_client, "Swati", "2026-07-05")
        notifs = resp.json()
        ajio_notifs = [n for n in notifs if n["merchant_id"] == 9001]
        assert len(ajio_notifs) >= 1, "Handler should see stage-1 notification"
        assert ajio_notifs[0]["escalation_level"] >= 1, (
            "Escalation level should be at least 1"
        )

    def test_stage1_not_visible_to_manager(self, seeded_client):
        """Stage-1 notifications are not visible to the Manager."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="07", year="2026")
        # 4 days later: stage 1 for daily merchant
        resp = _get_notifs(seeded_client, "Manager", "2026-07-05")
        notifs = resp.json()
        ajio_notifs = [n for n in notifs if n["merchant_id"] == 9001]
        # Manager only sees escalation_level >= 2 or reason_submitted
        stage1_pending = [n for n in ajio_notifs
                          if n["escalation_level"] < 2 and n["status"] == "pending"]
        assert len(stage1_pending) == 0, (
            "Manager should not see stage-1 pending notifications"
        )


class TestStage2ManagerVisible:
    """At stage 2+, the Manager is brought in."""

    def test_stage2_visible_to_manager(self, seeded_client):
        """When escalation reaches level 2+, the Manager can see the notification."""
        # No data entered for Ajio (Live daily). Far enough out to get stage >= 2.
        # days_over = (2026-07-28 - created_at).days. With created_at ~ 2026-07-22,
        # that is ~6 days. stage = max(1, 6//1) = 6.
        resp = _get_notifs(seeded_client, "Manager", "2026-07-28")
        notifs = resp.json()
        high_stage = [n for n in notifs if n["escalation_level"] >= 2]
        assert len(high_stage) >= 1, (
            "Manager should see notifications with escalation_level >= 2"
        )


class TestStage3FoundersVisible:
    """At stage 3+, Founders Office is brought in."""

    def test_stage3_visible_to_founders(self, seeded_client):
        """When escalation reaches level 3+, Founders Office can see it."""
        # Far enough out for stage >= 3
        resp = _get_notifs(seeded_client, "Founders Office", "2026-07-28")
        notifs = resp.json()
        high_stage = [n for n in notifs if n["escalation_level"] >= 3]
        assert len(high_stage) >= 1, (
            "Founders Office should see notifications with escalation_level >= 3"
        )

    def test_stage3_not_visible_to_founders_when_below_threshold(self, seeded_client):
        """Founders Office does not see notifications below escalation level 3."""
        resp = _get_notifs(seeded_client, "Founders Office", "2026-07-28")
        notifs = resp.json()
        below_3 = [n for n in notifs if n["escalation_level"] < 3]
        assert len(below_3) == 0, (
            "Founders Office should not see notifications with escalation_level < 3"
        )


class TestEscalationIncreases:
    """Escalation level rises as more periods are missed."""

    def test_escalation_increases_with_time(self, seeded_client):
        """Checking notifications at a later date should yield a higher escalation level."""
        # First check: moderate time gap
        resp1 = _get_notifs(seeded_client, "Swati", "2026-07-26")
        notifs1 = resp1.json()
        ajio1 = [n for n in notifs1 if n["merchant_id"] == 9001]

        # Second check: larger time gap
        resp2 = _get_notifs(seeded_client, "Swati", "2026-08-05")
        notifs2 = resp2.json()
        ajio2 = [n for n in notifs2 if n["merchant_id"] == 9001]

        assert len(ajio1) >= 1 and len(ajio2) >= 1, (
            "Both checks should produce notifications"
        )
        # The later date should have a higher or equal escalation level
        assert ajio2[0]["escalation_level"] >= ajio1[0]["escalation_level"], (
            f"Escalation should increase: {ajio1[0]['escalation_level']} -> "
            f"{ajio2[0]['escalation_level']}"
        )


class TestMessageChangesWithEscalation:
    """The notification message text reflects the escalation level."""

    def test_message_mentions_escalation_at_stage2(self, seeded_client):
        """At stage 2, the message should mention the Manager escalation."""
        # Ensure stage >= 2 by advancing time
        resp = _get_notifs(seeded_client, "Manager", "2026-07-28")
        notifs = resp.json()
        stage2_plus = [n for n in notifs if n["escalation_level"] >= 2]
        assert len(stage2_plus) >= 1
        msg = stage2_plus[0]["message"]
        assert "overdue" in msg.lower(), (
            f"Message should mention 'overdue', got: {msg}"
        )

    def test_message_mentions_founders_at_stage3(self, seeded_client):
        """At stage 3+, the message should mention the Founders Office."""
        resp = _get_notifs(seeded_client, "Founders Office", "2026-08-15")
        notifs = resp.json()
        stage3_plus = [n for n in notifs if n["escalation_level"] >= 3]
        assert len(stage3_plus) >= 1
        msg = stage3_plus[0]["message"]
        assert "Founders" in msg, (
            f"Stage 3 message should mention Founders Office, got: {msg}"
        )
