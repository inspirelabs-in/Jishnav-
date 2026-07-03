"""
Web search fallback via SearXNG (self-hosted metasearch engine).
Called only when DB returns zero results and user explicitly confirms.
"""

import logging
import httpx

import config

log = logging.getLogger(__name__)


async def search_web(category: str) -> list[dict]:
    """
    Query SearXNG and return up to 10 results as
    [{"title": ..., "url": ..., "content": ...}, ...]
    Returns empty list on any failure.
    """
    query = f"{category} coupon code working 2026"
    params = {
        "q":          query,
        "format":     "json",
        "categories": "general",
    }

    try:
        async with httpx.AsyncClient(timeout=config.SEARXNG_TIMEOUT_SECONDS) as client:
            resp = await client.get(f"{config.SEARXNG_URL}/search", params=params)
            resp.raise_for_status()
            data = resp.json()

        results = []
        for r in data.get("results", [])[:10]:
            results.append({
                "title":   r.get("title", ""),
                "url":     r.get("url", ""),
                "content": r.get("content", ""),
            })
        log.info("SearXNG returned %d results for %r", len(results), category)
        return results

    except Exception as e:
        log.error("SearXNG search failed: %s", e)
        return []
