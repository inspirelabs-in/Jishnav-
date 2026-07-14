"""
Integration test suite for the /api/chat endpoint.

Sends real queries to a running backend, parses SSE events,
and checks structural invariants (not exact coupon content).

Usage:
    python -m tests.test_integration_chat                   # default: http://localhost:8743
    python -m tests.test_integration_chat --base-url http://your-server:8743
    python -m tests.test_integration_chat --report           # generate HTML report

Each test case is a dict with:
    query               — the user message
    session_id          — (optional) share a session_id to test multi-turn flows
    rules               — dict of structural assertions:
        min_coupons             int   — at least N coupons returned
        max_coupons             int   — at most N coupons returned
        has_coupons             bool  — True = at least 1, False = exactly 0
        coupon_name_contains    [str] — every coupon's couponName must contain at least one
        coupon_name_excludes    [str] — NO coupon's couponName may contain any of these
        store_name_contains     [str] — every coupon's storeName must contain at least one
        store_name_excludes     [str] — NO coupon's storeName may contain any of these
        has_text                bool  — at least one text SSE event
        text_contains           [str] — concatenated text must contain at least one
        text_excludes           [str] — concatenated text must NOT contain any of these
        has_cross_sell          bool  — True = cross_sell event present
        cross_sell_min_chips    int   — at least N cross-sell suggestions
        has_clarification       bool  — True = response asks a question (no coupons)
        is_coupon_search        bool  — meta.isCouponSearch value
    description         — human label for the test
"""

import argparse
import asyncio
import json
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import httpx


# ── Test case definitions ────────────────────────────────────────────────────

TESTS: list[dict] = [
    # ── Store lookups ──
    {
        "query": "Zomato coupons",
        "description": "Direct store match — Zomato",
        "rules": {
            "has_coupons": True,
            "min_coupons": 1,
            "store_name_contains": ["zomato"],
            "is_coupon_search": True,
        },
    },
    {
        "query": "Swiggy coupon codes",
        "description": "Direct store match — Swiggy",
        "rules": {
            "has_coupons": True,
            "min_coupons": 1,
            "store_name_contains": ["swiggy"],
            "is_coupon_search": True,
        },
    },
    {
        "query": "Myntra deals",
        "description": "Direct store match — Myntra",
        "rules": {
            "has_coupons": True,
            "min_coupons": 1,
            "store_name_contains": ["myntra"],
            "is_coupon_search": True,
        },
    },
    {
        "query": "Zomato and Swiggy deals",
        "description": "Multi-store query — both should resolve",
        "rules": {
            "has_coupons": True,
            "min_coupons": 2,
            "is_coupon_search": True,
        },
    },

    # ── Vertical / category matches ──
    {
        "query": "flight coupons",
        "description": "Vertical match — Flights",
        "rules": {
            "has_coupons": True,
            "min_coupons": 1,
            "is_coupon_search": True,
        },
    },
    {
        "query": "pizza deals",
        "description": "Product → vertical resolution (Food)",
        "rules": {
            "has_coupons": True,
            "min_coupons": 1,
            "is_coupon_search": True,
        },
    },
    {
        "query": "laptop deals",
        "description": "Product → vertical resolution (Electronics/Laptops)",
        "rules": {
            "has_coupons": True,
            "min_coupons": 1,
            "is_coupon_search": True,
        },
    },
    {
        "query": "shoes coupons",
        "description": "Product → vertical resolution (Fashion)",
        "rules": {
            "has_coupons": True,
            "min_coupons": 1,
            "is_coupon_search": True,
        },
    },

    # ── Brand filter accuracy (Issue #4 fix) ──
    {
        "query": "Apple iPhone coupon codes",
        "description": "Brand filter — no false positives like Apple Cider Vinegar",
        "rules": {
            "has_coupons": True,
            "coupon_name_excludes": ["cider", "vinegar"],
            "is_coupon_search": True,
        },
    },
    {
        "query": "Samsung phone offers",
        "description": "Brand filter — Samsung mobile coupons",
        "rules": {
            "has_coupons": True,
            "is_coupon_search": True,
        },
    },
    {
        "query": "HP laptop deals",
        "description": "Brand + product — HP laptops specifically",
        "rules": {
            "has_coupons": True,
            "is_coupon_search": True,
        },
    },
    {
        "query": "Nike shoes coupons",
        "description": "Brand filter — Nike specifically",
        "rules": {
            "has_coupons": True,
            "is_coupon_search": True,
        },
    },

    # ── Keyword-index fallback (KFC fix) ──
    {
        "query": "KFC coupon codes",
        "description": "Keyword-index fallback — KFC (not in store index)",
        "rules": {
            "has_coupons": True,
            "min_coupons": 1,
            "is_coupon_search": True,
        },
    },

    # ── New user / discount filters ──
    {
        "query": "Swiggy first order discount",
        "description": "New user flag detection",
        "rules": {
            "has_coupons": True,
            "store_name_contains": ["swiggy"],
            "is_coupon_search": True,
        },
    },
    {
        "query": "Zomato coupons above 50%",
        "description": "Min discount extraction",
        "rules": {
            "has_coupons": True,
            "store_name_contains": ["zomato"],
            "is_coupon_search": True,
        },
    },

    # ── Clarification / ambiguous queries ──
    {
        "query": "I need coupons",
        "description": "Vague query — should ask for clarification",
        "rules": {
            "has_clarification": True,
            "has_coupons": False,
        },
    },
    {
        "query": "hello",
        "description": "Greeting — should ask what they want",
        "rules": {
            "has_coupons": False,
            "has_text": True,
        },
    },

    # ── Non-coupon intent ──
    {
        "query": "What is the weather today?",
        "description": "Non-coupon query — should not return coupons",
        "rules": {
            "has_coupons": False,
            "has_text": True,
        },
    },
    {
        "query": "What can you do?",
        "description": "System info query",
        "rules": {
            "has_coupons": False,
            "has_text": True,
        },
    },

    # ── Typo correction ──
    {
        "query": "Amzon coupon codes",
        "description": "Typo correction — 'Amzon' → Amazon",
        "rules": {
            "has_text": True,
            "is_coupon_search": True,
        },
    },
    {
        "query": "fligt deals",
        "description": "Typo correction — 'fligt' → flight",
        "rules": {
            "has_coupons": True,
            "is_coupon_search": True,
        },
    },

    # ── Edge cases ──
    {
        "query": "show me 3 Flipkart coupons",
        "description": "Requested count — should honour the number",
        "rules": {
            "has_coupons": True,
            "max_coupons": 5,
            "is_coupon_search": True,
        },
    },
    {
        "query": "Airbnb coupon codes",
        "description": "Store lookup — Airbnb",
        "rules": {
            "has_text": True,
            "is_coupon_search": True,
        },
    },
    {
        "query": "bus coupons",
        "description": "Specific vertical — Bus (not generic Travel)",
        "rules": {
            "has_coupons": True,
            "is_coupon_search": True,
        },
    },
    {
        "query": "Hyderabad to Mumbai flights",
        "description": "Location-aware query",
        "rules": {
            "has_coupons": True,
            "is_coupon_search": True,
        },
    },
]


