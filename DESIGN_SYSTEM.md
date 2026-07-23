# CR Portal — Design System

**Codename:** Build Blocks
**For:** GrabOn CR Portal (CS + Sales), built by Inspirelabs
**Direction:** premium, data-dense, confident. An operator's tool, not a
brochure-y SaaS admin panel. Numbers are the hero; one orange accent carries
meaning; motion is deliberate and physical, never decorative.

Every value below is derived from the **Inspirelabs brand assets**, not
invented. The through-line: the logo is *rounded blocks* — one orange, one
black, one gray, and one **dashed empty block** ("Always building"). That
"place the next block" idea is the spine of the whole system.

---

## 0. Brand extraction (the source of every decision)

| Brand asset | Becomes |
|---|---|
| Orange square + orange dot on the "i" | **Primary accent** — action, brand, "active / you are here", unread. Reserved; never a data series. |
| Black square / wordmark ink | **Primary ink** `#141414` (headings, hero numbers). |
| Gray square | **Neutral scale** (warm gray, not cold blue-gray). |
| **Dashed empty block** | **The signature** — every empty / add-new / loading / placeholder state, and the "block-place" motion (§7). |
| Geometric bold wordmark | **Space Grotesk** — UI + headings. |
| Monospace "Always building." tagline | **JetBrains Mono** — all numbers, labels, data. |
| White field around the mark | **Paper** ground, generous air, borders-only depth. |

Guardrails (anti-generic): **no purple gradients**, **no cards nested in
cards**, **no Inter + glow**. Depth is hairlines + whitespace + exactly one
float shadow. Orange is a scarce resource (~10% of any screen).

---

## 1. Spacing & grid

**Base unit: 4px.** Everything is a multiple. Density is a decision — this app
is *tight* (operator density), not airy.

| Token | px | Use |
|---|---|---|
| `--space-0` | 0 | reset |
| `--space-1` | 4 | icon/text micro-gaps |
| `--space-2` | 8 | control internal, chip gaps |
| `--space-3` | 12 | default gap between fields |
| `--space-4` | 16 | card padding (compact) |
| `--space-5` | 20 | card padding (standard) |
| `--space-6` | 24 | between groups |
| `--space-8` | 32 | between sections |
| `--space-10` | 40 | page rhythm |
| `--space-12` | 48 | hero blocks |
| `--space-16` | 64 | landing sections |

Semantic aliases (use these at call sites, not raw numbers):

```css
--pad-card: 20px;         /* .card padding */
--pad-control-x: 12px;    /* input/button horizontal */
--gap-tight: 8px;
--gap: 12px;
--gap-section: 24px;
--gutter-page: 24px;      /* .page left/right */
--page-max: 1440px;
```

**Control heights** (fixed, so rows align): `--h-control: 36px` (standard),
`--h-control-sm: 28px` (table-inline), `--h-control-lg: 44px` (primary CTAs /
touch min). Hit area ≥ 40px even when the visible control is smaller.

**Padding is symmetrical.** If one side has a value, the others match unless
content genuinely demands otherwise.

---

## 2. Color tokens

Warm-neutral base (a hint of taupe, matching the logo's warm black/gray — this
is what keeps it off the generic cold-SaaS look). One orange accent. Semantic
colors reserved for status only. A separate categorical palette for data — and
**orange is never a data series** (it would collide with the brand).

### 2.1 Primary — orange (brand / action / active)

| Stop | Hex | Role |
|---|---|---|
| `--orange-50` | `#FEF2EB` | tint background (hover fill, active chip) |
| `--orange-100` | `#FBDECB` | soft fill |
| `--orange-200` | `#F7BE9B` | |
| `--orange-300` | `#F49766` | |
| `--orange-400` | `#F26B2C` | **DEFAULT — the brand orange** |
| `--orange-500` | `#E1571C` | hover |
| `--orange-600` | `#BC4715` | active / pressed / border |
| `--orange-700` | `#8E3611` | text on light tint (AA on `--orange-50`) |
| `--orange-900` | `#3A1607` | text on stronger tints |

