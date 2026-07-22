"""Tests for CR (conversion rate) computation edge cases.

CR = sales / clicks * 100, rounded to 2 decimal places.
Delivery CR (d_cr) follows the same formula.
"""
from tests.conftest import make_entry


def test_cr_basic_computation(seeded_client):
    """CR is computed as sales/clicks*100 rounded to 2 decimal places."""
    r = make_entry(seeded_client, clicks=200, sales=15, gmv=10000, revenue=1000)
    assert r.status_code == 200
    # 15/200*100 = 7.5
    assert r.json()["cr"] == 7.5


def test_cr_zero_clicks_no_division_error(seeded_client):
    """When clicks is 0, CR should be None (no ZeroDivisionError)."""
    r = make_entry(seeded_client, clicks=0, sales=0, gmv=1000, revenue=100)
    assert r.status_code == 200
    assert r.json()["cr"] is None


def test_cr_with_large_numbers(seeded_client):
    """CR computation works with very large click and sales values."""
    r = make_entry(seeded_client, clicks=10_000_000, sales=123_456, gmv=999999, revenue=50000)
    assert r.status_code == 200
    # 123456/10000000*100 = 1.23456 -> rounded to 1.23
    assert r.json()["cr"] == 1.23


def test_cr_rounds_to_two_decimals(seeded_client):
    """CR is rounded to exactly 2 decimal places."""
    r = make_entry(seeded_client, clicks=300, sales=7, gmv=5000, revenue=500)
    assert r.status_code == 200
    # 7/300*100 = 2.33333... -> 2.33
    assert r.json()["cr"] == 2.33


def test_cr_recomputed_on_edit(seeded_client):
    """Editing clicks or sales recomputes CR in the update response."""
    r = make_entry(seeded_client, clicks=100, sales=10, gmv=5000, revenue=500)
    entry_id = r.json()["id"]

    # Edit: change sales from 10 to 25
    edit_r = seeded_client.put(f"/api/entries/{entry_id}", json={
        "entry_date": "2026-07-01",
        "clicks": 100,
        "sales": 25,
        "gmv": 5000,
        "revenue": 500,
        "edited_by": "Swati",
    })
    assert edit_r.status_code == 200
    assert edit_r.json()["updated"] is True
    # 25/100*100 = 25.0
    assert edit_r.json()["cr"] == 25.0


def test_cr_recomputed_on_clicks_change(seeded_client):
    """Changing clicks also triggers a CR recomputation."""
    r = make_entry(seeded_client, clicks=100, sales=10, gmv=5000, revenue=500)
    entry_id = r.json()["id"]

    edit_r = seeded_client.put(f"/api/entries/{entry_id}", json={
        "entry_date": "2026-07-01",
        "clicks": 50,
        "sales": 10,
        "gmv": 5000,
        "revenue": 500,
        "edited_by": "Swati",
    })
    assert edit_r.status_code == 200
    # 10/50*100 = 20.0
    assert edit_r.json()["cr"] == 20.0


def test_delivery_cr_computation(seeded_client):
    """Delivery CR (d_cr) is computed with the same formula as CR."""
    # Create entry with delivery_requested flag
    r = make_entry(seeded_client, clicks=100, sales=10, gmv=5000, revenue=500,
                   delivery_requested=True)
    entry_id = r.json()["id"]

    # Fill delivery data
    fill_r = seeded_client.post(f"/api/entries/{entry_id}/delivery", json={
        "clicks": 500,
        "sales": 30,
        "gmv": 20000,
        "revenue": 3000,
        "filled_by": "Delivery",
    })
    assert fill_r.status_code == 200
    # 30/500*100 = 6.0
    assert fill_r.json()["d_cr"] == 6.0


def test_delivery_cr_zero_clicks(seeded_client):
    """Delivery CR returns None when delivery clicks is 0."""
    r = make_entry(seeded_client, clicks=100, sales=10, gmv=5000, revenue=500,
                   delivery_requested=True)
    entry_id = r.json()["id"]

    fill_r = seeded_client.post(f"/api/entries/{entry_id}/delivery", json={
        "clicks": 0,
        "sales": 0,
        "gmv": 1000,
        "revenue": 100,
        "filled_by": "Delivery",
    })
    assert fill_r.status_code == 200
    assert fill_r.json()["d_cr"] is None


def test_cr_100_percent(seeded_client):
    """CR of exactly 100% when sales equals clicks."""
    r = make_entry(seeded_client, clicks=50, sales=50, gmv=10000, revenue=1000)
    assert r.status_code == 200
    assert r.json()["cr"] == 100.0
