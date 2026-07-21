import { useEffect, useMemo, useState } from "react";
import { api, formatRailwayTime } from "../api";
import { useToast } from "../Toast";
import { HANDLERS, type Merchant, type Transfer } from "../types";
import { HandlerAvatar, Pagination } from "./Icons";

export default function BrandTransferTab({
  user,
  onDataChanged,
}: {
  user: string;
  onDataChanged: () => void;
}) {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [history, setHistory] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [handler, setHandler] = useState("All");
  const [staged, setStaged] = useState<{ id: number; to: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const toast = useToast();

  useEffect(() => {
    setLoading(true);
    Promise.all([api.listMerchants(), api.listTransfers()])
      .then(([m, t]) => {
        setMerchants(m);
        setHistory(t);
        setError(null);
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [reloadKey]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return merchants
      .filter((m) => (handler === "All" ? true : m.owner === handler))
      .filter((m) => (q ? m.merchant_name.toLowerCase().includes(q) : true))
      .sort((a, b) => a.merchant_name.localeCompare(b.merchant_name));
  }, [merchants, search, handler]);

  const PER_PAGE = 10;
  const [mPage, setMPage] = useState(1);
  const [hPage, setHPage] = useState(1);
  useEffect(() => { setMPage(1); }, [search, handler]);
  const shownRows = rows.slice((mPage - 1) * PER_PAGE, mPage * PER_PAGE);
  const shownHistory = history.slice((hPage - 1) * PER_PAGE, hPage * PER_PAGE);

  async function confirmTransfer(m: Merchant, to: string) {
    setBusyId(m.merchant_id);
    try {
      const res = await api.transferMerchant(m.merchant_id, to, user);
      setMerchants((prev) =>
        prev.map((x) => (x.merchant_id === m.merchant_id ? { ...x, owner: to } : x))
      );
      setHistory((prev) => [
        {
          id: Date.now(),
          merchant_id: m.merchant_id,
          merchant_name: m.merchant_name,
          from_handler: res.from_handler,
          to_handler: to,
          transferred_by: user,
          transferred_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setStaged(null);
      setFlashId(m.merchant_id);
      window.setTimeout(() => setFlashId(null), 1200);
      toast(`${m.merchant_name} moved from ${res.from_handler ?? "unassigned"} to ${to}`);
      onDataChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="card">
        <div className="dash-head">
          <div>
            <h3 style={{ margin: 0 }}>Brand Transfer</h3>
            <p className="card-sub" style={{ margin: "4px 0 0" }}>
              Reassign a merchant to a different handler. Pick the new handler by name.
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
            <div className="mini-field">
              <label htmlFor="xfer-handler">Handler</label>
              <select id="xfer-handler" value={handler} onChange={(e) => setHandler(e.target.value)}>
                <option>All</option>
                {HANDLERS.map((h) => (
                  <option key={h}>{h}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {error && !loading && (
          <div className="empty-state">
            Couldn't load: {error}{" "}
            <button className="btn btn-sm" onClick={() => setReloadKey((k) => k + 1)}>Retry</button>
          </div>
        )}

        {loading && (
          <div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 48, marginBottom: 6 }} />
            ))}
          </div>
        )}

        {!loading && !error && (
          <div className="table-wrap cmp-wrap">
            <table className="data xfer-table">
              <thead>
                <tr>
                  <th className="rank-col">#</th>
                  <th>Merchant</th>
                  <th>Current handler</th>
                  <th className="reassign-col">Reassign to</th>
                </tr>
              </thead>
              <tbody>
                {shownRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No merchants match.
                    </td>
                  </tr>
                )}
                {shownRows.map((m, i) => {
                  const isStaged = staged?.id === m.merchant_id;
                  const stagedTo = isStaged ? staged!.to : null;
                  const targets = HANDLERS.filter((h) => h !== m.owner);
                  return (
                    <tr
                      key={m.merchant_id}
                      className={`cmp-row ${flashId === m.merchant_id ? "xfer-flash" : ""}`}
                      style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}
                    >
                      <td className="rank-col mono muted">{(mPage - 1) * PER_PAGE + i + 1}</td>
                      <td>
                        <div className="dash-merchant">
                          <b>{m.merchant_name}</b>
                          <span className="muted mono">#{m.merchant_id}</span>
                        </div>
                      </td>
                      <td>
                        <span className="owner-cell">
                          <HandlerAvatar name={m.owner} size={24} />
                          {m.owner ?? "-"}
                        </span>
                      </td>
                      <td className="reassign-col">
                        {isStaged ? (
                          <div className="reassign-confirm">
                            <span className="reassign-question">
                              Move to <HandlerAvatar name={stagedTo} size={20} /> <b>{stagedTo}</b>?
                            </span>
                            <button
                              className="btn btn-sm btn-green"
                              disabled={busyId === m.merchant_id}
                              onClick={() => confirmTransfer(m, stagedTo!)}
                            >
                              {busyId === m.merchant_id ? "Moving" : "Confirm"}
                            </button>
                            <button
                              className="btn btn-sm"
                              disabled={busyId === m.merchant_id}
                              onClick={() => setStaged(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="reassign-select-wrap">
                            <select
                              className="reassign-select"
                              value=""
                              aria-label={`Reassign ${m.merchant_name} to a handler`}
                              onChange={(e) => {
                                if (e.target.value) setStaged({ id: m.merchant_id, to: e.target.value });
                              }}
                            >
                              <option value="">Choose a handler…</option>
                              {targets.map((h) => (
                                <option key={h} value={h}>{h}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pagination page={mPage} total={rows.length} perPage={PER_PAGE} noun="merchants" onChange={setMPage} />
          </div>
        )}
      </div>

      <div className="card">
        <h3>Transfer history</h3>
        {history.length === 0 ? (
          <div className="empty-state" style={{ padding: "24px 0" }}>
            No transfers yet. Reassignments will appear here.
          </div>
        ) : (
          <>
            <ol className="xfer-timeline">
              {shownHistory.map((t, i) => (
                <li key={t.id} className="xfer-event" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
                  <div className="xfer-handoff-viz">
                    <HandlerAvatar name={t.from_handler} size={26} />
                    <span className="xfer-arrow" aria-hidden="true">
                      <svg width="22" height="10" viewBox="0 0 22 10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 5h18M15 1l4 4-4 4" />
                      </svg>
                    </span>
                    <HandlerAvatar name={t.to_handler} size={26} />
                  </div>
                  <div className="xfer-detail">
                    <span>
                      <b>{t.merchant_name}</b> moved from <b>{t.from_handler ?? "unassigned"}</b> to{" "}
                      <b>{t.to_handler}</b>
                    </span>
                    <span className="muted">
                      by {t.transferred_by} <span className="mono">{formatRailwayTime(t.transferred_at)}</span>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
            <Pagination page={hPage} total={history.length} perPage={PER_PAGE} noun="transfers" onChange={setHPage} />
          </>
        )}
      </div>
    </>
  );
}
