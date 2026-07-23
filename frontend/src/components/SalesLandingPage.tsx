import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { SALES_STAGES, userLabel, type SalesLead } from "../types";

/** How the landing opens the pipeline: optionally pre-filtered. */
export type SalesOpen = (init?: { stage?: string; priority?: string }) => void;

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

/** rAF is paused in a backgrounded tab, so a timer safety-net guarantees the
 *  final value always lands (the count is data, it must never stick at 0). */
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

function stageColor(key: string): string {
  return SALES_STAGES.find((s) => s.key === key)?.color ?? "#8A93A8";
}
function stageLabel(key: string): string {
  return SALES_STAGES.find((s) => s.key === key)?.label ?? key;
}

// The forward path shown in the "pipeline at a glance" breakdown.
const FLOW = ["new_lead", "contacted", "responded", "negotiating", "closed_won"];

const CLOSED = new Set(["closed_won", "closed_lost", "parked"]);

const ArrowGo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

const TrophyIc = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
  </svg>
);
const HandshakeIc = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="m11 17 2 2a1 1 0 0 0 1.4 0l3.6-3.6a2 2 0 0 0 0-2.8l-3.2-3.2a1 1 0 0 0-.7-.3H8.5a1 1 0 0 0-.7.3L5 12" /><path d="m14 8-1.5-1.5a2 2 0 0 0-2.8 0L6 10a2 2 0 0 0 0 2.8L7 14" /><path d="M18 15h2M4 12H2" />
  </svg>
);
const FlameIc = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s0 2 2 2c1.5 0 1-4 2-9Z" />
  </svg>
);

interface Slide {
  key: string;
  accent: string;
  icon: JSX.Element;
  kicker: string;
  brands: string[];
  line: string;
  sub: string;
  empty: string;
}

// A small, fixed set of confetti pieces (elegant, not a storm). Preset so the
// fall never re-randomises between renders. Rains behind the "closed" slide.
const CONFETTI: { l: number; d: number; dur: number; c: string; w: number; h: number }[] = [
  { l: 6, d: 0, dur: 3.2, c: "#E08C0C", w: 6, h: 9 },
  { l: 15, d: 1.1, dur: 3.8, c: "#17B978", w: 5, h: 5 },
  { l: 23, d: 0.5, dur: 3.0, c: "#3D8BF5", w: 5, h: 8 },
  { l: 33, d: 2.0, dur: 4.1, c: "#E08C0C", w: 5, h: 5 },
  { l: 42, d: 0.9, dur: 3.5, c: "#EE5C97", w: 6, h: 9 },
  { l: 51, d: 1.7, dur: 3.1, c: "#C9E633", w: 5, h: 5 },
  { l: 60, d: 0.2, dur: 3.9, c: "#17B978", w: 5, h: 8 },
  { l: 69, d: 2.4, dur: 3.4, c: "#3D8BF5", w: 5, h: 5 },
  { l: 78, d: 1.3, dur: 3.7, c: "#E08C0C", w: 6, h: 9 },
  { l: 87, d: 0.6, dur: 3.2, c: "#EE5C97", w: 5, h: 5 },
  { l: 94, d: 2.1, dur: 4.0, c: "#C9E633", w: 5, h: 8 },
];