# ── SSE parser ───────────────────────────────────────────────────────────────

@dataclass
class SSEResponse:
    text: str = ""
    coupons: list = field(default_factory=list)
    meta: dict = field(default_factory=dict)
    cross_sell: dict | None = None
    errors: list = field(default_factory=list)
    raw_events: list = field(default_factory=list)
    duration_ms: float = 0


async def send_query(base_url: str, query: str, session_id: str, timeout: float = 30.0) -> SSEResponse:
    result = SSEResponse()
    start = time.monotonic()

    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            f"{base_url}/api/chat",
            json={"session_id": session_id, "message": query},
        ) as resp:
            if resp.status_code != 200:
                result.errors.append(f"HTTP {resp.status_code}")
                return result

            buffer = ""
            async for chunk in resp.aiter_text():
                buffer += chunk
                while "\n\n" in buffer:
                    raw_event, buffer = buffer.split("\n\n", 1)
                    event_type = ""
                    event_data = ""
                    for line in raw_event.strip().split("\n"):
                        if line.startswith("event: "):
                            event_type = line[7:].strip()
                        elif line.startswith("data: "):
                            event_data = line[6:]

                    result.raw_events.append({"event": event_type, "data": event_data})

                    if event_type == "text":
                        try:
                            result.text += json.loads(event_data)
                        except json.JSONDecodeError:
                            result.text += event_data

                    elif event_type == "coupons":
                        try:
                            result.coupons.extend(json.loads(event_data))
                        except json.JSONDecodeError:
                            result.errors.append(f"Bad coupons JSON: {event_data[:100]}")

                    elif event_type == "meta":
                        try:
                            result.meta.update(json.loads(event_data))
                        except json.JSONDecodeError:
                            pass

                    elif event_type == "cross_sell":
                        try:
                            result.cross_sell = json.loads(event_data)
                        except json.JSONDecodeError:
                            pass

                    elif event_type == "error":
                        try:
                            err = json.loads(event_data)
                            result.errors.append(err.get("message", str(err)))
                        except json.JSONDecodeError:
                            result.errors.append(event_data)

    result.duration_ms = (time.monotonic() - start) * 1000
    return result


