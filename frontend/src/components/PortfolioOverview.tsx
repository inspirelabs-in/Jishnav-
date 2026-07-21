import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  api,
  formatMonthLong,
  formatMonthYearISO,
  formatMoney,
  formatNumber,
  formatPct,
} from "../api";
import { downloadCsv } from "../csv";
import { useToast } from "../Toast";
import {
  CHART_CHROME,
  OVERVIEW_METRICS,
  type MetricKind,
  type OverviewMetric,
  type OverviewResponse,
} from "../types";
import { DownloadIcon } from "./Icons";

interface MY {
  m: number;
  y: number;
}

function fmtByKind(kind: MetricKind, v: number | null | undefined): string {
  if (kind === "money") return formatMoney(v);
  if (kind === "pct") return formatPct(v);
  return formatNumber(v);
}

const iso1 = (p: MY) => `${p.y}-${String(p.m).padStart(2, "0")}-01`;
const isoLast = (p: MY) =>
  `${p.y}-${String(p.m).padStart(2, "0")}-${String(new Date(p.y, p.m, 0).getDate()).padStart(2, "0")}`;

interface Props {
  owner: string; // "All" or a handler name
  subtitle: string;
}

/** Portfolio overview: a monthly trend graph (portfolio totals, incl. CR) and a
 *  per-brand month-by-month breakdown, each with its own month controls. */
