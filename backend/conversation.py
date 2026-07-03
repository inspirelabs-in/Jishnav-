"""
Per-session conversation history (in-memory, no persistence).
Expires sessions after SESSION_TIMEOUT_MINUTES of inactivity.
"""

import threading
import time
import logging
from dataclasses import dataclass, field

import config

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


@dataclass
class Session:
    messages: list[Message] = field(default_factory=list)
    last_active: float      = field(default_factory=time.time)


_sessions: dict[str, Session] = {}
_lock = threading.Lock()


def _touch(session_id: str) -> Session:
    with _lock:
        if session_id not in _sessions:
            _sessions[session_id] = Session()
        s = _sessions[session_id]
        s.last_active = time.time()
        return s


def get_history(session_id: str) -> list[Message]:
    s = _touch(session_id)
    return list(s.messages)


def add_message(session_id: str, msg: Message) -> None:
    s = _touch(session_id)
    with _lock:
        s.messages.append(msg)
        if len(s.messages) > config.MAX_CONVERSATION_TURNS * 2:
            s.messages = s.messages[-(config.MAX_CONVERSATION_TURNS * 2):]


def last_assistant_message(session_id: str) -> Message | None:
    history = get_history(session_id)
    for m in reversed(history):
        if m.role == "assistant":
            return m
    return None


def clear(session_id: str) -> None:
    with _lock:
        _sessions.pop(session_id, None)


def _evict_loop() -> None:
    timeout = config.SESSION_TIMEOUT_MINUTES * 60
    while True:
        time.sleep(300)
        now = time.time()
        with _lock:
            dead = [sid for sid, s in _sessions.items() if now - s.last_active > timeout]
            for sid in dead:
                del _sessions[sid]
        if dead:
            log.debug("Evicted %d expired sessions", len(dead))


def start_eviction_loop() -> None:
    t = threading.Thread(target=_evict_loop, daemon=True)
    t.start()