# ── Rule checker ─────────────────────────────────────────────────────────────

@dataclass
class CheckResult:
    rule: str
    passed: bool
    detail: str


def check_rules(response: SSEResponse, rules: dict) -> list[CheckResult]:
    results = []
    coupons = response.coupons

    if "has_coupons" in rules:
        expect = rules["has_coupons"]
        actual = len(coupons) > 0
        results.append(CheckResult(
            rule="has_coupons",
            passed=actual == expect,
            detail=f"Expected {'coupons' if expect else 'no coupons'}, got {len(coupons)}",
        ))

    if "min_coupons" in rules:
        n = rules["min_coupons"]
        results.append(CheckResult(
            rule="min_coupons",
            passed=len(coupons) >= n,
            detail=f"Expected >= {n}, got {len(coupons)}",
        ))

    if "max_coupons" in rules:
        n = rules["max_coupons"]
        results.append(CheckResult(
            rule="max_coupons",
            passed=len(coupons) <= n,
            detail=f"Expected <= {n}, got {len(coupons)}",
        ))

    if "coupon_name_contains" in rules:
        keywords = [k.lower() for k in rules["coupon_name_contains"]]
        for c in coupons:
            name = (c.get("couponName") or "").lower()
            ok = any(k in name for k in keywords)
            if not ok:
                results.append(CheckResult(
                    rule="coupon_name_contains",
                    passed=False,
                    detail=f"Coupon '{c.get('couponName', '')[:60]}' missing any of {keywords}",
                ))
                break
        else:
            if coupons:
                results.append(CheckResult(
                    rule="coupon_name_contains",
                    passed=True,
                    detail=f"All {len(coupons)} coupons contain required keywords",
                ))

    if "coupon_name_excludes" in rules:
        bad_words = [k.lower() for k in rules["coupon_name_excludes"]]
        found_bad = []
        for c in coupons:
            name = (c.get("couponName") or "").lower()
            for bw in bad_words:
                if bw in name:
                    found_bad.append((c.get("couponName", "")[:60], bw))
        results.append(CheckResult(
            rule="coupon_name_excludes",
            passed=len(found_bad) == 0,
            detail=f"Found excluded words: {found_bad}" if found_bad else "No excluded words found",
        ))

    if "store_name_contains" in rules:
        keywords = [k.lower() for k in rules["store_name_contains"]]
        if coupons:
            stores_found = {(c.get("storeName") or "").lower() for c in coupons}
            ok = any(any(k in s for k in keywords) for s in stores_found)
            results.append(CheckResult(
                rule="store_name_contains",
                passed=ok,
                detail=f"Stores found: {list(stores_found)[:5]}, looking for {keywords}",
            ))

    if "store_name_excludes" in rules:
        bad_words = [k.lower() for k in rules["store_name_excludes"]]
        found_bad = []
        for c in coupons:
            sname = (c.get("storeName") or "").lower()
            for bw in bad_words:
                if bw in sname:
                    found_bad.append((c.get("storeName", "")[:40], bw))
        results.append(CheckResult(
            rule="store_name_excludes",
            passed=len(found_bad) == 0,
            detail=f"Found excluded store names: {found_bad}" if found_bad else "No excluded stores",
        ))

    if "has_text" in rules:
        expect = rules["has_text"]
        actual = len(response.text.strip()) > 0
        results.append(CheckResult(
            rule="has_text",
            passed=actual == expect,
            detail=f"Text length: {len(response.text)} chars",
        ))

    if "text_contains" in rules:
        keywords = [k.lower() for k in rules["text_contains"]]
        text_lower = response.text.lower()
        ok = any(k in text_lower for k in keywords)
        results.append(CheckResult(
            rule="text_contains",
            passed=ok,
            detail=f"Looking for {keywords} in text ({len(response.text)} chars)",
        ))

    if "text_excludes" in rules:
        bad_words = [k.lower() for k in rules["text_excludes"]]
        text_lower = response.text.lower()
        found = [k for k in bad_words if k in text_lower]
        results.append(CheckResult(
            rule="text_excludes",
            passed=len(found) == 0,
            detail=f"Found excluded text: {found}" if found else "No excluded text found",
        ))

    if "has_cross_sell" in rules:
        expect = rules["has_cross_sell"]
        actual = response.cross_sell is not None
        results.append(CheckResult(
            rule="has_cross_sell",
            passed=actual == expect,
            detail=f"Cross-sell {'present' if actual else 'absent'}",
        ))

    if "cross_sell_min_chips" in rules:
        n = rules["cross_sell_min_chips"]
        actual = len(response.cross_sell.get("suggestions", [])) if response.cross_sell else 0
        results.append(CheckResult(
            rule="cross_sell_min_chips",
            passed=actual >= n,
            detail=f"Expected >= {n} chips, got {actual}",
        ))

    if "has_clarification" in rules:
        expect = rules["has_clarification"]
        text_lower = response.text.lower()
        looks_like_question = "?" in response.text
        no_coupons = len(coupons) == 0
        actual = looks_like_question and no_coupons
        results.append(CheckResult(
            rule="has_clarification",
            passed=actual == expect,
            detail=f"Question mark: {looks_like_question}, coupons: {len(coupons)}",
        ))

    if "is_coupon_search" in rules:
        expect = rules["is_coupon_search"]
        actual = response.meta.get("isCouponSearch")
        results.append(CheckResult(
            rule="is_coupon_search",
            passed=actual == expect,
            detail=f"meta.isCouponSearch = {actual}",
        ))

    if response.errors:
        results.append(CheckResult(
            rule="no_errors",
            passed=False,
            detail=f"Errors: {response.errors}",
        ))

    return results