Roles: `--accent: var(--orange-400)` · `--accent-hover: var(--orange-500)` ·
`--accent-press: var(--orange-600)` · `--accent-bg: var(--orange-50)` ·
`--accent-ink: var(--orange-700)` · `--on-accent: #FFFFFF`.

### 2.2 Neutral — warm ink/gray (structure + text)

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#FFFFFF` | cards, floating layers |
| `--canvas` | `#FAFAF8` | page background |
| `--surface` | `#F5F4F1` | inset / secondary surface, inputs |
| `--rule-soft` | `#ECEAE6` | faint divider |
| `--rule` | `#E2DFDA` | **default hairline** |
| `--border-strong` | `#CFCBC4` | hover border, emphasis |
| `--ink-400` | `#ABA79F` | disabled text, decorative |
| `--ink-muted` | `#86837C` | metadata, captions, placeholders |
| `--ink-secondary` | `#58554F` | supporting text |
| `--ink-700` | `#3D3B36` | strong body |
| `--ink` | `#141414` | headings, hero numbers, primary text |

Text hierarchy is four levels: `--ink` (primary) → `--ink-secondary`
(supporting) → `--ink-muted` (metadata) → `--ink-400` (disabled). Never use
opacity on text — pick a stop.

### 2.3 Secondary — ink as the "quiet strong"

There is no second brand hue by design (restraint = premium). The **secondary
action** color is ink, not a color: secondary buttons are `--paper` +
`--border-strong`; the strongest neutral fill (e.g. a dark CTA alternative) is
`--fill-ink: #141414` / `--on-ink: #FFFFFF`. Orange is the *only* accent.

### 2.4 Semantic (status only — never decoration)

Hue-separated from the brand orange so nothing is confusable.

| Role | Core | Tint bg | Ink (on tint) |
|---|---|---|---|
| Success | `--success: #1E9E5B` | `--success-bg: #E7F5EC` | `--success-ink: #0E5F35` |
| Danger | `--danger: #DC3A32` | `--danger-bg: #FCEAE9` | `--danger-ink: #8E211C` |
| Warning | `--warning: #E0A008` | `--warning-bg: #FBF1D8` | `--warning-ink: #7C5606` |
| Info | `--info: #2E77D0` | `--info-bg: #E8F0FB` | `--info-ink: #164A86` |

Warning is deliberately **yellow-amber** (~42° hue) so it never reads as the
brand orange (~22°). Danger is a true red (~5°). Status always pairs color with
an icon or label — never color alone.

### 2.5 Data / categorical (charts, metric colors)

Fixed order, never cycled like a rainbow. **Orange is excluded** (reserved for
brand). Use the mid hue for bars/fills, the darker end for text on white.

| Slot | Hue | Hex | CR-portal metric |
|---|---|---|---|
| 1 | blue | `#2E77D0` | Clicks |
| 2 | green | `#2E9E5B` | Sales |
| 3 | teal | `#0E9BAE` | CR |
| 4 | violet | `#6A5AE0` | GMV |
| 5 | rose | `#C43E7A` | Revenue |
| 6 | slate | `#64748B` | overflow / "Other" |

Diverging (Δ vs target): blue ↔ red through a neutral gray midpoint
(`#EFEDE9`) — never a hue at the midpoint. Sequential (magnitude): one hue,
light→dark.

### 2.6 Elevation & effects (borders-first, one shadow)

- **Depth strategy: borders-only, with ONE float shadow** for genuinely
  floating layers (dropdown, popover, modal, drawer, toast). No shadows on
  in-flow cards. No glow, no neon.
- `--shadow-pop: 0 1px 2px rgba(20,20,20,.05), 0 10px 28px -10px rgba(20,20,20,.16)`
- `--shadow-modal: 0 2px 6px rgba(20,20,20,.06), 0 24px 60px -16px rgba(20,20,20,.22)`
- **Focus ring (orange, always visible):**
  `--focus-ring: 0 0 0 2px var(--paper), 0 0 0 4px var(--orange-400)`
