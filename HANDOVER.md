# CR Portal — Handover

A full brain-dump for the next session. Read this top to bottom before touching anything.

---

## 1. What this project is

**CR Portal** is an internal web app for **GrabOn**'s customer-handling (CS) team. It replaces the
Excel sheets they used to enter, view, filter, and analyse merchant (brand) performance data.
"CR" = the conversion funnel they track: **Clicks → Sales → CR% → GMV → Revenue**.

Branding: the header shows **GrabOn** (company, small eyebrow) with **CR Portal** as the bold hero
wordmark. Colours are GrabOn navy + a lime accent.

There is **no login yet**. Users are hard-coded and switched via an "acting as" dropdown in the
header. Real auth is **v1** (see §12).

---

## 2. Tech stack & layout

```
cr_portal/
  backend/            FastAPI + SQLAlchemy + SQLite (Python)
    .venv/            virtualenv (python 3.13)
    app/
      main.py         all API routes + non-destructive migrations
      models.py       SQLAlchemy models (5 tables)
      database.py     engine/session (SQLite file: backend/cr_portal.db)
      notifications.py overdue-detection + escalation logic
      seed.py         WIPES + reseeds mock data (32 merchants)
      utils.py        merchant_url() slug helper
    export_excel.py   dumps the DB to CR_Portal_Mock_Data.xlsx (project root)
  frontend/           React + TypeScript + Vite, Recharts for charts
    src/
      App.tsx, main.tsx, styles.css, api.ts, types.ts, csv.ts, Toast.tsx
      components/     one file per tab/widget (see §8)
  .claude/
    skills/interface-design/   installed craft-first UI design skill
    launch.json                preview dev-server config (name: "frontend", port 5173)
  HANDOVER.md         this file
  README.md           run instructions (keep in sync)
```

Fonts: **Archivo** (UI text) + **IBM Plex Mono** (all numbers), bundled locally via
`@fontsource/*` (imported in `main.tsx`) — no CDN.

---

## 3. How to run (two terminals)

**Backend (port 8000):**
```powershell
cd C:\Users\Jishnav\Documents\projects\cr_portal\backend
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir app
```
`--reload-dir app` is **mandatory** — without it uvicorn watches `.venv` too, so any `pip install`
fires a reload storm that kills the server.

**Frontend (port 5173, proxies `/api` → 8000):**
```powershell
cd C:\Users\Jishnav\Documents\projects\cr_portal\frontend
npm run dev
```
Open http://localhost:5173.

**Reseed (WIPES all data):** `cd backend; .venv\Scripts\python -m app.seed`
**Excel snapshot:** `cd backend; .venv\Scripts\python export_excel.py`
**Typecheck:** `cd frontend; npx tsc --noEmit`

The migrations are **non-destructive** (`_run_migrations()` in `main.py` ALTERs tables to add new
columns and backfills). So schema changes do **not** require a reseed — hand-entered test data
survives. Only `app.seed` wipes the DB.

---

## 4. ENVIRONMENT GOTCHAS (these cost hours — read carefully)

1. **Zombie uvicorn workers.** Killing the process on port 8000 often leaves orphaned
   `multiprocessing.spawn` reload-worker children alive. They keep **serving stale code**, and a
   freshly started uvicorn then **fails to bind** (exit 1) because the port is held — so your code
   changes silently don't take effect. Symptom: a backend change (new query param, new field) has
   no effect even after "restart". **Fix:**
   ```powershell
   Get-CimInstance Win32_Process -Filter "Name='python.exe'" |
     Where-Object { $_.CommandLine -like '*uvicorn*' -or $_.CommandLine -like '*multiprocessing*' } |
     ForEach-Object { taskkill /F /PID $_.ProcessId }
   # confirm port free, THEN start uvicorn
   Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
   ```
2. **An unrelated `python main.py` app** binds `0.0.0.0:8000` on this machine (started via nohup on
   an earlier date). It answers **404 on every `/api/*`**. Our server binds `127.0.0.1` specifically,
   which wins for localhost while ours is alive. **Do not kill it** — it isn't part of CR Portal.
   If the UI shows no data, check http://127.0.0.1:8000/api/merchants: JSON = our backend is up;
   404 = our backend is down and you're hitting that other app.
