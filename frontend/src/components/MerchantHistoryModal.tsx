import { useEffect, useMemo, useRef, useState } from "react";
import { api, formatRailwayTime } from "../api";
import type { Merchant, MerchantEditLog, StatusEvent } from "../types";

/** Labels for the merchant's own fields (the Merchant Info table columns). */
export const MERCHANT_FIELD_LABELS: Record<string, string> = {
  merchant_name: "Merchant Name",
  breadcrumb1_name: "Breadcrumb1 Name",
  breadcrumb2_name: "Breadcrumb2 Name",
  affiliate_id: "Affiliate ID",
  affiliate_name: "Affiliate Name",
  reporting: "Reporting",
  deal_type: "Deal Type",
  payout: "Payout",
  owner: "Handler",
  revenue_status: "Revenue Status",
};

export function fmtMerchantVal(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  return String(v);
}

export interface HistoryRow {
  key: string;
  type: "Edit" | "Status";
  when: string;
  by: string;
  changes: { field: string; old: string; new: string }[];
}

/** Merge one merchant's own field edits and Revenue/Non-revenue flips into a
 *  single time-sorted history list. Entry (clicks/sales/…) edits are excluded. */
export function buildMerchantHistory(
  editLogs: MerchantEditLog[],
  events: StatusEvent[],
  merchantId: number
): HistoryRow[] {
  const rows: HistoryRow[] = [];
  for (const l of editLogs) {
    if (l.merchant_id !== merchantId) continue;
    rows.push({
      key: `m${l.id}`, type: "Edit", when: l.edited_at, by: l.edited_by,
      changes: Object.entries(l.changes).map(([f, ch]) => ({
        field: MERCHANT_FIELD_LABELS[f] ?? f,
        old: fmtMerchantVal(ch.old),
        new: fmtMerchantVal(ch.new),
      })),
    });
  }
  for (const ev of events) {
    if (ev.merchant_id !== merchantId) continue;
    rows.push({
      key: `s${ev.merchant_id}-${ev.date}-${ev.to_status}`, type: "Status",
      when: ev.date, by: ev.changed_by,
      changes: [{ field: "Revenue Status", old: ev.from_status, new: ev.to_status }],
    });
  }
  return rows.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
}

export default function MerchantHistoryModal({
  merchant,
  onClose,
}: {
  merchant: Merchant;
  onClose: () => void;
}) {
  const [editLogs, setEditLogs] = useState<MerchantEditLog[] | null>(null);
  const [events, setEvents] = useState<StatusEvent[]>([]);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Full history for this merchant, filtered to its exact id (the name search
    // is a substring match).
    Promise.all([
      api.listMerchantEditLogs({ merchant: merchant.merchant_name, limit: 5000 }),
      api.statusHistory({ merchant: merchant.merchant_name }),
    ])
      .then(([l, e]) => { setEditLogs(l); setEvents(e); })
      .catch(() => { setEditLogs([]); setEvents([]); });
  }, [merchant.merchant_name]);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus(); };
  }, [onClose]);

  const rows = useMemo(
    () => buildMerchantHistory(editLogs ?? [], events, merchant.merchant_id),
    [editLogs, events, merchant.merchant_id]
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal merchant-history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mh-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" ref={closeRef} onClick={onClose} aria-label="Close">
          <span aria-hidden="true">&#10005;</span>
        </button>
        <h3 id="mh-title">
          Edit history
          <span className="mh-scope">{merchant.merchant_name} <span className="muted mono">#{merchant.merchant_id}</span></span>
        </h3>
        <p className="card-sub" style={{ margin: "-8px 0 12px" }}>
          Changes to this merchant's details (category, reporting, payout, deal type, revenue status…).
        </p>

        {editLogs === null && <p className="muted">Loading history…</p>}
        {editLogs !== null && rows.length === 0 && (
          <p className="muted">No changes recorded for {merchant.merchant_name} yet.</p>
        )}

        {rows.length > 0 && (
          <div className="table-wrap mh-scroll">
            <table className="data change-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Change</th>
                  <th>By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <span className={`type-chip ${r.type === "Status" ? "type-status" : "type-edit"}`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="change-cell">
                      {r.changes.map((c, ci) => (
                        <span key={ci} className="change-line">
                          <span className="change-field">{c.field}</span>
                          <span className="change-old">{c.old}</span>
                          <span className="change-arrow" aria-hidden="true">→</span>
                          <span className="change-new">{c.new}</span>
                        </span>
                      ))}
                    </td>
                    <td>{r.by}</td>
                    <td className="muted mono">{formatRailwayTime(r.when)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