# ── Runner ───────────────────────────────────────────────────────────────────

@dataclass
class TestResult:
    query: str
    description: str
    checks: list[CheckResult]
    response: SSEResponse
    passed: bool
    session_id: str


async def run_tests(base_url: str) -> list[TestResult]:
    results = []

    for i, tc in enumerate(TESTS):
        sid = tc.get("session_id") or f"test-{uuid.uuid4().hex[:12]}"
        query = tc["query"]
        desc = tc.get("description", query)
        rules = tc.get("rules", {})

        print(f"  [{i+1:2d}/{len(TESTS)}] {desc:<55s}", end="", flush=True)

        try:
            response = await send_query(base_url, query, sid)
            checks = check_rules(response, rules)
            all_passed = all(c.passed for c in checks)
            status = "PASS" if all_passed else "FAIL"
            symbol = "\033[32m✓\033[0m" if all_passed else "\033[31m✗\033[0m"
            print(f" {symbol} {status}  ({response.duration_ms:.0f}ms)")

            if not all_passed:
                for c in checks:
                    if not c.passed:
                        print(f"       └─ {c.rule}: {c.detail}")

            results.append(TestResult(
                query=query,
                description=desc,
                checks=checks,
                response=response,
                passed=all_passed,
                session_id=sid,
            ))

        except httpx.ConnectError:
            print(f" \033[31m✗ CONNECTION REFUSED\033[0m")
            results.append(TestResult(
                query=query,
                description=desc,
                checks=[CheckResult("connection", False, "Could not connect to backend")],
                response=SSEResponse(),
                passed=False,
                session_id=sid,
            ))
        except Exception as e:
            print(f" \033[31m✗ ERROR: {e}\033[0m")
            results.append(TestResult(
                query=query,
                description=desc,
                checks=[CheckResult("exception", False, str(e))],
                response=SSEResponse(),
                passed=False,
                session_id=sid,
            ))

    return results


# ── HTML report generator ────────────────────────────────────────────────────

