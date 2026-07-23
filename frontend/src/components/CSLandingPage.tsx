import { useEffect, useRef, useState } from "react";
import { api, formatMoney, formatNumber, formatPct } from "../api";
import { isHandler, isPrivileged, userLabel } from "../types";

/** The CS feature tabs a landing card can jump to. */
export type CSTab = "entry" | "analytics" | "dashboard" | "transfer";

const REDUCED =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** Name of the last completed month, e.g. "June 2026". */
function lastMonthLabel(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** Ease a number from 0 to target once, on mount / when target settles.
 *  rAF is paused in a backgrounded tab, so a timer safety-net guarantees the
 *  final value always lands (the number is data, it must never stick at 0). */
function useCountUp(target: number, ms = 950): number {
  const [v, setV] = useState(REDUCED ? target : 0);
  const raf = useRef<number>();
  useEffect(() => {
    if (REDUCED || document.visibilityState === "hidden") {
      setV(target);
      return;
    }
    const start = performance.now();
    let done = false;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(target * eased);
      if (t < 1) raf.current = requestAnimationFrame(tick);
      else {
        done = true;
        setV(target);
      }
    };
    raf.current = requestAnimationFrame(tick);
    const safety = window.setTimeout(() => {
      if (!done) setV(target);
    }, ms + 400);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      window.clearTimeout(safety);
    };
  }, [target, ms]);
  return v;
}

interface Totals {
  clicks: number;
  sales: number;
  cr: number;
  gmv: number;
  revenue: number;
}

/** The landing's numbers, cached per user so a reload (e.g. Chrome discarding a
 *  backgrounded tab) repaints the last-known figures instantly and revalidates
 *  in the background, instead of flashing the skeleton. */
interface HomeSnapshot {
  mineTotals: Totals;
  allTotals: Totals;
  brands: number;
  allBrands: number;
  reminders: number;
}
const homeKey = (u: string) => `cr.home.${u}`;
function readHome(u: string): HomeSnapshot | null {
  try {
    const s = sessionStorage.getItem(homeKey(u));
    return s ? (JSON.parse(s) as HomeSnapshot) : null;
  } catch {
    return null;
  }
}
function writeHome(u: string, snap: HomeSnapshot) {
  try {
    sessionStorage.setItem(homeKey(u), JSON.stringify(snap));
  } catch {
    /* private mode / quota — the network fetch still fills the page */
  }
}

type MetricKey = keyof Totals;
type Kind = "count" | "money" | "pct";

// Real metric colours (colour = data). `additive` metrics can be summed, so a
// share of the whole is meaningful; CR is a rate, so it's compared instead.
// The spotlight cards are light frosted glass, so each metric wears its darker
// shade (readable on the light pane) — same hues as the app's light palette.
const CM: Record<MetricKey, { label: string; color: string; kind: Kind; additive: boolean }> = {
  clicks: { label: "Clicks", color: "#2563EB", kind: "count", additive: true },
  sales: { label: "Sales", color: "#0C9D63", kind: "count", additive: true },
  cr: { label: "CR", color: "#C21E63", kind: "pct", additive: false },
  gmv: { label: "GMV", color: "#C2740A", kind: "money", additive: true },
  revenue: { label: "Revenue", color: "#7A4EE0", kind: "money", additive: true },
};

// The rotation: outcome pair first (Sales + Revenue), then the funnel-top pair
// (Clicks + CR).
const SLIDES: MetricKey[][] = [
  ["sales", "revenue"],
  ["clicks", "cr"],
];

function fmtByKind(kind: Kind, v: number): string {
  if (kind === "money") return formatMoney(v);
  if (kind === "pct") return formatPct(v);
  return formatNumber(v);
}

const ICONS: Record<CSTab, JSX.Element> = {
  entry: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  analytics: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" rx="1" /><rect x="12" y="7" width="3" height="10" rx="1" /><rect x="17" y="4" width="3" height="13" rx="1" />
    </svg>
  ),
  dashboard: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M8 9v11" />
    </svg>
  ),
  transfer: (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h13l-3-3M20 16H7l3 3" />
    </svg>
  ),
};

const ArrowGo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const ChipGo = () => (
  <svg className="lp-chip-go" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m9 18 6-6-6-6" />
  </svg>
);