- **Dashed language (signature):**
  `--dash: 2px dashed var(--border-strong)` — the empty-block border.

### 2.7 Dark mode (variant, later)

Same tokens, inverted; one hue, shift only lightness. Ground `--canvas: #141414`,
`--surface: #1C1B19`, `--paper: #201F1C`, `--ink: #F5F4F1`, hairlines
`rgba(255,255,255,.10)`. Orange stays `#F26B2C` (pops harder on dark). Shadows
weaken on dark — lean on borders. Not built yet; do not block v1 on it.

---

## 3. Typography

Two families, both bundled locally via `@fontsource` (**no CDN**, same pattern
as today): **Space Grotesk** (geometric — matches the wordmark) and
**JetBrains Mono** (matches the "Always building." tagline). Numbers and
micro-labels are always mono. If dense tables ever feel busy in Space Grotesk,
`Manrope` is the sanctioned body swap (headings stay Space Grotesk).

```css
--font-ui:   "Space Grotesk", "Segoe UI", system-ui, sans-serif;
--font-data: "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace;
```

### 3.1 Type scale (ratio ~1.25, base 14px — tuned for density)

| Token | Size / line-height | Weight | Family | Use |
|---|---|---|---|---|
| `--t-display` | 40 / 1.05, `-0.02em` | 700 | ui | landing hero |
| `--t-h1` | 28 / 1.1, `-0.02em` | 700 | ui | page / section hero |
| `--t-h2` | 22 / 1.15, `-0.01em` | 700 | ui | card title, modal title |
| `--t-h3` | 18 / 1.2 | 600 | ui | sub-section |
| `--t-h4` | 16 / 1.25 | 600 | ui | strong label |
| `--t-body` | 14 / 1.5 | 400 | ui | **base** |
| `--t-body-sm` | 13 / 1.45 | 400 | ui | dense body, table cells |
| `--t-caption` | 12 / 1.4 | 400 | ui | helper text |
| `--t-data` | 11 / 1.3, `0.06em` | 500 | data | uppercase micro-label |
| `--t-num` | 13–26 (context) | 500 | data | every number |
| `--t-num-hero` | 26–40 | 500 | data | KPI / hero figures |

Weights: **400 / 500 / 700** only (no 600 in body — reserve for headings). Big
type gets negative tracking (`-0.02em` at 28px+); body stays neutral. All
numbers use `font-variant-numeric: tabular-nums` (JetBrains Mono is inherently
tabular) so columns and count-ups never shift.

### 3.2 Rules
- Words in the sans, numbers in the mono. Money is `₹ Lakh/Crore` (`formatMoney`).
- Micro-labels are `--t-data` (11px, mono, tracked, uppercase) — the one place
  ALL CAPS is allowed, because it's a data label, not prose.
- `text-wrap: balance` on headings, `pretty` on body. `-webkit-font-smoothing:
  antialiased` on root.
- **No em/en-dashes** anywhere (hard product rule). Use `-`.

---

## 4. Border-radius

The blocks are noticeably rounded — this is a brand tell, so radii run a touch
larger than a typical admin UI.

| Token | px | Use |
|---|---|---|
| `--radius-xs` | 6 | chips, badges, tags, small dots' container |
| `--radius-sm` | 8 | buttons, inputs, selects |
| `--radius-md` | 12 | cards, KPI tiles, dropdown menus |
| `--radius-lg` | 16 | modals, drawers, hero panels |
| `--radius-block` | 12 | **the block motif** (KPI tile, avatar, nav icon) |
| `--radius-full` | 999px | pills, the orange dot, toggles |

**Concentric radius:** nested rounded elements → `outer = inner + padding`
(a 12px tile with 8px inner padding uses 20px on the wrapper, or ≤ child). No
single-sided rounded borders — if a left/top accent bar is used, that element
stays square. Never same-radius parent+child (the most common "off" tell).