def generate_report(results: list[TestResult], output_path: str) -> str:
    passed = sum(1 for r in results if r.passed)
    failed = len(results) - passed
    pct = (passed / len(results) * 100) if results else 0
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")

    rows_html = []
    for i, r in enumerate(results):
        status_class = "pass" if r.passed else "fail"
        status_label = "PASS" if r.passed else "FAIL"
        duration = f"{r.response.duration_ms:.0f}ms"

        checks_html = ""
        for c in r.checks:
            c_class = "check-pass" if c.passed else "check-fail"
            c_icon = "✓" if c.passed else "✗"
            checks_html += f'<div class="{c_class}"><span class="c-icon">{c_icon}</span> <strong>{c.rule}</strong>: {c.detail}</div>\n'

        coupons_html = ""
        if r.response.coupons:
            coupons_html = '<div class="coupons-preview"><strong>Coupons returned:</strong><ul>'
            for c in r.response.coupons[:8]:
                sname = c.get("storeName", "?")
                cname = c.get("couponName", "?")[:80]
                code = c.get("couponCode", "")
                coupons_html += f"<li><strong>{sname}</strong> — {cname}"
                if code:
                    coupons_html += f' <code>{code}</code>'
                coupons_html += "</li>"
            if len(r.response.coupons) > 8:
                coupons_html += f"<li>... and {len(r.response.coupons) - 8} more</li>"
            coupons_html += "</ul></div>"

        text_preview = ""
        if r.response.text.strip():
            safe_text = r.response.text[:300].replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            text_preview = f'<div class="text-preview"><strong>Response text:</strong> {safe_text}{"..." if len(r.response.text) > 300 else ""}</div>'

        cross_sell_html = ""
        if r.response.cross_sell:
            cs = r.response.cross_sell
            chips = ", ".join(s.get("keyword", "?") for s in cs.get("suggestions", []))
            cross_sell_html = f'<div class="cross-sell-preview"><strong>Cross-sell:</strong> {cs.get("intro", "")} [{chips}]</div>'

        rows_html.append(f"""
        <div class="test-row {status_class}" onclick="this.classList.toggle('expanded')">
            <div class="test-header">
                <span class="status-badge {status_class}">{status_label}</span>
                <span class="test-query">"{r.query}"</span>
                <span class="test-desc">{r.description}</span>
                <span class="test-duration">{duration}</span>
                <span class="expand-icon">▸</span>
            </div>
            <div class="test-details">
                <div class="checks">{checks_html}</div>
                {text_preview}
                {coupons_html}
                {cross_sell_html}
            </div>
        </div>""")

    html = f"""<title>GrabonGPT Integration Test Report</title>
<style>
    :root {{
        --bg: #0f1117;
        --surface: #1a1d27;
        --surface-2: #232633;
        --border: #2d3142;
        --text-1: #e8eaed;
        --text-2: #9aa0b0;
        --text-3: #6b7185;
        --green: #22c55e;
        --green-bg: rgba(34, 197, 94, 0.08);
        --green-border: rgba(34, 197, 94, 0.2);
        --red: #ef4444;
        --red-bg: rgba(239, 68, 68, 0.08);
        --red-border: rgba(239, 68, 68, 0.2);
        --brand: #84cc16;
        --radius: 12px;
    }}
    @media (prefers-color-scheme: light) {{
        :root {{
            --bg: #f5f6f8;
            --surface: #ffffff;
            --surface-2: #f0f1f4;
            --border: #e0e2e8;
            --text-1: #1a1d27;
            --text-2: #5a6078;
            --text-3: #8890a5;
            --green-bg: rgba(34, 197, 94, 0.06);
            --red-bg: rgba(239, 68, 68, 0.06);
        }}
    }}
    :root[data-theme="light"] {{
        --bg: #f5f6f8;
        --surface: #ffffff;
        --surface-2: #f0f1f4;
        --border: #e0e2e8;
        --text-1: #1a1d27;
        --text-2: #5a6078;
        --text-3: #8890a5;
        --green-bg: rgba(34, 197, 94, 0.06);
        --red-bg: rgba(239, 68, 68, 0.06);
    }}
    :root[data-theme="dark"] {{
        --bg: #0f1117;
        --surface: #1a1d27;
        --surface-2: #232633;
        --border: #2d3142;
        --text-1: #e8eaed;
        --text-2: #9aa0b0;
        --text-3: #6b7185;
        --green-bg: rgba(34, 197, 94, 0.08);
        --red-bg: rgba(239, 68, 68, 0.08);
    }}
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        background: var(--bg);
        color: var(--text-1);
        padding: 32px 24px;
        max-width: 900px;
        margin: 0 auto;
    }}
    h1 {{
        font-size: 22px;
        font-weight: 700;
        margin-bottom: 6px;
    }}
    .subtitle {{
        color: var(--text-3);
        font-size: 13px;
        margin-bottom: 24px;
    }}
    .summary {{
        display: flex;
        gap: 16px;
        margin-bottom: 28px;
    }}
    .summary-card {{
        flex: 1;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 16px 20px;
        text-align: center;
    }}
    .summary-card .num {{
        font-size: 28px;
        font-weight: 800;
        font-variant-numeric: tabular-nums;
    }}
    .summary-card .lbl {{
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--text-3);
        margin-top: 2px;
    }}
    .summary-card.pass-card .num {{ color: var(--green); }}
    .summary-card.fail-card .num {{ color: var(--red); }}
    .summary-card.pct-card .num {{ color: var(--brand); }}

    .test-row {{
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        margin-bottom: 8px;
        overflow: hidden;
        cursor: pointer;
        transition: border-color 0.15s;
    }}
    .test-row:hover {{ border-color: var(--text-3); }}
    .test-row.fail {{ border-left: 3px solid var(--red); }}
    .test-row.pass {{ border-left: 3px solid var(--green); }}

    .test-header {{
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
    }}
    .status-badge {{
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 3px 8px;
        border-radius: 6px;
        flex-shrink: 0;
    }}
    .status-badge.pass {{
        color: var(--green);
        background: var(--green-bg);
        border: 1px solid var(--green-border);
    }}
    .status-badge.fail {{
        color: var(--red);
        background: var(--red-bg);
        border: 1px solid var(--red-border);
    }}
    .test-query {{
        font-size: 13px;
        font-weight: 600;
        color: var(--text-1);
        flex-shrink: 0;
    }}
    .test-desc {{
        font-size: 12px;
        color: var(--text-3);
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }}
    .test-duration {{
        font-size: 11px;
        color: var(--text-3);
        font-variant-numeric: tabular-nums;
        flex-shrink: 0;
    }}
    .expand-icon {{
        color: var(--text-3);
        font-size: 12px;
        transition: transform 0.2s;
        flex-shrink: 0;
    }}
    .test-row.expanded .expand-icon {{ transform: rotate(90deg); }}

    .test-details {{
        display: none;
        padding: 0 16px 14px;
        border-top: 1px solid var(--border);
    }}
    .test-row.expanded .test-details {{ display: block; padding-top: 12px; }}

    .checks {{ display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }}
    .check-pass, .check-fail {{
        font-size: 12px;
        padding: 4px 8px;
        border-radius: 6px;
    }}
    .check-pass {{
        color: var(--green);
        background: var(--green-bg);
    }}
    .check-fail {{
        color: var(--red);
        background: var(--red-bg);
    }}
    .c-icon {{ font-weight: 700; }}

    .text-preview, .coupons-preview, .cross-sell-preview {{
        font-size: 12px;
        color: var(--text-2);
        margin-top: 8px;
        padding: 8px 10px;
        background: var(--surface-2);
        border-radius: 8px;
    }}
    .coupons-preview ul {{
        margin: 4px 0 0 16px;
        list-style: disc;
    }}
    .coupons-preview li {{
        margin: 2px 0;
        font-size: 11px;
    }}
    .coupons-preview code {{
        background: var(--bg);
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        color: var(--brand);
    }}
</style>

<h1>GrabonGPT Integration Test Report</h1>
<p class="subtitle">Generated {timestamp} &middot; {len(results)} tests</p>

<div class="summary">
    <div class="summary-card pass-card">
        <div class="num">{passed}</div>
        <div class="lbl">Passed</div>
    </div>
    <div class="summary-card fail-card">
        <div class="num">{failed}</div>
        <div class="lbl">Failed</div>
    </div>
    <div class="summary-card pct-card">
        <div class="num">{pct:.0f}%</div>
        <div class="lbl">Pass Rate</div>
    </div>
</div>

{''.join(rows_html)}
"""

    Path(output_path).write_text(html, encoding="utf-8")
    return output_path


# ── Main ─────────────────────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(description="GrabonGPT Integration Tests")
    parser.add_argument("--base-url", default="http://localhost:8743", help="Backend base URL")
    parser.add_argument("--report", action="store_true", help="Generate HTML report")
    parser.add_argument("--report-path", default="test_report.html", help="Report output path")
    args = parser.parse_args()

    print(f"\n  GrabonGPT Integration Tests")
    print(f"  Target: {args.base_url}")
    print(f"  Tests:  {len(TESTS)}\n")

    results = await run_tests(args.base_url)

    passed = sum(1 for r in results if r.passed)
    failed = len(results) - passed
    print(f"\n  {'─' * 50}")
    print(f"  Results: \033[32m{passed} passed\033[0m, \033[31m{failed} failed\033[0m / {len(results)} total")

    if args.report:
        path = generate_report(results, args.report_path)
        print(f"  Report:  {path}")

    print()
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