3. **Preview browser animation clock is PAUSED** when the tab is backgrounded (the `mcp__Claude_Browser`
   pane). CSS `transition`/`@keyframes` on `transform` **freeze at their start frame** in the preview,
   so e.g. the notification drawer looks stuck off-screen there. It animates fine in the user's real
   foreground browser. The drawer's correctness does **not** depend on the transition — its transform
   is driven by an **inline style** (`open ? translateX(0) : translateX(100%)`). To measure/verify
   layout in the preview, inject `.notif-drawer{transition:none!important}` first.
4. **Stale console errors.** The preview console buffer holds ~4 old `NotificationBell` React errors
   whose module URLs carry old HMR timestamps (`...NotificationBell.tsx?t=1784534824756`). They are
   from mid-edit hot-reloads, **do not clear on navigate**, stay at a fixed count, and do NOT reflect
   current code. To check for *real* errors, attach a fresh `window.addEventListener('error', …)` and
   exercise the app; that has consistently caught **zero**.
5. **Screenshots time out** (`mcp__Claude_Browser__computer` `screenshot`). Verify via `javascript_tool`
   DOM inspection (computed styles, getBoundingClientRect) instead.
6. **UI automation flakiness:** the merchant autocomplete needs the input `focus()`ed before typing,
   or the dropdown/no-match state won't appear. Long chained `javascript_tool` scripts that open the
   edit-history modal sometimes hit the 30s tool timeout even though the modal is fine — run such
   checks in small steps.

---

## 5. Hard product rules (do not regress)

- **No em-dashes / en-dashes anywhere** in the app (user requirement). Use `-` or rephrase. Grep
  `—|–` over `frontend/src` should return nothing.
- **Numbers in IBM Plex Mono**, words in Archivo. Money is Indian notation: **₹ Lakh (L) / Crore (Cr)**
  (`formatMoney`). Timestamps are **24h "railway"** (`formatRailwayTime`, e.g. `20 Jul 2026, 14:04`).
