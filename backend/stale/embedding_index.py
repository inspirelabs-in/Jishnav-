"""
Vertical embedding index.
Encodes all active vertical CategoryNames into a numpy matrix at startup.
Query-time: encode user query, cosine similarity against matrix.
"""

import logging
import threading
from pathlib import Path

import numpy as np
import yaml

import config
import db

log = logging.getLogger(__name__)

_vertical_names: list[str] = []
_vertical_ids: list[int] = []
_embeddings: np.ndarray | None = None   # shape: (N, 384)
_model = None
_lock = threading.Lock()
_keyword_fallback: bool = False   # set True if model fails to load


def _load_exclusions() -> set[int]:
    with open(config.EXCLUSIONS_FILE) as f:
        data = yaml.safe_load(f)
    return set(data.get("excluded_vertical_ids", []))


def _load_merge_pairs() -> dict[int, int]:
    with open(config.EXCLUSIONS_FILE) as f:
        data = yaml.safe_load(f)
    merge = {}
    for p in data.get("vertical_merge_pairs", []):
        canonical = min(p["id_a"], p["id_b"])
        non_can   = max(p["id_a"], p["id_b"])
        merge[non_can] = canonical
    return merge


def _l2_norm(mat: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1, norms)
    return mat / norms


def build() -> None:
    global _model, _embeddings, _vertical_names, _vertical_ids, _keyword_fallback

    excluded = _load_exclusions()
    merge    = _load_merge_pairs()

    rows = db.query(f"""
        SELECT CategoryID, CategoryName
        FROM   {config.CATEGORIES_TABLE}
        WHERE  CategoryTypeID = 2
          AND  Status = 1
    """)

    # Filter junk entries and resolve duplicate IDs
    seen_canonical: set[int] = set()
    names, ids = [], []
    for r in rows:
        vid   = r["CategoryID"]
        vname = (r["CategoryName"] or "").strip()
        if not vname or vid in excluded:
            continue
        canonical = merge.get(vid, vid)
        if canonical in seen_canonical:
            continue
        seen_canonical.add(canonical)
        ids.append(canonical)
        names.append(vname)

    log.info("Loading embedding model: %s", config.EMBEDDING_MODEL)
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(config.EMBEDDING_MODEL)
        embeddings = model.encode(names, convert_to_numpy=True, show_progress_bar=False)
        embeddings = _l2_norm(embeddings)

        with _lock:
            _model           = model
            _vertical_names  = names
            _vertical_ids    = ids
            _embeddings      = embeddings
            _keyword_fallback = False

        log.info("Embedding index built: %d verticals, dim=%d", len(names), embeddings.shape[1])

    except Exception as e:
        log.warning("Embedding model failed to load (%s). Falling back to keyword-only classification.", e)
        with _lock:
            _vertical_names  = names
            _vertical_ids    = ids
            _embeddings      = None
            _keyword_fallback = True


def search(query: str) -> list[tuple[int, str, float]]:
    """
    Returns list of (vertical_id, vertical_name, similarity_score)
    sorted by score descending, above EMBEDDING_SIMILARITY_THRESHOLD.
    Returns empty list if embedding model is unavailable.
    """
    with _lock:
        if _embeddings is None or _model is None:
            return []
        model      = _model
        embeddings = _embeddings
        names      = _vertical_names
        ids        = _vertical_ids

    query_vec = model.encode([query], convert_to_numpy=True, show_progress_bar=False)
    query_vec = _l2_norm(query_vec)          # shape: (1, 384)
    scores    = (embeddings @ query_vec.T).flatten()  # cosine similarity

    threshold = config.EMBEDDING_SIMILARITY_THRESHOLD
    top_k     = config.EMBEDDING_TOP_K

    indices = np.argsort(scores)[::-1]
    results = []
    for i in indices[:top_k * 3]:            # check more, filter by threshold
        if scores[i] >= threshold:
            results.append((ids[i], names[i], float(scores[i])))
        if len(results) >= top_k:
            break

    return results


def max_score(query: str) -> float:
    hits = search(query)
    return hits[0][2] if hits else 0.0


def is_keyword_fallback() -> bool:
    with _lock:
        return _keyword_fallback
