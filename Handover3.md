# CR Portal — Handover 3

**Date:** 2026-07-22
**Scope:** Everything done in Session 3 — landing pages, Sales pipeline polish,
the CS "contribution" hero, activity auto-advance, a stack of UI/UX fixes, the
git push, and (most importantly for what comes next) the **new Inspirelabs
visual direction** the UI is about to be rebuilt in.

**Git:** committed as `1bb04cb` ("Role landings, Sales Pipeline, and a session
of UX polish") and **pushed to `origin/main`** (`a979bbd..1bb04cb`) on GitHub
`inspirelabs-in/Jishnav-`. Everything below is already on `main`.

> Read `HANDOVER.md` (foundational, code-level source of truth) and
> `Handover 2.md` (Sales module + notification rework + Data View redesign)
> first. This file is the delta on top of those.

---

## 0. THE NEXT THING — new UI direction: "Build Blocks" (Inspirelabs)

This is the active piece of work. The whole app is going to be re-skinned in
the **Inspirelabs** brand language. The direction is decided in principle and
was previewed (real fonts + colors) via an inline specimen; **no app code has
been changed for it yet.** Start here.

### The system

Derived from the Inspirelabs logo (wordmark + 2x2 rounded-square mark, orange
dot on the "i", monospace "Always building." tagline):

- **Ground:** white. (A dark variant — near-black `#141414` ground — falls out
  of the same tokens later if wanted.)
- **Accent (single, decisive — retires the old lime):** orange, sampled from
  the mark. Working values (tunable, awaiting confirm):
  - core `#F26B2C` · hover `#DA5A1E` · ink-on-tint `#9A3E12` · tint `#FCE9DD`
- **Ink:** near-black `#141414`. **Neutral gray:** `#7C7C7C`.
- **Surfaces / lines:** surface `#F5F4F2` · hairline rule `#E9E7E3` ·
  muted text `#86847F`.
- **Depth:** borders-only, more generous rounding than today
  (~14px tiles/cards, ~9px controls).

### Typography (the current Archivo is being replaced)

- **UI + headings:** **Space Grotesk** (geometric, matches the wordmark).
- **Numbers + micro-labels:** **JetBrains Mono** (echoes the "Always building."
  mono tagline; keeps the "numbers are mono" rule).
- **Alternative under consideration:** use **Manrope** for dense body text and
  keep Space Grotesk for headings only (calmer in tables).
- Bundle locally via `@fontsource/*` (same pattern as the current
  Archivo + IBM Plex Mono in `frontend/src/main.tsx`) — **no CDN**.
  Packages: `@fontsource/space-grotesk`, `@fontsource/jetbrains-mono`
  (and `@fontsource/manrope` if we take that route).

### Signature elements (unique to this product — do not lose these)

1. **Rounded "blocks"** as the base shape — KPI tiles, chips, buttons, avatars,
   nav all read as soft squares (mirrors the 2x2 mark).
2. **The dashed empty-block** = the universal language for **empty states,
   add-new, loading skeletons, placeholders** ("always building" = the next
   block to fill). Empty tables, "+ Add" affordances, and skeletons should all
   speak this dashed-rounded-square language.
3. **Orange dot** = active / unread / "you are here" (replaces every current
   use of the lime accent — tab underline, active markers, notification badge).

### Status & the 3 open confirms

Direction previewed; **pending the user's answers before building:**
1. Fonts: Space Grotesk + JetBrains Mono, **or** Manrope body + Space Grotesk
   headings?
2. Orange shade: is `#F26B2C` right, or warmer/deeper?
3. First screen to convert: **Sales Pipeline** (densest — table, chips,
   dropdowns, forms, empty states all in one) or the **CS landing** (most
   visible)?

### Build plan (agreed approach)

One screen at a time, review each in the browser before the next — do NOT
re-skin the whole app in one shot (that's how it goes generic again):

1. Wire fonts + tokens into `frontend/src/styles.css` `:root` (swap
   `--lime*` role for `--orange*`; swap `--font-ui` to Space Grotesk; keep a
   `--font-num` mono).
2. Convert the anchor screen fully; verify in browser.
3. Then: Sales Pipeline → CS landing → Data Entry → Data View → Merchant Info →
   Delivery → Brand Transfer (or whatever order after the anchor).
4. Once one screen is locked, **save the tokens + component patterns to
   `.claude/skills/` (or the installed `interface-design` skill's
   `system.md`)** so every later screen follows the same system.

### Hard rules that carry over (do not regress)

- **No em/en-dashes** anywhere in the app (use `-`). Grep `—|–` over
  `frontend/src` must be empty.
- Numbers in mono, words in the sans. Indian money (`Lakh`/`Crore`,
  `formatMoney`). 24h railway timestamps.
- Colour = data (metric colours stay), plus the ONE orange brand accent.
- Respect `prefers-reduced-motion` (already globally handled).

### Component checklist for the re-skin (audit output)

Every distinct component that needs a pass, with the "spec once, reuse" states.
Use this so nothing is missed per screen:

- **Buttons:** primary (was navy → becomes orange or ink), secondary, green
  (confirm), danger, reject, small, icon-only (trash/expand/bell/close/
  paginator), link-style, toggle switches, filter pills (`.sales-pill`,
  `.metric-chip`), landing cards/chips, carousel dots, custom-dropdown trigger,
  popover triggers.
- **Inputs:** text / number / email / date / datetime / textarea / read-only,
  the merchant autocomplete (`.ac-dropdown`), the chips-combobox
  (`TokenAutocomplete`).
- **Dropdowns:** native `<select>` (many), custom `PriorityDropdown` (`.pdd`,
  opens down), `PeriodPicker`, `RangeSelect`/`SingleMonthSelect`.
- **Tables:** Entry Logs, Data View breakdown (grouped headers, in-cell bars,
  tfoot), Merchant Info, Brand Transfer, Delivery history (dual columns),
  Sales leads (expandable), modal change-tables; headers, row states
  (hover/non-rev/comeback/overdue/expanded/leader/flash), pagination, MoreNote.
- **Modals/overlays:** EditHistoryModal, MerchantHistoryModal, notification
  drawer (portaled slide-in), RemarkPopover, email compose panel, toast.
- **Tabs/nav:** header tab bar + active underline, acting-as switcher, brand
  wordmark, in-page navigation via landing cards/chips.
- **Cards:** `.card`, form sections, merchant-info strip, KPI/metric cards,
  landing feature/stage/spotlight cards, notification cards, activity timeline
  entries, delivery master-detail, transfer timeline.
- **Tooltips:** all native `title` today (candidate to standardize),
  ReportingBadge hint.
- **Badges/tags:** rev-chip, stage/priority chips, notification status +
  route chips, change-type chip, activity-type badge, reporting badge,
  "back to revenue" stamp / non-revenue banner, info pills, notif unread badge,
  HandlerAvatar, hero chips, colour dots.
- **Loading:** `.skeleton`, landing skeletons, button loading labels, table
  dim-on-refetch.
- **Empty:** generic `.empty-state`, delivery-empty, timeline empty, history
  empties, drawer empties, transfer-history empty, landing zero-fallbacks →
  ALL of these become the **dashed-block** pattern.
- **Error:** load-error + Retry, toast error, entry-form notices, autocomplete
  no-match. (Gap noted: no field-level inline validation today.)

---

## 1. Role-scoped landing pages (new)

Two "home" screens sit in front of the existing tabs; each role lands on its own.

**`frontend/src/App.tsx`:**
- `TabKey` gained `"home"` (CS) and `"saleshome"` (Sales). Default tab is
  `"home"`.
- Tab sets: Handlers/Manager/Founders → `Home + Data Entry + Data View +
  Merchant Info (+ Brand Transfer)`; Sales1/Sales2 → `Home + Sales Pipeline`;
  Delivery unchanged (straight to `Delivery Queue`).
- `openSales(init?)` deep-links the Sales landing into the pipeline with
  pre-applied filters; a `salesNav` counter remounts `SalesTab` so filters
  re-apply each jump.
- Wires `onOpenNotifications` (see §7) and `openSignal` to `NotificationBell`.

**`frontend/src/components/CSLandingPage.tsx`** (new) — CS Home. See §6 for its
current, reworked contents.

**`frontend/src/components/SalesLandingPage.tsx`** (new) — Sales Home:
- Hero greeting + live chips (active / hot / touchpoints).
- **Insight spotlight** (see §3): an auto-rotating stacked card carousel.
- Four stat tiles (Active / Hot / Follow-ups due / Won).
- **Stage-flow** cards (New lead → … → Closed) that deep-link into the
  pipeline filtered by stage.
- Quick-action cards: Open pipeline, Work the hot leads (priority=hot),
  Review your wins (stage=closed_won).

**`frontend/src/components/SalesTab.tsx`:** added optional `initialStage` /
`initialPriority` props for the deep-links.

**`frontend/src/vite-env.d.ts`** (new): `/// <reference types="vite/client" />`
— fixed a pre-existing `tsc` failure on `import.meta.env` (Vite client types
were never referenced). `npx tsc --noEmit` is now clean.

CSS: a large `landing pages` block in `styles.css` (`.lp-*`, hero, chips,
stat tiles, stage-flow, feature cards, responsive breakpoints).

---

## 2. Display-name layer: Sales1 → "Pravallika"

**`frontend/src/types.ts`:** `USER_LABELS = { Sales1: "Pravallika" }` and
`userLabel(user)`. The stored id stays `"Sales1"` (seed data, filters, backend
untouched — **no reseed**); only what humans see changes. Applied in:
`App.tsx` (acting-as dropdown + avatar), `CSLandingPage`/`SalesLandingPage`
greetings, `SalesTab` assigned-to select. Sales2 left as-is.

---

## 3. Sales landing "insight spotlight"

Replaced an earlier clumsy "traveling deal chips" conveyor (chips overlapped)
with an **auto-rotating stacked 3-card carousel** in `SalesLandingPage.tsx`:
- Slides: **Closed this month** (won brands, green) → **On the verge**
  (negotiating, amber) → **Hot & waiting** (hot active leads, red).
- Cards shuffle forward every ~4.2s (front slides back, next rises), pause on
  hover, dots to navigate, a progress bar keyed to the slide, an accent glow.
- Brand chips wrap (no overlap); each slide re-runs its entrance animation via
  `key={spot}`.
- **Confetti** rains behind the "Closed this month" slide only (`Confetti`
  component, a fixed preset of ~11 pieces, `lp-confetti-fall`), z-index below
  the text, clipped to the card.
- CSS: `.lp-spot*`, `.lp-confetti*` in `styles.css`.

---

## 4. Email composer + activity form (Sales pipeline)

**`frontend/src/components/SalesTab.tsx`:**
- **Draft-email button** (`.sf-draft-btn`) is **grey/disabled until a valid
  email is typed, then turns green + clickable** (`isValidEmail()` regex).
- **Compose panel moved to full width** below the form grid (was trapped in a
  half-width POC column). Clean header (mail icon, "New email", recipient),
  Subject, Message textarea, demo-mode hint.
- **Green "Send email" button** — no mail service yet, so it's a realistic
  stub: brief "Sending…", toast `Email sent to {addr}`, closes; when editing an
  existing lead it also logs an `email_sent` activity. `copyEmail()` still
  copies to clipboard.
- **Auto-scroll:** clicking Draft scrolls the composer into view
  (`composeRef` + effect keyed on `emailCompose?.poc`, `behavior:"smooth"`).
- **Activity form redesigned** (`.saf` grid): titled card, aligned 2-col grid,
  Summary/Next-action span full width, inputs fill their cells. Fixed a bug
  where `table.data input[type="date"]{width:136px}` shrank the date field
  (scoped override `.saf .saf-grid .field input{width:100%}`).

CSS: reworked `.email-compose`/`.ec-*` and new `.saf-*`, `.sf-draft-btn.ready`
in `styles.css`.

---

## 5. New sales stage: "No response"

Contacted leads that go silent had nowhere to sit (they stayed in "Contacted").
Added a distinct stage.

- **`frontend/src/types.ts`** `SALES_STAGES`: inserted
  `{ key: "no_response", label: "No response", color: "#7C8AA0" }` after
  `contacted`.
- **`backend/app/main.py`** `SALES_STAGES` constant: added `"no_response"`
  (documentation only — nothing validates against it).
- **`SalesTab.tsx`** quick-stage buttons: from Contacted → "Mark responded" or
  "No response"; from No response → "Follow up again" / "Got a reply".

---

## 6. CS landing "contribution" hero (built, then reworked)

**`frontend/src/components/CSLandingPage.tsx`** — the old static CR funnel was
replaced with a rotating **"your contribution vs all brands"** panel, then
trimmed per feedback. Current state:

- Fetches **two** `GET /api/analytics/overview` windows for the same completed
  month: `handlers=[you]` (mine) and `handlers=[]` (all brands). Computes each
  metric's **share** = mine/all.
- **Rotation = 2 slides** (GMV dropped): `[sales, revenue]` then
  `[clicks, cr]`. Auto-advances (~4.6s), pause on hover, dots + progress.
- Each additive metric: big count-up value, a **share bar**, and under the bar
  at the **right corner** the share `%` (`.cscx-share`) + `of {total} · all N
  brands`.
- **CR** is a rate, so no share — it shows `vs portfolio {X}%` with a
  `▲/▼ {pts}` delta (green above / red below). Framing: your blended CR vs the
  whole portfolio's blended CR (`round(sales/clicks*100)`).
- Labels have **no "· you"**; eyebrow reads "Your contribution · {month}"
  (Manager/Founders see "Portfolio", totals only, no share).
- Hero **paragraph removed**; only **two chips**, both clickable:
  **"N brands" → Data View**, **"N need action" → opens Notifications**
  (elegant hover-lift + chevron). The **four stat tiles were removed**.
- Components: `ContributionSpotlight`, `MetricBlock`, `CountNum`.
- CSS: `.cscx-*` in `styles.css` (metric cards, bar, share, delta, progress,
  skeleton) + `.lp-hero-chip-btn`.

> Note: `.lp-stat` CSS is still used by the **Sales** landing tiles — do not
> delete it when cleaning up.

---

## 7. "Need action" chip → notification drawer

The landing chip opens the header's existing drawer via a signal (no duplicate
drawer):
- `App.tsx`: `notifOpenSignal` state; `onOpenNotifications` bumps it; passed to
  `NotificationBell` as `openSignal`.
- `NotificationBell.tsx`: new optional `openSignal` prop + an effect that calls
  `openDrawer()` when it increments (which also marks items seen).

---

## 8. Sales pipeline table polish

**`SalesTab.tsx` + `styles.css`:**
- **Touchpoints** column left-aligned (removed the right-aligning `num` class →
  `.sales-tp-col`), matching Brand/POC.
- **Search box made compact** (`.sales-filters input` → `flex:0 1 340px`,
  styled to match the app's controls) instead of stretching full width.
- **Priority filter → custom `PriorityDropdown`** (`.pdd`) that **opens
  downward**. (A native `<select>` re-anchors its menu over the selected option,
  so once a non-first option like "Hot" is chosen the list appears *above* the
  box — read as "opening up." The custom menu always drops below, with
  click-outside + Escape.)

---

## 9. Activity auto-advances the pipeline (backend)

Logging outreach used to leave `stage` untouched (so "Contacted" could stay
empty forever). Now `POST /api/sales/leads/{id}/activities` moves a lead
**forward only**:

- `activity_type in {call, email_sent, whatsapp, meeting}` AND stage in
  `{new_lead, no_response}` → **contacted**.
- `activity_type == "reply_received"` AND stage in
  `{new_lead, contacted, no_response}` → **responded**.
- `note` (and anything else) → no change.
- The response now also returns the lead's new `stage`.

Both the Log-activity form (`saveActivity` already calls `load()`) and the
Send-email stub (`sendEmail` now calls `load()`) reflect the advance.

---

## 10. Bug fixed: "Add lead" was 500-ing (pre-existing)

`POST /api/sales/leads` threw `IntegrityError: NOT NULL constraint failed:
sales_leads.created_at`. This DB's `sales_leads.created_at` has no server
default (a SQLite quirk — the same class of bug the earlier handover documented
for `SalesActivity`), and `create_lead` never set it. **Fix:** `create_lead`
now passes `created_at=datetime.now()` explicitly. (So creating a lead through
the app works now — it was silently broken before.)

---

## 11. ENVIRONMENT: zombie uvicorn + clean restart (important)

Backend code changes weren't taking effect and `create_lead` 500'd because
**two duplicate uvicorn instances** were running on port 8000 plus orphaned
`multiprocessing.spawn` children (the exact gotcha in `HANDOVER.md` §4.1) —
one misconfigured (`--reload` without `--host`/`--reload-dir`), serving stale
code. All CR-Portal uvicorn processes were killed and **one clean instance**
was started:

```
.venv\Scripts\python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir app
```

If backend edits ever "don't take effect" again: kill zombies, confirm port
8000 free, restart with that exact command. `--reload` here proved flaky at
picking up edits (watchfiles fallback) — a hard restart is the reliable path.

---

## 12. Verification state

- `npx tsc --noEmit` — **clean** (frontend).
- Backend `pytest` suite exists (`backend/tests/`, ~34 files) — not re-run this
  session, but the auto-advance + create_lead fixes were verified live via the
  API and the browser.
- Preview gotchas from `HANDOVER.md` all still apply: **screenshots time out**;
  **rAF + CSS transitions freeze in the backgrounded preview tab** (count-ups,
  fades, smooth-scroll, confetti, dot/dropdown transitions only animate in a
  real foreground browser — verify layout/state via `javascript_tool` DOM
  inspection, and inject `transition:none` to measure). Vite dev server is on
  5173; open as different acting-as users to exercise each role.

---

## 13. Process notes

- The user wanted to install third-party design plugins (`design-style-picker`,
  `impeccable`, `/audit`, `/normalize`, `/polish`) via `/plugin`. Those are
  interactive Claude Code CLI installs (and third-party code) — run them in an
  interactive `claude` terminal if wanted. This session used the already-
  installed **`interface-design`** skill for the direction work instead, and
  the `visualize` tool to render the live specimens the user reacted to.
- Five generic directions were proposed first and rejected; the **Inspirelabs
  "Build Blocks"** direction in §0 is the accepted path.

---

## 14. File map (net new / changed this session)

New:
- `frontend/src/components/CSLandingPage.tsx`
- `frontend/src/components/SalesLandingPage.tsx`
- `frontend/src/vite-env.d.ts`
- `Handover3.md` (this file)

Changed (frontend): `App.tsx`, `types.ts`, `styles.css` (large landing +
`.cscx-*` + `.saf-*` + `.pdd-*` + dashed/`.sf-draft-btn` blocks),
`components/SalesTab.tsx`, `components/NotificationBell.tsx`.

Changed (backend): `app/main.py` (`create_lead` fix, `create_activity`
auto-advance, `SALES_STAGES`).

(Plus everything already carried in from Session 2 / `Handover 2.md`, all now
committed in `1bb04cb`.)
