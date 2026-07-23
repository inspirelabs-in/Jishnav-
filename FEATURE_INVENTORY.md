# CR Portal — Feature Inventory (Parity Contract)

The rebuild is **not done** until every line here is verified present and behaving
identically in the new UI. Presentation may change; behaviour, data, permissions,
and validation may not. No feature added, none removed.

**Stack today:** React 18 + TypeScript + Vite 6. Recharts for charts. Fonts via
`@fontsource` (Archivo + IBM Plex Mono). Styling: one hand-written `styles.css`
(~3.4k lines) with CSS custom properties. **No router** — navigation is a `tab`
string in `App.tsx`; screens mount/unmount conditionally. Backend: FastAPI +
SQLite (unchanged by this rebuild).

---

## 0. Roles & navigation (App.tsx)

Acting-as `<select>` in the header switches the current user (no real auth). Role
decides the available sections; when the active section is invalid for a role it
falls back to the first.

| Role | `isPrivileged`/`isSales`/`isDelivery` | Sections |
|---|---|---|
| Swati / Yamini / Meena (handlers) | none | Home, Data Entry, Data View, Merchant Info |
| Manager / Founders Office | privileged | + Brand Transfer |
| Sales1 (Pravallika) / Sales2 | sales | Sales Home, Sales Pipeline |
| Delivery | delivery | Delivery Queue only |

`TabKey` = home · entry · analytics · dashboard · transfer · delivery · saleshome · sales.
Deep links: Sales Home → Pipeline with pre-applied stage/priority filter (remounts
`SalesTab` via a nav counter). CS Home chips → Data View / open notification drawer.

**Global header:** brand wordmark (GrabOn / CR Portal), section tabs, `NotificationBell`
(bell + unread badge + slide-in drawer), acting-as avatar + select.

**→ Rebuild target:** left sidebar app shell (Phase 3). Every section above must
appear in the sidebar, grouped, with the same role gating. Header becomes a
contextual top bar. The acting-as switcher, notifications, and unread count survive.

---

## 1. Screens, controls, and states

### 1.1 CS Home (`CSLandingPage`)
- **Contribution spotlight** (signature today): fetches two `analytics/overview`
  windows (mine vs all brands) for the last completed month; rotates 2 slides
  ([sales, revenue] then [clicks, cr]) with count-up, share bar, share %, and for
  CR a `vs portfolio ▲/▼ pts` delta. Auto-advance ~4.6s, pause on hover, dots +
  progress. Manager/Founders see "Portfolio" totals, no share.
- **Two hero chips** (clickable): "N brands" → Data View; "N need action" → opens
  notification drawer. Hover-lift + chevron.
- States: loading (skeleton), loaded, zero/empty contribution, error (fetch fails).

### 1.2 Sales Home (`SalesLandingPage`)
- Hero greeting + live chips (active / hot / touchpoints).
- **Insight spotlight**: auto-rotating stacked 3-card carousel — Closed this month
  (confetti), On the verge, Hot & waiting. Dots, progress bar, pause on hover,
  entrance re-runs per slide. Empty fallback ("No wins yet…").
- Four stat tiles: Active / Hot / Follow-ups due / Won.
- **Stage-flow cards** (New lead → … → Closed) deep-link into Pipeline filtered by stage.
- Quick-action cards: Open pipeline, Work the hot leads, Review your wins.
- States: loading skeletons, loaded, empty, error.

### 1.3 Data Entry (`DataEntryTab`)
- **EntryForm** (existing merchant) or **AddMerchantForm** (searched merchant not found):
  - Merchant autocomplete (search, results dropdown, no-match → "Add New" prompt).
  - Date (month+year pair, no day), Revenue/Non-revenue toggle, 5 metric inputs
    (clicks/sales/gmv/revenue + CR auto read-only), remarks, Save Entry.
  - "Delivery team data" toggle (sets `delivery_requested`).
  - Merchant info strip (ID, category, sub, reporting badge, payout, deal, owner) with
    inline edit of merchant fields (privileged), writes an audit log.
  - Notices: foreign-brand lock; non-revenue guard (already-non-rev block); "saving will
    mark non-revenue" heads-up.
  - AddMerchantForm: id (optional), name, breadcrumb names, affiliate, reporting/deal/
    payout/revenue-status.
  - Validation (toasts): select a merchant first; revenue fields mandatory for revenue.
