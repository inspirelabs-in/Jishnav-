"""Tests for foreign key constraints and cascade delete behavior.

Verifies that deleting a parent entity properly cascades to its children,
and that foreign key references are valid.
"""
from tests.conftest import make_entry


def test_deleting_entry_removes_edit_logs(seeded_client):
    """Deleting an entry also removes its associated edit logs."""
    # Create and then edit an entry to generate an edit log
    r = make_entry(seeded_client, clicks=100, sales=10, gmv=5000, revenue=500)
    entry_id = r.json()["id"]

    seeded_client.put(f"/api/entries/{entry_id}", json={
        "entry_date": "2026-07-01",
        "clicks": 200,
        "sales": 20,
        "gmv": 10000,
        "revenue": 1000,
        "edited_by": "Swati",
    })

    # Verify edit log exists
    logs_r = seeded_client.get("/api/edit-logs")
    assert any(log["entry_id"] == entry_id for log in logs_r.json())

    # Delete the entry
    del_r = seeded_client.delete(f"/api/entries/{entry_id}", params={"entered_by": "Swati"})
    assert del_r.status_code == 200

    # Edit logs for this entry should be gone
    logs_r2 = seeded_client.get("/api/edit-logs")
    assert not any(log["entry_id"] == entry_id for log in logs_r2.json())


def test_entry_references_valid_merchant(seeded_client):
    """Creating an entry for a non-existent merchant returns 404."""
    r = make_entry(seeded_client, merchant_id=99999, entered_by="Swati",
                   clicks=100, sales=10, gmv=5000, revenue=500)
    assert r.status_code == 404


def test_notification_references_valid_merchant(seeded_client):
    """Submitting a reason for a non-existent notification returns 404."""
    r = seeded_client.post("/api/notifications/99999/reason", json={"reason": "Test"})
    assert r.status_code == 404


def test_transfer_references_valid_merchant(seeded_client):
    """Transferring a non-existent merchant returns 404."""
    r = seeded_client.post("/api/transfers", json={
        "merchant_id": 99999,
        "to_handler": "Yamini",
        "by": "Manager",
    })
    assert r.status_code == 404


def test_sales_activity_references_valid_lead(seeded_client):
    """Creating an activity for a non-existent lead returns 404."""
    r = seeded_client.post("/api/sales/leads/99999/activities", json={
        "activity_type": "call",
        "summary": "Test call",
        "logged_by": "Sales1",
    })
    assert r.status_code == 404


def test_edit_nonexistent_entry_returns_404(seeded_client):
    """Editing a non-existent entry returns 404."""
    r = seeded_client.put("/api/entries/99999", json={
        "entry_date": "2026-07-01",
        "clicks": 100,
        "sales": 10,
        "gmv": 5000,
        "revenue": 500,
        "edited_by": "Swati",
    })
    assert r.status_code == 404


def test_delete_nonexistent_entry_returns_404(seeded_client):
    """Deleting a non-existent entry returns 404."""
    r = seeded_client.delete("/api/entries/99999")
    assert r.status_code == 404


def test_delivery_fill_nonexistent_entry_returns_404(seeded_client):
    """Filling delivery data for a non-existent entry returns 404."""
    r = seeded_client.post("/api/entries/99999/delivery", json={
        "clicks": 100,
        "sales": 10,
        "gmv": 5000,
        "revenue": 500,
        "filled_by": "Delivery",
    })
    assert r.status_code == 404