---

## 5. Motion tokens

Motion is **felt, not watched** — fast, purposeful, physical (blocks settle and
snap). Only `transform` and `opacity` animate (GPU-composited); never
`transition: all`. Everything below respects `prefers-reduced-motion` (drop
transforms, keep opacity/color).

### 5.1 Durations

```css
--dur-instant: 80ms;    /* dense control color/opacity */
--dur-fast:    120ms;   /* hover states */
--dur-base:    180ms;   /* dropdown/tooltip, tab indicator */
--dur-moderate:240ms;   /* popover, chip toggle, page-content swap */
--dur-slow:    320ms;   /* modal / drawer entrance */
--dur-slower:  480ms;   /* large drawer, celebratory */
```

### 5.2 Easing

```css
--ease-out:    cubic-bezier(0.22, 1, 0.36, 1);   /* entering / interactive — strong settle */
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);   /* on-screen movement (tab indicator) */
--ease-in:     cubic-bezier(0.4, 0, 1, 1);        /* exits only (rare) */
--ease-snap:   cubic-bezier(0.34, 1.4, 0.64, 1);  /* the "block place" overshoot — signature */
```

Never `ease-in` for entrances (it delays the frame the user is watching).
Custom curves only — built-in `ease`/`linear` are too weak (linear allowed only
for spinners/progress bars).

### 5.3 Per-interaction spec

| Interaction | Duration | Easing | What moves |
|---|---|---|---|
| **Hover** (button, row, chip) | `--dur-fast` | `--ease-out` | bg/border color, `translateY(-1px)` on cards |
| **Press / click** | 100ms | `--ease-out` | `transform: scale(0.97)` (never < 0.95) |
| **Tab switch** | `--dur-base` | `--ease-in-out` | the **orange block indicator slides** between tabs (shared-layout), content cross-fades |
| **Dropdown / popover** | `--dur-base` | `--ease-out` | scale `0.96→1` + opacity, `transform-origin` = trigger edge |
| **Tooltip** | 140ms | `--ease-out` | opacity + 2px rise |
| **Modal open** | `--dur-slow` | `--ease-out` | panel `scale(0.96)→1` + opacity; backdrop fades 200ms |
| **Modal close** | `--dur-base` | `--ease-in` | reverse, **faster than open** |
| **Drawer** (notifications) | `--dur-slow`–`--dur-slower` | `--ease-out` | `translateX(100%)→0` |
| **Page / route content** | `--dur-moderate` | `--ease-out` | `translateY(8px)→0` + opacity |
| **List / grid entrance** | per-item | `--ease-out` | scale-in with **30–50ms stagger** |
| **Count-up numbers** | 850ms | cubic ease-out (JS) | value ramps 0→target (mono, no layout shift) |

Frequency rule: things done 100+×/day (keyboard nav, dense inline edits) get
**no** animation — it makes them feel slow. Occasional surfaces (modals,
drawers, tab switches) get standard motion. Rare/first-run moments (a lead
closes won) may add delight (confetti already exists on the Sales landing).

---

## 6. Depth, states & anti-patterns

- **One elevation.** In-flow tiles are flat (border + surface tint). At most one
  floating layer's shadow visible at a time (a modal over a dropdown → close the
  dropdown). Third floating layer = a dialog, not popover-on-popover.
- **No cards nested in cards.** Group with whitespace, a hairline
  (`--rule-soft`), or an inset `--surface` tint — never a bordered card inside a
  bordered card. (Form "sections" use an inset tint, not a nested card.)
- **Every interactive element ships all states:** default · hover · active ·
  focus-visible (orange ring) · disabled. Every data view ships loading · empty
  · error. Missing states are the fastest "unfinished" tell.
- **Squint test:** blur the screen — hierarchy still reads, nothing harsh jumps
  out, borders disappear until looked for.