- **Entry Logs table** (`table.data`): latest 10 default + MoreNote; filters — merchant
  text, handler `<select>`, `PeriodPicker` (month-year), CSV export, "View edit logs" →
  `EditHistoryModal`. Inline edit of a row (writes edit log). Delete (privileged) with
  confirm. Row states: non-revenue (red row + spanning banner), comeback (green +
  "Back to revenue" stamp), hover. Remark cell → `RemarkPopover` (pinned floating note).
  Pagination.
- States for the table: default, hover, inline-edit, non-rev, comeback, empty
  (no matches), loading (skeleton/dim-on-refetch), error + Retry, overflow.

### 1.4 Data View (`AnalyticsTab` → `BrandBreakdown`)
- Brand-level breakdown table (`.ov-table`): grouped month headers (colour bands),
  per-cell data bars, column leader highlight, Portfolio `tfoot` totals, frozen brand
  column, sticky two-row header.
- Filters (`dvFilters`): handler `TokenAutocomplete` (chips), brand/category token
  fields, Single-month toggle, Multiple-handlers/brands toggles, All-handlers toggle,
  Clear, `RangeSelect`/`SingleMonthSelect` date popover, Search (dirty state).
- Metric column chips (show/hide each metric, ≥1 must stay), CSV export.
- States: loading (skeleton, dim-on-refetch), empty (no data), error + Retry, overflow
  (horizontal scroll), sortable (ranking `cmp-table` with sort arrows + rank badges).

### 1.5 Merchant Info (`DashboardTab`)
- Merchant table (`.mi-table`): URL link, rev-chip, deal, payout, reporting badge, owner
  avatar. Handler `<select>` filter (privileged), search, CSV, pagination.
- Per-merchant **History** link → `MerchantHistoryModal` (merges field edits + status
  flips; type chip Edit/Status; search + PeriodPicker; latest 10 + MoreNote).
- Below: unified Change-history table.
- States: loading, empty, error + Retry, overflow.

### 1.6 Brand Transfer (`BrandTransferTab`, privileged)
- Merchant table (`.xfer-table`): search, handler filter; per-row reassign `<select>`
  ("Choose a handler…", excludes current owner) → "Move to X? Confirm/Cancel" → transfer.
- **Transfer history timeline** (`.xfer-event`): from-avatar → to-avatar handoff; row
  flash on fresh transfer; latest 10 + MoreNote; PeriodPicker.
- States: loading, empty ("No transfers yet"), error + Retry, confirm, flash.

### 1.7 Delivery (`DeliveryTab`, delivery role)
- Master-detail queue (`.delivery-queue-item` list, auto-selects first): detail =
  merchant strip + read-only CS metrics (`.read-cell`) + delivery inputs (5-col) + Save.
- Delivery history table (`.dhist-table`): CS vs Delivery numbers side-by-side; search +
  PeriodPicker; edit (privileged) with Save; delete with confirm; pagination.
- States: loading, empty (`delivery-empty` icon + heading + copy), error + Retry, saving.

### 1.8 Sales Pipeline (`SalesTab`, sales role)
- Header card: stage filter pills (with counts), priority custom dropdown (`PriorityDropdown`,
  opens down), search (debounced).
- Leads table (`.sales-table`): expandable rows → POC detail + activity timeline
  (`.sales-tl-entry`). Row states: hover, overdue (red tint), expanded (highlight). Stage
  chip, priority chip, touchpoints count, relative dates.
- Quick-stage buttons (contextual: Mark responded / No response / Closed won / lost / etc).
- **Lead form** (create/edit): 4 sections (Brand, POC1, POC2, Pipeline) — stage/priority/
  source/assigned selects, name/email/phone/designation, next-followup date.
- **Activity form** (`.saf`): type select, datetime-local "when", summary, outcome, next-action.
- **Email compose** (`.email-compose`): draft button (grey→green when a valid email is typed),
  full-width panel, subject, body textarea, Send email (stub → toast + logs activity),
  Copy. Auto-scroll into view.
- Delete lead (confirm). Add lead.
- States: loading, empty, error ("Failed to load leads"), overdue, expanded, saving, sending.

### 1.9 Notifications (`NotificationBell`, global)
- Bell + unread badge; right slide-in drawer (portaled) + scrim.
- Filters: search (merchant/handler), PeriodPicker.
- Cards: message, handler avatar, escalation route chip (handler / manager / founders),
  status chip (pending / reason_submitted / approved / rejected / resolved), reason input +
  Submit, Approve/Reject (role-gated).
- Escalation logic (levels 1/2/3, visibility by role) — unchanged.
- Dev-only "time machine" (+1mo / -1mo / Reset), only in DEV.
- States: loading, empty ("Nothing needs your attention" / "No past notifications"),
  error + Retry, unseen badge, open/close animation.

