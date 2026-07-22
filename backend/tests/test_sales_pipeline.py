"""Tests for the Sales Pipeline CRUD — leads and activities."""
import pytest


def _create_lead(client, **overrides):
    """Helper to create a sales lead with sensible defaults."""
    payload = {
        "brand_name": "TestBrand",
        "category": "E-Commerce",
        "website": "https://testbrand.com",
        "source": "Cold outreach",
        "poc1_name": "Alice",
        "poc1_email": "alice@test.com",
        "stage": "new_lead",
        "priority": "warm",
        "assigned_to": "Sales1",
    }
    payload.update(overrides)
    return client.post("/api/sales/leads", json=payload)


class TestSalesLeadsCRUD:
    """CRUD operations on /api/sales/leads."""

    def test_create_lead(self, client):
        """POST /api/sales/leads should create a lead with the correct fields."""
        resp = _create_lead(client, brand_name="Acme Corp", priority="hot")
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert data["brand_name"] == "Acme Corp", "Brand name should match"
        assert data["priority"] == "hot", "Priority should match"
        assert data["stage"] == "new_lead", "Default stage should be new_lead"
        assert data["assigned_to"] == "Sales1", "Assigned to should match"
        assert "id" in data, "Response should include an id"

    def test_list_leads(self, client):
        """GET /api/sales/leads should list all created leads."""
        _create_lead(client, brand_name="Lead1")
        _create_lead(client, brand_name="Lead2")

        resp = client.get("/api/sales/leads")
        assert resp.status_code == 200
        data = resp.json()
        names = [l["brand_name"] for l in data]
        assert "Lead1" in names, "Lead1 should be in the list"
        assert "Lead2" in names, "Lead2 should be in the list"

    def test_filter_by_assigned_to(self, client):
        """Filter by assigned_to should narrow results to that person's leads."""
        _create_lead(client, brand_name="S1Lead", assigned_to="Sales1")
        _create_lead(client, brand_name="S2Lead", assigned_to="Sales2")

        resp = client.get("/api/sales/leads", params={"assigned_to": "Sales1"})
        data = resp.json()
        assert all(l["assigned_to"] == "Sales1" for l in data), "All leads should be assigned to Sales1"
        names = [l["brand_name"] for l in data]
        assert "S1Lead" in names, "Sales1's lead should appear"
        assert "S2Lead" not in names, "Sales2's lead should not appear"

    def test_filter_by_stage(self, client):
        """Filter by stage should return only leads at that stage."""
        _create_lead(client, brand_name="NewLead", stage="new_lead")
        _create_lead(client, brand_name="NegLead", stage="negotiating")

        resp = client.get("/api/sales/leads", params={"stage": "negotiating"})
        data = resp.json()
        assert all(l["stage"] == "negotiating" for l in data), "All leads should be at negotiating stage"
        assert len(data) == 1, "Only one lead should match"

    def test_filter_by_priority(self, client):
        """Filter by priority should return only matching leads."""
        _create_lead(client, brand_name="HotLead", priority="hot")
        _create_lead(client, brand_name="ColdLead", priority="cold")

        resp = client.get("/api/sales/leads", params={"priority": "hot"})
        data = resp.json()
        assert all(l["priority"] == "hot" for l in data), "All leads should be hot priority"

    def test_filter_by_search(self, client):
        """Search filter should match brand_name, poc1_name, or poc2_name."""
        _create_lead(client, brand_name="UniqueXyz", poc1_name="Bob")
        _create_lead(client, brand_name="OtherBrand", poc1_name="Charlie")

        resp = client.get("/api/sales/leads", params={"search": "UniqueXyz"})
        data = resp.json()
        assert len(data) == 1, "Search should find exactly one lead"
        assert data[0]["brand_name"] == "UniqueXyz"

    def test_update_lead(self, client):
        """PUT /api/sales/leads/{id} should update fields and set updated_at."""
        create_resp = _create_lead(client, brand_name="UpdateMe")
        lead_id = create_resp.json()["id"]

        resp = client.put(f"/api/sales/leads/{lead_id}", json={
            "stage": "contacted",
            "priority": "hot",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["stage"] == "contacted", "Stage should be updated"
        assert data["priority"] == "hot", "Priority should be updated"
        assert data["updated_at"] is not None, "updated_at should be set after update"

    def test_delete_lead(self, client):
        """DELETE /api/sales/leads/{id} should remove the lead and its activities."""
        create_resp = _create_lead(client, brand_name="DeleteMe")
        lead_id = create_resp.json()["id"]

        # Add an activity first
        client.post(f"/api/sales/leads/{lead_id}/activities", json={
            "activity_type": "call",
            "summary": "Intro call",
            "logged_by": "Sales1",
        })

        resp = client.delete(f"/api/sales/leads/{lead_id}")
        assert resp.status_code == 200
        assert resp.json()["deleted"] is True

        # Verify lead is gone
        list_resp = client.get("/api/sales/leads")
        ids = [l["id"] for l in list_resp.json()]
        assert lead_id not in ids, "Deleted lead should not appear in list"

        # Verify activities are also gone
        act_resp = client.get(f"/api/sales/leads/{lead_id}/activities")
        assert act_resp.status_code == 404, "Activities endpoint should 404 for deleted lead"


class TestSalesActivities:
    """CRUD operations on /api/sales/leads/{id}/activities."""

    def test_create_activity_updates_last_contact(self, client):
        """POST activity should create it and update the lead's last_contact_date."""
        create_resp = _create_lead(client)
        lead_id = create_resp.json()["id"]

        resp = client.post(f"/api/sales/leads/{lead_id}/activities", json={
            "activity_type": "email_sent",
            "summary": "Sent intro email",
            "logged_by": "Sales1",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["activity_type"] == "email_sent", "Activity type should match"
        assert data["summary"] == "Sent intro email", "Summary should match"

        # Verify lead's last_contact_date is updated
        lead_resp = client.get("/api/sales/leads")
        lead = next(l for l in lead_resp.json() if l["id"] == lead_id)
        assert lead["last_contact_date"] is not None, "last_contact_date should be set"

    def test_list_activities_ordered_by_date_desc(self, client):
        """GET activities should return them ordered by activity_date descending."""
        create_resp = _create_lead(client)
        lead_id = create_resp.json()["id"]

        client.post(f"/api/sales/leads/{lead_id}/activities", json={
            "activity_type": "call",
            "activity_date": "2026-06-01T10:00:00",
            "summary": "First call",
            "logged_by": "Sales1",
        })
        client.post(f"/api/sales/leads/{lead_id}/activities", json={
            "activity_type": "email_sent",
            "activity_date": "2026-07-01T10:00:00",
            "summary": "Follow-up email",
            "logged_by": "Sales1",
        })

        resp = client.get(f"/api/sales/leads/{lead_id}/activities")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 2, "Should have two activities"
        # Most recent first
        assert data[0]["summary"] == "Follow-up email", "Newest activity should be first"
        assert data[1]["summary"] == "First call", "Oldest activity should be second"

    def test_unknown_activity_type_returns_422(self, client):
        """An unrecognized activity_type should be rejected with 422."""
        create_resp = _create_lead(client)
        lead_id = create_resp.json()["id"]

        resp = client.post(f"/api/sales/leads/{lead_id}/activities", json={
            "activity_type": "carrier_pigeon",
            "summary": "Sent via pigeon",
            "logged_by": "Sales1",
        })
        assert resp.status_code == 422, f"Expected 422 for unknown activity type, got {resp.status_code}"

    def test_nonexistent_lead_returns_404(self, client):
        """Operations on a non-existent lead should return 404."""
        resp = client.get("/api/sales/leads/99999/activities")
        assert resp.status_code == 404, "Should 404 for non-existent lead"

        resp2 = client.post("/api/sales/leads/99999/activities", json={
            "activity_type": "call",
            "summary": "Test",
            "logged_by": "Sales1",
        })
        assert resp2.status_code == 404, "Should 404 for non-existent lead on POST"

        resp3 = client.delete("/api/sales/leads/99999")
        assert resp3.status_code == 404, "Should 404 for non-existent lead on DELETE"

        resp4 = client.put("/api/sales/leads/99999", json={"stage": "contacted"})
        assert resp4.status_code == 404, "Should 404 for non-existent lead on PUT"