- **Every list shows the latest/first 10 by default**, with a `<MoreNote>` ("Showing the latest 10 of
  N…"); a search or filter reveals the full set. Applies to: Entry Logs, Dashboard merchants,
  Dashboard Change history, Delivery history, Brand Transfer merchants, Transfer history.
- **`entry_date` ≠ `created_at`.** `entry_date` is the day the data is *for* (user-chosen, editable);
  `created_at` is when the row was saved (auto). They differ on back-fills. `entry_month`/`entry_year`
  are derived stored columns kept in step with `entry_date`.

---

## 6. Database schema (SQLite: `backend/cr_portal.db`)

Everything hangs off **`merchants`** via `merchant_id`.

### `merchants` — brand master (Table 1)
`merchant_id` (PK) · `merchant_name` (unique) · `breadcrumb1` + `breadcrumb1_name` (category) ·
`breadcrumb2` + `breadcrumb2_name` (sub-category) · `affiliate_id` + `affiliate_name` · `url`
(storefront, auto-derived) · `reporting` (Live daily / 2-week / 3-week / Weekly / Monthly / 60 days /
90 days) · `payout` · `deal_type` (Coupon / Link / Coupon and Link based) · `revenue_status`
(Revenue / Non-revenue) · `owner` (the handler).

### `entries` — performance data (Table 2, what handlers type)
`id` (PK) · `merchant_id` (FK) · `entry_date` · `entry_month` · `entry_year` · `clicks` · `sales` ·
`cr` (auto = sales/clicks*100) · `gmv` · `revenue` · `remarks` · `revenue_status` · `entered_by` ·
`created_at` · `updated_at` ·
**delivery block:** `delivery_requested` (bool) · `d_clicks` · `d_sales` · `d_cr` · `d_gmv` ·
`d_revenue` · `delivery_filled_by` · `delivery_filled_at`.

### `edit_logs` — audit of edits to entries
`id` · `entry_id` (FK) · `merchant_id` · `merchant_name` · `edited_by` · `edited_at` ·
`changes` (JSON string: `{"clicks":{"old":100,"new":120}, ...}`).

### `notifications` — overdue reminders with escalation
`id` · `merchant_id` · `merchant_name` · `user` (recipient = the handler/owner) · `message` ·
`period_label` (e.g. "since Jul 2026") · `reason` · `status`
(pending → reason_submitted → approved | rejected ; `resolved` = data was entered) ·
`escalation_level` (1 handler, 2 +manager, 3+ +founders) · `created_at` · `updated_at`.

### `transfers` — brand reassignment log
`id` · `merchant_id` · `merchant_name` · `from_handler` · `to_handler` · `transferred_by` ·
`transferred_at`.

### Users/roles — NOT a table yet (hard-coded)
Handlers `Swati, Yamini, Meena` · `Manager` · `Founders Office` · `Delivery`.
`USERS`/`HANDLERS`/role helpers live in `frontend/src/types.ts` and mirror constants in `main.py`.

---

## 7. Backend API (all under `/api`)

- `GET /merchants/search?q=` — typeahead (used by EntryForm).
- `GET /merchants?owner=` — list, optional owner filter. Returns `url` + all fields.
- `GET /categories` — distinct `breadcrumb1_name`.
- `GET /handlers` — HANDLERS list.
- `POST /merchants` — create. `merchant_id` optional (validates uniqueness, auto-generates if blank);
  auto-sets `url` via `merchant_url()`.
- `POST /entries` — create. Enforces: non-rev parking guard (409 if already non-rev), revenue fields
  mandatory when Revenue, sets `delivery_requested`, syncs `merchant.revenue_status`, resolves open
  notifications for that merchant.
- `GET /entries?merchant=&handler=&date_from=&date_to=&limit=` — list; computes `is_comeback` per row
  from each merchant's full history (not just the page).
- `PUT /entries/{id}` — edit; writes an `edit_logs` row with the diff; recomputes `cr`.
- `GET /delivery-requests?status=pending|done` — delivery queue; **includes merchant details**
  (breadcrumb names, reporting, payout, deal_type, owner, url) so the delivery view can show the full
  record. `pending` = `delivery_requested` and `d_clicks IS NULL`.
- `POST /entries/{id}/delivery` — fills the `d_*` columns + `delivery_filled_by/at`, computes `d_cr`.
- `GET /status-history?owner=&merchant=` — Revenue↔Non-revenue transitions derived from the entries
  timeline.
- `GET /edit-logs?owner=&edited_by=&merchant=&limit=` — edit logs with filters (`edited_by` scopes to a
  handler; `owner` scopes to merchants that handler currently owns).
- `GET /notifications?user=` — role-based visibility (see §9).
- `POST /notifications/{id}/reason` — handler submits a reason.
- `POST /notifications/{id}/approve` — Manager/Founders approve → status `approved`, case closed forever.
- `POST /notifications/{id}/reject` — status `rejected`; escalation continues.
- `POST /transfers` — reassign `merchant.owner`; logs a transfer; moves that merchant's OPEN
  notifications to the new owner.
- `GET /transfers` — transfer history (newest first).
- `GET /analytics?mode=&brands=&categories=&owner=&date_from=&date_to=` — modes below.

---

## 8. Frontend components (`frontend/src/components/`)

- **App.tsx** — header (brand, tabs, `NotificationBell`, acting-as `<select>`). Tabs depend on role:
  handlers/others → `Data Entry, Analytics, Dashboard`; +`Brand Transfer` for Manager/Founders;
  **Delivery** user sees ONLY `Delivery Queue`.
- **DataEntryTab** — `EntryForm` (or `AddMerchantForm` when the searched merchant doesn't exist) +
  **Entry Logs** table (inline edit, filters: merchant text / handler / `PeriodPicker` month-year /
  CSV export / "View edit logs" → `EditHistoryModal`). Non-rev rows are red with a single spanning
  "Non-revenue" banner; the first Revenue-after-non-rev row is green ("Back to revenue").
- **EntryForm** — merchant autocomplete, date, Revenue/Non-revenue toggle, 5 metric inputs (CR auto),
  remarks + Save on one row, **"Delivery team data" toggle** (sets `delivery_requested`). Compact grid
  layout; merchant info strip (ID, Category, Sub, Reporting badge, Payout, Deal, Owner).
- **AddMerchantForm** — Merchant ID (optional, "Auto if blank") + name + breadcrumb **names only**
  (IDs default 0) + affiliate + reporting/deal/payout/revenue-status.
- **TokenAutocomplete** — combobox with **inline chips inside the field**; single or multi (compare);
  full keyboard nav; `multiHint` when typing a 2nd value with compare off.
- **PeriodPicker** — the "All time" button that opens a year-tabs + 3-column month grid. Used by Entry
  Logs, Notification drawer, Dashboard change history, Delivery history, Edit-history modal.
- **AnalyticsTab / AnalyticsPanel** — see §10.
- **NotificationBell** — **right-side slide-in drawer** (portaled to body). Search (merchant/handler) +
  `PeriodPicker`. Cards show full message, handler avatar, escalation level, status, reason, and the
  submit/approve/reject actions per role. Badge = unseen open cases; opening marks seen (localStorage).
- **EditHistoryModal** — respects the Entry Logs handler filter (`edited_by`), shows latest 10, has
  merchant search + `PeriodPicker`.
- **DashboardTab** — merchants table (URL link, Revenue/Non-rev chip, deal, payout, reporting, owner
  avatar) + handler dropdown (privileged) + search + CSV. Below: **one unified "Change history" table**
  merging entry edits AND status flips (Type chip Edit/Status), with search + `PeriodPicker` + CSV.
- **BrandTransferTab** — search + handler filter; per-row **"Choose a handler…" dropdown** (full names,
  excludes current owner) → "Move to X? Confirm/Cancel" → transfer; **Transfer history timeline**
  (from-avatar → to-avatar).
- **DeliveryTab** — master-detail queue (**auto-selects first** request so it's never blank). Detail =
  single-line merchant strip + read-only CS metrics + delivery inputs (aligned 5-col grid) + **Save**.
  Below: **Delivery history** table (CS vs Delivery numbers side-by-side) with search + `PeriodPicker`.
- **Icons.tsx** — `HandlerAvatar` (initial tinted by `handlerColor`), `ReportingBadge`, `DownloadIcon`,
  `ExternalLinkIcon`, `MoreNote` (the "showing 10 of N" hint).
- **Toast.tsx** — toast provider, `role=status/alert` + `aria-live`.

`api.ts` has all fetch wrappers + formatters (`formatNumber`, `formatMoney`, `formatRailwayTime`,
`formatDate`, `deltaPct`). `csv.ts` = `downloadCsv`. `types.ts` = interfaces + role helpers +
`HANDLER_COLORS` + `METRICS`/`CR_COLOR`/`CHART_CHROME`.

---

## 9. Notification escalation (the tricky business logic)

- **One case-row per missed (merchant, period).** `refresh_notifications()` (in `notifications.py`)
  runs on every `GET /notifications`. For each **Revenue** merchant, it compares the latest entry date
  to the reporting interval; `escalation_level = max(1, days_overdue // interval)`.
- **Recipients by level:** L1 → handler only · L2 → handler + Manager · L3+ → handler + Manager +
  Founders Office.
- **Visibility (`GET /notifications?user=`):** a handler sees rows where `user == them`; **Manager**
  sees `escalation_level >= 2` OR any `reason_submitted` (so they can approve early reasons);
  **Founders** sees `escalation_level >= 3`.
- **Flow:** handler submits a `reason` → Manager or Founders **Approve** (status `approved`, case closed
  forever, never re-created) or **Reject** (`rejected`, escalation keeps climbing). Entering data
  resolves the case (`resolved`).
- **Non-revenue merchants are never chased.** Saving a Non-revenue entry resolves open cases and no new
  ones are created until it returns to Revenue.
- A **transferred** merchant's open cases follow to the new owner.
- Frontend badge shows count of unseen open cases; drawer separates "Needs your action" from "History".

---

## 10. Analytics

- **Default (no mode):** a single **overview graph** = the acting handler's **average across all their
  brands** (Manager/Founders → average across everyone). Averaging divides summed metrics by the
  merchant count (`averaged_over`).
- Two mode chips: **Brand** and **Category**. Under each input is a **Compare toggle**.
  - Brand, compare off → one brand's **trend graph**. Compare on → **animated ranking table** of brands.
  - Category → **ranking table** of the brands in that category (+ Handler owner filter). Compare on →
    compare multiple categories.
- Selected brands/categories show as **inline chips inside the input**. Global date-range picker.
- KPI tiles (Clicks/Sales/GMV/Revenue) double as **metric toggles** and show period-over-period deltas.
  With multiple metrics the chart normalises each line to % of its own peak (single axis); tooltips
  always show real values. Comparison tables have per-column data bars, rank badges, sortable columns,
  CSV export. Backend `mode` values: `overview`, `brand`, `brand_comparison`, `category`,
  `category_comparison`.

---

## 11. Design system (`styles.css`)

White ground; ink navy `--navy #14213d`; **one accent, lime `--lime #c6d92d`, meaning
"recorded / active / you are here"** (tab underline, checkmarks, toast edge, comeback rows).
Borders-only depth — **shadows only on floating layers** (dropdown, modal, drawer, toast). 4px grid,
36px standard control height, uppercase 10px letter-spaced labels. Metric data colours
(blue/green/orange/purple) are data, not decoration. Respects `prefers-reduced-motion`.
A craft-first **`interface-design` skill** is installed at `.claude/skills/interface-design/`
(loads in new sessions; triggers on UI work).

---

## 12. What's next — v1: auth / login

Add a **`users` table** (`id, name, email, password_hash, role`) and real login. Then replace the
name-string fields (`merchants.owner`, `entries.entered_by`, `notifications.user`,
`transfers.*_handler`, `delivery_filled_by`) with user IDs, and derive tab visibility + edit rights
from the logged-in user's role instead of the acting-as dropdown. The role model already exists in the
UI (`isPrivileged`, `isHandler`, `isDelivery`), so it's mostly wiring auth in front of it.

Other backlog ideas mentioned by the user: importing existing Excel history (one-time bulk load);
pulling clicks/sales from an affiliate feed instead of manual entry.

---

## 13. Current test-data state (not pristine — created while verifying)

- 32 merchants, ~1370+ entries (seeded 180 days of history per merchant).
- **Overdue-on-purpose** for the notification demo: Nike (Swati), 1mglabs, 12Go (Yamini).
- **BigBasket** has a Revenue → Non-revenue → Revenue cycle (comeback demo).
- **MakeMyTrip** is currently **Non-revenue** (parking demo).
- Demo **edit logs**: 11 Wickets (Swati), 1 gram jewellery (Meena), 10Kya (Yamini), MakeMyTrip (Meena).
- Some **delivery** entries filled (Crocs, 10Web, 12Go) — visible in Delivery history.
- A few **transfers** in history. `1 gram jewellery` owner was toggled during testing and **restored to
  Meena**.
- Reseed with `python -m app.seed` for a clean slate (wipes everything, including hand-entered rows).

---

## 14. Verification checklist for changes

1. `cd frontend; npx tsc --noEmit` → clean.
2. Backend: after editing, **kill zombies** (§4.1), confirm port free, restart, hit the endpoint with
   PowerShell `Invoke-WebRequest` to confirm new behaviour before trusting the UI.
3. Frontend: reload the preview, inspect via `javascript_tool` (screenshots are broken). For the
   notification drawer, inject `.notif-drawer{transition:none!important}` to measure.
4. Console: ignore the ~4 stale `NotificationBell` HMR errors; attach a fresh `error` listener to catch
   real ones.
5. No em-dashes; check alignment (the user cares a lot about alignment) and no horizontal overflow.
6. Keep `README.md` in step for run instructions.

---

## 15. Memory

Persistent memory dir:
`C:\Users\Jishnav\.claude\projects\C--Users-Jishnav-Documents-projects-cr-portal\memory\`
with `MEMORY.md` as the loaded index. There's an existing `cr-portal-project.md` memory. This
HANDOVER.md is the fuller, code-level source of truth — prefer it, and update memory pointers if you
add durable facts.
