import logging
import uuid
import json
import asyncpg
import config

log = logging.getLogger(__name__)

_pool = None

async def init_db():
    global _pool
    log.info("Initializing PostgreSQL database...")

    # Connect to default database 'postgres' to check/create the target database 'grabgpt'
    try:
        conn = await asyncpg.connect(
            host=config.POSTGRES_HOST,
            port=config.POSTGRES_PORT,
            database="postgres",
            user=config.POSTGRES_USER,
            password=config.POSTGRES_PASSWORD
        )
        try:
            exists = await conn.fetchval(
                "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)",
                config.POSTGRES_DB
            )
            if not exists:
                log.info("Database '%s' does not exist. Creating it...", config.POSTGRES_DB)
                # CREATE DATABASE cannot run inside a transaction
                await conn.execute(f'CREATE DATABASE "{config.POSTGRES_DB}"')
        finally:
            await conn.close()
    except Exception as e:
        log.warning("Could not check/create database '%s' automatically: %s", config.POSTGRES_DB, e)

    # Establish the connection pool to the actual target database
    _pool = await asyncpg.create_pool(
        host=config.POSTGRES_HOST,
        port=config.POSTGRES_PORT,
        database=config.POSTGRES_DB,
        user=config.POSTGRES_USER,
        password=config.POSTGRES_PASSWORD,
        min_size=2,
        max_size=10
    )

    # Create tables if they do not exist
    async with _pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS guest_sessions (
                guest_token VARCHAR PRIMARY KEY,
                fingerprint_hash VARCHAR NOT NULL,
                chat_count INT NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_sessions (
                session_id UUID PRIMARY KEY,
                user_id VARCHAR,
                guest_token VARCHAR REFERENCES guest_sessions(guest_token) ON DELETE SET NULL,
                title VARCHAR(255) NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """)

        await conn.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                message_id UUID PRIMARY KEY,
                session_id UUID REFERENCES chat_sessions(session_id) ON DELETE CASCADE,
                role VARCHAR(10) NOT NULL,
                content TEXT NOT NULL,
                metadata JSONB,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        """)

    log.info("PostgreSQL database initialization complete.")


# ── Guest Sessions CRUD ─────────────────────────────────────────────────────────

async def get_guest_session(guest_token: str):
    async with _pool.acquire() as conn:
        return await conn.fetchrow(
            "SELECT guest_token, fingerprint_hash, chat_count, created_at FROM guest_sessions WHERE guest_token = $1",
            guest_token
        )

async def get_guest_by_fingerprint(fingerprint_hash: str):
    async with _pool.acquire() as conn:
        # Check if unexpired guest session exists for fingerprint (within 7 days)
        row = await conn.fetchrow(
            """
            SELECT guest_token FROM guest_sessions
            WHERE fingerprint_hash = $1 AND created_at > now() - INTERVAL '7 days'
            LIMIT 1
            """,
            fingerprint_hash
        )
        return row["guest_token"] if row else None

async def create_guest_session(guest_token: str, fingerprint_hash: str):
    async with _pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO guest_sessions (guest_token, fingerprint_hash, chat_count) VALUES ($1, $2, 0)",
            guest_token, fingerprint_hash
        )

async def increment_guest_chat_count(guest_token: str):
    async with _pool.acquire() as conn:
        await conn.execute(
            "UPDATE guest_sessions SET chat_count = chat_count + 1 WHERE guest_token = $1",
            guest_token
        )

async def cleanup_old_guest_sessions():
    async with _pool.acquire() as conn:
        res = await conn.execute(
            "DELETE FROM guest_sessions WHERE created_at < now() - INTERVAL '7 days'"
        )
        log.info("Cleaned up expired guest sessions: %s", res)


# ── Chat Sessions & Messages CRUD ───────────────────────────────────────────────

