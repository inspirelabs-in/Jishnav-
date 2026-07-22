# CR Portal -- Handover 2

**Date:** 2026-07-22
**Scope:** All changes made in Session 2 (post v1 commit `a979bbd`)

---

## 1. Sales Pipeline Module (new feature, full-stack)

A complete CRM-style sales pipeline for the 2-person sales team (Sales1, Sales2) to track brand outreach, POC contacts, and follow-up activities across 50+ brands.

### Backend

**`backend/app/models.py`** -- Two new SQLAlchemy models:

- **`SalesLead`** (table `sales_leads`): `id`, `brand_name`, `category`, `website`, `source`, `poc1_name/email/phone/designation`, `poc2_name/email/phone/designation`, `stage` (default `new_lead`), `priority` (default `warm`), `assigned_to`, `last_contact_date`, `next_followup`, `created_at`, `updated_at`. Has a `activities` relationship ordered by `activity_date` descending.
- **`SalesActivity`** (table `sales_activities`): `id`, `lead_id` (FK to `sales_leads.id`), `activity_type`, `activity_date`, `summary`, `outcome`, `next_action`, `logged_by`, `created_at`. Has a `lead` relationship back to `SalesLead`.

**`backend/app/main.py`** -- ~240 lines of new API routes:

- Constants: `SALES_TEAM`, `SALES_STAGES` (7 stages), `SALES_PRIORITIES` (3 levels), `ACTIVITY_TYPES` (6 types), `LEAD_SOURCES`
- Pydantic schemas: `LeadCreate`, `LeadUpdate`, `ActivityCreate`
- Helper: `_lead_out(lead)` serializes a `SalesLead` with computed `touchpoints` count
- Routes:
  - `GET /api/sales/leads` -- list leads with filters (`assigned_to`, `stage`, `priority`, `search`)
  - `POST /api/sales/leads` -- create a new lead
  - `PUT /api/sales/leads/{lead_id}` -- update a lead
  - `DELETE /api/sales/leads/{lead_id}` -- delete a lead and its activities
  - `GET /api/sales/leads/{lead_id}/activities` -- list activities for a lead
  - `POST /api/sales/leads/{lead_id}/activities` -- log an activity (auto-updates `last_contact_date` and optionally `next_followup`)
  - `GET /api/sales/team` -- list sales team members
  - `GET /api/sales/sources` -- list lead sources
- **Bug fix (this session):** Added `created_at=datetime.now()` to `SalesActivity` creation in `create_activity` route -- the model column has no server default, causing `NOT NULL constraint failed` on activity creation via the API.

**`backend/app/seed.py`** -- Sales demo data:

- 15 `SalesLead` entries across all 7 stages and 3 priorities, split between Sales1 and Sales2. Brands: Myntra, Zomato, PhonePe, Urban Company, Nykaa, MakeMyTrip, Boat, Lenskart, Swiggy (closed won), Pepperfry (closed lost), BigBasket (parked), ixigo, Mamaearth, CRED, Flipkart.
- 44 `SalesActivity` entries with realistic summaries, outcomes, and next actions across call, email_sent, reply_received, meeting, whatsapp, and note types.
- New `seed_sales(db)` function called from `main()`.
- Import added: `SalesActivity`, `SalesLead` from models.

### Frontend

**`frontend/src/types.ts`** -- New types and constants:

- `SALES_TEAM = ["Sales1", "Sales2"]` -- declared before `USERS` array (was a bug: used before declaration)
- `USERS` now includes `...SALES_TEAM`
- `isSales(user)` helper function
- `SALES_STAGES` array (7 entries with key/label/color): `new_lead`, `contacted`, `responded`, `negotiating`, `closed_won`, `closed_lost`, `parked`
- `SALES_PRIORITIES` array (3 entries): `hot` (red), `warm` (amber), `cold` (blue)
- `ACTIVITY_TYPES` array (6 entries): `call`, `email_sent`, `reply_received`, `meeting`, `whatsapp`, `note`
- `SalesLead` interface (22 fields including computed `touchpoints`)
- `SalesActivity` interface (9 fields)

**`frontend/src/api.ts`** -- New API client methods:

- `listLeads(filters)`, `createLead(payload)`, `updateLead(id, payload)`, `deleteLead(id)`
- `listActivities(leadId)`, `createActivity(leadId, payload)`
- Added `SalesActivity` and `SalesLead` to imports

**`frontend/src/App.tsx`** -- Sales tab integration:

- Import `SalesTab` and `isSales`
- `TabKey` union includes `"sales"`
- Sales users see only `[{ key: "sales", label: "Sales Pipeline" }]`
- Render: `{tab === "sales" && sales && <SalesTab user={user} />}`

