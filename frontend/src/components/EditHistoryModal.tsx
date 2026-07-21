import { useEffect, useMemo, useRef, useState } from "react";
import { api, formatMonthYearISO, formatRailwayTime } from "../api";
import type { EditLog } from "../types";
import { Pagination } from "./Icons";
import PeriodPicker from "./PeriodPicker";

const FIELD_LABELS: Record<string, string> = {
  entry_date: "Period",
  clicks: "Clicks",
  sales: "Sales",
  cr: "CR %",
  gmv: "GMV",
  revenue: "Revenue",
  remarks: "Remarks",
};

/** entry_date diffs are stored as ISO dates but shown month/year only. */
function fmtChangeValue(field: string, v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (field === "entry_date") return formatMonthYearISO(String(v));
  return String(v);
}

export default function EditHistoryModal({
  handler,
  onClose,
}: {
  handler: string; // the Entry Logs handler filter ("All" or a name)
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<EditLog[] | null>(null);
  const [search, setSearch] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const closeRef = useRef<HTMLButtonElement>(null);

  // Respect the Entry Logs handler filter: "All" -> everyone, else that person.
  useEffect(() => {
    api
      .listEditLogs({
        edited_by: handler !== "All" ? handler : undefined,
        merchant: search.trim() || undefined,
      })
      .then(setLogs)
      .catch(() => setLogs([]));
  }, [handler, search]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [onClose]);

  const yearOptions = useMemo(() => {
    const ys = new Set<number>();
    for (const l of logs ?? []) ys.add(new Date(l.edited_at).getFullYear());
    ys.add(new Date().getFullYear());
    return [...ys].sort((a, b) => b - a);
  }, [logs]);

  const filtered = useMemo(() => {
    let list = logs ?? [];
    if (year) {
      list = list.filter((l) => {
        const d = new Date(l.edited_at);
        if (d.getFullYear() !== Number(year)) return false;
        if (month && d.getMonth() + 1 !== Number(month)) return false;
        return true;
      });
    }
    return list;
  }, [logs, year, month]);

  const PER_PAGE = 10;
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [year, month, search]);
  const visible = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal editlog-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="editlog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" ref={closeRef} onClick={onClose} aria-label="Close">
          <span aria-hidden="true">&#10005;</span>
        </button>
        <h3 id="editlog-title">
          Edit History
          <span className="editlog-scope">{handler === "All" ? "all handlers" : handler}</span>
        </h3>

        <div className="editlog-filters">
          <input
            placeholder="Search merchant"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search edit history by merchant"
          />
          <PeriodPicker
            year={year}
            month={month}
            yearOptions={yearOptions}
            onChange={(y, m) => {
              setYear(y);
              setMonth(m);
            }}
          />
        </div>
        {logs === null && <p className="muted">Loading</p>}
        {logs !== null && visible.length === 0 && (
          <p className="muted">No edits{search ? ` for "${search}"` : ""}{year ? " in this period" : ""}.</p>
        )}
        {visible.map((l) => (
          <div key={l.id} className="editlog-item">
            <div>
              <b>{l.merchant_name}</b>{" "}
              <span className="muted mono">(entry #{l.entry_id})</span>{" "}
              edited by <b>{l.edited_by}</b>{" "}
              <span className="muted">
                &middot; <span className="mono">{formatRailwayTime(l.edited_at)}</span>
              </span>
            </div>
            <div>
              {Object.entries(l.changes).map(([field, ch]) => (
                <span key={field} className="change">
                  {FIELD_LABELS[field] ?? field}: <b>{fmtChangeValue(field, ch.old)}</b>{" "}
                  <span aria-hidden="true">&rarr;</span> <span>{fmtChangeValue(field, ch.new)}</span>
                </span>
              ))}
            </div>
          </div>
        ))}
        <Pagination page={page} total={filtered.length} perPage={PER_PAGE} noun="edits" onChange={setPage} />
      </div>
    </div>
  );
}
