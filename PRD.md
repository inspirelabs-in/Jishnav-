# GrabonGPT - Product Requirements Document

## What is GrabonGPT?

GrabonGPT is an AI-powered coupon assistant for [GrabOn.in](https://www.grabon.in), India's leading coupon and deals platform. Instead of browsing through hundreds of store pages, users simply ask in natural language - "Zomato coupons", "best flight deals above 30%", "iPhone offers" - and the assistant instantly retrieves, ranks, and presents the most relevant coupon codes in a streaming chat interface.

It handles the full spectrum of coupon discovery: direct store lookups, category browsing, brand-specific searches, location-aware queries, multi-store comparisons, and follow-up conversations with context retention.

---

## Core Features

| Feature | Description |
|---|---|
| **Natural Language Search** | Ask for coupons in plain language. Handles typos, slang, Hindi-English mix. |
| **Smart Intent Detection** | Classifies queries into store matches, vertical/category matches, clarifications, affirmations, negations, and non-coupon intents. |
| **4-Tier Coupon Ranking** | Prioritises coupons: sitewide offers > LLM-judged relevance > synonym matches > best-discount catch-all. |
| **Streaming Responses** | Real-time SSE (Server-Sent Events) streaming - text appears word-by-word, coupons render as interactive cards. |
| **Copy & Reveal Flow** | Coupon codes are masked. Clicking "Get Code" copies to clipboard, opens the store in a new tab, and reveals the full code. |
| **Cross-Sell Suggestions** | After showing coupons, suggests related product categories on the same store ("Also on Myntra: Shoes, Electronics"). |
| **Conversation Context** | Multi-turn conversations with memory. "Show me hotels" after discussing "Bali trip" carries the location forward. |
| **Brand Filtering** | Searches for brands not in the store index by scanning coupon names across all stores (e.g. "KFC" found via PhonePe/Nearbuy coupons). |
| **New User Detection** | Detects "first order", "new user" queries and filters for first-time-user coupons. |
| **Discount Filtering** | Extracts minimum discount thresholds ("above 40%") and carries them through clarification flows. |
| **Guest & Authenticated Access** | Guests get 4 free messages. Authenticated users get full access with persistent chat history. |
| **Chat History** | All conversations are saved and can be revisited from the sidebar. |

---

## Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| **React 18** | UI framework |
| **TypeScript** | Type safety |
| **Vite 6** | Build tool and dev server |
| **Tailwind CSS 3** | Utility-first styling |
| **SSE (EventSource)** | Real-time streaming from backend |

### Backend

| Technology | Purpose |
|---|---|
| **Python 3.11+** | Backend language |
| **FastAPI** | Async web framework with SSE streaming |
| **Uvicorn** | ASGI server |
| **gpt-4o-mini** (OpenAI) | Intent classification, coupon ranking, response generation, cross-sell suggestions |
| **Ollama** (optional) | Local LLM inference (Qwen 2.5 3B) for response generation as an alternative to OpenAI |
| **pyodbc** | SQL Server connectivity (coupon/store data) |
| **asyncpg** | PostgreSQL async driver (chat sessions, messages) |
| **httpx** | Async HTTP client for auth endpoints |

### Databases

| Database | Role |
|---|---|
| **SQL Server** | Primary data source (read-only). Stores the coupon catalog (`dbo.Coupon`) and store/category hierarchy (`dbo.Category`). Shared with the main GrabOn platform. |
| **PostgreSQL** | Application state. Stores guest sessions, chat sessions, and chat message history with metadata. |

### Infrastructure

| Component | Detail |
|---|---|
| **In-Memory Cache** | Bottom-up cache built at startup from SQL Server. Maps verticals to stores, stores to coupons, and keywords to store IDs. Auto-refreshes periodically. |
| **Store Index** | In-memory fuzzy search index for store/brand name resolution. Handles aliases, alternate names, and typo correction. |

---

## Architecture

```
                          +-----------+
                          |  Frontend |
                          |  React+TS |
                          +-----+-----+
                                |
                          POST /api/chat
                          (SSE stream)
                                |
                          +-----v-----+
                          |  FastAPI   |
                          |  Backend   |
                          +-----+-----+
                                |
              +-----------------+-----------------+
              |                 |                 |
        +-----v-----+   +------v------+   +------v------+
        |   Query    |   |   In-Memory |   | Conversation|
        |   Router   |   |    Cache    |   |   (Postgres)|
        +-----+------+   +------+------+   +-------------+
              |                  |
        +-----v------+   +------v------+
        | Vertical   |   |  Retriever  |
        | Classifier |   | (SQL Server)|
        | (gpt-4o-m) |   +------+------+
        +------------+          |
                          +-----v-----+
                          | Responder |
                          | (LLM +    |
                          |  Streaming)|
                          +-----------+
```

### Request Flow

1. **User sends a message** via the React frontend.
2. **FastAPI** receives the POST request and opens an SSE stream.
3. **Query Router** calls gpt-4o-mini to classify intent (coupon search, affirmation, negation, non-coupon, etc.) and extract store names, verticals, discount thresholds, and location keywords.
4. **Store Index** resolves brand/store names to store IDs. If not found, the keyword index checks if the brand appears in coupon names across other stores.
5. **Retriever** fetches coupons from the in-memory cache (backed by SQL Server) filtered by store IDs or vertical IDs.
6. **Coupon Tiers** applies 4-tier priority selection: sitewide, LLM-judged relevant, synonym match, best-discount fallback.
7. **Responder** generates a natural language response via LLM streaming while the selected coupons are serialized and sent as a structured SSE event.
8. **Cross-sell** suggestions are fetched in parallel (async task) and sent after the main response.
9. **Conversation** is saved to PostgreSQL with full metadata (matched verticals, store IDs, coupons shown, pending offers).

### SSE Event Types

| Event | Payload | Purpose |
|---|---|---|
| `meta` | `{isCouponSearch: bool}` | Tells the frontend to show loading skeleton |
| `text` | `string` | Streamed LLM response text, word by word |
| `coupons` | `[{couponId, storeName, couponCode, ...}]` | Structured coupon data for card rendering |
| `cross_sell` | `{intro, suggestions: [{keyword, label}]}` | Cross-sell chip suggestions |
| `error` | `{message: string}` | Error messages |
| `done` | `{}` | Stream complete |

---

## Project Structure

```
Jishnav-/
├── backend/
│   ├── main.py                  # FastAPI app, all endpoints, SSE streaming
│   ├── config.py                # Environment-based configuration
│   ├── db.py                    # SQL Server connection pool
│   ├── postgres_db.py           # PostgreSQL for sessions/messages
│   ├── cache.py                 # In-memory coupon & store cache
│   ├── store_index.py           # Fuzzy store name lookup index
│   ├── vertical_classifier.py   # LLM-based intent & vertical classifier
│   ├── query_router.py          # Routes user messages to handlers
│   ├── retriever.py             # Fetches & filters coupons
│   ├── responder.py             # LLM response generation & streaming
│   ├── conversation.py          # Chat history management
│   ├── coupon_tiers.py          # 4-tier coupon ranking logic
│   ├── validity.py              # Coupon expiry/urgency calculation
│   ├── llm_logger.py            # LLM call logging to Excel
│   ├── llm/
│   │   ├── base.py              # Abstract LLM backend
│   │   ├── factory.py           # Singleton LLM provider factory
│   │   └── openai_backend.py    # OpenAI streaming implementation
│   ├── prompts/
│   │   ├── intent_classify.txt  # Intent classification prompt
│   │   ├── respond_openai.txt   # Coupon response prompt
│   │   ├── narrowing.txt        # Clarification question prompt
│   │   └── fallback_respond.txt # No-results / fallback prompt
│   ├── config/
│   │   ├── exclusions.yaml      # Excluded/merged vertical IDs
│   │   ├── settings.yaml        # Retrieval settings
│   │   └── widen_verticals.yaml # Vertical widening rules
│   ├── tests/
│   │   └── test_integration_chat.py  # 25-query integration test suite
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Root app component
│   │   ├── main.tsx             # React entry point
│   │   ├── index.css            # Global styles & animations
│   │   ├── types.ts             # TypeScript interfaces
│   │   ├── components/
│   │   │   ├── ChatWindow.tsx   # Main chat container
│   │   │   ├── MessageBubble.tsx# Message rendering + cross-sell chips
│   │   │   ├── CouponCard.tsx   # Coupon ticket cards with copy/reveal
│   │   │   ├── InputBar.tsx     # Chat input with send button
│   │   │   ├── Sidebar.tsx      # Chat history sidebar
│   │   │   ├── AuthModal.tsx    # Login/signup modal
│   │   │   └── CouponIcon.tsx   # Loading icon
│   │   ├── hooks/
│   │   │   ├── useChat.ts       # Chat state, SSE handling, history
│   │   │   └── useAuth.ts       # Authentication state
│   │   └── config/
│   │       └── auth.ts          # Auth configuration
│   ├── package.json
│   └── vite.config.ts
│
├── grabon_brand_asset/          # Brand assets (logos, etc.)
├── start.bat                    # Windows dev launcher
└── PRD.md                       # This document
```

---

## Authentication

| Mode | How It Works |
|---|---|
| **Guest** | Auto-assigned on first visit. Fingerprinted by IP + User-Agent hash. Limited to 4 messages. Expires after 7 days. |
| **Google OAuth** | Users sign in with Google. Session cookie (`grabon_session`) validated against GrabOn's auth service. |
| **Session Migration** | When a guest signs in, their chat history is migrated to the authenticated account. |

---

## Key Design Decisions

1. **LLM for classification, not embeddings.** An earlier version used embedding-based similarity for vertical matching. The current version uses gpt-4o-mini structured output for higher accuracy, especially with typos and ambiguous queries.

2. **In-memory cache over live queries.** Coupons and store mappings are loaded into memory at startup and refreshed periodically. This makes coupon lookups O(1) instead of hitting SQL Server on every request.

3. **SSE over WebSockets.** Server-Sent Events are simpler, unidirectional (server to client), and work through proxies and CDNs without special configuration. Each chat message is a single POST that returns an SSE stream.

4. **Dual database.** SQL Server is the source of truth for coupon data (shared with the main GrabOn platform). PostgreSQL is used for application-specific state (sessions, messages) because it's async-friendly and supports JSONB for flexible metadata storage.

5. **4-tier coupon ranking.** Instead of showing coupons in database order, a tiered system ensures sitewide offers (always applicable) come first, followed by LLM-judged relevance, then synonym matches, then best-discount fallback. This maximises the chance the top 3 coupons are useful.

6. **Parallel cross-sell.** Cross-sell LLM calls run as async tasks in parallel with the main response stream, so users don't see an extra 1-2 second delay after coupons load.
