"""
Locks the _skip_filter logic from main.py:817-819:

    _skip_filter = _coupons_pre_filtered or (
        not route.location_keywords and not route.is_new_user
    )

skip_relevance_filter=True means the LLM relevance check inside
stream_coupon_response() is bypassed. It should be True for normal
coupon searches and False when we need to confirm coupons are actually
relevant to a location or new-user context.

INTENT: If the condition logic changes, update this file and make sure
the new behavior is intentional.
"""


def compute_skip_filter(
    coupons_pre_filtered: bool,
    location_keywords: dict,
    is_new_user: bool,
) -> bool:
    """MIRRORS main.py:817-819."""
    return coupons_pre_filtered or (not location_keywords and not is_new_user)


class TestSkipFilterPreFiltered:
    """coupons_pre_filtered=True → always skip the LLM filter."""

    def test_pre_filtered_no_location_no_new_user(self):
        assert compute_skip_filter(True, {}, False) is True

    def test_pre_filtered_with_location(self):
        assert compute_skip_filter(True, {"17": ["Mumbai"]}, False) is True

    def test_pre_filtered_with_new_user(self):
        assert compute_skip_filter(True, {}, True) is True

    def test_pre_filtered_with_both(self):
        assert compute_skip_filter(True, {"17": ["Mumbai"]}, True) is True


class TestSkipFilterNormalSearch:
    """No location, not new-user → skip filter (standard search)."""

    def test_normal_search_skips_filter(self):
        assert compute_skip_filter(False, {}, False) is True

    def test_empty_dict_is_falsy(self):
        # {} is falsy, so no location keywords → skip
        assert compute_skip_filter(False, {}, False) is True


class TestSkipFilterLocationAware:
    """Location keywords present → must run relevance filter."""

    def test_single_keyword(self):
        assert compute_skip_filter(False, {"17": ["Mumbai"]}, False) is False

    def test_multiple_verticals(self):
        assert compute_skip_filter(False, {"17": ["Mumbai"], "45": ["Hyderabad"]}, False) is False

    def test_location_and_new_user(self):
        assert compute_skip_filter(False, {"17": ["Mumbai"]}, True) is False


class TestSkipFilterNewUser:
    """is_new_user=True → must run relevance filter."""

    def test_new_user_no_location(self):
        assert compute_skip_filter(False, {}, True) is False

    def test_new_user_with_location(self):
        assert compute_skip_filter(False, {"17": ["Delhi"]}, True) is False


class TestSkipFilterTruthTable:
    """Exhaustive truth table for the 2-variable (location, new_user) case."""

    cases = [
        # (location_keywords, is_new_user, expected_skip)
        ({},              False, True),   # normal search → skip
        ({"1": ["X"]},   False, False),  # location → filter
        ({},              True,  False),  # new user → filter
        ({"1": ["X"]},   True,  False),  # both → filter
    ]

    def test_all_combinations(self):
        for loc, nu, expected in self.cases:
            result = compute_skip_filter(False, loc, nu)
            assert result is expected, (
                f"compute_skip_filter(False, {loc!r}, {nu!r}) "
                f"returned {result}, expected {expected}"
            )
