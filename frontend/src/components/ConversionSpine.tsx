import { useEffect, useRef, useState } from "react";
import { formatMoney, formatNumber, formatPct } from "../api";
import { OVERVIEW_METRICS, type MetricKind, type OverviewCell } from "../types";

/** Count a figure up from zero on mount and re-run whenever the target moves.
 *  Uses rAF so it costs one composited paint per frame, and honours
 *  prefers-reduced-motion by landing on the final value immediately. */
function useCountUp(target: number, duration = 700): number {
  const [v, setV] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setV(a + (target - a) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

function fmt(kind: MetricKind, v: number): string {
  if (kind === "money") return formatMoney(v);
  if (kind === "pct") return formatPct(v);
  return formatNumber(Math.round(v));
}

function Segment({
  label, color, kind, value, prev, index,
}: {
  label: string; color: string; kind: MetricKind;
  value: number; prev: number | null; index: number;
}) {
  const shown = useCountUp(value);
  const delta = prev != null && prev !== 0 ? ((value - prev) / Math.abs(prev)) * 100 : null;
  const dir = delta == null ? "flat" : delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat";

  return (
    <div className="cs-seg" style={{ ["--seg" as string]: color, animationDelay: `${index * 60}ms` }}>
      <span className="cs-k">
        <i className="cs-dot" />
        {label}
      </span>
      <span className="cs-v">{fmt(kind, shown)}</span>
      {delta != null && (
        <span className={`cs-d is-${dir}`}>
          {dir === "up" ? "▲" : dir === "down" ? "▼" : "–"} {Math.abs(delta).toFixed(1)}%
        </span>
      )}
      {delta == null && <span className="cs-d is-flat">no prior period</span>}
    </div>
  );
}

/**
 * THE CONVERSION SPINE — the signature of this portal.
 *
 * Clicks → Sales → CR → GMV → Revenue read left to right as one connected
 * ribbon, because that is literally the product's physics: a wide number
 * narrowing into a smaller one. Each segment wears its metric's hue (the same
 * hue it wears in the table header, the filter chip and the in-cell bar), the
 * figures count up on arrival, and each carries its move against the previous
 * period. It is the page's focal point and its legend at once.
 */
export default function ConversionSpine({
  totals, prev, caption,
}: {
  totals: OverviewCell;
  prev: OverviewCell | null;
  caption?: string;
}) {
  return (
    <section className="conv-spine" aria-label="Conversion totals for the period in view">
      <div className="cs-head">
        <span className="cs-title">Conversion</span>
        {caption && <span className="cs-cap">{caption}</span>}
      </div>
      <div className="cs-track">
        {OVERVIEW_METRICS.map((m, i) => (
          <Segment
            key={m.key}
            label={m.label}
            color={m.color}
            kind={m.kind}
            value={totals[m.key] ?? 0}
            prev={prev ? prev[m.key] ?? null : null}
            index={i}
          />
        ))}
      </div>
    </section>
  );
}
