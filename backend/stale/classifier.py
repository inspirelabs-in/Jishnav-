"""
Level 1: classify user query into matching vertical IDs.
Uses embedding search + keyword fallback map. No LLM call.
"""

import logging
import re
from pathlib import Path

import yaml

import config
import embedding_index

log = logging.getLogger(__name__)

_keyword_map: dict[str, list[str]] = {}   # normalised_term → [vertical_name, ...]
_name_to_ids: dict[str, list[int]] = {}   # vertical_name (lower) → [vertical_id, ...]


def _load_keyword_map() -> None:
    global _keyword_map
    with open(config.KEYWORD_MAP_FILE) as f:
        data = yaml.safe_load(f)
    raw = data.get("keywords", {})
    _keyword_map = {k.lower(): v for k, v in raw.items()}


def _build_name_to_ids() -> None:
    global _name_to_ids
    ids   = embedding_index._vertical_ids
    names = embedding_index._vertical_names
    m: dict[str, list[int]] = {}
    for vid, vname in zip(ids, names):
        key = vname.lower()
        m.setdefault(key, []).append(vid)
    _name_to_ids = m


def init() -> None:
    _load_keyword_map()
    _build_name_to_ids()
    log.info("Classifier ready: %d keyword entries", len(_keyword_map))


def _resolve_name(vname: str) -> list[int]:
    key = vname.lower()
    if key in _name_to_ids:
        return _name_to_ids[key]
    # Partial match fallback
    for k, ids in _name_to_ids.items():
        if key in k or k in key:
            return ids
    return []


def classify(query: str) -> tuple[list[tuple[int, str, float]], bool]:
    """
    Returns:
      (matches, used_keyword_fallback)
      matches: [(vertical_id, vertical_name, score), ...]
    """
    # ── Embedding search ───────────────────────────────────────────────────────
    embedding_hits = embedding_index.search(query)
    seen: dict[int, tuple[str, float]] = {vid: (vname, score) for vid, vname, score in embedding_hits}

    # ── Keyword fallback ───────────────────────────────────────────────────────
    used_kw = False
    tokens = re.split(r"[\s,;.!?]+", query.lower())
    tokens += [query.lower()]   # also try full query as a key

    for token in tokens:
        token = token.strip()
        if token in _keyword_map:
            for vname in _keyword_map[token]:
                for vid in _resolve_name(vname):
                    if vid not in seen:
                        # keyword match = explicit intent signal, treat as confident
                        seen[vid] = (vname, 0.75)
                        used_kw = True

    # ── Sort by score ──────────────────────────────────────────────────────────
    merged = [(vid, vname, score) for vid, (vname, score) in seen.items()]
    merged.sort(key=lambda x: x[2], reverse=True)

    return merged, used_kw
