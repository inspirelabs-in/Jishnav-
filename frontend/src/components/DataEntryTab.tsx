import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, formatMonthYear, formatMoney, formatNumber, formatRailwayTime } from "../api";
import { downloadCsv } from "../csv";
import { useToast } from "../Toast";
import { HANDLERS, isPrivileged, type Entry, type Merchant } from "../types";
import AddMerchantForm from "./AddMerchantForm";
import EditHistoryModal from "./EditHistoryModal";
import EntryForm from "./EntryForm";
import { DownloadIcon, Pagination, TrashIcon } from "./Icons";
import MonthYearPicker from "./MonthYearPicker";
import PeriodPicker from "./PeriodPicker";
import RemarkCell from "./RemarkPopover";

interface Props {
  user: string;
  onDataChanged: () => void;
}

interface EditDraft {
  entry_date: string;
  clicks: string;
  sales: string;
  gmv: string;
  revenue: string;
  remarks: string;
}

/** [year, month(1-12)] -> ["2026-07-01", "2026-07-31"] */
function monthRange(year: number, month: number): [string, string] {
  const last = new Date(year, month, 0).getDate();
  const m = String(month).padStart(2, "0");
  return [`${year}-${m}-01`, `${year}-${m}-${String(last).padStart(2, "0")}`];
}

function yearRange(year: number): [string, string] {
  return [`${year}-01-01`, `${year}-12-31`];
}

