import { useEffect, useMemo, useState } from "react";
import { api, formatRailwayTime } from "../api";
import { downloadCsv } from "../csv";
import { useToast } from "../Toast";
import { HANDLERS, isHandler, type Merchant } from "../types";
import { DownloadIcon, Pagination } from "./Icons";
import { FilterField, iso1, isoLast, RangeSelect, type MY } from "./dvFilters";
import MerchantHistoryModal, { MERCHANT_FIELD_LABELS, fmtMerchantVal } from "./MerchantHistoryModal";
import LedgerHeader from "./shell/LedgerHeader";

/** Left-aligned value; a missing value shows a centered dash instead. */
function Cell({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "" || v === 0) return <span className="mi-null">-</span>;
  return <>{String(v)}</>;
}

/** Merchant Info: every brand's metadata in one table, with a per-merchant edit
 *  history modal, and handler / brand filters plus a history-period export. */
export default function DashboardTab({ user }: { user: string }) {
  const now = useMemo(() => new Date(), []);
  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y, y - 1, y - 2, y - 3];
  }, [now]);

  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // ---- filters
  const [handlerSel, setHandlerSel] = useState<string[]>(isHandler(user) ? [user] : []);
  const [handlerMulti, setHandlerMulti] = useState(false);
  const [allHandlers, setAllHandlers] = useState(false);
  const [brandSel, setBrandSel] = useState<string[]>([]);
  const [brandMulti, setBrandMulti] = useState(false);

  // ---- history period (drives the history CSV; default Jan last year -> now)
  const [from, setFrom] = useState<MY>({ m: 1, y: now.getFullYear() - 1 });
  const [to, setTo] = useState<MY>({ m: now.getMonth() + 1, y: now.getFullYear() });

  const [historyMerchant, setHistoryMerchant] = useState<Merchant | null>(null);
  const [mPage, setMPage] = useState(1);
  const [downloadingHistory, setDownloadingHistory] = useState(false);
  const toast = useToast();

  useEffect(() => {
    setHandlerSel(isHandler(user) ? [user] : []);
    setAllHandlers(false);
    setHandlerMulti(false);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    api
      .listMerchants()
      .then((m) => { setMerchants(m); setError(null); })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const activeHandlers = allHandlers ? [] : handlerSel;

  // Brand options track the chosen handler(s) so suggestions stay relevant.
  const brandOptions = useMemo(() => {
    const scope = activeHandlers.length
      ? merchants.filter((m) => activeHandlers.includes(m.owner ?? ""))
      : merchants;
    return scope.map((m) => m.merchant_name).sort((a, b) => a.localeCompare(b));
  }, [merchants, activeHandlers]);

  const rows = useMemo(() => {
    return merchants
      .filter((m) => (activeHandlers.length ? activeHandlers.includes(m.owner ?? "") : true))
      .filter((m) => (brandSel.length ? brandSel.includes(m.merchant_name) : true))
      .sort((a, b) => a.merchant_name.localeCompare(b.merchant_name));
  }, [merchants, activeHandlers, brandSel]);

  const PER_PAGE = 12;
  useEffect(() => { setMPage(1); }, [handlerSel, allHandlers, brandSel]);
  const shown = rows.slice((mPage - 1) * PER_PAGE, mPage * PER_PAGE);

  function exportTableCsv() {
    if (rows.length === 0) return toast("Nothing to export.", "error");
    downloadCsv("merchant-info.csv", [
      [
        "Merchant ID", "Merchant Name", "Breadcrumb1 Name", "Breadcrumb2 Name",
        "Affiliate ID", "Affiliate Name", "Reporting", "Deal Type", "Payout", "Revenue Status",
      ],
      ...rows.map((m) => [
        m.merchant_id, m.merchant_name, m.breadcrumb1_name ?? "", m.breadcrumb2_name ?? "",
        m.affiliate_id || "", m.affiliate_name ?? "", m.reporting ?? "", m.deal_type ?? "",
        m.payout ?? "", m.revenue_status,
      ]),
    ]);
    toast(`Exported ${rows.length} merchant${rows.length === 1 ? "" : "s"}`);
  }

  async function exportHistoryCsv() {
    if (rows.length === 0) return toast("No merchants in view to export history for.", "error");
    setDownloadingHistory(true);
    try {
      const dFrom = iso1(from);
      const dTo = isoLast(to);
      const ids = new Set(rows.map((m) => m.merchant_id));
      const [logs, evs] = await Promise.all([
        api.listMerchantEditLogs({ date_from: dFrom, date_to: dTo, limit: 5000 }),
        api.statusHistory({}),
      ]);
      const out: { mid: number; name: string; type: string; field: string; old: string; new: string; by: string; when: string }[] = [];
      for (const l of logs) {
        if (!ids.has(l.merchant_id)) continue;
        for (const [f, ch] of Object.entries(l.changes)) {
          out.push({
            mid: l.merchant_id, name: l.merchant_name, type: "Edit",
            field: MERCHANT_FIELD_LABELS[f] ?? f, old: fmtMerchantVal(ch.old), new: fmtMerchantVal(ch.new),
            by: l.edited_by, when: l.edited_at,
          });
        }
      }
      const fromT = new Date(`${dFrom}T00:00:00`).getTime();
      const toT = new Date(`${dTo}T23:59:59`).getTime();
      for (const ev of evs) {
        if (!ids.has(ev.merchant_id)) continue;
        const t = new Date(ev.date).getTime();
        if (t < fromT || t > toT) continue;
        out.push({
          mid: ev.merchant_id, name: ev.merchant_name, type: "Status",
          field: "Revenue Status", old: ev.from_status, new: ev.to_status,
          by: ev.changed_by, when: ev.date,
        });
      }
      out.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
      if (out.length === 0) return toast("No edit history in this period.", "error");
      downloadCsv("merchant-edit-history.csv", [
        ["Merchant ID", "Merchant Name", "Type", "Field", "Old Value", "New Value", "Changed By", "When"],
        ...out.map((r) => [r.mid, r.name, r.type, r.field, r.old, r.new, r.by, formatRailwayTime(r.when)]),
      ]);
      toast(`Exported ${out.length} change${out.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDownloadingHistory(false);
    }
  }

  const revCount = rows.filter((m) => m.revenue_status === "Revenue").length;

  return (
    <>
      <LedgerHeader
        title="Merchant Info"
        description="The master record for every brand: reporting cadence, payout, deal type, and owner."
        figures={[
          { label: "Merchants", value: String(rows.length) },
          { label: "Revenue", value: String(revCount) },
          { label: "Non-revenue", value: String(rows.length - revCount) },
        ]}
      />

      {/* ---------------------------------------------- filters --- */}
      <div className="card dv-filters">
        <div className="dv-filter-grid dv-grid-2">
          <FilterField
            label="Handler"
            options={HANDLERS}
            selected={handlerSel}
            onChange={setHandlerSel}
            multi={handlerMulti}
            onMulti={(on) => { setHandlerMulti(on); if (!on && handlerSel.length > 1) setHandlerSel(handlerSel.slice(0, 1)); }}
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
            onMulti={(on) => { setBrandMulti(on); if (!on && brandSel.length > 1) setBrandSel(brandSel.slice(0, 1)); }}
            toggleLabel="Multiple brands"
            singlePlaceholder="Search a brand"
            multiPlaceholder="Add brands to view"
            showClear
          />
        </div>

        <div className="dv-actions">
          <div className="dv-date">
            <span className="dv-date-label">History period</span>
            <RangeSelect from={from} to={to} years={yearOptions} onFrom={setFrom} onTo={setTo} />
          </div>
          <div className="mi-downloads">
            <button className="btn btn-sm" onClick={exportTableCsv} data-tip="Download the merchant table as CSV">
              <DownloadIcon />
              Download CSV
            </button>
            <button className="btn btn-sm" onClick={exportHistoryCsv} disabled={downloadingHistory} data-tip="Download the edit history for the selected period as CSV">
              <DownloadIcon />
              {downloadingHistory ? "Preparing…" : "Download history"}
            </button>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------- table --- */}
      <div className="card mi-card">
        {error && !loading && (
          <div className="empty-state is-error">
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
          <div className="table-wrap mi-scroll">
            <table className="data mi-table">
              <thead>
                <tr>
                  <th>Merchant ID</th>
                  <th>Merchant Name</th>
                  <th>Breadcrumb1 Name</th>
                  <th>Breadcrumb2 Name</th>
                  <th>Affiliate ID</th>
                  <th>Affiliate Name</th>
                  <th>Reporting</th>
                  <th>Deal Type</th>
                  <th>Payout</th>
                  <th>Revenue Status</th>
                  <th>History</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No merchants match these filters.
                    </td>
                  </tr>
                )}
                {shown.map((m) => (
                  <tr key={m.merchant_id}>
                    <td className="mono">{m.merchant_id}</td>
                    <td><b>{m.merchant_name}</b></td>
                    <td><Cell v={m.breadcrumb1_name} /></td>
                    <td><Cell v={m.breadcrumb2_name} /></td>
                    <td className="mono"><Cell v={m.affiliate_id} /></td>
                    <td><Cell v={m.affiliate_name} /></td>
                    <td><Cell v={m.reporting} /></td>
                    <td><Cell v={m.deal_type} /></td>
                    <td><Cell v={m.payout} /></td>
                    <td>
                      <span className={`rev-chip ${m.revenue_status === "Non-revenue" ? "rev-off" : "rev-on"}`}>
                        {m.revenue_status}
                      </span>
                    </td>
                    <td>
                      <button className="history-link" onClick={() => setHistoryMerchant(m)}>
                        History
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={mPage} total={rows.length} perPage={PER_PAGE} noun="merchants" onChange={setMPage} />
          </div>
        )}
      </div>

      {historyMerchant && (
        <MerchantHistoryModal merchant={historyMerchant} onClose={() => setHistoryMerchant(null)} />
      )}
    </>
  );
}