async def ensure_session_exists(session_id: uuid.UUID, user_id: str | None, guest_token: str | None, title: str):
    async with _pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO chat_sessions (session_id, user_id, guest_token, title)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (session_id) DO UPDATE 
            SET updated_at = now(),
                user_id = COALESCE(chat_sessions.user_id, EXCLUDED.user_id),
                guest_token = COALESCE(chat_sessions.guest_token, EXCLUDED.guest_token)
            """,
            session_id, user_id, guest_token, title
        )

async def update_session_timestamp(session_id: uuid.UUID):
    async with _pool.acquire() as conn:
        await conn.execute(
            "UPDATE chat_sessions SET updated_at = now() WHERE session_id = $1",
            session_id
        )

async def get_messages(session_id: uuid.UUID):
    async with _pool.acquire() as conn:
        return await conn.fetch(
            "SELECT role, content, metadata, created_at FROM chat_messages WHERE session_id = $1 ORDER BY created_at ASC",
            session_id
        )

def serialise_coupon(c: dict) -> dict:
    if not isinstance(c, dict):
        return c

    # Map keys from either camelCase (already serialised) or PascalCase/UPPERCASE (raw DB)
    coupon_id = c.get("couponId") if "couponId" in c else c.get("CouponID")
    store_name = c.get("storeName") if "storeName" in c else c.get("StoreName", "")
    coupon_name = c.get("couponName") if "couponName" in c else c.get("CouponName", "")
    coupon_code = c.get("couponCode") if "couponCode" in c else (c.get("CouponCode") or "")
    coupon_url = c.get("couponUrl") if "couponUrl" in c else (c.get("CouponUrl") or c.get("CouponURL") or "")
    coupon_type_id = c.get("couponTypeId") if "couponTypeId" in c else c.get("CouponTypeID")

    discount = c.get("discount") if "discount" in c else c.get("Discount")
    if discount is not None:
        try:
            discount = float(discount)
        except (ValueError, TypeError):
            discount = 0.0
    else:
        discount = 0.0

    discount_display = c.get("discountDisplay") if "discountDisplay" in c else c.get("discount_display", "")

    min_order = c.get("minOrderAmount") if "minOrderAmount" in c else c.get("MinimumOrderAmount")
    if min_order is not None:
        try:
            min_order = float(min_order)
        except (ValueError, TypeError):
            min_order = None

    max_disc = c.get("maxDiscount") if "maxDiscount" in c else c.get("MaximumDiscount")
    if max_disc is not None:
        try:
            max_disc = float(max_disc)
        except (ValueError, TypeError):
            max_disc = None

    verified = bool(c.get("verified") if "verified" in c else c.get("Verified", False))
    exclusive = bool(c.get("exclusive") if "exclusive" in c else c.get("Exclusive", False))
    hot_offer = bool(c.get("hotOffer") if "hotOffer" in c else c.get("HotOffer", False))
    best_offer = bool(c.get("bestOffer") if "bestOffer" in c else c.get("BestOffer", False))
    for_existing = bool(c.get("forExistingUser") if "forExistingUser" in c else c.get("ForExistingUser", False))

    validity_label = c.get("validityLabel") if "validityLabel" in c else c.get("validity_label", "")
    validity_urgency = c.get("validityUrgency") if "validityUrgency" in c else c.get("validity_urgency", "valid")

    end_date = c.get("endDate") if "endDate" in c else c.get("EndDate")
    if end_date is not None:
        if hasattr(end_date, "isoformat"):
            end_date = end_date.isoformat()
        else:
            end_date = str(end_date)

    return {
        "couponId":         coupon_id,
        "storeName":        store_name,
        "couponName":       coupon_name,
        "couponCode":       coupon_code,
        "couponUrl":        coupon_url,
        "couponTypeId":     coupon_type_id,
        "discount":         discount,
        "discountDisplay":  discount_display,
        "minOrderAmount":   min_order,
        "maxDiscount":      max_disc,
        "verified":         verified,
        "exclusive":        exclusive,
        "hotOffer":         hot_offer,
        "bestOffer":        best_offer,
        "forExistingUser":  for_existing,
        "validityLabel":    validity_label,
        "validityUrgency":  validity_urgency,
        "endDate":          end_date,
    }


async def add_message(message_id: uuid.UUID, session_id: uuid.UUID, role: str, content: str, metadata: dict):
    import json
    if metadata and "coupons" in metadata and metadata["coupons"]:
        metadata = dict(metadata)
        metadata["coupons"] = [serialise_coupon(c) for c in metadata["coupons"]]
    async with _pool.acquire() as conn:
        await conn.execute(
            "INSERT INTO chat_messages (message_id, session_id, role, content, metadata) VALUES ($1, $2, $3, $4, $5::jsonb)",
            message_id, session_id, role, content, json.dumps(metadata)
        )




async def get_history_by_user(user_id: str):
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.session_id, s.title, s.created_at, 
                   m.message_id, m.role, m.content, m.metadata, m.created_at as msg_created_at
            FROM chat_sessions s
            LEFT JOIN chat_messages m ON s.session_id = m.session_id
            WHERE s.user_id = $1
            ORDER BY s.updated_at DESC, m.created_at ASC
            """,
            user_id
        )
        return _group_messages_by_session(rows)

async def get_history_by_guest(guest_token: str):
    async with _pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT s.session_id, s.title, s.created_at, 
                   m.message_id, m.role, m.content, m.metadata, m.created_at as msg_created_at
            FROM chat_sessions s
            LEFT JOIN chat_messages m ON s.session_id = m.session_id
            WHERE s.guest_token = $1
            ORDER BY s.updated_at DESC, m.created_at ASC
            """,
            guest_token
        )
        return _group_messages_by_session(rows)

def _group_messages_by_session(rows):
    sessions = {}
    ordered_ids = []
    for r in rows:
        sid = str(r["session_id"])
        if sid not in sessions:
            sessions[sid] = {
                "id": sid,
                "title": r["title"],
                "sessionId": sid,
                "timestamp": int(r["created_at"].timestamp() * 1000),
                "messages": []
            }
            ordered_ids.append(sid)
        
        if r["message_id"]:
            meta = r["metadata"]
            if isinstance(meta, str):
                meta = json.loads(meta)
            meta = meta or {}
            
            coupons = meta.get("coupons")
            if coupons:
                coupons = [serialise_coupon(c) for c in coupons]
            
            sessions[sid]["messages"].append({
                "id": str(r["message_id"]),
                "role": r["role"],
                "content": r["content"],
                "coupons": coupons,
                "isCouponSearch": meta.get("isCouponSearch", False)
            })
            
    return [sessions[sid] for sid in ordered_ids]

async def migrate_guest(guest_token: str, user_id: str):
    async with _pool.acquire() as conn:
        async with conn.transaction():
            # Update all chat_sessions matching guest_token to point to user_id
            await conn.execute(
                "UPDATE chat_sessions SET user_id = $1, guest_token = NULL WHERE guest_token = $2",
                user_id, guest_token
            )
            # Delete the guest token session
            await conn.execute(
                "DELETE FROM guest_sessions WHERE guest_token = $1",
                guest_token
            )


async def delete_session(session_id: uuid.UUID, user_id: str | None, guest_token: str | None):
    async with _pool.acquire() as conn:
        if user_id:
            await conn.execute(
                "DELETE FROM chat_sessions WHERE session_id = $1 AND user_id = $2",
                session_id, user_id
            )
        elif guest_token:
            await conn.execute(
                "DELETE FROM chat_sessions WHERE session_id = $1 AND guest_token = $2",
                session_id, guest_token
            )
