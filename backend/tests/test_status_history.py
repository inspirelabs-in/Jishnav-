"""Tests for GET /api/status-history — Revenue/Non-revenue transitions.

Verifies that the endpoint correctly derives status transitions from
the entry timeline and supports owner/merchant filters.
"""
from tests.conftest import make_entry


class TestStatusHistory:
    """GET /api/status-history returns Revenue <-> Non-revenue transitions."""

    def test_revenue_to_nonrevenue_transition(self, seeded_client):
        """A Revenue entry followed by a Non-revenue entry creates a transition event."""
        # First entry: Revenue
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="01", year="2026", revenue_status="Revenue")
        # Second entry: Non-revenue (no numeric fields required)
        seeded_client.post("/api/entries", json={
            "merchant_id": 9001, "entry_date": "2026-02-01",
            "revenue_status": "Non-revenue", "entered_by": "Swati",
        })

        r = seeded_client.get("/api/status-history")
        assert r.status_code == 200
        events = r.json()
        transitions = [e for e in events if e["merchant_id"] == 9001]
        assert len(transitions) >= 1, "Should have at least one transition"
        t = transitions[0]
        assert t["from_status"] == "Revenue", "Transition should be from Revenue"
        assert t["to_status"] == "Non-revenue", "Transition should be to Non-revenue"
        assert t["merchant_name"] == "Ajio"

    def test_nonrevenue_to_revenue_comeback(self, seeded_client):
        """A Non-revenue -> Revenue transition (comeback) appears in history."""
        # Revenue entry
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="01", year="2026", revenue_status="Revenue")
        # Non-revenue entry
        seeded_client.post("/api/entries", json={
            "merchant_id": 9001, "entry_date": "2026-02-01",
            "revenue_status": "Non-revenue", "entered_by": "Swati",
        })
        # Comeback: Revenue again
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="03", year="2026", revenue_status="Revenue")

        r = seeded_client.get("/api/status-history")
        events = r.json()
        transitions = [e for e in events if e["merchant_id"] == 9001]
        comebacks = [e for e in transitions if e["from_status"] == "Non-revenue"
                     and e["to_status"] == "Revenue"]
        assert len(comebacks) >= 1, "Should have a Non-revenue -> Revenue comeback"

    def test_filter_by_owner(self, seeded_client):
        """Filtering by owner scopes transitions to that handler's merchants."""
        # Create transitions for Swati's merchant (9001)
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="01", year="2026", revenue_status="Revenue")
        seeded_client.post("/api/entries", json={
            "merchant_id": 9001, "entry_date": "2026-02-01",
            "revenue_status": "Non-revenue", "entered_by": "Swati",
        })

        # Filter by Yamini (should not see Ajio transitions)
        r = seeded_client.get("/api/status-history", params={"owner": "Yamini"})
        events = r.json()
        ajio_events = [e for e in events if e["merchant_name"] == "Ajio"]
        assert len(ajio_events) == 0, \
            "Yamini filter should not include Ajio (owned by Swati)"

    def test_filter_by_merchant_name(self, seeded_client):
        """Filtering by merchant name narrows results to matching brands."""
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="01", year="2026", revenue_status="Revenue")
        seeded_client.post("/api/entries", json={
            "merchant_id": 9001, "entry_date": "2026-02-01",
            "revenue_status": "Non-revenue", "entered_by": "Swati",
        })

        r = seeded_client.get("/api/status-history", params={"merchant": "Ajio"})
        events = r.json()
        assert all(e["merchant_name"] == "Ajio" for e in events), \
            "All events should be for Ajio when filtered by merchant name"

    def test_no_transitions_returns_empty_list(self, seeded_client):
        """When there are no status transitions, the endpoint returns an empty list."""
        # A single Revenue entry produces no transitions
        make_entry(seeded_client, merchant_id=9001, entered_by="Swati",
                   month="01", year="2026", revenue_status="Revenue")

        r = seeded_client.get("/api/status-history")
        assert r.status_code == 200
        events = r.json()
        ajio_events = [e for e in events if e["merchant_id"] == 9001]
        assert len(ajio_events) == 0, \
            "A single entry cannot produce a transition"