---

## 2. Component families & full state matrix (from the 12-item audit)

| Family | Variants | States to preserve |
|---|---|---|
| Buttons | primary, secondary, green/confirm, danger, reject, sm, icon (trash/close/bell/paginator/expand), link, draft (grey→green), toggle, filter pill, carousel dot, dropdown trigger, popover trigger | default / hover / active / focus-visible / disabled / loading |
| Inputs | text, email, number, date, datetime, textarea, read-only, autocomplete, chips-combobox | default / hover / focus / disabled / read-only / invalid |
| Dropdowns | native `<select>`, PriorityDropdown, PeriodPicker, RangeSelect/SingleMonthSelect | closed / open / hover-option / selected / disabled |
| Tables | Entry Logs, Data View breakdown, Merchant Info, Brand Transfer, Delivery history, Sales leads, modal change tables | header (plain/num/grouped/sortable) · rows (hover/non-rev/comeback/overdue/expanded/leader/flash) · pagination · MoreNote · empty · loading · error · overflow |
| Overlays | EditHistoryModal, MerchantHistoryModal, notification drawer, RemarkPopover, email compose, toast | backdrop · open/close anim · focus trap · Esc · click-outside |
| Nav | section tabs (→ sidebar), acting-as switcher, wordmark, in-page cards/chips | active / hover / focus |
| Cards | generic card, form section, merchant strip, KPI/metric, landing feature/stage/spotlight, notif card, activity entry, delivery master-detail, transfer timeline | rest / hover / selected / loading / empty |
| Tooltips | branded `[data-tip]` (migrated from native `title`) + reporting badge | hover / focus |
| Badges/chips | rev, stage, priority, notif status, route, change-type, activity, reporting, stamps, info pills, unread badge, HandlerAvatar, hero chips, colour dots | on/off / semantic tiers |
| Loading | skeletons, landing skeletons, button labels, dim-on-refetch | — |
| Empty | generic, delivery, timeline, history, drawer, transfer, landing fallbacks | filter-empty vs first-run |
| Error | load+Retry, toast error, form notices (warning/danger), autocomplete no-match, field validation | — |

---

## 3. Backend API surface (must keep working — presentation only)

`GET /merchants/search` · `GET /merchants?owner=` · `GET /categories` · `GET /handlers`
· `POST /merchants` · `POST /entries` · `GET /entries` · `PUT /entries/{id}`
· `GET /delivery-requests` · `POST /entries/{id}/delivery` · `GET /status-history`
· `GET /edit-logs` · `GET /merchant-edit-logs` · `PUT /merchants/{id}`
· `GET /notifications` · `POST /notifications/{id}/reason|approve|reject`
· `POST /transfers` · `GET /transfers` · `GET /analytics` (+ `analytics/overview`)
· Sales: `GET/POST/PUT/DELETE /sales/leads`, `GET/POST /sales/leads/{id}/activities`,
`GET /sales/team`, `GET /sales/sources`.

Enforced business rules to keep: non-rev parking guard (409), revenue fields mandatory
when Revenue, delivery_requested sync, notification resolution on entry, comeback
detection, escalation levels + role visibility, transfers move open notifications, audit
logs on edits, activity auto-advances lead stage.

---

## 4. Layout hacks / hard-coded values to eliminate in the rebuild

- Top-tab header layout (`.header` + `.tabs`) → replaced by sidebar shell.
- `.page { max-width: 1440px }` single centered column → composed page grid per screen.
- Franken `styles.css`: legacy tokens (`--navy`, `--lime`, `--inset`, `--field`,
  `--rule-control`, `--ctl-h`, `--radius-ctl`) mixed with the appended Build-Blocks
  sections → collapse to ONE token layer.
- Raw hex scattered in CSS (`#D2E600` titles removed already; audit for the rest) and
  data colours hard-coded in rules (`#2E7DE0`, `#188952`, `#D97706`, `#8B4FC9`, `#E24B4A`).
- Off-scale pixel values (7px radius, 9/11/13/18px paddings, 24px/30px control heights,
  136px date widths) → snap to the token scale.
- Preview/animation gotchas from HANDOVER (screenshots time out, backgrounded rAF freezes)
  — QA via computed styles, not screenshots, in the preview pane.

**Definition of done for parity:** every row of §1 and §2 demonstrably works in the new
sidebar shell, at all six viewport widths, with no behaviour change and no console errors.
