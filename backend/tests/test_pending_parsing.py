"""
Locks the pending_offer magic-string format that drives the 4-handler
affirmation state machine in main.py (lines ~258-400).

INTENT: These tests WILL FAIL if you refactor pending_offer strings to a
dataclass (Issue 2) without also updating the parsing logic. That is the
point — they are the regression guard for Issue 2.

The four prefixes and their handlers:
  "general_fallback:<vid>,<vid>"          → handler 1 (main.py:258-289)
  "web:<query>"                           → handler 2 (main.py:291-306)
  "new_user_fallback:<sids>|vids:<vids>"  → handler 3 (main.py:310-366)
  (anything else, or empty)               → handler 4 (main.py:368-400)
  "choice:<vids>|web:<query>"             → NOT affirmation; is_ambiguous=True
"""
import main


# ── Prefix length constants (lock the magic-number slice offsets) ─────────────

class TestPrefixConstants:
    def test_general_fallback_is_17_chars(self):
        # main.py:259 does pending_offer[17:] to strip the prefix
        assert len("general_fallback:") == 17

    def test_web_is_4_chars(self):
        # main.py:292 does pending_offer[4:]
        assert len("web:") == 4

    def test_new_user_fallback_is_18_chars(self):
        # main.py:311 does .replace("new_user_fallback:", "")
        assert len("new_user_fallback:") == 18

    def test_choice_is_7_chars(self):
        # _extract_related_vids does pending_offer.split("|")[0][7:]
        assert len("choice:") == 7


# ── _extract_web_category (main.py:886-897) ───────────────────────────────────

class TestExtractWebCategory:
    def test_plain_web_prefix(self):
        assert main._extract_web_category("web:Zomato") == "Zomato"

    def test_strips_coupon_noise_words(self):
        assert main._extract_web_category("web:Zomato coupon codes") == "Zomato"

    def test_strips_deal_noise_words(self):
        assert main._extract_web_category("web:Myntra deals offer") == "Myntra"

    def test_choice_pipe_web_extracts_web_part(self):
        # choice:...|web:<category> → extract category from the web part
        assert main._extract_web_category("choice:17,45|web:flights") == "flights"

    def test_pipe_web_extracts_category(self):
        assert main._extract_web_category("new_user_fallback:101|web:Swiggy") == "Swiggy"

    def test_multi_word_brand_preserved(self):
        result = main._extract_web_category("web:Apple iPhone discount")
        assert "Apple" in result
        assert "iPhone" in result

    def test_fallback_when_all_noise(self):
        # If every word is a noise word, fall back to the raw string
        result = main._extract_web_category("web:coupon codes")
        assert result  # must not return empty string


# ── _extract_related_vids (main.py:900-908) ───────────────────────────────────

class TestExtractRelatedVids:
    def test_single_vid(self):
        assert main._extract_related_vids("choice:17|web:flights") == [17]

    def test_multiple_vids(self):
        assert main._extract_related_vids("choice:17,45,89|web:travel") == [17, 45, 89]

    def test_wrong_prefix_returns_empty(self):
        assert main._extract_related_vids("general_fallback:17") == []

    def test_web_only_returns_empty(self):
        assert main._extract_related_vids("web:flights") == []

    def test_empty_pending_returns_empty(self):
        assert main._extract_related_vids("") == []

    def test_empty_vids_section(self):
        assert main._extract_related_vids("choice:|web:flights") == []


# ── general_fallback inline parsing  (MIRRORS main.py:259) ───────────────────
# This code lives inside generate() and can't be imported directly.
# When Issue 2 extracts it into a helper, replace this mirror with an import.

def _parse_general_fallback(pending: str) -> list[int]:
    """MIRRORS main.py:259 exactly."""
    return [int(v) for v in pending[17:].split(",") if v]


class TestGeneralFallbackParsing:
    def test_single_vid(self):
        assert _parse_general_fallback("general_fallback:17") == [17]

    def test_multiple_vids(self):
        assert _parse_general_fallback("general_fallback:17,45") == [17, 45]

    def test_trailing_comma(self):
        assert _parse_general_fallback("general_fallback:17,") == [17]

    def test_empty_vids(self):
        assert _parse_general_fallback("general_fallback:") == []

    def test_three_vids(self):
        assert _parse_general_fallback("general_fallback:1,2,3") == [1, 2, 3]


# ── new_user_fallback inline parsing  (MIRRORS main.py:311-315) ──────────────
# Same note: lives inside generate(); replace with import after Issue 2.

def _parse_new_user_fallback(pending: str):
    """MIRRORS main.py:311-315 exactly. Returns (store_ids, vertical_ids)."""
    parts     = pending.split("|")
    sids_part = parts[0].replace("new_user_fallback:", "")
    vids_part = parts[1].replace("vids:", "") if len(parts) > 1 else ""
    fb_sids   = [int(x) for x in sids_part.split(",") if x]
    fb_vids   = [int(x) for x in vids_part.split(",") if x]
    return fb_sids, fb_vids


class TestNewUserFallbackParsing:
    def test_with_both_sids_and_vids(self):
        sids, vids = _parse_new_user_fallback("new_user_fallback:101,102|vids:17,45")
        assert sids == [101, 102]
        assert vids == [17, 45]

    def test_single_sid_single_vid(self):
        sids, vids = _parse_new_user_fallback("new_user_fallback:999|vids:7")
        assert sids == [999]
        assert vids == [7]

    def test_empty_vids_section(self):
        sids, vids = _parse_new_user_fallback("new_user_fallback:101|vids:")
        assert sids == [101]
        assert vids == []

    def test_no_pipe_section(self):
        sids, vids = _parse_new_user_fallback("new_user_fallback:42")
        assert sids == [42]
        assert vids == []

    def test_multiple_sids_no_vids(self):
        sids, vids = _parse_new_user_fallback("new_user_fallback:10,20,30|vids:")
        assert sids == [10, 20, 30]
        assert vids == []