**`frontend/src/components/SalesTab.tsx`** -- New component (~843 lines):

- **Lead list**: table with expand/collapse rows, stage/priority chips, relative dates, touchpoint counts, overdue highlighting
- **Filters**: stage pills with counts, priority dropdown, text search (debounced)
- **Lead form**: create/edit form with 4 sections (Brand info, POC 1, POC 2, Pipeline). Brand info uses a 3-column row (brand name, category, source). Website field deliberately removed per user request.
- **Activity timeline**: expandable per-lead, shows all logged activities in reverse chronological order with colored type badges, timestamps, summaries, outcomes, and next actions
- **Quick stage buttons**: contextual actions ("Mark contacted" for new_lead, "Mark responded" for contacted, "Move to negotiating" for responded, "Closed won"/"Closed lost" for negotiating)
- **POC detail card**: shown in expanded view with POC 1 and POC 2 details (name, email, phone, designation)
- **Email compose panel** (Layer 1 -- no email service connected yet):
  - "Draft email" button appears next to each POC's email in the expanded detail card
  - Clicking opens an inline compose panel with auto-generated first-contact email template
  - Template uses brand name, POC first name, and category to generate a professional outreach email
  - Subject: "Partnership opportunity -- GrabOn x {brand}"
  - Body: personalized intro referencing GrabOn's user base, the brand's vertical, and a meeting request
  - "Copy & log activity" button: copies full email (To, Subject, Body) to clipboard AND logs it as an `email_sent` activity in the timeline
  - "Copy only" button: copies to clipboard without logging
  - "Cancel" button: closes the compose panel
  - Hint text explains email service is not connected yet
- **Delete with confirmation**: inline confirm/cancel before deleting a lead
- Helper functions: `stageLabel`, `stageColor`, `priorityLabel`, `priorityColor`, `activityLabel`, `activityColor`, `relativeDate`, `toInputDate`
- Draft management: `LeadDraft` interface, `emptyDraft(user)`, `leadToDraft(lead)` converters

**`frontend/src/styles.css`** -- ~440 lines of new CSS:

- Sales header: `.sales-header`, `.sales-top-row`, `.sales-stage-pills`, `.sales-pill` with `--pill-color` CSS custom property, hover/active states
- Sales filters: `.sales-filters` with search input and priority select
- Lead form: `.sales-form`, `.sales-form-grid`, `.sf-section` (inset background with border, uppercase label), `.sf-row` (2-column grid), `.sf-row-3` (3-column grid), `.sf-actions`
- Table: `.sales-table`, `.sales-row`, `.sales-expand-btn` (chevron rotation animation), `.sales-brand-cell`, `.sales-poc-cell`
- Chips: `.sales-stage-chip`, `.sales-priority-chip` with `--chip-color` CSS variable
- Timeline: `.sales-timeline-row` (lime top border on expanded), `.sales-timeline`, `.sales-tl-header`, `.sales-tl-list`, `.sales-tl-entry` (left border, hover highlight), `.stl-dot`, `.stl-content`, `.stl-head`, `.stl-type`, `.stl-summary`, `.stl-next`
- POC detail: `.sales-poc-detail` (CSS grid), `.spd-group`, `.spd-label`
- Activity form: `.sales-act-form`
- **Email compose (new):** `.spd-email-row`, `.spd-draft-btn` (small button with mail icon, blue hover), `.email-compose` (blue border card with animation), `.ec-header`, `.ec-body` (textarea with focus ring), `.ec-hint`, `.ec-actions`

---

## 2. Notification Escalation Rework

**`backend/app/notifications.py`:**

- Replaced single day-threshold model (`REPORTING_INTERVAL_DAYS`) with separate month-cadence (`MONTH_STEP`) and day-cadence (`DAY_STEP`) calculations via new `_stage_and_period()` function
- `refresh_notifications()` now returns the set of currently-overdue `(merchant_id, period_label)` keys so old pending rows are hidden (not deleted) when the time machine steps backward
- Messages reworded from "Level N" language to stage-based routing text

**`frontend/src/components/NotificationBell.tsx`:**

- Renamed `levelLabel` to `routeLabel` with friendlier copy ("With handler" / "Escalated to Manager" / "Escalated to Founders Office")
- Added dev-only "time machine" UI (`+1 mo` / `-1 mo` / `Reset` buttons, only rendered when `import.meta.env.DEV`) that passes `as_of` to the notifications fetch
- Backend `GET /api/notifications` gained an `as_of` param for the time machine

---

## 3. Merchant Edit Audit Trail

