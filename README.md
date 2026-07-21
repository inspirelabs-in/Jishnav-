# CR Portal

Internal portal for the customer-handling team to enter, view and analyze merchant
performance data (clicks, sales, CR, GMV, revenue) — replacing the manual Excel sheets.

## Stack

- **Backend**: Python / FastAPI + SQLAlchemy, SQLite (`backend/cr_portal.db`) for local dev.
  Swap the SQLite URL in `backend/app/database.py` for Postgres/MySQL when deploying.
- **Frontend**: React + TypeScript (Vite), Recharts for the analytics graphs.

## Run locally

```powershell
# 1. Backend (port 8000)
cd backend
python -m venv .venv          # first time only
.venv\Scripts\pip install -r requirements.txt
.venv\Scripts\python -m app.seed        # (re)create + seed the mock DB
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir app

# 2. Frontend (port 5173, proxies /api to 8000)
cd frontend
npm install                   # first time only
npm run dev
```

Open http://localhost:5173.

**Exporting data.** Every table exports itself as CSV from the UI — "Export CSV"
on the Entry Logs table (exports the rows your filters are showing), and a "CSV"
button on each analytics panel. For a full workbook of both DB tables instead:

```powershell
cd backend
.venv\Scripts\python export_excel.py     # -> CR_Portal_Mock_Data.xlsx in the project root
```

> `--reload-dir app` matters: without it uvicorn watches `.venv` too, so any
> `pip install` fires a reload storm that can take the server down. If the UI ever
> shows no data, the backend is almost certainly not running — check
> http://127.0.0.1:8000/api/merchants and restart it with the command above.
> Note port 8000 is also bound by an unrelated `python main.py` process on this
> machine; our server binds `127.0.0.1` specifically, which takes precedence.

## What's inside

**Tab 1 — Data Entry**
- Merchant autocomplete against the DB; unknown names offer **Add New Merchant**
  (breadcrumbs/affiliate editable + Reporting, Deal Type, Payout, Revenue Status;
  the person adding becomes the owner).
- Entry form: date, Clicks, Sales, CR (auto = Sales/Clicks), GMV, Revenue, optional remarks.
- **Revenue/Non-revenue toggle**: flipping to Non-revenue updates the merchant's status,
  makes metric fields optional, and pauses overdue reminders until flipped back.
- Entry Logs table with merchant / handler / date-range filters, inline row edit
  (only the person who entered a row can edit it), and a full **edit history** view.
- **Notifications** (bell, top-right): overdue entries are detected from each merchant's
  Reporting frequency. Handlers can submit a *reason*; the Lead sees it and can approve —
  approval stops reminders for that brand/period. History is kept.

**Tab 2 — Analytics (unified dashboard)**
- The four views — Brand Analytics, Brand Comparison, Category Analytics, Category
  Comparison — are **multi-select toggles**: all four panels can be on screen at once,
  or any subset. Each panel has its own brand/category selector and auto-refreshes on
  change (no Search button). Hidden panels keep their selections.
- Global controls: date presets (7D/30D/90D/6M) + custom range, Owner filter
  (narrows category views to a handler's merchants; categories = Breadcrumb1).
- Per-panel KPI tiles (Clicks / Sales / GMV / Revenue) show totals with
  period-over-period deltas and double as metric toggles, Search-Console style.
  With multiple metrics active the chart normalizes each line to % of its own peak
  (single-axis rule); tooltips always show real values. Money renders in ₹ Lakh/Crore.

**"Acting as" selector** (header) stands in for login in v0 — it attributes entries,
drives edit permissions and notification targeting. Real auth/RBAC is planned for v1.

## Seeded mock data

22 merchants modeled on the main-DB screenshot (1mg, Nike, Puma, Crocs, Zouk, Myntra…)
across Fashion / Health / Travel / Software / Games etc., owned by Swati / Yamini / Meena,
with ~6 months of entries at each merchant's reporting cadence. A few merchants
(Nike, 1mglabs, 12Go) are intentionally left overdue so the notification flow has data;
`20i` is seeded as Non-revenue.