---

## 7. Signature — "Place the block"

**One detail makes this portal unmistakable: the dashed empty-block that snaps
into a solid block.** It is both a *visual language* and a *motion*, and it
recurs everywhere the product is "building."

**Where it appears (visual):**
- **Empty states** — an empty table, an empty pipeline stage, "no leads yet" →
  a large **dashed rounded block** with an orange `+`, captioned as an
  invitation ("Add your first block to start building"), not an apology.
- **Add-new** affordances and **skeletons/loading** use the same dashed-block
  language, so loading and empty feel like the same family, not two systems.
- **Active / "you are here"** — the **orange dot** (from the *i*) marks the
  active tab, unread notifications, and the live/current row; the **tab
  indicator is a small orange block** that slides between tabs.

**The motion (the hero moment):** when a dashed block *becomes real* — data
loads, an item is added, a skeleton resolves — the solid block **places
itself**: it scales in `0.92 → 1` with the **`--ease-snap`** overshoot while the
dashed placeholder cross-fades out beneath it. Fast (`--dur-moderate`), physical,
done once per arrival.

```css
@keyframes place-block {
  0%   { opacity: 0; transform: scale(0.92); }
  60%  { opacity: 1; }
  100% { opacity: 1; transform: scale(1); }
}
.block-in { animation: place-block var(--dur-moderate) var(--ease-snap) both; }

.block-empty {                      /* the dashed placeholder / add / skeleton */
  border: var(--dash);
  border-radius: var(--radius-block);
  background: transparent;
}
```

KPI tiles and table rows on first paint use `.block-in` with a 40ms stagger, so
a screen literally *assembles* from blocks. That's the whole brand ("Always
building") expressed as behavior — not a logo pasted in a corner.

---

## 8. Component application (quick reference)

- **Buttons:** primary = `--accent` fill + `--on-accent`, hover `--accent-hover`,
  press `scale(0.97)`, `--radius-sm`. Secondary = `--paper` + `--border-strong`.
  Danger = `--danger`. One accent-filled button per view (restraint).
- **Inputs/selects:** `--surface` fill (inset reads as "type here"),
  `--border-strong` at rest, `--focus-ring` on focus, `--h-control`,
  `--radius-sm`.
- **Chips/badges:** `--radius-xs`, tint bg + matching `-ink` text
  (`--accent-bg`/`--accent-ink` for "hot/active", semantic tints for status).
- **Cards / KPI tiles:** `--paper`, `--rule` border, `--radius-md`,
  `--pad-card`, flat; the "block" tiles use `--radius-block` and `.block-in`.
- **Tables:** hairline row separators (not boxed rows), `--surface` header,
  numbers right/left per §meaning in `--font-data` tabular, hover `--surface`.
- **The orange dot** = active/unread only. **Never** an orange data series.
- **Tab bar:** ink text, active = `--ink` + sliding **orange block** indicator.

---

## 9. Migration from the current tokens

| Current (`styles.css`) | New |
|---|---|
| `--navy #14213d` (primary/ink) | `--ink #141414` |
| `--lime #c6d92d` (accent, "recorded/you are here") | `--accent #F26B2C` + the **orange dot** |
| `--font-ui: Archivo` | `--font-ui: "Space Grotesk"` |
| `--font-num: IBM Plex Mono` | `--font-data: "JetBrains Mono"` |
| `--ease-out: cubic-bezier(0.23,1,0.32,1)` | `--ease-out: cubic-bezier(0.22,1,0.36,1)` (+ `--ease-snap`) |
| `--radius-ctl 7px` / `--radius-card 10px` | `--radius-sm 8px` / `--radius-md 12px` |
| lime tab underline / checkmarks / comeback rows | orange dot / orange block indicator |
| metric colours (gmv orange, revenue purple) | data palette §2.5 (gmv violet, revenue rose) — **orange freed for brand** |
| empty states (plain `.empty-state`) | **dashed block** language §7 |

