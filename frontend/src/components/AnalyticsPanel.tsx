import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, deltaPct, formatMoney, formatNumber } from "../api";
import { downloadCsv } from "../csv";
import { useToast } from "../Toast";
import {
  CHART_CHROME,
  CR_COLOR,
  METRICS,
  type AnalyticsResponse,
  type Metric,
} from "../types";
import { DownloadIcon } from "./Icons";

function formatBucket(bucket: string, granularity: "day" | "month"): string {
  if (granularity === "month") {
    const [y, m] = bucket.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  }
  return new Date(bucket).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

const fmtMetric = (key: Metric, v: number | null | undefined) =>
  key === "gmv" || key === "revenue" ? formatMoney(v) : formatNumber(v);

interface SeriesTotal {
  name: string;
  clicks: number;
  sales: number;
  gmv: number;
  revenue: number;
  cr: number;
}

function seriesTotals(result: AnalyticsResponse): SeriesTotal[] {
  return result.series.map((s) => {
    const t = { clicks: 0, sales: 0, gmv: 0, revenue: 0 };
    for (const p of s.points) {
      t.clicks += p.clicks;
      t.sales += p.sales;
      t.gmv += p.gmv;
      t.revenue += p.revenue;
    }
    t.gmv = Math.round(t.gmv * 100) / 100;
    t.revenue = Math.round(t.revenue * 100) / 100;
    return { name: s.name, ...t, cr: t.clicks > 0 ? (t.sales / t.clicks) * 100 : 0 };
  });
}

export interface PanelParams {
  mode: string;
  brands?: string[];
  categories?: string[];
  owner?: string;
  dateFrom: string;
  dateTo: string;
}

interface Props {
  title: string;
  subtitle?: string;
  display: "graph" | "table";
  /** First column heading for table display, e.g. "Brand" or "Category". */
  tableLabel?: string;
  params: PanelParams;
}

/** One analytics surface: fetches its query, shows the KPI strip whose tiles
 *  toggle metrics, then either the trend graph or the animated ranking table. */
export default function AnalyticsPanel({ title, subtitle, display, tableLabel, params }: Props) {
  const [result, setResult] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeMetrics, setActiveMetrics] = useState<Set<Metric>>(
    new Set(["clicks", "sales", "gmv", "revenue"])
  );
  const toast = useToast();
  const fetchTimer = useRef<number>();
  const requestSeq = useRef(0);
  const [reloadKey, setReloadKey] = useState(0);

  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    const p: PanelParams = JSON.parse(paramsKey);
    window.clearTimeout(fetchTimer.current);
    fetchTimer.current = window.setTimeout(async () => {
      const seq = ++requestSeq.current;
      setLoading(true);
      try {
        const res = await api.analytics({
          mode: p.mode,
          brands: p.brands ?? [],
          categories: p.categories ?? [],
          owner: p.owner ?? "All",
          date_from: p.dateFrom || undefined,
          date_to: p.dateTo || undefined,
        });
        if (seq === requestSeq.current) {
          setResult(res);
          setError(null);
        }
      } catch (e) {
        if (seq === requestSeq.current) setError((e as Error).message);
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 300);
    return () => window.clearTimeout(fetchTimer.current);
  }, [paramsKey, reloadKey]);

  function toggleMetric(m: Metric) {
    setActiveMetrics((prev) => {
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

  const metrics = METRICS.filter((m) => activeMetrics.has(m.key));
  const multiMetric = metrics.length > 1;
  const soloMetric = metrics[0];

  const { data, maxima } = useMemo(() => {
    const rows: Record<string, Record<string, number | string>> = {};
    const maxima: Record<Metric, number> = { clicks: 0, sales: 0, gmv: 0, revenue: 0 };
    if (!result || display !== "graph") return { data: [], maxima };
    for (const s of result.series) {
      for (const p of s.points) {
        const row = (rows[p.date] ??= { date: p.date });
        for (const m of METRICS) {
          const v = p[m.key];
          row[m.key] = v;
          if (v > maxima[m.key]) maxima[m.key] = v;
        }
      }
    }
    const data = Object.values(rows).sort((a, b) =>
      String(a.date).localeCompare(String(b.date))
    );
    if (multiMetric) {
      for (const row of data) {
        for (const m of METRICS) {
          const raw = row[m.key] as number | undefined;
          row[`n__${m.key}`] =
            raw !== undefined && maxima[m.key] > 0 ? (raw / maxima[m.key]) * 100 : 0;
        }
      }
    }
    return { data, maxima };
  }, [result, multiMetric, display]);

  function exportCsv() {
    if (!result || result.series.length === 0) {
      toast("Nothing to export yet.", "error");
      return;
    }
    const range = `${params.dateFrom || "start"}_to_${params.dateTo || "today"}`;
    let rows: (string | number | null)[][];
    if (display === "table") {
      rows = [
        [tableLabel ?? "Name", "Clicks", "Sales", "CR %", "GMV", "Revenue"],
        ...seriesTotals(result).map((r) => [
          r.name, r.clicks, r.sales, r.cr.toFixed(2), r.gmv, r.revenue,
        ]),
      ];
    } else {
      rows = [
        ["Date", "Clicks", "Sales", "CR %", "GMV", "Revenue"],
        ...result.series.flatMap((s) =>
          s.points.map((p) => [
            p.date, p.clicks, p.sales,
            p.clicks > 0 ? ((p.sales / p.clicks) * 100).toFixed(2) : "",
            p.gmv, p.revenue,
          ])
        ),
      ];
    }
    downloadCsv(`${params.mode}-${range}.csv`, rows);
    toast(`Exported ${rows.length - 1} row${rows.length === 2 ? "" : "s"}`);
  }

  const gradientId = `grad-${params.mode}`;
  const hasData = !!result && result.series.some((s) => s.points.length > 0);

  return (
    <section className="panel">
      <div className="panel-head">
        <h3 className="panel-title">
          {title}
          {subtitle && <small>{subtitle}</small>}
        </h3>
        <button
          className="btn panel-export"
          onClick={exportCsv}
          disabled={!hasData}
          title="Download this view as CSV"
        >
          <DownloadIcon />
          CSV
        </button>
      </div>

      {result && hasData && (
        <div className="kpi-strip" role="group" aria-label="Metrics, click to toggle">
          {METRICS.map((m) => {
            const on = activeMetrics.has(m.key);
            const lastOn = on && activeMetrics.size === 1;
            const delta = result.prev_totals
              ? deltaPct(result.totals[m.key], result.prev_totals[m.key])
              : null;
            return (
              <button
                key={m.key}
                className={`kpi ${on ? "" : "dim"}`}
                style={{ ["--kpi-color" as string]: m.color }}
                onClick={() => toggleMetric(m.key)}
                aria-pressed={on}
                aria-disabled={lastOn || undefined}
                title={
                  lastOn
                    ? "At least one metric must stay visible"
                    : on
                      ? `Hide ${m.label}`
                      : `Show ${m.label}`
                }
              >
                <span className="kpi-label">
                  <span className="dot" />
                  {m.label}
                  {result.averaged_over ? <span className="kpi-avg">avg</span> : null}
                </span>
                <span className="kpi-value">
                  <span className="kpi-num">{fmtMetric(m.key, result.totals[m.key])}</span>
                  {delta !== null && (
                    <span
                      className={`kpi-delta ${delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat"}`}
                      aria-label={`${delta > 0.5 ? "up" : delta < -0.5 ? "down" : "flat"} ${Math.abs(delta).toFixed(0)} percent vs the previous period`}
                    >
                      {delta > 0.5 ? (
                        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 1l3 4H1z" fill="currentColor" /></svg>
                      ) : delta < -0.5 ? (
                        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><path d="M4 7L1 3h6z" fill="currentColor" /></svg>
                      ) : null}
                      {Math.abs(delta) < 0.5 ? "0%" : `${Math.abs(delta).toFixed(0)}%`}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {loading && !result && (
        <>
          <div className="skeleton" style={{ height: 64, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 290 }} />
        </>
      )}

      {error && !loading && (
        <div className="empty-state">
          Couldn't load this view: {error}{" "}
          <button className="btn btn-sm" onClick={() => setReloadKey((k) => k + 1)}>
            Retry
          </button>
        </div>
      )}

      {result && !hasData && !loading && !error && (
        <div className="empty-state">No data in this date range.</div>
      )}

      {result && hasData && display === "table" && (
        <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.2s" }}>
          <RankingTable result={result} metrics={metrics} label={tableLabel ?? "Name"} />
        </div>
      )}

      {result && hasData && display === "graph" && data.length > 0 && (
        <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.2s" }}>
          <ResponsiveContainer width="100%" height={290}>
            <ComposedChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={soloMetric?.color} stopOpacity={0.18} />
                  <stop offset="100%" stopColor={soloMetric?.color} stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_CHROME.grid} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => formatBucket(String(v), result.granularity)}
                tick={{ fontSize: 10.5, fill: CHART_CHROME.tick }}
                tickLine={false}
                axisLine={{ stroke: CHART_CHROME.axis }}
                minTickGap={28}
              />
              <YAxis
                tick={{ fontSize: 10.5, fill: CHART_CHROME.tick }}
                tickLine={false}
                axisLine={false}
                width={52}
                tickFormatter={(v) =>
                  multiMetric
                    ? `${v}%`
                    : soloMetric && (soloMetric.key === "gmv" || soloMetric.key === "revenue")
                      ? formatMoney(Number(v))
                      : formatNumber(Number(v))
                }
                domain={multiMetric ? [0, 100] : ["auto", "auto"]}
              />
              <Tooltip
                content={<ChartTooltip granularity={result.granularity} />}
                cursor={{ stroke: CHART_CHROME.cursor, strokeDasharray: "4 4" }}
              />
              {!multiMetric && soloMetric && (
                <Area
                  dataKey={soloMetric.key}
                  stroke="none"
                  fill={`url(#${gradientId})`}
                  animationDuration={550}
                  connectNulls
                  tooltipType="none"
                />
              )}
              {metrics.map((m) => (
                <Line
                  key={m.key}
                  type="monotone"
                  dataKey={multiMetric ? `n__${m.key}` : m.key}
                  name={m.key}
                  stroke={m.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 3.5, strokeWidth: 0 }}
                  animationDuration={550}
                  connectNulls
                />
              ))}
            </ComposedChart>
          </ResponsiveContainer>

          {multiMetric && (
            <p className="chart-note">
              Metrics sit on different scales, so each line is drawn as a share of that
              metric's peak in this range. Hover the chart for actual values. Peaks:{" "}
              {metrics.map((m) => `${m.label} ${fmtMetric(m.key, maxima[m.key])}`).join(" / ")}.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// ------------------------------------------------------- ranking table ----
type SortKey = Metric | "name" | "cr";

function RankingTable({
  result,
  metrics,
  label,
}: {
  result: AnalyticsResponse;
  metrics: { key: Metric; label: string; color: string }[];
  label: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [asc, setAsc] = useState(false);

  const rows = useMemo(() => seriesTotals(result), [result]);

  const maxima = useMemo(() => {
    const m: Record<string, number> = { clicks: 0, sales: 0, gmv: 0, revenue: 0, cr: 0 };
    for (const r of rows)
      for (const k of Object.keys(m)) m[k] = Math.max(m[k], r[k as keyof SeriesTotal] as number);
    return m;
  }, [rows]);

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      return (a[sortKey] as number) - (b[sortKey] as number);
    });
    return asc ? out : out.reverse();
  }, [rows, sortKey, asc]);

  const totals = useMemo(() => {
    const t = { clicks: 0, sales: 0, gmv: 0, revenue: 0 };
    for (const r of rows) {
      t.clicks += r.clicks;
      t.sales += r.sales;
      t.gmv += r.gmv;
      t.revenue += r.revenue;
    }
    return { ...t, cr: t.clicks > 0 ? (t.sales / t.clicks) * 100 : 0 };
  }, [rows]);

  function sortBy(k: SortKey) {
    if (k === sortKey) setAsc((a) => !a);
    else {
      setSortKey(k);
      setAsc(k === "name");
    }
  }

  const ariaSort = (k: SortKey) =>
    k === sortKey ? (asc ? ("ascending" as const) : ("descending" as const)) : undefined;

  const arrow = (k: SortKey) =>
    k === sortKey ? (
      <svg className="sort-arrow" width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
        <path d={asc ? "M4 1l3 4H1z" : "M4 7L1 3h6z"} fill="currentColor" />
      </svg>
    ) : null;

  const barScale = (value: number, max: number) => (max > 0 ? value / max : 0);

  return (
    <div className="table-wrap cmp-wrap">
      <table className="data cmp-table">
        <thead>
          <tr>
            <th className="rank-col" aria-label="Rank">#</th>
            <th aria-sort={ariaSort("name")}>
              <button className="th-sort" onClick={() => sortBy("name")}>
                {label} {arrow("name")}
              </button>
            </th>
            {metrics.map((m) => (
              <th key={m.key} className="num" aria-sort={ariaSort(m.key)}>
                <button className="th-sort" onClick={() => sortBy(m.key)}>
                  <span className="th-dot" style={{ background: m.color }} />
                  {m.label} {arrow(m.key)}
                </button>
              </th>
            ))}
            <th className="num" aria-sort={ariaSort("cr")}>
              <button className="th-sort" onClick={() => sortBy("cr")}>
                <span className="th-dot" style={{ background: CR_COLOR }} />
                CR % {arrow("cr")}
              </button>
            </th>
          </tr>
        </thead>
        <tbody key={`${sortKey}-${asc}`}>
          {sorted.map((r, i) => (
            <tr key={r.name} className="cmp-row" style={{ animationDelay: `${i * 45}ms` }}>
              <td className="rank-col">
                <span className={`rank-badge ${i === 0 && !asc && sortKey !== "name" ? "rank-top" : ""}`}>
                  {i + 1}
                </span>
              </td>
              <td className="cmp-name">{r.name}</td>
              {metrics.map((m) => (
                <td key={m.key} className="num cell-bar">
                  <span
                    className="bar"
                    style={{
                      ["--bar" as string]: barScale(r[m.key], maxima[m.key]),
                      background: `${m.color}1a`,
                    }}
                  />
                  <span className="cell-value">{fmtMetric(m.key, r[m.key])}</span>
                </td>
              ))}
              <td className="num cell-bar">
                <span
                  className="bar"
                  style={{ ["--bar" as string]: barScale(r.cr, maxima.cr), background: `${CR_COLOR}1a` }}
                />
                <span className="cell-value">{r.cr.toFixed(2)}</span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="rank-col" />
            <td className="cmp-name">Total</td>
            {metrics.map((m) => (
              <td key={m.key} className="num">
                {fmtMetric(m.key, totals[m.key])}
              </td>
            ))}
            <td className="num">{totals.cr.toFixed(2)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// -------------------------------------------------------------- tooltip ----
function ChartTooltip({
  active,
  payload,
  label,
  granularity,
}: {
  active?: boolean;
  payload?: { name: string; color: string; payload: Record<string, number | string> }[];
  label?: string;
  granularity: "day" | "month";
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="tooltip-box">
      <div className="tt-title">{formatBucket(String(label), granularity)}</div>
      {payload.map((p) => {
          const metricKey = p.name.replace(/^n__/, "") as Metric;
          const raw = row[metricKey] as number | undefined;
          const meta = METRICS.find((m) => m.key === metricKey);
          if (!meta) return null;
          return (
            <div key={p.name} className="tt-row">
              <span className="dot" style={{ background: p.color }} />
              <span>{meta.label}</span>
              <b>{fmtMetric(meta.key, raw ?? null)}</b>
            </div>
          );
        })}
    </div>
  );
}
