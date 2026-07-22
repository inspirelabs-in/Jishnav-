"""Tests for empty/zero state behavior across all endpoints.

Verifies that endpoints return sensible empty results when no data
has been entered, rather than erroring out.
"""


def test_entries_empty_list(client):
    """GET /api/entries with no entries returns an empty list."""
    r = client.get("/api/entries")
    assert r.status_code == 200
    assert r.json() == []


def test_analytics_no_entries_returns_zero_totals(client):
    """GET /api/analytics with no data returns zero totals."""
    r = client.get("/api/analytics", params={
        "mode": "overview",
        "owner": "All",
        "date_from": "2026-01-01",
        "date_to": "2026-06-30",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["totals"]["clicks"] == 0
    assert data["totals"]["sales"] == 0
    assert data["totals"]["gmv"] == 0
    assert data["totals"]["revenue"] == 0


def test_notifications_empty(client):
    """GET /api/notifications with no overdue merchants returns an empty list."""
    r = client.get("/api/notifications", params={"user": "Swati"})
    assert r.status_code == 200
    assert r.json() == []


def test_transfers_empty(client):
    """GET /api/transfers with no transfers returns an empty list."""
    r = client.get("/api/transfers")
    assert r.status_code == 200
    assert r.json() == []


def test_delivery_requests_empty(client):
    """GET /api/delivery-requests with no requests returns an empty list."""
    r = client.get("/api/delivery-requests")
    assert r.status_code == 200
    assert r.json() == []


def test_edit_logs_empty(client):
    """GET /api/edit-logs with no edits returns an empty list."""
    r = client.get("/api/edit-logs")
    assert r.status_code == 200
    assert r.json() == []


def test_status_history_empty(client):
    """GET /api/status-history with no transitions returns an empty list."""
    r = client.get("/api/status-history")
    assert r.status_code == 200
    assert r.json() == []


def test_sales_leads_empty(client):
    """GET /api/sales/leads with no leads returns an empty list."""
    r = client.get("/api/sales/leads")
    assert r.status_code == 200
    assert r.json() == []


def test_merchant_edit_logs_empty(client):
    """GET /api/merchant-edit-logs with no edits returns an empty list."""
    r = client.get("/api/merchant-edit-logs")
    assert r.status_code == 200
    assert r.json() == []