export default function DataEntryTab({ user, onDataChanged }: Props) {
  const [mode, setMode] = useState<"entry" | "add_merchant">("entry");
  const [newMerchantName, setNewMerchantName] = useState("");
  const [prefillMerchant, setPrefillMerchant] = useState<Merchant | null>(null);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [filterMerchant, setFilterMerchant] = useState("");
  const [filterHandler, setFilterHandler] = useState("All");
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showEditLogs, setShowEditLogs] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const toast = useToast();
  const filterTimer = useRef<number>();
  const firstLoad = useRef(true);

  const thisYear = new Date().getFullYear();
  const yearOptions = useMemo(() => [thisYear, thisYear - 1, thisYear - 2], [thisYear]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      let from: string | undefined;
      let to: string | undefined;
      if (filterYear && filterMonth) [from, to] = monthRange(Number(filterYear), Number(filterMonth));
      else if (filterYear) [from, to] = yearRange(Number(filterYear));
      setEntries(
        await api.listEntries({
          merchant: filterMerchant || undefined,
          handler: filterHandler,
          date_from: from,
          date_to: to,
        })
      );
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
      firstLoad.current = false;
    }
  }, [filterMerchant, filterHandler, filterYear, filterMonth]);

  useEffect(() => {
    setPage(1);
    window.clearTimeout(filterTimer.current);
    filterTimer.current = window.setTimeout(loadEntries, 250);
    return () => window.clearTimeout(filterTimer.current);
  }, [loadEntries]);

  function startEdit(e: Entry) {
    setEditingId(e.id);
    setDraft({
      entry_date: e.entry_date,
      clicks: e.clicks?.toString() ?? "",
      sales: e.sales?.toString() ?? "",
      gmv: e.gmv?.toString() ?? "",
      revenue: e.revenue?.toString() ?? "",
      remarks: e.remarks ?? "",
    });
  }

  async function saveEdit(entry: Entry) {
    if (!draft || savingEdit) return;
    setSavingEdit(true);
    try {
      await api.updateEntry(entry.id, {
        entry_date: draft.entry_date,
        clicks: draft.clicks === "" ? null : Number(draft.clicks),
        sales: draft.sales === "" ? null : Number(draft.sales),
        gmv: draft.gmv === "" ? null : Number(draft.gmv),
        revenue: draft.revenue === "" ? null : Number(draft.revenue),
        remarks: draft.remarks.trim() || null,
        edited_by: user,
      });
      toast("Entry updated");
      setEditingId(null);
      setDraft(null);
      loadEntries();
      onDataChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteEntry(entry: Entry) {
    if (deleting) return;
    setDeleting(true);
    try {
      await api.deleteEntry(entry.id, user);
      toast(`Deleted the ${entry.merchant_name} entry`);
      setConfirmDeleteId(null);
      loadEntries();
      onDataChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  }

  const draftCr =
    draft && draft.clicks && draft.sales && Number(draft.clicks) > 0
      ? ((Number(draft.sales) / Number(draft.clicks)) * 100).toFixed(2)
      : "-";

  const PER_PAGE = 10;
  const shownEntries = entries.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  function exportEntriesCsv() {
    if (entries.length === 0) {
      toast("Nothing to export. No rows match these filters.", "error");
      return;
    }
    downloadCsv(`cr-entry-logs-${new Date().toISOString().slice(0, 10)}.csv`, [
      [
        "MerchantID", "MerchantName", "Period", "Clicks", "Sales", "CR %", "GMV",
        "Revenue", "Remarks", "RevenueStatus", "EnteredBy", "AddedAt",
      ],
      ...entries.map((e) => [
        e.merchant_id, e.merchant_name, formatMonthYear(e.entry_month, e.entry_year),
        e.clicks, e.sales, e.cr,
        e.gmv, e.revenue, e.remarks, e.revenue_status, e.entered_by, e.created_at,
      ]),
    ]);
    toast(`Exported ${entries.length} row${entries.length === 1 ? "" : "s"}`);
  }

  return (
    <>
      {mode === "entry" ? (
        <EntryForm
          user={user}
          prefillMerchant={prefillMerchant}
          onAddNewMerchant={(name) => {
            setNewMerchantName(name);
            setMode("add_merchant");
          }}
          onSaved={() => {
            loadEntries();
            onDataChanged();
          }}
        />
      ) : (
        <AddMerchantForm
          user={user}
          initialName={newMerchantName}
          onCancel={() => setMode("entry")}
          onCreated={(m) => {
            setPrefillMerchant(m);
            setMode("entry");
          }}
        />
      )}

      <div className="card">
        <h3>Entry Logs</h3>
        <div className="filters-row">
          <div className="field">
            <label htmlFor="fl-merchant">Merchant</label>
            <input
              id="fl-merchant"
              placeholder="Filter by merchant"
              value={filterMerchant}
              onChange={(e) => setFilterMerchant(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="fl-handler">Handler</label>
            <select id="fl-handler" value={filterHandler} onChange={(e) => setFilterHandler(e.target.value)}>
              <option>All</option>
              {HANDLERS.map((h) => (
                <option key={h}>{h}</option>
              ))}
            </select>
          </div>
          <PeriodPicker
            year={filterYear}
            month={filterMonth}
            yearOptions={yearOptions}
            onChange={(y, m) => {
              setFilterYear(y);
              setFilterMonth(m);
            }}
          />
          <button className="btn" style={{ marginLeft: "auto" }} onClick={() => setShowEditLogs(true)}>
            View edit logs
          </button>
          <button
            className="btn"
            onClick={exportEntriesCsv}
            title="Download the rows currently shown, as CSV"
          >
            <DownloadIcon />
            Export CSV
          </button>
        </div>

        {loadError && !loading && (
          <div className="empty-state">
            Couldn't load entries: {loadError}{" "}
            <button className="btn btn-sm" onClick={loadEntries}>
              Retry
            </button>
          </div>
        )}

        {loading && firstLoad.current && (
          <div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 34, marginBottom: 6 }} />
            ))}
          </div>
        )}

        {!loadError && !(loading && firstLoad.current) && (
          <div className="table-wrap" style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.2s" }}>
            <table className="data">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Merchant</th>
                  <th>Period</th>
                  <th className="num">Clicks</th>
                  <th className="num">Sales</th>
                  <th className="num">CR %</th>
                  <th className="num">GMV</th>
                  <th className="num">Revenue</th>
                  <th>Remarks</th>
                  <th>Entered by</th>
                  <th>Added at</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={12} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No entries match these filters.
                    </td>
                  </tr>
                )}
                {shownEntries.map((e) => {
                  const isEditing = editingId === e.id;
                  const canEdit = e.entered_by === user;
                  const isNonRev = e.revenue_status === "Non-revenue";
                  const rowClass = isEditing
                    ? ""
                    : isNonRev
                      ? "row-nonrev"
                      : e.is_comeback
                        ? "row-comeback"
                        : "";
                  return (
                    <tr key={e.id} className={rowClass}>
                      <td className="muted mono">{e.merchant_id}</td>
                      <td>
                        <b>{e.merchant_name}</b>
                        {!isEditing && e.is_comeback && (
                          <span className="stamp stamp-resumed">Back to revenue</span>
                        )}
                      </td>
                      <td className="mono">
                        {isEditing ? (
                          <MonthYearPicker
                            compact
                            ariaLabel="Entry period"
                            month={Number(draft!.entry_date.slice(5, 7))}
                            year={Number(draft!.entry_date.slice(0, 4))}
                            years={yearOptions}
                            onChange={(m, y) =>
                              setDraft((d) => ({
                                ...d!,
                                entry_date: `${y}-${String(m).padStart(2, "0")}-01`,
                              }))
                            }
                          />
                        ) : (
                          formatMonthYear(e.entry_month, e.entry_year)
                        )}
                      </td>
                      {isEditing ? (
                        <>
                          <td className="num">
                            <input
                              type="number"
                              aria-label="Clicks"
                              value={draft!.clicks}
                              onChange={(ev) => setDraft((d) => ({ ...d!, clicks: ev.target.value }))}
                            />
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              aria-label="Sales"
                              value={draft!.sales}
                              onChange={(ev) => setDraft((d) => ({ ...d!, sales: ev.target.value }))}
                            />
                          </td>
                          <td className="num muted">{draftCr}</td>
                          <td className="num">
                            <input
                              type="number"
                              aria-label="GMV"
                              value={draft!.gmv}
                              onChange={(ev) => setDraft((d) => ({ ...d!, gmv: ev.target.value }))}
                            />
                          </td>
                          <td className="num">
                            <input
                              type="number"
                              aria-label="Revenue"
                              value={draft!.revenue}
                              onChange={(ev) => setDraft((d) => ({ ...d!, revenue: ev.target.value }))}
                            />
                          </td>
                        </>
                      ) : isNonRev ? (
                        <td className="nonrev-banner" colSpan={5}>
                          <span className="nonrev-dot" aria-hidden="true" />
                          Non-revenue
                        </td>
                      ) : (
                        <>
                          <td className="num">{formatNumber(e.clicks)}</td>
                          <td className="num">{formatNumber(e.sales)}</td>
                          <td className="num muted">{e.cr ?? "-"}</td>
                          <td className="num">{formatMoney(e.gmv)}</td>
                          <td className="num">{formatMoney(e.revenue)}</td>
                        </>
                      )}
                      <td className={isEditing ? undefined : "remarks-td"}>
                        {isEditing ? (
                          <input
                            className="remarks-input"
                            aria-label="Remarks"
                            value={draft!.remarks}
                            onChange={(ev) => setDraft((d) => ({ ...d!, remarks: ev.target.value }))}
                          />
                        ) : (
                          <RemarkCell text={e.remarks} />
                        )}
                      </td>
                      <td>{e.entered_by}</td>
                      <td className="muted mono">{formatRailwayTime(e.created_at)}</td>
                      <td>
                        {isEditing ? (
                          <span className="btn-row">
                            <button
                              className="btn btn-sm btn-green"
                              onClick={() => saveEdit(e)}
                              disabled={savingEdit}
                            >
                              {savingEdit ? "Saving" : "Save"}
                            </button>
                            <button
                              className="btn btn-sm"
                              disabled={savingEdit}
                              onClick={() => {
                                setEditingId(null);
                                setDraft(null);
                              }}
                            >
                              Cancel
                            </button>
                          </span>
                        ) : confirmDeleteId === e.id ? (
                          <span className="btn-row">
                            <span className="del-confirm">Delete?</span>
                            <button
                              className="btn btn-sm btn-danger"
                              disabled={deleting}
                              onClick={() => deleteEntry(e)}
                            >
                              {deleting ? "Deleting" : "Delete"}
                            </button>
                            <button
                              className="btn btn-sm"
                              disabled={deleting}
                              onClick={() => setConfirmDeleteId(null)}
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <span className="btn-row" title={canEdit ? undefined : `Only ${e.entered_by} can change this entry`}>
                            <button
                              className="btn btn-sm"
                              disabled={!canEdit}
                              onClick={() => startEdit(e)}
                            >
                              Edit
                            </button>
                            {isPrivileged(user) && (
                              <button
                                className="btn btn-sm btn-icon btn-del"
                                aria-label={`Delete the ${e.merchant_name} entry`}
                                title="Delete this entry"
                                onClick={() => setConfirmDeleteId(e.id)}
                              >
                                <TrashIcon />
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={page} total={entries.length} perPage={PER_PAGE} noun="entries" onChange={setPage} />
          </div>
        )}
      </div>

      {showEditLogs && (
        <EditHistoryModal handler={filterHandler} onClose={() => setShowEditLogs(false)} />
      )}
    </>
  );
}