export default function CSLandingPage({
  user,
  onNavigate,
  onOpenNotifications,
}: {
  user: string;
  onNavigate: (tab: CSTab) => void;
  onOpenNotifications: () => void;
}) {
  const privileged = isPrivileged(user);
  const handler = isHandler(user);

  // Seed from the per-user cache so the first paint after a reload already shows
  // real numbers (never the skeleton) for whoever was last acting.
  const seed = readHome(user);
  const [mineTotals, setMineTotals] = useState<Totals | null>(seed?.mineTotals ?? null);
  const [allTotals, setAllTotals] = useState<Totals | null>(seed?.allTotals ?? null);
  const [brands, setBrands] = useState(seed?.brands ?? 0);
  const [allBrands, setAllBrands] = useState(seed?.allBrands ?? 0);
  const [reminders, setReminders] = useState(seed?.reminders ?? 0);
  const [loaded, setLoaded] = useState(seed != null);

  useEffect(() => {
    let live = true;
    // If we have a cached snapshot for this user, keep showing it and revalidate
    // silently; only drop to the skeleton when there is nothing to show yet.
    const cached = readHome(user);
    if (cached) {
      setMineTotals(cached.mineTotals);
      setAllTotals(cached.allTotals);
      setBrands(cached.brands);
      setAllBrands(cached.allBrands);
      setReminders(cached.reminders);
      setLoaded(true);
    } else {
      setLoaded(false);
    }
    const ownerParam = handler ? user : undefined;
    // My book, and the whole portfolio, for the same completed month. For a
    // privileged user "mine" already is the whole book, so we reuse one call.
    const mineOv = api.overview({ handlers: handler ? [user] : [], months: 1 });
    const allOv = handler ? api.overview({ handlers: [], months: 1 }) : mineOv;
    Promise.all([
      api.listMerchants(ownerParam),
      mineOv,
      allOv,
      api.getNotifications(user).catch(() => []),
    ])
      .then(([ms, mine, all, notifs]) => {
        if (!live) return;
        const snap: HomeSnapshot = {
          mineTotals: mine.totals as Totals,
          allTotals: all.totals as Totals,
          brands: ms.length,
          allBrands: all.by_merchant?.length ?? ms.length,
          reminders: notifs.filter((n) =>
            ["pending", "reason_submitted", "rejected"].includes(n.status)
          ).length,
        };
        setBrands(snap.brands);
        setMineTotals(snap.mineTotals);
        setAllTotals(snap.allTotals);
        setAllBrands(snap.allBrands);
        setReminders(snap.reminders);
        setLoaded(true);
        writeHome(user, snap);
      })
      .catch(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [user, handler]);

  const cards: { tab: CSTab; title: string; desc: string; color: string }[] = [
    { tab: "entry", title: "Data Entry", desc: "Log this period's clicks, sales, GMV and revenue for your brands.", color: "#3D8BF5" },
    { tab: "analytics", title: "Data View", desc: "Month-by-month performance broken down across every brand you handle.", color: "#12B5A5" },
    { tab: "dashboard", title: "Merchant Info", desc: "Each brand's details, reporting cadence and full edit history.", color: "#17B978" },
  ];
  if (privileged) {
    cards.push({ tab: "transfer", title: "Brand Transfer", desc: "Reassign a brand to another handler and keep the audit trail.", color: "#8B6BF0" });
  }

  return (
    <div className="lp">
      {/* ---- hero ---- */}
      <section
        className="lp-hero"
        style={{ ["--glow-a" as string]: "#FF9A5C", ["--glow-b" as string]: "#E0763C" }}
      >
        <div className="lp-hero-content">
          <span className="lp-eyebrow">GrabOn · CR Portal</span>
          <h1 className="lp-title">
            {greeting()}, <b>{userLabel(user)}</b>
          </h1>
          <div className="lp-hero-chips">
            <button
              className="lp-hero-chip lp-hero-chip-btn"
              onClick={() => onNavigate("analytics")}
              data-tip="Open Data View"
            >
              <span className="lp-cdot" style={{ ["--cdot" as string]: "#3D8BF5" }} />
              <span className="lp-chip-txt">
                {loaded ? <><span className="mono">{brands}</span> brands</> : "loading brands"}
              </span>
              <ChipGo />
            </button>
            <button
              className="lp-hero-chip lp-hero-chip-btn"
              onClick={onOpenNotifications}
              data-tip="Open notifications"
            >
              <span
                className="lp-cdot"
                style={{ ["--cdot" as string]: reminders > 0 ? "#E08C0C" : "#17B978" }}
              />
              <span className="lp-chip-txt">
                {loaded
                  ? reminders > 0
                    ? <><span className="mono">{reminders}</span> need action</>
                    : "all caught up"
                  : "checking reminders"}
              </span>
              <ChipGo />
            </button>
          </div>
        </div>

        <div className="lp-visual" aria-hidden="true">
          {loaded && mineTotals && allTotals ? (
            <ContributionSpotlight
              mine={mineTotals}
              all={allTotals}
              allBrands={allBrands}
              isHandlerView={handler}
              monthLabel={lastMonthLabel()}
            />
          ) : (
            <div className="cscx-skel" />
          )}
        </div>
      </section>

      {/* ---- feature cards ---- */}
      <p className="lp-sec">Jump into your work</p>
      <div className="lp-cards">
        {cards.map((c, i) => (
          <button
            key={c.tab}
            className="lp-card"
            style={{ ["--cc" as string]: c.color, animationDelay: `${i * 60}ms` }}
            onClick={() => onNavigate(c.tab)}
          >
            <span className="lp-card-ic">{ICONS[c.tab]}</span>
            <span className="lp-card-title">{c.title}</span>
            <span className="lp-card-desc">{c.desc}</span>
            <span className="lp-card-go">
              Open <ArrowGo />
            </span>
            <span className="lp-card-accent" />
          </button>
        ))}
      </div>
    </div>
  );
}

/** A count-up number that formats as it rises. Remounts (via key) restart it. */
function CountNum({ value, kind }: { value: number; kind: Kind }) {
  const v = useCountUp(value, 850);
  return <>{fmtByKind(kind, v)}</>;
}

/** One metric: the big value, then either a contribution bar (additive metrics,
 *  with the share sitting under the bar at the right) or a "vs portfolio"
 *  comparison for CR. A privileged/all view shows the portfolio total only. */
function MetricBlock({
  mkey,
  mine,
  all,
  allBrands,
  isHandlerView,
}: {
  mkey: MetricKey;
  mine: number;
  all: number;
  allBrands: number;
  isHandlerView: boolean;
}) {
  const m = CM[mkey];

  if (!isHandlerView) {
    return (
      <div className="cscx-metric">
        <span className="cscx-label">{m.label}</span>
        <div className="cscx-val" style={{ color: m.color }}>
          <CountNum value={mine} kind={m.kind} />
        </div>
        <div className="cscx-sub">
          <span>portfolio total · {allBrands} brands</span>
        </div>
      </div>
    );
  }

  if (!m.additive) {
    // CR is a rate: compare your blended conversion to the portfolio's.
    const delta = mine - all;
    const up = delta >= 0;
    return (
      <div className="cscx-metric">
        <span className="cscx-label">{m.label}</span>
        <div className="cscx-val" style={{ color: m.color }}>
          <CountNum value={mine} kind={m.kind} />
        </div>
        <div className="cscx-sub cscx-sub-cmp">
          <span>vs portfolio <b>{formatPct(all)}</b></span>
          <span className={`cscx-delta ${up ? "up" : "down"}`}>
            {up ? "▲" : "▼"} {Math.abs(delta).toFixed(2)} pts
          </span>
        </div>
      </div>
    );
  }

  const share = all > 0 ? (mine / all) * 100 : 0;
  return (
    <div className="cscx-metric">
      <span className="cscx-label">{m.label}</span>
      <div className="cscx-val" style={{ color: m.color }}>
        <CountNum value={mine} kind={m.kind} />
      </div>
      <div className="cscx-bar">
        <span className="cscx-bar-fill" style={{ width: `${Math.min(100, share)}%`, background: m.color }} />
      </div>
      <div className="cscx-sub">
        <span>of <b>{fmtByKind(m.kind, all)}</b> · all {allBrands} brands</span>
        <span className="cscx-share">{Math.round(share)}%</span>
      </div>
    </div>
  );
}

/** The rotating "your contribution vs all brands" panel. Auto-advances through
 *  metric slides, pauses on hover, fades between them, and re-runs the count-up
 *  + bar-fill each time a slide lands. */
function ContributionSpotlight({
  mine,
  all,
  allBrands,
  isHandlerView,
  monthLabel,
}: {
  mine: Totals;
  all: Totals;
  allBrands: number;
  isHandlerView: boolean;
  monthLabel: string;
}) {
  const [spot, setSpot] = useState(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (REDUCED || SLIDES.length <= 1) return;
    const id = window.setInterval(() => {
      if (!pausedRef.current) setSpot((s) => (s + 1) % SLIDES.length);
    }, 4600);
    return () => window.clearInterval(id);
  }, []);

  const slide = SLIDES[spot];
  return (
    <div
      className="cscx"
      onMouseEnter={() => (pausedRef.current = true)}
      onMouseLeave={() => (pausedRef.current = false)}
    >
      <div className="cscx-head">
        <span className="cscx-eyebrow">
          {isHandlerView ? "Your contribution" : "Portfolio"} · {monthLabel}
        </span>
        <div className="cscx-dots">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              tabIndex={-1}
              className={`cscx-dot ${i === spot ? "on" : ""}`}
              onClick={() => setSpot(i)}
              aria-label={`View ${i + 1}`}
            />
          ))}
        </div>
      </div>

      <div
        className="cscx-body"
        key={spot}
        style={{ gridTemplateColumns: `repeat(${slide.length}, minmax(0, 1fr))` }}
      >
        {slide.map((k) => (
          <MetricBlock
            key={k}
            mkey={k}
            mine={mine[k]}
            all={all[k]}
            allBrands={allBrands}
            isHandlerView={isHandlerView}
          />
        ))}
      </div>

      <div className="cscx-progress">
        <i key={spot} />
      </div>
    </div>
  );
}
