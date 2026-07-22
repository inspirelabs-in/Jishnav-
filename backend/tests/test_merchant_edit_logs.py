"""Tests for GET /api/merchant-edit-logs.

Merchant edit logs track changes to merchant metadata fields
(category, reporting, payout, deal_type, owner).
"""
import json


def test_editing_merchant_creates_log(seeded_client):
    """Updating a merchant field creates a merchant edit log entry."""
    seeded_client.put("/api/merchants/9001", json={
        "reporting": "Weekly",
        "edited_by": "Swati",
    })
    r = seeded_client.get("/api/merchant-edit-logs")
    assert r.status_code == 200
    logs = r.json()
    assert len(logs) >= 1
    log = logs[0]
    assert log["merchant_id"] == 9001
    assert log["merchant_name"] == "Ajio"
    assert log["edited_by"] == "Swati"


def test_log_includes_old_and_new_values(seeded_client):
    """The changes dict includes both old and new values for each changed field."""
    seeded_client.put("/api/merchants/9001", json={
        "payout": "10%",
        "edited_by": "Swati",
    })
    r = seeded_client.get("/api/merchant-edit-logs")
    logs = r.json()
    log = logs[0]
    changes = log["changes"]
    assert "payout" in changes
    assert changes["payout"]["old"] == "5%"
    assert changes["payout"]["new"] == "10%"


def test_filter_by_merchant_name(seeded_client):
    """Logs can be filtered by merchant name substring."""
    # Create logs for two different merchants
    seeded_client.put("/api/merchants/9001", json={
        "reporting": "Weekly",
        "edited_by": "Swati",
    })
    seeded_client.put("/api/merchants/9002", json={
        "reporting": "Monthly",
        "edited_by": "Yamini",
    })

    # Filter to only Ajio
    r = seeded_client.get("/api/merchant-edit-logs", params={"merchant": "Ajio"})
    assert r.status_code == 200
    logs = r.json()
    assert all(log["merchant_name"] == "Ajio" for log in logs)
    assert len(logs) == 1


def test_filter_by_owner(seeded_client):
    """Logs can be filtered by owner (scoped to the handler's merchants)."""
    seeded_client.put("/api/merchants/9001", json={
        "reporting": "Weekly",
        "edited_by": "Swati",
    })
    seeded_client.put("/api/merchants/9002", json={
        "reporting": "Monthly",
        "edited_by": "Yamini",
    })

    # Filter by owner=Swati: should only show logs for Swati's merchants
    r = seeded_client.get("/api/merchant-edit-logs", params={"owner": "Swati"})
    assert r.status_code == 200
    logs = r.json()
    assert len(logs) >= 1
    assert all(log["merchant_name"] in ("Ajio", "Nike") for log in logs)


def test_multiple_field_changes_create_one_log(seeded_client):
    """Changing multiple fields in one PUT creates a single log entry."""
    seeded_client.put("/api/merchants/9001", json={
        "reporting": "Monthly",
        "payout": "8%",
        "deal_type": "Link based",
        "edited_by": "Swati",
    })
    r = seeded_client.get("/api/merchant-edit-logs")
    logs = r.json()
    assert len(logs) == 1
    changes = logs[0]["changes"]
    assert "reporting" in changes
    assert "payout" in changes
    assert "deal_type" in changes


def test_no_log_when_no_change(seeded_client):
    """No log is created when the submitted values match the current ones."""
    seeded_client.put("/api/merchants/9001", json={
        "reporting": "Live daily",  # same as seed value
        "edited_by": "Swati",
    })
    r = seeded_client.get("/api/merchant-edit-logs")
    assert r.status_code == 200
    assert len(r.json()) == 0
