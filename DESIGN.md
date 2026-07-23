# CR Portal — Design (single source of design truth)

The presentation layer, rebuilt. This file records the committed direction, the
signature, the token rationale, and every non-cosmetic decision. Keep it current.

---

## Direction — **"Conversion"**

### The human, the task, the feel
Swati, Yamini and Meena open this mid-morning to **post yesterday's numbers** for
the brands they own, clear whatever is flagged red, and see where they stand.
A Manager and the Founders Office read across everyone; a Delivery user fills a
queue; Sales moves leads down a pipeline. They came off Excel. Sessions are
10–40 minutes of typing figures and scanning dense tables.

It should feel **alive and precise** — a console you're glad to open, not a form
you endure. Vivid, but ordered: nothing decorative competes with the data.

### The idea that makes it colourful without noise
CR Portal measures a funnel: **Clicks → Sales → CR% → GMV → Revenue**. So a
metric always wears **its own hue, everywhere** — in the spine, the chart series,
the table's column-header dot, the filter chip, the in-cell magnitude bar and
the entry field's label. Colour means *"which measure is this"*, never decoration.

### Brand
The sidebar shows the **Inspirelabs wordmark** (`assets/inspirelabs-wordmark.png`)
with **CRM** set under it when open; collapsed, the **symbol alone**
(`shell/BrandMark.tsx`, an SVG of three placed blocks + one dashed) stands in and
becomes the button that re-opens the rail. Collapsing is a separate panel handle
in the brand row (a framed icon with a left chevron), so the two directions never
share one ambiguous control. The interface **accent is Inspirelabs orange**
(`--accent`, a deepened tone of the mark's orange so white text on a filled button
clears AA) — action, active, unread, "you are here". It is never data.

| Metric | Hue | |
|---|---|---|
| Clicks | blue | `--m-clicks` |
| Sales | green | `--m-sales` |
| CR % | pink (a ratio, not a magnitude — never confusable with a total) | `--m-cr` |
| GMV | amber | `--m-gmv` |
| Revenue | violet | `--m-revenue` |

Roughly 60 neutral ground / 30 surface + ink / 10 colour, and most of that 10
is data; the accent orange is the rest.

### The signature — the **Conversion Spine**
`frontend/src/components/ConversionSpine.tsx`. The five metrics as one connected
ribbon at the head of Data View: each segment carries its hue as a top rule and a
dot, the figure **counts up** on arrival, a delta chip shows the move against the
previous period, and chevrons in the gutters carry the eye down the funnel. It is
the page's focal point *and* the legend for every hue in the table below it. It
exists only for this product, because it is this product's physics.

Supporting signatures: the sidebar's sliding orange tick; the ledger header's
five-hue rule that draws itself in; in-cell bars in the metric's own colour.

### Rejected defaults
- Grey sidebar + white cards + one blue accent → the **metric-chromatic** system.
- Four identical KPI boxes in a row → the **connected spine**, with the funnel's
  direction expressed structurally.
- A flat data table → numeric cells carry a magnitude bar in the metric's hue;
  month bands in the breakdown rotate the metric hues.

---

## Ground: one light theme

A single **light** ground (`:root` in `tokens.css`) — no theme switch. Surfaces
move in **lightness only, one hue**: `--canvas` → `--surface` → `--paper` →
`--paper-2` → `--paper-3`. The sidebar shares the canvas (a border, not a
different world). Inputs sit *darker* than their surroundings — they receive
content. The one deep surface is the landing hero band, which earns it so the
figures on it read as lit.

The taxonomy hues (metric, stage, priority, activity) are mid-tone so the same
value works as a dot, bar or border. Where they must act as **text** (chips, the
handler-avatar initial, a card CTA), the hue is darkened toward ink to clear
4.5:1. Every text/background pair in the app was measured with a pixel-level
contrast audit across all six screens and every role; all pass WCAG AA (disabled
controls excepted, per WCAG 1.4.3).

---

## Tokens (`frontend/src/styles/tokens.css`)

Everything resolves through this file. No raw hex or off-scale pixel outside it.

- **Type — Inter (variable), one face.** Hierarchy comes from three levers
  together — size, weight, colour — never size alone. Scale ratio 1.25 from a
  14px base: `10.5 · 11.5 · 12.5 · 13.5 · 14 · 16 · 20 · 25 · 32 · 42`. Negative
  tracking ≥ 20px. Every figure gets `tabular-nums` so columns never dance.
- **Spacing — 4px grid**, `--space-1..10`. Density is a decision: control height
  **36px**, card padding 20px, page gutter 32px — a workbench, not a brochure.
- **Radius** — a scale, applied deliberately: `5 / 8 / 12 / 16 / 22`.
- **Depth — one strategy: a 1px ring plus a soft shadow.** In-flow surfaces use
  the ring; real shadows are reserved for floating layers (menu, popover, modal,
  drawer, toast).
- **Motion** — `120 / 180 / 260 / 380 / 560ms`; `--ease-out
  cubic-bezier(.23,1,.32,1)` for everything entering, spring reserved for the
  signature moments (nav tick, pinned note, toast). Transform and opacity only.
  Full `prefers-reduced-motion` collapse, including the count-ups.

### Blocklist (enforced)
No raw hex or raw pixel outside `tokens.css` · no size-only hierarchy · no mixed
depth strategies · no colour without meaning · no gradient accent · no emoji as
icons · no `transition: all`.

---

## File map

| File | Owns |
|---|---|
| `styles/tokens.css` | type, spacing, colour, elevation, radius, motion; both themes |
| `styles/base.css` | reset, typographic voice, focus, scrollbars, shared keyframes, ambient field |
| `styles/components.css` | every control family + full state matrix; light-theme contrast corrections |
| `styles/shell.css` | sidebar, top bar, theme switch, page transition |
| `styles/screens.css` | the spine, page headers, and every screen's composition |

`styles.css` and `styles/page.css` (three overlapping half-migrated systems) were
deleted; this set replaces them.
