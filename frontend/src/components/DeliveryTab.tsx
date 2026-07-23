import { useEffect, useMemo, useRef, useState } from "react";
import { api, formatMonthYear, formatMoney, formatNumber, formatRailwayTime } from "../api";
import { useToast } from "../Toast";
import type { DeliveryRequest } from "../types";
import { HandlerAvatar, Pagination, ReportingBadge, TrashIcon } from "./Icons";
import PeriodPicker from "./PeriodPicker";
import LedgerHeader from "./shell/LedgerHeader";

export default function DeliveryTab({ user }: { user: string }) {
  const [requests, setRequests] = useState<DeliveryRequest[]>([]);
  const [done, setDone] = useState<DeliveryRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ clicks: "", sales: "", gmv: "", revenue: "" });
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const toast = useToast();

  // history filters
  const [hSearch, setHSearch] = useState("");
  const [hYear, setHYear] = useState("");
  const [hMonth, setHMonth] = useState("");
  const hTimer = useRef<number>();

  useEffect(() => {
    setLoading(true);
    Promise.all([api.listDeliveryRequests("pending"), api.listDeliveryRequests("done")])
      .then(([p, d]) => {
        setRequests(p);
        setDone(d.filter((x) => x.delivery_filled_by === user));
        setError(null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [reloadKey, user]);

  // Auto-select the first request so the detail pane is never blank.
  useEffect(() => {
    if (requests.length && (selectedId == null || !requests.some((r) => r.id === selectedId))) {
      setSelectedId(requests[0].id);
      setForm({ clicks: "", sales: "", gmv: "", revenue: "" });
    }
    if (!requests.length) setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? requests.filter(
          (r) => r.merchant_name.toLowerCase().includes(q) || r.requested_by.toLowerCase().includes(q)
        )
      : requests;
  }, [requests, search]);

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  const dCr =
    form.clicks && form.sales && Number(form.clicks) > 0
      ? ((Number(form.sales) / Number(form.clicks)) * 100).toFixed(2)
      : "";

  const historyYears = useMemo(() => {
    const ys = new Set<number>();
    for (const d of done) ys.add(d.entry_year);
    ys.add(new Date().getFullYear());
    return [...ys].sort((a, b) => b - a);
  }, [done]);

  const historyRows = useMemo(() => {
    const q = hSearch.trim().toLowerCase();
    return done
      .filter((d) => (q ? d.merchant_name.toLowerCase().includes(q) : true))
      .filter((d) => (hYear ? d.entry_year === Number(hYear) : true))
      .filter((d) => (hMonth ? d.entry_month === Number(hMonth) : true));
  }, [done, hSearch, hYear, hMonth]);

  const [hPage, setHPage] = useState(1);
  useEffect(() => { setHPage(1); }, [hSearch, hYear, hMonth]);
  const PER_PAGE = 10;
  const shownHistory = historyRows.slice((hPage - 1) * PER_PAGE, hPage * PER_PAGE);

  // edit / delete state for history rows
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState({ clicks: "", sales: "", gmv: "", revenue: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  function startHistoryEdit(d: DeliveryRequest) {
    setEditingId(d.id);
    setEditDraft({
      clicks: d.d_clicks?.toString() ?? "",
      sales: d.d_sales?.toString() ?? "",
      gmv: d.d_gmv?.toString() ?? "",
      revenue: d.d_revenue?.toString() ?? "",
    });
  }

  async function saveHistoryEdit(d: DeliveryRequest) {
    if (savingEdit) return;
    if (!editDraft.clicks || !editDraft.sales || !editDraft.gmv || !editDraft.revenue) {
      toast("All four fields are required", "error");
      return;
    }
    setSavingEdit(true);
    try {
      await api.updateDelivery(d.id, {
        clicks: Number(editDraft.clicks),
        sales: Number(editDraft.sales),
        gmv: Number(editDraft.gmv),
        revenue: Number(editDraft.revenue),
        filled_by: user,
      });
      toast(`Updated delivery numbers for ${d.merchant_name}`);
      setEditingId(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteDelivery(d: DeliveryRequest) {
    if (deleting) return;
    setDeleting(true);
    try {
      await api.deleteDelivery(d.id, user);
      toast(`Removed delivery data for ${d.merchant_name}`);
      setConfirmDeleteId(null);
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  }

  const editCr =
    editDraft.clicks && editDraft.sales && Number(editDraft.clicks) > 0
      ? ((Number(editDraft.sales) / Number(editDraft.clicks)) * 100).toFixed(2)
      : "-";

  function pick(r: DeliveryRequest) {
    setSelectedId(r.id);
    setForm({ clicks: "", sales: "", gmv: "", revenue: "" });
  }

  async function save() {
    if (!selected) return;
    if (!form.clicks || !form.sales || !form.gmv || !form.revenue) {
      toast("Clicks, Sales, GMV and Revenue are required", "error");
      return;
    }
    setSaving(true);
    try {
      await api.fillDelivery(selected.id, {
        clicks: Number(form.clicks),
        sales: Number(form.sales),
        gmv: Number(form.gmv),
        revenue: Number(form.revenue),
        filled_by: user,
      });
      toast(`Saved delivery numbers for ${selected.merchant_name}`);
      setReloadKey((k) => k + 1);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <LedgerHeader
        title="Delivery Queue"
        description="Fill the delivery-side figures for the entries the CS team has sent over."
        figures={[
          { label: "Waiting", value: formatNumber(requests.length) },
          { label: "Filled", value: formatNumber(done.length) },
        ]}
      />

      <div className="card">
        <div className="dash-head">
          <div>
            <p className="card-sub" style={{ margin: 0 }}>
              {requests.length} request{requests.length === 1 ? "" : "s"} waiting for your numbers.
            </p>
          </div>
          {requests.length > 0 && (
            <input
              className="dash-search"
              placeholder="Search merchant or handler"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search delivery queue"
            />
          )}
        </div>

        {error && !loading && (
          <div className="empty-state is-error">
            Couldn't load the queue: {error}{" "}
            <button className="btn btn-sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
          </div>
        )}

        {loading && <div className="skeleton" style={{ height: 260 }} />}

        {!loading && !error && requests.length === 0 && (
          <div className="delivery-empty">
            <div className="delivery-empty-icon" aria-hidden="true">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 7h14l-1 13H6L5 7z" /><path d="M9 7V5a3 3 0 0 1 6 0v2" />
              </svg>
            </div>
            <h4>Your queue is empty</h4>
            <p>When a handler flags an entry for the Delivery team, it lands here for you to add your numbers. Anything you have already completed is in the history below.</p>
          </div>
        )}

        {!loading && !error && requests.length > 0 && (
          <div className="delivery-layout">
            <ul className="delivery-queue">
              {filtered.map((r) => (
                <li key={r.id}>
                  <button
                    className={`delivery-queue-item ${selectedId === r.id ? "on" : ""}`}
                    onClick={() => pick(r)}
                  >
                    <HandlerAvatar name={r.requested_by} size={30} />
                    <span className="dq-body">
                      <b>{r.merchant_name}</b>
                      <span className="muted">
                        from {r.requested_by} · <span className="mono">{formatMonthYear(r.entry_month, r.entry_year)}</span>
                      </span>
                    </span>
                  </button>
                </li>
              ))}
              {filtered.length === 0 && <li className="muted" style={{ padding: 12 }}>No match.</li>}
            </ul>

            <div className="delivery-detail">
              {selected && (
                <>
                  <div className="delivery-detail-head">
                    <div>
                      <h3 style={{ margin: 0 }}>{selected.merchant_name}</h3>
                      <span className="muted">
                        Requested by <b>{selected.requested_by}</b> ·{" "}
                        <span className="mono">{formatMonthYear(selected.entry_month, selected.entry_year)}</span>
                      </span>
                    </div>
                    <span className="rev-chip rev-on" style={{ alignSelf: "center" }}>Needs delivery data</span>
                  </div>

                  <div className="merchant-info">
                    <span className="info-pill">ID <b className="mono">{selected.merchant_id}</b></span>
                    <span className="info-pill">Category <b>{selected.breadcrumb1_name ?? "-"}</b></span>
                    {selected.breadcrumb2_name && (
                      <span className="info-pill">Sub <b>{selected.breadcrumb2_name}</b></span>
                    )}
                    <span className="info-pill">Reporting <ReportingBadge reporting={selected.reporting} /></span>
                    <span className="info-pill">Payout <b>{selected.payout ?? "-"}</b></span>
                    <span className="info-pill">Deal <b>{selected.deal_type ?? "-"}</b></span>
                    <span className="info-pill">Owner <b>{selected.owner ?? "-"}</b></span>
                  </div>

                  <div className="delivery-section-label" style={{ marginTop: 18 }}>
                    Data entered by {selected.requested_by} (read only)
                  </div>
                  <div className="entry-metrics">
                    <ReadField label="Clicks" value={formatNumber(selected.clicks)} />
                    <ReadField label="Sales" value={formatNumber(selected.sales)} />
                    <ReadField label="CR %" value={selected.cr != null ? String(selected.cr) : "-"} />
                    <ReadField label="GMV" value={formatMoney(selected.gmv)} />
                    <ReadField label="Revenue" value={formatMoney(selected.revenue)} />
                  </div>

                  <div className="delivery-section-label" style={{ marginTop: 18 }}>
                    Delivery team numbers
                  </div>
                  <div className="entry-metrics">
                    <div className="field">
                      <label className="req" htmlFor="d-clicks">Clicks</label>
                      <input id="d-clicks" type="number" min="0" value={form.clicks} onChange={(e) => setForm((f) => ({ ...f, clicks: e.target.value }))} />
                    </div>
                    <div className="field">
                      <label className="req" htmlFor="d-sales">Sales</label>
                      <input id="d-sales" type="number" min="0" value={form.sales} onChange={(e) => setForm((f) => ({ ...f, sales: e.target.value }))} />
                    </div>
                    <div className="field">
                      <label htmlFor="d-cr">CR %</label>
                      <input id="d-cr" value={dCr} readOnly placeholder="auto" />
                    </div>
                    <div className="field">
                      <label className="req" htmlFor="d-gmv">GMV</label>
                      <input id="d-gmv" type="number" min="0" value={form.gmv} onChange={(e) => setForm((f) => ({ ...f, gmv: e.target.value }))} />
                    </div>
                    <div className="field">
                      <label className="req" htmlFor="d-revenue">Revenue</label>
                      <input id="d-revenue" type="number" min="0" value={form.revenue} onChange={(e) => setForm((f) => ({ ...f, revenue: e.target.value }))} />
                    </div>
                  </div>

                  <div className="entry-footer">
                    <button className="btn btn-primary" onClick={save} disabled={saving}>
                      {saving ? "Saving" : "Save"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <div className="dash-head">
          <div>
            <h3 style={{ margin: 0 }}>Delivery history</h3>
            <p className="card-sub" style={{ margin: "4px 0 0" }}>
              Entries you have completed, with the CS and delivery numbers side by side.
            </p>
          </div>
          <div className="dash-tools">
            <input
              className="dash-search"
              placeholder="Search merchant"
              value={hSearch}
              onChange={(e) => setHSearch(e.target.value)}
              aria-label="Search delivery history"
            />
            <PeriodPicker
              year={hYear}
              month={hMonth}
              yearOptions={historyYears}
              onChange={(y, m) => {
                setHYear(y);
                setHMonth(m);
              }}
            />
          </div>
        </div>

        {historyRows.length === 0 ? (
          <div className="empty-state" style={{ padding: "28px 0" }}>
            No completed entries{hSearch ? ` for "${hSearch}"` : ""}{hYear ? " in this period" : ""} yet.
          </div>
        ) : (
          <div className="table-wrap cmp-wrap">
            <table className="data dhist-table">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Period</th>
                  <th className="num">Clicks (CS / Del)</th>
                  <th className="num">Sales (CS / Del)</th>
                  <th className="num">GMV (CS / Del)</th>
                  <th className="num">Revenue (CS / Del)</th>
                  <th>Filled</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shownHistory.map((d, i) => {
                  const isEditing = editingId === d.id;
                  const canEdit = d.delivery_filled_by === user;
                  return (
                    <tr key={d.id} className="cmp-row" style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}>
                      <td><b>{d.merchant_name}</b> <span className="muted mono">#{d.merchant_id}</span></td>
                      <td className="mono">{formatMonthYear(d.entry_month, d.entry_year)}</td>
                      {isEditing ? (
                        <>
                          <td className="num dual">
                            <span>{formatNumber(d.clicks)}</span>
                            <input type="number" aria-label="Del Clicks" value={editDraft.clicks} onChange={(e) => setEditDraft((p) => ({ ...p, clicks: e.target.value }))} style={{ width: 70 }} />
                          </td>
                          <td className="num dual">
                            <span>{formatNumber(d.sales)}</span>
                            <input type="number" aria-label="Del Sales" value={editDraft.sales} onChange={(e) => setEditDraft((p) => ({ ...p, sales: e.target.value }))} style={{ width: 70 }} />
                          </td>
                          <td className="num dual">
                            <span>{formatMoney(d.gmv)}</span>
                            <input type="number" aria-label="Del GMV" value={editDraft.gmv} onChange={(e) => setEditDraft((p) => ({ ...p, gmv: e.target.value }))} style={{ width: 80 }} />
                          </td>
                          <td className="num dual">
                            <span>{formatMoney(d.revenue)}</span>
                            <input type="number" aria-label="Del Revenue" value={editDraft.revenue} onChange={(e) => setEditDraft((p) => ({ ...p, revenue: e.target.value }))} style={{ width: 80 }} />
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="num dual"><span>{formatNumber(d.clicks)}</span><span className="del">{formatNumber(d.d_clicks)}</span></td>
                          <td className="num dual"><span>{formatNumber(d.sales)}</span><span className="del">{formatNumber(d.d_sales)}</span></td>
                          <td className="num dual"><span>{formatMoney(d.gmv)}</span><span className="del">{formatMoney(d.d_gmv)}</span></td>
                          <td className="num dual"><span>{formatMoney(d.revenue)}</span><span className="del">{formatMoney(d.d_revenue)}</span></td>
                        </>
                      )}
                      <td className="muted mono">{d.delivery_filled_at ? formatRailwayTime(d.delivery_filled_at) : "-"}</td>
                      <td>
                        {isEditing ? (
                          <span className="btn-row">
                            <button className="btn btn-sm btn-green" onClick={() => saveHistoryEdit(d)} disabled={savingEdit}>
                              {savingEdit ? "Saving" : "Save"}
                            </button>
                            <button className="btn btn-sm" disabled={savingEdit} onClick={() => { setEditingId(null); }}>
                              Cancel
                            </button>
                          </span>
                        ) : confirmDeleteId === d.id ? (
                          <span className="btn-row">
                            <span className="del-confirm">Delete?</span>
                            <button className="btn btn-sm btn-danger" disabled={deleting} onClick={() => deleteDelivery(d)}>
                              {deleting ? "Deleting" : "Delete"}
                            </button>
                            <button className="btn btn-sm" disabled={deleting} onClick={() => setConfirmDeleteId(null)}>
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <span className="btn-row" data-tip={canEdit ? undefined : `Only ${d.delivery_filled_by} can change this`}>
                            <button className="btn btn-sm" disabled={!canEdit} onClick={() => startHistoryEdit(d)}>
                              Edit
                            </button>
                            <button
                              className="btn btn-sm btn-icon btn-del"
                              disabled={!canEdit}
                              aria-label={`Delete delivery data for ${d.merchant_name}`}
                              data-tip={canEdit ? "Delete delivery data" : `Only ${d.delivery_filled_by} can delete this`}
                              onClick={() => setConfirmDeleteId(d.id)}
                            >
                              <TrashIcon />
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={hPage} total={historyRows.length} perPage={PER_PAGE} noun="entries" onChange={setHPage} />
          </div>
        )}
      </div>
    </>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div className="read-cell">
      <span className="read-label">{label}</span>
      <span className="read-value mono">{value}</span>
    </div>
  );
}
