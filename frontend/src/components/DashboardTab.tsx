import { useEffect, useMemo, useRef, useState } from "react";
import { api, formatMonthYearISO, formatRailwayTime } from "../api";
import { downloadCsv } from "../csv";
import { useToast } from "../Toast";
import { HANDLERS, isPrivileged, type EditLog, type Merchant, type StatusEvent } from "../types";
import { DownloadIcon, ExternalLinkIcon, HandlerAvatar, Pagination } from "./Icons";
import PeriodPicker from "./PeriodPicker";

const FIELD_LABELS: Record<string, string> = {
  entry_date: "Period", clicks: "Clicks", sales: "Sales",
  cr: "CR %", gmv: "GMV", revenue: "Revenue", remarks: "Remarks",
};

/** entry_date diffs are stored as ISO dates but shown month/year only. */
function fmtChangeValue(field: string, v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (field === "entry_date") return formatMonthYearISO(String(v));
  return String(v);
}

export default function DashboardTab({ user }: { user: string }) {
  const privileged = isPrivileged(user);
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [handler, setHandler] = useState("All");
  const [search, setSearch] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const toast = useToast();

  // One unified "Change history" combining entry edits AND revenue-status flips.
  const [editLogs, setEditLogs] = useState<EditLog[]>([]);
  const [events, setEvents] = useState<StatusEvent[]>([]);
  const [chSearch, setChSearch] = useState("");
  const [chYear, setChYear] = useState("");
  const [chMonth, setChMonth] = useState("");
  const chTimer = useRef<number>();

  // Handlers only ever see their own book; privileged pick via the dropdown.
  const effectiveOwner = privileged ? handler : user;

  useEffect(() => {
    window.clearTimeout(chTimer.current);
    chTimer.current = window.setTimeout(() => {
      const merchant = chSearch.trim() || undefined;
      api.listEditLogs({ owner: effectiveOwner, merchant }).then(setEditLogs).catch(() => setEditLogs([]));
      api.statusHistory({ owner: effectiveOwner, merchant }).then(setEvents).catch(() => setEvents([]));
    }, 250);
    return () => window.clearTimeout(chTimer.current);
  }, [effectiveOwner, chSearch, reloadKey]);

  // Merge both event kinds into one time-sorted list.
  const changeRows = useMemo(() => {
    const rows: {
      key: string; type: "Edit" | "Status"; merchant_id: number; merchant_name: string;
      by: string; when: string; change: string;
    }[] = [];
    for (const l of editLogs) {
      rows.push({
        key: `e${l.id}`, type: "Edit", merchant_id: l.merchant_id, merchant_name: l.merchant_name,
        by: l.edited_by, when: l.edited_at,
        change: Object.entries(l.changes)
          .map(([f, ch]) => `${FIELD_LABELS[f] ?? f}: ${fmtChangeValue(f, ch.old)} → ${fmtChangeValue(f, ch.new)}`)
          .join(", "),
      });
    }
    for (const ev of events) {
      rows.push({
        key: `s${ev.merchant_id}-${ev.date}-${ev.to_status}`, type: "Status",
        merchant_id: ev.merchant_id, merchant_name: ev.merchant_name,
        by: ev.changed_by, when: ev.date,
        change: `${ev.from_status} → ${ev.to_status}`,
      });
    }
    return rows.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
  }, [editLogs, events]);

  const chYearOptions = useMemo(() => {
    const ys = new Set<number>();
    for (const r of changeRows) ys.add(new Date(r.when).getFullYear());
    ys.add(new Date().getFullYear());
    return [...ys].sort((a, b) => b - a);
  }, [changeRows]);

  const filteredChanges = useMemo(() => {
    if (!chYear) return changeRows;
    return changeRows.filter((r) => {
      const d = new Date(r.when);
      if (d.getFullYear() !== Number(chYear)) return false;
      if (chMonth && d.getMonth() + 1 !== Number(chMonth)) return false;
      return true;
    });
  }, [changeRows, chYear, chMonth]);

  function exportChangesCsv() {
    if (filteredChanges.length === 0) {
      toast("Nothing to export.", "error");
      return;
    }
    downloadCsv(`cr-change-history-${effectiveOwner === "All" ? "all" : effectiveOwner}.csv`, [
      ["Merchant", "MerchantID", "Type", "Change", "By", "When"],
      ...filteredChanges.map((r) => [
        r.merchant_name, r.merchant_id, r.type, r.change, r.by, formatRailwayTime(r.when),
      ]),
    ]);
    toast(`Exported ${filteredChanges.length} change${filteredChanges.length === 1 ? "" : "s"}`);
  }

  useEffect(() => {
    setLoading(true);
    api
      .listMerchants(effectiveOwner)
      .then((m) => {
        setMerchants(m);
        setError(null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [effectiveOwner, reloadKey]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? merchants.filter((m) => m.merchant_name.toLowerCase().includes(q))
      : merchants;
    return [...list].sort((a, b) => a.merchant_name.localeCompare(b.merchant_name));
  }, [merchants, search]);

  const PER_PAGE = 10;
  const [mPage, setMPage] = useState(1);
  const [chPage, setChPage] = useState(1);
  useEffect(() => { setMPage(1); }, [search, handler]);
  useEffect(() => { setChPage(1); }, [chSearch, chYear, chMonth]);
  const shownRows = rows.slice((mPage - 1) * PER_PAGE, mPage * PER_PAGE);
  const shownChanges = filteredChanges.slice((chPage - 1) * PER_PAGE, chPage * PER_PAGE);

  function exportCsv() {
    if (rows.length === 0) {
      toast("Nothing to export.", "error");
      return;
    }
    downloadCsv(`cr-dashboard-${effectiveOwner === "All" ? "all" : effectiveOwner}.csv`, [
      ["MerchantID", "MerchantName", "URL", "RevenueStatus", "DealType", "Payout", "Reporting", "Handler"],
      ...rows.map((m) => [
        m.merchant_id, m.merchant_name, m.url, m.revenue_status,
        m.deal_type, m.payout, m.reporting, m.owner,
      ]),
    ]);
    toast(`Exported ${rows.length} merchant${rows.length === 1 ? "" : "s"}`);
  }

  return (
    <>
      <div className="card">
        <div className="dash-head">
          <div>
            <h3 style={{ margin: 0 }}>
              {privileged
                ? handler === "All"
                  ? "All merchants"
                  : `${handler}'s merchants`
                : "My merchants"}
            </h3>
            <p className="card-sub" style={{ margin: "4px 0 0" }}>
              {rows.length} merchant{rows.length === 1 ? "" : "s"}
              {privileged ? "" : `, handled by ${user}`}
            </p>
          </div>
          <div className="dash-tools">
            <input
              className="dash-search"
              placeholder="Search merchant"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search merchant"
            />
            {privileged && (
              <div className="mini-field">
                <label htmlFor="dash-handler">Handler</label>
                <select id="dash-handler" value={handler} onChange={(e) => setHandler(e.target.value)}>
                  <option>All</option>
                  {HANDLERS.map((h) => (
                    <option key={h}>{h}</option>
                  ))}
                </select>
              </div>
            )}
            <button className="btn" onClick={exportCsv} title="Download this table as CSV">
              <DownloadIcon />
              Export CSV
            </button>
          </div>
        </div>

        {error && !loading && (
          <div className="empty-state">
            Couldn't load merchants: {error}{" "}
            <button className="btn btn-sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
          </div>
        )}

        {loading && (
          <div>
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton" style={{ height: 40, marginBottom: 6 }} />
            ))}
          </div>
        )}

        {!loading && !error && (
          <div className="table-wrap cmp-wrap">
            <table className="data dash-table">
              <thead>
                <tr>
                  <th className="rank-col">#</th>
                  <th>Merchant</th>
                  <th>Link</th>
                  <th>Status</th>
                  <th>Deal type</th>
                  <th className="num">Payout</th>
                  <th>Reporting</th>
                  {privileged && <th>Handler</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={privileged ? 8 : 7} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No merchants match.
                    </td>
                  </tr>
                )}
                {shownRows.map((m, i) => (
                  <tr key={m.merchant_id} className="cmp-row" style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                    <td className="rank-col mono muted">{(mPage - 1) * PER_PAGE + i + 1}</td>
                    <td>
                      <div className="dash-merchant">
                        <b>{m.merchant_name}</b>
                        <span className="muted mono">#{m.merchant_id}</span>
                      </div>
                    </td>
                    <td>
                      {m.url ? (
                        <a className="url-link" href={m.url} target="_blank" rel="noreferrer" title={m.url}>
                          <ExternalLinkIcon />
                          {m.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                        </a>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </td>
                    <td>
                      <span className={`rev-chip ${m.revenue_status === "Non-revenue" ? "rev-off" : "rev-on"}`}>
                        {m.revenue_status}
                      </span>
                    </td>
                    <td>{m.deal_type ?? "-"}</td>
                    <td className="num">{m.payout ?? "-"}</td>
                    <td>{m.reporting ?? "-"}</td>
                    {privileged && (
                      <td>
                        <span className="owner-cell">
                          <HandlerAvatar name={m.owner} size={22} />
                          {m.owner ?? "-"}
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={mPage} total={rows.length} perPage={PER_PAGE} noun="merchants" onChange={setMPage} />
          </div>
        )}
      </div>

      <div className="card">
        <div className="dash-head">
          <div>
            <h3 style={{ margin: 0 }}>Edit History</h3>
            <p className="card-sub" style={{ margin: "4px 0 0" }}>
              Every edit to an entry and every Revenue / Non-revenue switch, in one place.
            </p>
          </div>
          <div className="dash-tools">
            <input
              className="dash-search"
              placeholder="Search merchant"
              value={chSearch}
              onChange={(e) => setChSearch(e.target.value)}
              aria-label="Search change history by merchant"
            />
            <PeriodPicker
              year={chYear}
              month={chMonth}
              yearOptions={chYearOptions}
              onChange={(y, m) => {
                setChYear(y);
                setChMonth(m);
              }}
            />
            <button className="btn" onClick={exportChangesCsv} title="Download this history as CSV">
              <DownloadIcon />
              Export CSV
            </button>
          </div>
        </div>

        {filteredChanges.length === 0 ? (
          <div className="empty-state" style={{ padding: "28px 0" }}>
            No changes{chSearch ? ` for "${chSearch}"` : ""}{chYear ? " in this period" : ""} yet.
          </div>
        ) : (
          <div className="table-wrap cmp-wrap">
            <table className="data change-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Type</th>
                  <th>Change</th>
                  <th>By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {shownChanges.map((r, i) => (
                  <tr key={r.key} className="cmp-row" style={{ animationDelay: `${Math.min(i, 14) * 28}ms` }}>
                    <td><b>{r.merchant_name}</b> <span className="muted mono">#{r.merchant_id}</span></td>
                    <td>
                      <span className={`type-chip ${r.type === "Status" ? "type-status" : "type-edit"}`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="change-cell">{r.change}</td>
                    <td>{r.by}</td>
                    <td className="muted mono">{formatRailwayTime(r.when)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={chPage} total={filteredChanges.length} perPage={PER_PAGE} noun="changes" onChange={setChPage} />
          </div>
        )}
      </div>
    </>
  );
}
