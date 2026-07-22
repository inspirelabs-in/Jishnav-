"""Tests for GET /api/handlers — handler list."""


class TestHandlers:
    """The handlers endpoint returns the static list of CR handlers."""

    def test_returns_handler_list(self, client):
        """Should return the three handlers: Swati, Yamini, Meena."""
        resp = client.get("/api/handlers")
        assert resp.status_code == 200
        data = resp.json()
        assert data == ["Swati", "Yamini", "Meena"], (
            f"Expected ['Swati', 'Yamini', 'Meena'], got {data}"
        )
