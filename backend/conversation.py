"""
Per-session conversation history backed by PostgreSQL.
"""

import time
import logging
import uuid
from dataclasses import dataclass, field
import postgres_db

log = logging.getLogger(__name__)


@dataclass
class Message:
    role: str          # "user" | "assistant"
    content: str
    matched_vertical_ids: list[int]  = field(default_factory=list)
    store_ids: list[int]             = field(default_factory=list)
    coupon_count: int                = 0
    was_narrowing: bool              = False   # True if assistant asked a clarifying question
    pending_offer: str               = ""      # what the assistant offered ("hotel coupons", etc.)
    min_discount: float | None       = None    # carried from user's original query through clarification
    timestamp: float                 = field(default_factory=time.time)
    coupons: list[dict]              = field(default_factory=list)


async def get_history(session_id: str) -> list[Message]:
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        log.warning("Invalid UUID for get_history: %s", session_id)
        return []
    
    rows = await postgres_db.get_messages(session_uuid)
    messages = []
    for r in rows:
        meta = r["metadata"] or {}
        if isinstance(meta, str):
            import json
            meta = json.loads(meta)
        messages.append(Message(

            role=r["role"],
            content=r["content"],
            matched_vertical_ids=meta.get("matched_vertical_ids", []),
            store_ids=meta.get("store_ids", []),
            coupon_count=meta.get("coupon_count", 0),
            was_narrowing=meta.get("was_narrowing", False),
            pending_offer=meta.get("pending_offer", ""),
            min_discount=meta.get("min_discount"),
            timestamp=meta.get("timestamp", r["created_at"].timestamp()),
            coupons=meta.get("coupons", [])
        ))
    return messages


async def add_message(session_id: str, msg: Message) -> None:
    try:
        session_uuid = uuid.UUID(session_id)
    except ValueError:
        log.warning("Invalid UUID for add_message: %s", session_id)
        return
        
    message_uuid = uuid.uuid4()
    metadata = {
        "matched_vertical_ids": msg.matched_vertical_ids,
        "store_ids": msg.store_ids,
        "coupon_count": msg.coupon_count,
        "was_narrowing": msg.was_narrowing,
        "pending_offer": msg.pending_offer,
        "min_discount": msg.min_discount,
        "timestamp": msg.timestamp,
        "coupons": msg.coupons
    }
    
    await postgres_db.add_message(message_uuid, session_uuid, msg.role, msg.content, metadata)
    await postgres_db.update_session_timestamp(session_uuid)


async def last_assistant_message(session_id: str) -> Message | None:
    history = await get_history(session_id)
    for m in reversed(history):
        if m.role == "assistant":
            return m
    return None


async def clear(session_id: str) -> None:
    # No-op since database does not need eviction
    pass


def start_eviction_loop() -> None:
    # No-op since database does not need eviction
    pass