function Confetti() {
  return (
    <div className="lp-confetti" aria-hidden="true">
      {CONFETTI.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.l}%`,
            width: p.w,
            height: p.h,
            background: p.c,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.d}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function SalesLandingPage({
  user,
  onOpen,
}: {
  user: string;
  onOpen: SalesOpen;
}) {
  // Cache leads per user so a reload (Chrome discarding the tab, etc.) repaints
  // the last pipeline instantly and revalidates quietly, never the skeleton.
  const leadsKey = `cr.saleshome.${user}`;
  const readLeads = (): SalesLead[] | null => {
    try {
      const s = sessionStorage.getItem(leadsKey);
      return s ? (JSON.parse(s) as SalesLead[]) : null;
    } catch {
      return null;
    }
  };
  const [leads, setLeads] = useState<SalesLead[] | null>(() => readLeads());

  useEffect(() => {
    let live = true;
    // keep any cached pipeline on screen; only blank to skeleton with nothing
    let cached: SalesLead[] | null = null;
    try {
      const s = sessionStorage.getItem(`cr.saleshome.${user}`);
      cached = s ? (JSON.parse(s) as SalesLead[]) : null;
    } catch {
      cached = null;
    }
    setLeads(cached);
    api
      .listLeads({ assigned_to: user })
      .then((d) => {
        if (!live) return;
        setLeads(d);
        try {
          sessionStorage.setItem(`cr.saleshome.${user}`, JSON.stringify(d));
        } catch {
          /* private mode / quota — ignore */
        }
      })
      .catch(() => live && setLeads((prev) => prev ?? []));
    return () => {
      live = false;
    };
  }, [user]);

  const stats = useMemo(() => {
    const ls = leads ?? [];
    const active = ls.filter((l) => !CLOSED.has(l.stage));
    const hot = active.filter((l) => l.priority === "hot");
    const todayMs = new Date(new Date().toDateString()).getTime();
    const due = active.filter(
      (l) => l.next_followup && new Date(l.next_followup).getTime() <= todayMs
    );
    const won = ls.filter((l) => l.stage === "closed_won");
    const touch = ls.reduce((s, l) => s + (l.touchpoints || 0), 0);
    const counts: Record<string, number> = {};
    for (const l of ls) counts[l.stage] = (counts[l.stage] ?? 0) + 1;
    return {
      total: ls.length,
      active: active.length,
      hot: hot.length,
      due: due.length,
      won: won.length,
      touch,
      counts,
    };
  }, [leads]);

  const loaded = leads !== null;
  const nActive = useCountUp(stats.active);
  const nHot = useCountUp(stats.hot);
  const nDue = useCountUp(stats.due);
  const nWon = useCountUp(stats.won);

  // The three stories the hero spotlight rotates through - all from real leads.
  const slides = useMemo<Slide[]>(() => {
    const ls = leads ?? [];
    const won = ls.filter((l) => l.stage === "closed_won").map((l) => l.brand_name);
    const nearing = ls.filter((l) => l.stage === "negotiating").map((l) => l.brand_name);
    const hot = ls
      .filter((l) => !CLOSED.has(l.stage) && l.priority === "hot")
      .map((l) => l.brand_name);
    return [
      {
        key: "won", accent: "#17B978", icon: <TrophyIc />, kicker: "Closed this month",
        brands: won,
        line: won.length
          ? `Congrats - you closed ${won.length} ${won.length === 1 ? "brand" : "brands"} this month!`
          : "No wins logged yet this month.",
        sub: won.length ? "Great momentum. Keep it rolling." : "Your next win is closer than it looks.",
        empty: "Push a deal over the line",
      },
      {
        key: "near", accent: "#E08C0C", icon: <HandshakeIc />, kicker: "On the verge",
        brands: nearing,
        line: nearing.length
          ? `${nearing.length} ${nearing.length === 1 ? "brand is" : "brands are"} one nudge from closing.`
          : "Nothing in final negotiation right now.",
        sub: nearing.length ? "A follow-up today could seal it." : "Move a warm lead into negotiation.",
        empty: "Advance a responded lead",
      },
      {
        key: "hot", accent: "#E8484B", icon: <FlameIc />, kicker: "Hot & waiting",
        brands: hot,
        line: hot.length
          ? `${hot.length} hot ${hot.length === 1 ? "lead is" : "leads are"} waiting to be closed.`
          : "No hot leads flagged right now.",
        sub: hot.length ? "Strike while they're warm." : "Mark a promising lead as hot.",
        empty: "Pick your next target",
      },
    ];
  }, [leads]);

  // Auto-rotate the spotlight; pause on hover, and stay put for reduced motion.
  const [spot, setSpot] = useState(0);
  const pausedRef = useRef(false);
  useEffect(() => {
    if (REDUCED || slides.length <= 1) return;
    const id = window.setInterval(() => {
      if (!pausedRef.current) setSpot((s) => (s + 1) % slides.length);
    }, 4200);
    return () => window.clearInterval(id);
  }, [slides.length]);

  const maxStage = Math.max(1, ...FLOW.map((s) => stats.counts[s] ?? 0));
  const skel = <span className="lp-skel" aria-hidden="true" />;

  return (
    <div className="lp">
      {/* ---- hero ---- */}
      <section
        className="lp-hero"
        style={{ ["--glow-a" as string]: "#12B5A5", ["--glow-b" as string]: "#E08C0C" }}
      >
        <div className="lp-hero-content">
          <span className="lp-eyebrow">GrabOn · Sales Pipeline</span>
          <h1 className="lp-title">
            {greeting()}, <b>{userLabel(user)}</b>
          </h1>
          <p className="lp-sub">
            Your deals, end to end. Move every lead from first contact to closed won, log each
            touchpoint, and never let a follow-up slip.
          </p>
          <div className="lp-hero-chips">
            <span className="lp-hero-chip">
              <span className="lp-cdot" style={{ ["--cdot" as string]: "#3D8BF5" }} />
              {loaded ? <><span className="mono">{stats.active}</span>&nbsp;active</> : "loading leads"}
            </span>
            <span className="lp-hero-chip">
              <span className="lp-cdot" style={{ ["--cdot" as string]: "#E8484B" }} />
              {loaded ? <><span className="mono">{stats.hot}</span>&nbsp;hot</> : "checking priority"}
            </span>
            <span className="lp-hero-chip">
              <span className="lp-cdot" style={{ ["--cdot" as string]: "#C9E633" }} />
              {loaded ? <><span className="mono">{stats.touch}</span>&nbsp;touchpoints</> : "counting activity"}
            </span>
          </div>
        </div>

        <div className="lp-visual" aria-hidden="true">
          {!loaded ? (
            <div className="lp-spot-skel" />
          ) : (
            <div className="lp-spotlight">
              <div
                className="lp-spot-stack"
                onMouseEnter={() => (pausedRef.current = true)}
                onMouseLeave={() => (pausedRef.current = false)}
              >
                {slides.map((s, i) => {
                  const pos = (i - spot + slides.length) % slides.length;
                  return (
                    <article
                      key={s.key}
                      className="lp-spot"
                      data-pos={pos}
                      style={{ ["--accent" as string]: s.accent }}
                    >
                      {s.key === "won" && pos === 0 && s.brands.length > 0 && <Confetti />}
                      <div className="lp-spot-top">
                        <span className="lp-spot-ic">{s.icon}</span>
                        <span className="lp-spot-kicker">{s.kicker}</span>
                        <span className="lp-spot-count">{s.brands.length}</span>
                      </div>
                      <p className="lp-spot-line">{s.line}</p>
                      <div className="lp-spot-brands">
                        {s.brands.slice(0, 4).map((b, bi) => (
                          <span key={b + bi} className="lp-spot-chip" style={{ animationDelay: `${bi * 70}ms` }}>
                            <span className="lp-cdot" />
                            {b}
                          </span>
                        ))}
                        {s.brands.length > 4 && (
                          <span className="lp-spot-chip more">+{s.brands.length - 4} more</span>
                        )}
                        {s.brands.length === 0 && <span className="lp-spot-chip more">{s.empty}</span>}
                      </div>
                      <p className="lp-spot-sub">{s.sub}</p>
                      {pos === 0 && (
                        <div className="lp-spot-progress">
                          <i key={spot} style={{ background: s.accent }} />
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
              <div className="lp-spot-dots">
                {slides.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    tabIndex={-1}
                    className={`lp-spot-dot ${i === spot ? "on" : ""}`}
                    style={i === spot ? { background: s.accent } : undefined}
                    onClick={() => setSpot(i)}
                    aria-label={s.kicker}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---- stat tiles ---- */}
      <div className="lp-stats">
        <StatTile color="#3D8BF5" label="Active leads" delay={0}
          value={loaded ? Math.round(nActive).toString() : skel} meta="in play right now" icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M4 12h10M4 17h7" /></svg>
          } />
        <StatTile color="#E8484B" label="Hot leads" delay={70}
          value={loaded ? Math.round(nHot).toString() : skel} meta="need attention now" icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s0 2 2 2c1.5 0 1-4 2-9Z" /></svg>
          } />
        <StatTile color={stats.due > 0 ? "#E08C0C" : "#17B978"} label="Follow-ups due" delay={140}
          value={loaded ? Math.round(nDue).toString() : skel}
          meta={stats.due > 0 ? "on or past due" : "nothing overdue"} icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          } />
        <StatTile color="#7EAE12" label="Deals won" delay={210}
          value={loaded ? Math.round(nWon).toString() : skel} meta="closed and live" icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0Z" /><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" /></svg>
          } />
      </div>

      {/* ---- stage flow (data-driven, deep-links into the pipeline) ---- */}
      <p className="lp-sec">Your pipeline at a glance</p>
      <div className="lp-stageflow">
        {FLOW.map((s, i) => {
          const count = stats.counts[s] ?? 0;
          return (
            <button
              key={s}
              className="lp-stagecard"
              style={{ ["--sc" as string]: stageColor(s), animationDelay: `${i * 55}ms` }}
              onClick={() => onOpen({ stage: s })}
              data-tip={`Open the pipeline filtered to ${stageLabel(s)}`}
            >
              <span className="lp-stagecard-top">
                <span className="lp-stage-badge" />
                <span className="lp-stage-name">{stageLabel(s)}</span>
              </span>
              <span className="lp-stage-count">{loaded ? count : "·"}</span>
              <span className="lp-stagecard-bar">
                <i style={{ width: `${loaded ? Math.round(((count || 0) / maxStage) * 100) : 0}%` }} />
              </span>
              <span className="lp-stage-sub">
                {count === 1 ? "1 lead" : `${count} leads`} <ArrowGo />
              </span>
            </button>
          );
        })}
      </div>

      {/* ---- quick actions ---- */}
      <p className="lp-sec">Get to work</p>
      <div className="lp-cards">
        <button className="lp-card" style={{ ["--cc" as string]: "#C9E633", animationDelay: "0ms" }} onClick={() => onOpen()}>
          <span className="lp-card-ic">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="7" height="16" rx="1.5" /><rect x="14" y="4" width="7" height="10" rx="1.5" /></svg>
          </span>
          <span className="lp-card-title">Open your pipeline</span>
          <span className="lp-card-desc">
            {loaded ? `All ${stats.total} leads` : "Every lead"} in one board — expand any lead to log
            calls, emails and meetings, and advance the stage.
          </span>
          <span className="lp-card-go">Open <ArrowGo /></span>
          <span className="lp-card-accent" />
        </button>

        <button className="lp-card" style={{ ["--cc" as string]: "#E8484B", animationDelay: "60ms" }} onClick={() => onOpen({ priority: "hot" })}>
          <span className="lp-card-ic">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s0 2 2 2c1.5 0 1-4 2-9Z" /></svg>
          </span>
          <span className="lp-card-title">Work the hot leads</span>
          <span className="lp-card-desc">
            {loaded ? `${stats.hot} hot ${stats.hot === 1 ? "deal" : "deals"}` : "The hot deals"} that are
            closest to closing — jump straight to the ones that need you today.
          </span>
          <span className="lp-card-go">Filter <ArrowGo /></span>
          <span className="lp-card-accent" />
        </button>

        <button className="lp-card" style={{ ["--cc" as string]: "#7EAE12", animationDelay: "120ms" }} onClick={() => onOpen({ stage: "closed_won" })}>
          <span className="lp-card-ic">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
          </span>
          <span className="lp-card-title">Review your wins</span>
          <span className="lp-card-desc">
            {loaded ? `${stats.won} closed ${stats.won === 1 ? "deal" : "deals"}` : "Closed deals"} that are
            live — revisit what worked and keep those partnerships warm.
          </span>
          <span className="lp-card-go">View <ArrowGo /></span>
          <span className="lp-card-accent" />
        </button>
      </div>
    </div>
  );
}

function StatTile({
  color,
  label,
  value,
  meta,
  icon,
  delay,
}: {
  color: string;
  label: string;
  value: React.ReactNode;
  meta: string;
  icon: JSX.Element;
  delay: number;
}) {
  return (
    <div className="lp-stat" style={{ ["--sc" as string]: color, animationDelay: `${delay}ms` }}>
      <span className="lp-stat-ic">{icon}</span>
      <span className="lp-stat-label">{label}</span>
      <div className="lp-stat-val">{value}</div>
      <span className="lp-stat-meta">{meta}</span>
    </div>
  );
}
