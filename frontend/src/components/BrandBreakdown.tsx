import { useEffect, useMemo, useRef, useState } from "react";
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
  HANDLERS,
  isHandler,
  OVERVIEW_METRICS,
  type MetricKind,
  type Merchant,
  type OverviewMetric,
  type OverviewResponse,
} from "../types";
import ConversionSpine from "./ConversionSpine";
import { DownloadIcon } from "./Icons";
import { FilterField, iso1, isoLast, RangeSelect, SingleMonthSelect, type MY } from "./dvFilters";
import LedgerHeader, { type LedgerFigure } from "./shell/LedgerHeader";

function fmtByKind(kind: MetricKind, v: number | null | undefined): string {
  if (kind === "money") return formatMoney(v);
  if (kind === "pct") return formatPct(v);
  return formatNumber(v);
}

interface Applied {
  handlers: string[];
  brands: string[];
  categories: string[];
  dateFrom: string;
  dateTo: string;
}

/** Data View: per-merchant month-by-month breakdown. Handler / Brand / Category
 *  filters (brand and category are mutually exclusive) feed a Search action —
 *  nothing is fetched until Search is tapped. */
export default function BrandBreakdown({ user }: { user: string }) {
  const now = useMemo(() => new Date(), []);
  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y, y - 1, y - 2];
  }, [now]);

  const defTo = useMemo<MY>(
    () => ({ m: new Date(now.getFullYear(), now.getMonth() - 1, 1).getMonth() + 1, y: new Date(now.getFullYear(), now.getMonth() - 1, 1).getFullYear() }),
    [now]
  );
  const defFrom = useMemo<MY>(
    () => ({ m: new Date(now.getFullYear(), now.getMonth() - 3, 1).getMonth() + 1, y: new Date(now.getFullYear(), now.getMonth() - 3, 1).getFullYear() }),
    [now]
  );

  // ---- filters (draft; applied only on Search)
  const [handlerSel, setHandlerSel] = useState<string[]>(isHandler(user) ? [user] : []);
  const [handlerMulti, setHandlerMulti] = useState(false);
  const [allHandlers, setAllHandlers] = useState(false);
  const [brandSel, setBrandSel] = useState<string[]>([]);
  const [brandMulti, setBrandMulti] = useState(false);
  const [catSel, setCatSel] = useState<string[]>([]);

  // ---- date controls (draft)
  const [from, setFrom] = useState<MY>(defFrom);
  const [to, setTo] = useState<MY>(defTo);
  const [single, setSingle] = useState(false);
  const [one, setOne] = useState<MY>(defTo);

  // ---- options + data
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [res, setRes] = useState<OverviewResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cols, setCols] = useState<Set<OverviewMetric>>(
    new Set(["clicks", "sales", "cr", "gmv", "revenue"])
  );
  const [applied, setApplied] = useState<Applied | null>(null);
  const seq = useRef(0);
  const toast = useToast();

  const brandOptions = useMemo(() => merchants.map((m) => m.merchant_name), [merchants]);
  // Brand and category are mutually exclusive: pick one, the other locks until
  // it is cleared.
  const brandDisabled = catSel.length > 0;
  const catDisabled = brandSel.length > 0;

  function buildFilters(handlersOverride?: string[]): Applied {
    const f = single ? one : from;
    const t = single ? one : to;
    return {
      handlers: handlersOverride ?? (allHandlers ? [] : handlerSel),
      brands: brandSel,
      categories: catSel,
      dateFrom: iso1(f),
      dateTo: isoLast(t),
    };
  }
  function runSearch() {
    setApplied(buildFilters());
  }
  const dirty = !applied || JSON.stringify(buildFilters()) !== JSON.stringify(applied);

  useEffect(() => {
    Promise.all([api.listMerchants(), api.listCategories()])
      .then(([m, c]) => {
        setMerchants(m);
        setCategoryOptions(c);
      })
      .catch(() => {/* the table fetch surfaces its own error */});
  }, []);

  // Initial load, and whenever the acting user changes: reset the handler filter
  // to their own book and run the search once so the table isn't empty.
  useEffect(() => {
    const hs = isHandler(user) ? [user] : [];
    setHandlerSel(hs);
    setAllHandlers(false);
    setHandlerMulti(false);
    setApplied(buildFilters(hs));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (!applied) return;
    const s = ++seq.current;
    setLoading(true);
    api
      .overview({
        date_from: applied.dateFrom,
        date_to: applied.dateTo,
        brands: applied.brands,
        categories: applied.categories,
        handlers: applied.handlers,
      })
      .then((r) => {
        if (s !== seq.current) return;
        setRes(r);
        setErr(null);
      })
      .catch((e) => s === seq.current && setErr((e as Error).message))
      .finally(() => s === seq.current && setLoading(false));
  }, [applied]);

  function setBrandMode(on: boolean) {
    setBrandMulti(on);
    if (!on && brandSel.length > 1) setBrandSel(brandSel.slice(0, 1));
  }
  function setHandlerMode(on: boolean) {
    setHandlerMulti(on);
    if (!on && handlerSel.length > 1) setHandlerSel(handlerSel.slice(0, 1));
  }

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

  // Ledger-header figures, surfaced from the loaded breakdown (presentation only).
  const months = res?.months ?? [];
  const latestMk = months[months.length - 1];
  const latestTot = latestMk ? totals[latestMk] : null;
  const periodLabel = months.length
    ? `${formatMonthLong(months[0])} to ${formatMonthLong(latestMk)}`
    : "";
  const figures: LedgerFigure[] = res
    ? [
        { label: "Brands", value: formatNumber(res.by_merchant.length) },
        ...(latestTot
          ? [
              { label: "Revenue", value: formatMoney(latestTot.revenue) } as LedgerFigure,
              { label: "Blended CR", value: formatPct(latestTot.cr) } as LedgerFigure,
            ]
          : []),
      ]
    : [];

  function exportCsv() {
    if (!res || res.by_merchant.length === 0) return toast("Nothing to export yet.", "error");
    const header = ["Merchant name"];
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
    downloadCsv("merchant-breakdown.csv", rows);
    toast(`Exported ${res.by_merchant.length} merchant${res.by_merchant.length === 1 ? "" : "s"}`);
  }

  return (
    <>
      <LedgerHeader
        title="Data View"
        description={`Month-by-month funnel across every brand in view${periodLabel ? ` · ${periodLabel}` : ""}.`}
        figures={figures}
      />

      {/* ---------------------------------------------- filters --- */}
      <div className="card dv-filters">
        <div className="dv-filter-grid">
          <FilterField
            label="Handler"
            options={HANDLERS}
            selected={handlerSel}
            onChange={setHandlerSel}
            multi={handlerMulti}
            onMulti={setHandlerMode}
            toggleLabel="Multiple handlers"
            singlePlaceholder="Search a handler"
            multiPlaceholder="Add handlers to view"
            clearQueryOnFocus
            all={allHandlers}
            onAll={setAllHandlers}
            allLabel="All handlers"
          />
          <FilterField
            label="Brand"
            options={brandOptions}
            selected={brandSel}
            onChange={setBrandSel}
            multi={brandMulti}
            onMulti={setBrandMode}
            toggleLabel="Multiple brands"
            singlePlaceholder="Search a brand"
            multiPlaceholder="Add brands to view"
            showClear
            disabled={brandDisabled}
            disabledHint="Clear the category to search brands"
          />
          <FilterField
            label="Category"
            options={categoryOptions}
            selected={catSel}
            onChange={setCatSel}
            singlePlaceholder="Search a category"
            showClear
            disabled={catDisabled}
            disabledHint="Clear the brand to search categories"
          />
        </div>

        <div className="dv-actions">
          <div className="dv-date">
            <span className="dv-date-label">Months</span>
            {single ? (
              <SingleMonthSelect value={one} years={yearOptions} onChange={setOne} />
            ) : (
              <RangeSelect from={from} to={to} years={yearOptions} onFrom={setFrom} onTo={setTo} />
            )}
            <label className="dv-multi">
              <button
                type="button"
                className={`toggle toggle-sm ${single ? "" : "off"}`}
                onClick={() => setSingle((v) => !v)}
                role="switch"
                aria-checked={single}
                aria-label="Single month"
              />
              <span className="compare-label">Single month</span>
            </label>
          </div>
          <button className={`btn btn-primary dv-search ${dirty ? "is-dirty" : ""}`} onClick={runSearch}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" />
            </svg>
            Search
          </button>
        </div>
      </div>

      {/* ------------------------------------- the conversion spine --- */}
      {res && res.by_merchant.length > 0 && (
        <ConversionSpine
          totals={res.totals}
          prev={res.prev_totals}
          caption={periodLabel ? `${periodLabel} · ${res.by_merchant.length} brand${res.by_merchant.length === 1 ? "" : "s"}` : undefined}
        />
      )}

      {/* ---------------------------------------------- table --- */}
      <section className="panel ov-breakdown">
        <div className="ov-table-bar">
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
                  data-tip={lastOn ? "At least one column must stay" : on ? `Hide ${m.label} column` : `Show ${m.label} column`}
                >
                  <span className="mc-dot" />
                  {m.label}
                </button>
              );
            })}
          </div>
          <button className="btn btn-sm ov-csv" onClick={exportCsv} data-tip="Download the breakdown as CSV">
            <DownloadIcon />
            Table CSV
          </button>
        </div>

        {err && <div className="empty-state is-error">Couldn't load the breakdown: {err}</div>}

        {res && (
          <div className="table-wrap ov-scroll" style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.2s" }}>
            <table className="data ov-table">
              <thead>
                <tr>
                  <th className="ov-brand-col" rowSpan={2}>Merchant name</th>
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
                      No merchants match these filters.
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
    </>
  );
}