Roll out one screen at a time (Sales Pipeline first — densest), verify in the
browser, then save the locked patterns back into this file / the
`interface-design` skill's `system.md`.

---

## 10. The `:root` (drop-in starting point)

```css
:root {
  /* orange — brand / action / active */
  --orange-50:#FEF2EB; --orange-100:#FBDECB; --orange-200:#F7BE9B;
  --orange-300:#F49766; --orange-400:#F26B2C; --orange-500:#E1571C;
  --orange-600:#BC4715; --orange-700:#8E3611; --orange-900:#3A1607;
  --accent:var(--orange-400); --accent-hover:var(--orange-500);
  --accent-press:var(--orange-600); --accent-bg:var(--orange-50);
  --accent-ink:var(--orange-700); --on-accent:#FFFFFF;

  /* warm neutral */
  --paper:#FFFFFF; --canvas:#FAFAF8; --surface:#F5F4F1;
  --rule-soft:#ECEAE6; --rule:#E2DFDA; --border-strong:#CFCBC4;
  --ink-400:#ABA79F; --ink-muted:#86837C; --ink-secondary:#58554F;
  --ink-700:#3D3B36; --ink:#141414; --fill-ink:#141414; --on-ink:#FFFFFF;

  /* semantic */
  --success:#1E9E5B; --success-bg:#E7F5EC; --success-ink:#0E5F35;
  --danger:#DC3A32;  --danger-bg:#FCEAE9;  --danger-ink:#8E211C;
  --warning:#E0A008; --warning-bg:#FBF1D8; --warning-ink:#7C5606;
  --info:#2E77D0;    --info-bg:#E8F0FB;    --info-ink:#164A86;

  /* data / metrics (orange reserved for brand) */
  --data-1:#2E77D0; --data-2:#2E9E5B; --data-3:#0E9BAE;
  --data-4:#6A5AE0; --data-5:#C43E7A; --data-6:#64748B;

  /* type */
  --font-ui:"Space Grotesk","Segoe UI",system-ui,sans-serif;
  --font-data:"JetBrains Mono","IBM Plex Mono",ui-monospace,monospace;

  /* spacing / sizing */
  --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-5:20px; --space-6:24px; --space-8:32px; --space-10:40px;
  --pad-card:20px; --pad-control-x:12px; --gap-tight:8px; --gap:12px;
  --gap-section:24px; --gutter-page:24px; --page-max:1440px;
  --h-control:36px; --h-control-sm:28px; --h-control-lg:44px;

  /* radius */
  --radius-xs:6px; --radius-sm:8px; --radius-md:12px; --radius-lg:16px;
  --radius-block:12px; --radius-full:999px;

  /* depth */
  --shadow-pop:0 1px 2px rgba(20,20,20,.05), 0 10px 28px -10px rgba(20,20,20,.16);
  --shadow-modal:0 2px 6px rgba(20,20,20,.06), 0 24px 60px -16px rgba(20,20,20,.22);
  --focus-ring:0 0 0 2px var(--paper), 0 0 0 4px var(--orange-400);
  --dash:2px dashed var(--border-strong);

  /* motion */
  --dur-instant:80ms; --dur-fast:120ms; --dur-base:180ms;
  --dur-moderate:240ms; --dur-slow:320ms; --dur-slower:480ms;
  --ease-out:cubic-bezier(0.22,1,0.36,1);
  --ease-in-out:cubic-bezier(0.65,0,0.35,1);
  --ease-in:cubic-bezier(0.4,0,1,1);
  --ease-snap:cubic-bezier(0.34,1.4,0.64,1);
}

@media (prefers-reduced-motion: reduce) {
  *,*::before,*::after { animation-duration:.01ms !important; transition-duration:.01ms !important; }
}
```

---

**One line to hold in your head:** warm white ground, one orange accent, mono
numbers on hairline rules, and everything empty or loading is a **dashed block
waiting to be placed** — because the brand is *always building*.
