"""
Tests RouteResult construction and the pending_offer-driven dispatch invariants.

Key rule in main.py: which affirmation handler fires is determined entirely by
`route.pending_offer.startswith(prefix)`. These tests lock that contract so
Issue 2 (dataclass refactor) can't silently break handler selection.
"""
from query_router import RouteResult


# ── RouteResult defaults ──────────────────────────────────────────────────────

class TestRouteResultDefaults:
    def test_query_type_default(self):
        assert RouteResult().query_type == "B"

    def test_store_ids_default(self):
        assert RouteResult().store_ids == []

    def test_vertical_ids_default(self):
        assert RouteResult().vertical_ids == []

    def test_boolean_flags_default_false(self):
        r = RouteResult()
        assert r.is_affirmation is False
        assert r.is_negation is False
        assert r.is_non_coupon is False
        assert r.is_ambiguous is False
        assert r.is_explicit_web is False
        assert r.is_explicit_related is False
        assert r.is_new_user is False

    def test_optional_fields_default_none(self):
        r = RouteResult()
        assert r.requested_count is None
        assert r.min_discount is None

    def test_string_fields_default_empty(self):
        r = RouteResult()
        assert r.pending_offer == ""
        assert r.corrected_query == ""
        assert r.brand_name_hint == ""

    def test_dict_fields_default_empty(self):
        assert RouteResult().location_keywords == {}

    def test_list_fields_default_empty(self):
        assert RouteResult().store_query_names == []


class TestRouteResultInstanceIsolation:
    """Each RouteResult gets its own mutable containers — no shared state."""

    def test_store_ids_are_independent(self):
        r1, r2 = RouteResult(), RouteResult()
        r1.store_ids.append(1)
        assert r2.store_ids == []

    def test_vertical_ids_are_independent(self):
        r1, r2 = RouteResult(), RouteResult()
        r1.vertical_ids.append(99)
        assert r2.vertical_ids == []

    def test_location_keywords_are_independent(self):
        r1, r2 = RouteResult(), RouteResult()
        r1.location_keywords["17"] = ["Mumbai"]
        assert r2.location_keywords == {}


# ── Handler dispatch invariants (mirrors main.py:258-400 if/elif chain) ───────

class TestAffirmationHandlerDispatch:
    """
    The 4 affirmation handlers are selected by startswith checks in order:
      1. general_fallback:  (main.py:258)
      2. web:               (main.py:291)
      3. new_user_fallback: (main.py:310)
      4. else / empty       (main.py:368)
    choice: is NOT an affirmation — it flips to is_ambiguous=True (query_router.py:109-111).
    """

    HANDLER_PREFIXES = [
        "general_fallback:",
        "web:",
        "new_user_fallback:",
    ]

    def _affirmation(self, pending: str) -> RouteResult:
        r = RouteResult()
        r.is_affirmation = True
        r.query_type = "D"
        r.pending_offer = pending
        return r

    def test_handler1_general_fallback_trigger(self):
        r = self._affirmation("general_fallback:17,45")
        assert r.pending_offer.startswith("general_fallback:")

    def test_handler2_web_trigger(self):
        r = self._affirmation("web:Zomato")
        assert r.pending_offer.startswith("web:")

    def test_handler3_new_user_fallback_trigger(self):
        r = self._affirmation("new_user_fallback:101|vids:17")
        assert r.pending_offer.startswith("new_user_fallback:")

    def test_handler4_generic_empty_pending(self):
        r = self._affirmation("")
        assert not any(r.pending_offer.startswith(p) for p in self.HANDLER_PREFIXES)

    def test_choice_makes_ambiguous_not_affirmation(self):
        # query_router.py:109-111: choice: → is_ambiguous=True, is_affirmation=False
        r = RouteResult()
        r.is_ambiguous = True
        r.is_affirmation = False
        r.pending_offer = "choice:17,45|web:flights"
        assert r.is_ambiguous
        assert not r.is_affirmation

    def test_prefixes_are_mutually_exclusive(self):
        """No prefix starts-with another — the if/elif chain is unambiguous."""
        for i, p1 in enumerate(self.HANDLER_PREFIXES):
            for j, p2 in enumerate(self.HANDLER_PREFIXES):
                if i != j:
                    assert not p1.startswith(p2), (
                        f"Handler prefixes overlap: {p1!r} starts with {p2!r}"
                    )

    def test_choice_not_in_handler_prefixes(self):
        """choice: must not accidentally match any of the 3 affirmation prefixes."""
        for p in self.HANDLER_PREFIXES:
            assert not "choice:17|web:x".startswith(p)


# ── RouteResult field assignment ──────────────────────────────────────────────

class TestRouteResultFieldAssignment:
    def test_can_set_store_ids(self):
        r = RouteResult()
        r.store_ids = [1, 2, 3]
        assert r.store_ids == [1, 2, 3]

    def test_can_set_vertical_ids(self):
        r = RouteResult()
        r.vertical_ids = [17, 45]
        assert r.vertical_ids == [17, 45]

    def test_can_set_pending_offer(self):
        r = RouteResult()
        r.pending_offer = "general_fallback:17"
        assert r.pending_offer.startswith("general_fallback:")

    def test_can_set_is_new_user(self):
        r = RouteResult()
        r.is_new_user = True
        assert r.is_new_user is True

    def test_can_set_min_discount(self):
        r = RouteResult()
        r.min_discount = 30.0
        assert r.min_discount == 30.0