**`backend/app/models.py`:**
- New `MerchantEditLog` model: `id`, `merchant_id`, `merchant_name`, `edited_by`, `edited_at`, `changes` (JSON field storing `{field: {old, new}}` diffs)

**`backend/app/main.py`:**
- `update_merchant` endpoint now diffs old/new values and writes a `MerchantEditLog` audit row
- New endpoint `GET /api/merchant-edit-logs` to retrieve merchant field change history

**`frontend/src/types.ts`:**
- New `MerchantEditLog` interface

**`frontend/src/api.ts`:**
- New `listMerchantEditLogs` method
- `updateMerchant` now sends `edited_by` param

**`frontend/src/components/MerchantHistoryModal.tsx`** (new, 162 lines):
- Per-merchant edit/status history modal
- Exports `MERCHANT_FIELD_LABELS` and `fmtMerchantVal` helpers

---

## 4. Data View and Merchant Info Redesign

**`frontend/src/components/AnalyticsTab.tsx`:**
- Gutted from a 286-line brand/category comparison view (with `AnalyticsPanel`, `PortfolioOverview`, charts, compare toggles) down to a 7-line wrapper rendering the new `BrandBreakdown` component

**Deleted:**
- `frontend/src/components/AnalyticsPanel.tsx` (543 lines) -- superseded by `BrandBreakdown.tsx`
- `frontend/src/components/PortfolioOverview.tsx` (793 lines) -- functionality folded into new Data View

**New:**
- `frontend/src/components/BrandBreakdown.tsx` (398 lines) -- new brand-level breakdown table powering the "Data View" tab
- `frontend/src/components/dvFilters.tsx` (271 lines) -- shared filter-field/range-select helpers (`MY` type, `iso1`/`isoLast`, `FilterField`, `RangeSelect`) reused by Data View and Merchant Info

**`frontend/src/components/DashboardTab.tsx`:**
- Substantially rewritten as "Merchant Info" -- replaced ad hoc filter state/change-history logic with shared helpers from `dvFilters.tsx` and delegates history display to `MerchantHistoryModal`

**`frontend/src/App.tsx`:**
- Tab labels renamed: "Analytics" to "Data View", "Dashboard" to "Merchant Info"

---

## 5. Database Integrity Improvements

**`backend/app/models.py`:**
- Tightened column lengths (`String(255)` etc.)
- Added `created_at`/`updated_at` with `server_default=func.now()` and `onupdate` to `Merchant` and `Entry`
- Added cascade deletes (`ondelete="CASCADE"`, `cascade="all, delete-orphan"`) across Entry/EditLog/Transfer/Notification relationships
- Added indexes: `ix_entry_merchant_date`, `ix_entry_year_month`, `ix_notif_merchant_period`
- Renamed `Notification.user` column to `handler`

---

## 6. Other Frontend Changes

**`frontend/src/components/DataEntryTab.tsx`:**
- Entry delete button now gated by `isPrivileged(user)` instead of an ownership check

**`frontend/src/components/EntryForm.tsx`:**
- `MerchantInfoStrip` now takes a `user` prop and sends `edited_by` on merchant field save (for audit log)

**`frontend/src/components/TokenAutocomplete.tsx`:**
- Added `clearQueryOnFocus`, `labelRequired`, `disabled` props
- Fixed a stale-query bug (effect now depends on `selected[0]` not just `single`)
- Restores the prior pick on blur if nothing new was chosen

---

## 7. Backend Test Suite (new)

**`backend/tests/`** -- 11 files, ~950 lines:
- `conftest.py` -- pytest fixtures with in-memory SQLite
- Tests covering: merchant create/list/search/update, entry create/list/permissions, delivery fill/requests, analytics-by-brand

---

## 8. Generated Documents

- `CR_Portal_PRD.docx` -- Product Requirements Document (generated via docx-js script)
- `CR_Portal_PRD.pdf` -- PDF version of the PRD

---

## Known Issues / Incomplete Items

1. **Email compose (Layer 2 pending):** The "Draft email" feature currently only copies to clipboard and logs as an activity. Actual email sending and reply detection require an email service (SendGrid/SMTP) and real auth (SSO). This is designed to be wired up when auth lands.

2. **Backend `created_at` on `SalesActivity`:** The model column does not have a `server_default`. Fixed in the `create_activity` route by explicitly passing `created_at=datetime.now()`, but the model itself should ideally have `server_default=func.now()` for consistency.

3. **Sales UI styling:** CSS was overhauled to match the design system (Archivo font, navy/lime palette, 4px grid, card patterns), but visual QA in the browser pane was limited by screenshot timeouts -- recommend a manual visual pass.