export default function PortfolioOverview({ owner, subtitle }: Props) {
  const now = useMemo(() => new Date(), []);
  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y, y - 1, y - 2];
  }, [now]);

  // Defaults: the last 3 completed months (current in-progress month excluded).
  const defTo = useMemo<MY>(
    () => ({ m: new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth() + 1, y: new Date(now.getFullYear(), now.getMonth() - 1, 1).getFullYear() }),
    [now]
  );
  const defFrom = useMemo<MY>(
    () => ({ m: new Date(now.getFullYear(), now.getMonth() - 3, 1).getMonth() + 1, y: new Date(now.getFullYear(), now.getMonth() - 3, 1).getFullYear() }),
    [now]
  );

  const [active, setActive] = useState<Set<OverviewMetric>>(
    new Set(["clicks", "sales", "cr", "gmv", "revenue"])
  );

  // Graph controls (own month range + single-month toggle).
  const [gFrom, setGFrom] = useState<MY>(defFrom);
  const [gTo, setGTo] = useState<MY>(defTo);
  const [gSingle, setGSingle] = useState(false);
  const [gOne, setGOne] = useState<MY>(defTo);

  // Table controls (own month range + single-month toggle + brand search).
  const [tFrom, setTFrom] = useState<MY>(defFrom);
  const [tTo, setTTo] = useState<MY>(defTo);
  const [tSingle, setTSingle] = useState(false);
  const [tOne, setTOne] = useState<MY>(defTo); // single-month value, default last month
  const [tSearch, setTSearch] = useState("");

  const [graphRes, setGraphRes] = useState<OverviewResponse | null>(null);
  const [graphErr, setGraphErr] = useState<string | null>(null);
  const [tableRes, setTableRes] = useState<OverviewResponse | null>(null);
  const [tableErr, setTableErr] = useState<string | null>(null);

  const gSeq = useRef(0);
  const tSeq = useRef(0);
  const tTimer = useRef<number>();
  const toast = useToast();

  // ---- graph fetch
  useEffect(() => {
    const from = gSingle ? gOne : gFrom;
    const to = gSingle ? gOne : gTo;
    const seq = ++gSeq.current;
    api
      .overview({ owner, date_from: iso1(from), date_to: isoLast(to) })
      .then((r) => seq === gSeq.current && (setGraphRes(r), setGraphErr(null)))
      .catch((e) => seq === gSeq.current && setGraphErr((e as Error).message));
  }, [owner, gFrom, gTo, gSingle, gOne]);

  // ---- table fetch (debounced for the search box)
  useEffect(() => {
    const from = tSingle ? tOne : tFrom;
    const to = tSingle ? tOne : tTo;
    window.clearTimeout(tTimer.current);
    tTimer.current = window.setTimeout(() => {
      const seq = ++tSeq.current;
      api
        .overview({
          owner,
          date_from: iso1(from),
          date_to: isoLast(to),
          merchant: tSearch.trim() || undefined,
        })
        .then((r) => seq === tSeq.current && (setTableRes(r), setTableErr(null)))
        .catch((e) => seq === tSeq.current && setTableErr((e as Error).message));
    }, 250);
    return () => window.clearTimeout(tTimer.current);
  }, [owner, tFrom, tTo, tSingle, tOne, tSearch]);

  function toggle(m: OverviewMetric) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(m)) {
        if (next.size === 1) return next;
        next.delete(m);
      } else {
        next.add(m);
      }
      return next;
    });
  }

  const metrics = OVERVIEW_METRICS.filter((m) => active.has(m.key));

  const data = useMemo(() => {
    if (!graphRes || graphRes.aggregate.length === 0) return [] as Record<string, number | string>[];
    const base = graphRes.aggregate[0];
    return graphRes.aggregate.map((a) => {
      const row: Record<string, number | string> = { ...a, date: a.month };
      for (const m of OVERVIEW_METRICS) {
        const b = base[m.key];
        row[`idx__${m.key}`] = b > 0 ? (a[m.key] / b) * 100 : 0;
      }
      return row;
    });
  }, [graphRes]);

  const hasGraph = !!graphRes && graphRes.aggregate.some((a) => a.clicks || a.sales || a.gmv || a.revenue);

  const singleBarData = useMemo(() => {
    if (!gSingle || !graphRes || graphRes.aggregate.length === 0) return [];
    const a = graphRes.aggregate[0];
    return metrics.map((m) => ({
      label: m.label,
      value: a[m.key] as number,
      color: m.color,
      kind: m.kind,
      formatted: fmtByKind(m.kind, a[m.key] as number),
    }));
  }, [gSingle, graphRes, metrics]);

  // The graph exports the monthly portfolio totals; the table exports the
  // per-brand breakdown (handled inside BreakdownTable) - kept separate.
  function exportGraphCsv() {
    if (!graphRes || !hasGraph) return toast("Nothing to export yet.", "error");
    const rows: (string | number)[][] = [
      ["Month", "Clicks", "Sales", "CR %", "GMV", "Revenue"],
      ...graphRes.aggregate.map((a) => [
        formatMonthYearISO(a.month), a.clicks, a.sales, a.cr, a.gmv, a.revenue,
      ]),
    ];
    downloadCsv(`portfolio-graph-${owner === "All" ? "all" : owner}.csv`, rows);
    toast(`Exported ${graphRes.aggregate.length} month${graphRes.aggregate.length === 1 ? "" : "s"}`);
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h3 className="panel-title">
            {gSingle ? "Monthly Snapshot" : "Indexed Trend"}
            <small>{gSingle
              ? "Actual metric values for the selected month."
              : "All metrics indexed to the first selected month (100) to compare trends. Actual values in the KPI cards."
            }</small>
          </h3>
        </div>

        {graphErr && (
          <div className="empty-state">Couldn't load the overview: {graphErr}</div>
        )}

        {graphRes && hasGraph && (
          <div className="kpi-strip kpi-5" role="group" aria-label="Metrics, click to toggle">
            {OVERVIEW_METRICS.map((m) => {
              const on = active.has(m.key);
              const lastOn = on && active.size === 1;
              return (
                <button
                  key={m.key}
                  className={`kpi ${on ? "" : "dim"}`}
                  style={{ ["--kpi-color" as string]: m.color }}
                  onClick={() => toggle(m.key)}
                  aria-pressed={on}
                  aria-disabled={lastOn || undefined}
                  title={lastOn ? "At least one metric must stay visible" : on ? `Hide ${m.label}` : `Show ${m.label}`}
                >
                  <span className="kpi-label">
                    <span className="dot" />
                    {m.label}
                  </span>
                  <span className="kpi-value">
                    <span className="kpi-num">{fmtByKind(m.kind, graphRes.totals[m.key])}</span>
                  </span>
                </button>
              );
            })}
          </div>
        )}

        <div className="ov-controls">
          <span className="ov-controls-label">Graph months</span>
          {gSingle ? (
            <SingleMonthSelect value={gOne} years={yearOptions} onChange={setGOne} />
          ) : (
            <RangeSelect from={gFrom} to={gTo} years={yearOptions} onFrom={setGFrom} onTo={setGTo} />
          )}
          <label className="ov-single">
            <button
              type="button"
              className={`toggle toggle-sm ${gSingle ? "" : "off"}`}
              onClick={() => setGSingle((s) => !s)}
              role="switch"
              aria-checked={gSingle}
              aria-label="Single month"
            />
            <span className="compare-label">Single month</span>
          </label>
          <button className="btn btn-sm ov-csv" onClick={exportGraphCsv} disabled={!hasGraph} title="Download the graph's monthly totals as CSV">
            <DownloadIcon />
            Graph CSV
          </button>
        </div>

        {graphRes && !hasGraph && !graphErr && <div className="empty-state">No data in these months.</div>}

        {graphRes && hasGraph && !gSingle && (
          <ResponsiveContainer width="100%" height={360}>
            <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 4 }}>
              <defs>
                {metrics.map((m) => (
                  <linearGradient key={m.key} id={`grad_${m.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={m.color} stopOpacity={0.18} />
                    <stop offset="100%" stopColor={m.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid stroke={CHART_CHROME.grid} vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickFormatter={(v) => formatMonthYearISO(String(v))} tick={{ fontSize: 11, fill: CHART_CHROME.tick }} tickLine={false} axisLine={{ stroke: CHART_CHROME.axis }} minTickGap={10} />
              <YAxis tick={{ fontSize: 10.5, fill: CHART_CHROME.tick }} tickLine={false} axisLine={{ stroke: CHART_CHROME.axis }} width={36} domain={["dataMin - 5", "dataMax + 5"]} tickFormatter={(v: number) => String(Math.round(v))} />
              <ReferenceLine y={100} stroke={CHART_CHROME.axis} strokeDasharray="6 3" label={{ value: "Base (100)", position: "right", fontSize: 9, fill: CHART_CHROME.tick }} />
              <Tooltip content={<OverviewTooltip />} cursor={{ stroke: CHART_CHROME.cursor, strokeDasharray: "4 4" }} />
              {metrics.map((m) => (
                <Area key={`area_${m.key}`} type="monotone" dataKey={`idx__${m.key}`} name={m.key} stroke="none" fill={`url(#grad_${m.key})`} fillOpacity={1} animationDuration={600} connectNulls />
              ))}
              {metrics.map((m) => (
                <Line key={m.key} type="monotone" dataKey={`idx__${m.key}`} name={m.key} stroke={m.color} strokeWidth={2.5} dot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: m.color }} activeDot={{ r: 6, strokeWidth: 2, stroke: "#fff" }} animationDuration={600} connectNulls />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {graphRes && hasGraph && gSingle && singleBarData.length > 0 && (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={singleBarData} margin={{ top: 24, right: 24, bottom: 4, left: 4 }} barCategoryGap="28%">
              <CartesianGrid stroke={CHART_CHROME.grid} vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: CHART_CHROME.tick }} tickLine={false} axisLine={{ stroke: CHART_CHROME.axis }} />
              <YAxis hide />
              <Tooltip content={<SnapshotTooltip />} cursor={{ fill: "var(--surface-hover, rgba(0,0,0,0.04))" }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} animationDuration={500} isAnimationActive={false}>
                {singleBarData.map((d, i) => (
                  <Cell key={i} fill={d.color} fillOpacity={0.85} />
                ))}
                <LabelList
                  content={({ x, y, width, index }: { x?: number; y?: number; width?: number; index?: number }) => {
                    const d = singleBarData[index ?? 0];
                    if (!d) return null;
                    return (
                      <text x={(x ?? 0) + (width ?? 0) / 2} y={(y ?? 0) - 8} textAnchor="middle" fontSize={12} fontWeight={600} fill={d.color}>
                        {d.formatted}
                      </text>
                    );
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      <BreakdownTable
        res={tableRes}
        err={tableErr}
        owner={owner}
        years={yearOptions}
        search={tSearch}
        onSearch={setTSearch}
        single={tSingle}
        onSingle={setTSingle}
        from={tFrom}
        to={tTo}
        one={tOne}
        onFrom={setTFrom}
        onTo={setTTo}
        onOne={setTOne}
      />
    </>
  );
}

// ------------------------------------------------ per-brand breakdown ----
function BreakdownTable({
  res,
  err,
  owner,
  years,
  search,
  onSearch,
  single,
  onSingle,
  from,
  to,
  one,
  onFrom,
  onTo,
  onOne,
}: {
  res: OverviewResponse | null;
  err: string | null;
  owner: string;
  years: number[];
  search: string;
  onSearch: (v: string) => void;
  single: boolean;
  onSingle: (v: boolean) => void;
  from: MY;
  to: MY;
  one: MY;
  onFrom: (v: MY) => void;
  onTo: (v: MY) => void;
  onOne: (v: MY) => void;
}) {
  const toast = useToast();

  // The table has its own metric selection (independent of the graph), shown as
  // a chip row directly above it. Deselecting a metric drops its column under
  // every month; at least one must stay.
  const [cols, setCols] = useState<Set<OverviewMetric>>(
    new Set(["clicks", "sales", "cr", "gmv", "revenue"])
  );
  function toggleCol(k: OverviewMetric) {
    setCols((prev) => {
      const next = new Set(prev);
      if (next.has(k)) {
        if (next.size === 1) return next;
        next.delete(k);
      } else {
        next.add(k);
      }
      return next;
    });
  }
  const shown = OVERVIEW_METRICS.filter((m) => cols.has(m.key));

  function exportTableCsv() {
    if (!res || res.by_merchant.length === 0) return toast("Nothing to export yet.", "error");
    const header = ["Brand"];
    for (const mk of res.months) for (const c of shown) header.push(`${formatMonthYearISO(mk)} ${c.label}`);
    const rows: (string | number)[][] = [header];
    for (const r of res.by_merchant) {
      const line: (string | number)[] = [r.merchant];
      for (const mk of res.months) {
        const cell = r.months[mk];
        for (const c of shown) line.push(cell ? cell[c.key] : "-");
      }
      rows.push(line);
    }
    downloadCsv(`portfolio-breakdown-${owner === "All" ? "all" : owner}.csv`, rows);
    toast(`Exported ${res.by_merchant.length} brand${res.by_merchant.length === 1 ? "" : "s"}`);
  }
  // Per (month, metric) peak, for the in-cell comparison bars.
  const maxima = useMemo(() => {
    const mx: Record<string, Record<string, number>> = {};
    if (!res) return mx;
    for (const mk of res.months) {
      mx[mk] = { clicks: 0, sales: 0, cr: 0, gmv: 0, revenue: 0 };
      for (const r of res.by_merchant) {
        const c = r.months[mk];
        if (!c) continue;
        for (const k of ["clicks", "sales", "cr", "gmv", "revenue"] as OverviewMetric[])
          if (c[k] > mx[mk][k]) mx[mk][k] = c[k];
      }
    }
    return mx;
  }, [res]);

  // Portfolio totals per (month, metric) for the footer.
  const totals = useMemo(() => {
    const t: Record<string, Record<string, number>> = {};
    if (!res) return t;
    for (const mk of res.months) {
      const s = { clicks: 0, sales: 0, gmv: 0, revenue: 0 };
      for (const r of res.by_merchant) {
        const c = r.months[mk];
        if (!c) continue;
        s.clicks += c.clicks; s.sales += c.sales; s.gmv += c.gmv; s.revenue += c.revenue;
      }
      t[mk] = { ...s, cr: s.clicks > 0 ? (s.sales / s.clicks) * 100 : 0 };
    }
    return t;
  }, [res]);

  const spanCols = 1 + (res?.months.length ?? 0) * shown.length;

  return (
    <section className="panel ov-breakdown">
      <div className="ov-breakdown-head">
        <div>
          <h4>Brand breakdown</h4>
          <span className="muted">Each brand's numbers, month by month. Use the column chips below to add or drop metrics.</span>
        </div>
        <div className="ov-table-tools">
          <input className="ov-search" placeholder="Search brand" value={search} onChange={(e) => onSearch(e.target.value)} aria-label="Search brand in the breakdown" />
          {single ? (
            <SingleMonthSelect value={one} years={years} onChange={onOne} />
          ) : (
            <RangeSelect from={from} to={to} years={years} onFrom={onFrom} onTo={onTo} />
          )}
          <label className="ov-single">
            <button
              type="button"
              className={`toggle toggle-sm ${single ? "" : "off"}`}
              onClick={() => onSingle(!single)}
              role="switch"
              aria-checked={single}
              aria-label="Single month"
            />
            <span className="compare-label">Single month</span>
          </label>
          <button className="btn btn-sm ov-csv" onClick={exportTableCsv} disabled={!res || res.by_merchant.length === 0} title="Download the per-brand breakdown as CSV">
            <DownloadIcon />
            Table CSV
          </button>
        </div>
      </div>

      {/* metric column chips - directly above the table (independent selection) */}
      <div className="ov-metric-pick" role="group" aria-label="Columns to show in the table">
        {OVERVIEW_METRICS.map((m) => {
          const on = cols.has(m.key);
          const lastOn = on && cols.size === 1;
          return (
            <button
              key={m.key}
              type="button"
              className={`metric-chip ${on ? "on" : ""}`}
              style={{ ["--chip-color" as string]: m.color }}
              onClick={() => toggleCol(m.key)}
              aria-pressed={on}
              aria-disabled={lastOn || undefined}
              title={lastOn ? "At least one column must stay" : on ? `Hide ${m.label} column` : `Show ${m.label} column`}
            >
              <span className="mc-dot" />
              {m.label}
            </button>
          );
        })}
      </div>

      {err && <div className="empty-state">Couldn't load the breakdown: {err}</div>}

      {res && (
        <div className="table-wrap ov-scroll">
          <table className="data ov-table">
            <thead>
              <tr>
                <th className="ov-brand-col" rowSpan={2}>Brand</th>
                {res.months.map((mk, gi) => (
                  <th key={mk} className={`ov-month-group grp-${gi % 4}`} colSpan={shown.length}>
                    {formatMonthLong(mk)}
                  </th>
                ))}
              </tr>
              <tr>
                {res.months.map((mk) =>
                  shown.map((c, ci) => (
                    <th key={`${mk}-${c.key}`} className={`num ov-metric-col ${ci === 0 ? "ov-group-start" : ""}`}>
                      <span className="th-dot" style={{ background: c.color }} />
                      {c.label}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {res.by_merchant.length === 0 && (
                <tr>
                  <td colSpan={spanCols} className="muted" style={{ textAlign: "center", padding: 24 }}>
                    No brands match{search ? ` "${search}"` : ""}.
                  </td>
                </tr>
              )}
              {res.by_merchant.map((r, ri) => (
                <tr key={r.merchant} className="ov-row" style={{ animationDelay: `${Math.min(ri, 16) * 32}ms` }}>
                  <td className="ov-brand-col cmp-name">{r.merchant}</td>
                  {res.months.map((mk) => {
                    const cell = r.months[mk];
                    return shown.map((c, ci) => {
                      const v = cell ? cell[c.key] : null;
                      const mx = maxima[mk]?.[c.key] ?? 0;
                      const ratio = v !== null && mx > 0 ? v / mx : 0;
                      const leader = v !== null && mx > 0 && v === mx && res.by_merchant.length > 1;
                      return (
                        <td key={`${mk}-${c.key}`} className={`num ov-cell ${ci === 0 ? "ov-group-start" : ""} ${leader ? "ov-leader" : ""}`}>
                          {v !== null && <span className="ov-bar" style={{ ["--bar" as string]: ratio, background: `${c.color}24` }} />}
                          <span className="ov-cell-val">{cell ? fmtByKind(c.kind, v) : <span className="muted">-</span>}</span>
                        </td>
                      );
                    });
                  })}
                </tr>
              ))}
            </tbody>
            {res.by_merchant.length > 0 && (
              <tfoot>
                <tr>
                  <td className="ov-brand-col cmp-name">Portfolio</td>
                  {res.months.map((mk) =>
                    shown.map((c, ci) => (
                      <td key={`${mk}-${c.key}`} className={`num ${ci === 0 ? "ov-group-start" : ""}`}>
                        {fmtByKind(c.kind, totals[mk]?.[c.key] ?? 0)}
                      </td>
                    ))
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
}

// ----------------------------------------------- single month popover ----
function SingleMonthSelect({ value, years, onChange }: {
  value: MY; years: number[]; onChange: (v: MY) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickYear, setPickYear] = useState(value.y);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const label = `${MONTHS_SHORT[value.m - 1]} ${value.y}`;

  return (
    <div className="rp-wrap" ref={wrapRef}>
      <button
        type="button"
        className="rp-trigger"
        onClick={() => { setOpen((o) => !o); setPickYear(value.y); }}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span>{label}</span>
        <svg className="rp-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="rp-panel" role="dialog" aria-label="Choose a month">
          <div className="rp-section-label">Year</div>
          <div className="rp-years">
            {[...years].sort((a, b) => a - b).map((y) => (
              <button key={y} type="button" className={`rp-chip ${pickYear === y ? "on" : ""}`} onClick={() => setPickYear(y)}>{y}</button>
            ))}
          </div>

          <div className="rp-section-label">Month</div>
          <div className="rp-months">
            {MONTHS_SHORT.map((m, i) => (
              <button
                key={m}
                type="button"
                className={`rp-chip rp-month ${value.y === pickYear && value.m === i + 1 ? "on" : ""}`}
                onClick={() => { onChange({ m: i + 1, y: pickYear }); setOpen(false); }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------- compact range picker ----
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function RangeSelect({ from, to, years, onFrom, onTo }: {
  from: MY; to: MY; years: number[]; onFrom: (v: MY) => void; onTo: (v: MY) => void;
}) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"from" | "to">("from");
  const [pickYear, setPickYear] = useState(() => (side === "from" ? from : to).y);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function switchSide(s: "from" | "to") {
    setSide(s);
    setPickYear((s === "from" ? from : to).y);
  }

  function pickMonth(m: number) {
    if (side === "from") {
      onFrom({ m, y: pickYear });
      setSide("to");
      setPickYear(to.y);
    } else {
      onTo({ m, y: pickYear });
      setOpen(false);
    }
  }

  const current = side === "from" ? from : to;
  const label = `${MONTHS_SHORT[from.m - 1]} ${from.y} – ${MONTHS_SHORT[to.m - 1]} ${to.y}`;

  return (
    <div className="rp-wrap" ref={wrapRef}>
      <button
        type="button"
        className="rp-trigger"
        onClick={() => { setOpen((o) => !o); setSide("from"); setPickYear(from.y); }}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span>{label}</span>
        <svg className="rp-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="rp-panel" role="dialog" aria-label="Choose date range">
          <div className="rp-tabs">
            <button type="button" className={`rp-tab ${side === "from" ? "on" : ""}`} onClick={() => switchSide("from")}>
              <span className="rp-tab-label">From</span>
              <span className="rp-tab-value">{MONTHS_SHORT[from.m - 1]} {from.y}</span>
            </button>
            <span className="rp-tab-arrow" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
            <button type="button" className={`rp-tab ${side === "to" ? "on" : ""}`} onClick={() => switchSide("to")}>
              <span className="rp-tab-label">To</span>
              <span className="rp-tab-value">{MONTHS_SHORT[to.m - 1]} {to.y}</span>
            </button>
          </div>

          <div className="rp-section-label">Year</div>
          <div className="rp-years">
            {[...years].sort((a, b) => a - b).map((y) => (
              <button key={y} type="button" className={`rp-chip ${pickYear === y ? "on" : ""}`} onClick={() => setPickYear(y)}>{y}</button>
            ))}
          </div>

          <div className="rp-section-label">Month</div>
          <div className="rp-months">
            {MONTHS_SHORT.map((m, i) => (
              <button
                key={m}
                type="button"
                className={`rp-chip rp-month ${current.y === pickYear && current.m === i + 1 ? "on" : ""}`}
                onClick={() => pickMonth(i + 1)}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------- tooltip ----
function OverviewTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; color: string; payload: Record<string, number | string> }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  const seen = new Set<string>();
  return (
    <div className="tooltip-box">
      <div className="tt-title">{formatMonthLong(String(label))}</div>
      {payload.map((p) => {
        const key = p.name.replace(/^(n__|idx__)/, "") as OverviewMetric;
        if (seen.has(key)) return null;
        seen.add(key);
        const meta = OVERVIEW_METRICS.find((m) => m.key === key);
        if (!meta) return null;
        const raw = row[key] as number | undefined;
        const idx = row[`idx__${key}`] as number | undefined;
        const idxRound = idx != null ? Math.round(idx) : 100;
        const pctChange = idxRound - 100;
        const pctStr = pctChange === 0 ? "0%" : pctChange > 0 ? `+${pctChange}%` : `${pctChange}%`;
        const pctClass = pctChange > 0 ? "tt-up" : pctChange < 0 ? "tt-down" : "";
        return (
          <div key={key} className="tt-row tt-row-rich">
            <span className="dot" style={{ background: meta.color }} />
            <span className="tt-metric">{meta.label}</span>
            <b className="tt-actual">{fmtByKind(meta.kind, raw ?? null)}</b>
            <span className={`tt-pct ${pctClass}`}>{pctStr}</span>
          </div>
        );
      })}
    </div>
  );
}

function SnapshotTooltip({ active, payload }: {
  active?: boolean;
  payload?: { payload: { label: string; value: number; color: string; kind: MetricKind } }[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="tooltip-box">
      <div className="tt-row">
        <span className="dot" style={{ background: d.color }} />
        <span className="tt-metric">{d.label}</span>
        <b className="tt-actual">{fmtByKind(d.kind, d.value)}</b>
      </div>
    </div>
  );
}

