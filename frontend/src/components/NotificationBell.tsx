import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { api, formatRailwayTime } from "../api";
import { useToast } from "../Toast";
import { isHandler, isPrivileged, type Notification } from "../types";
import { HandlerAvatar } from "./Icons";
import PeriodPicker from "./PeriodPicker";

const STATUS_LABEL: Record<Notification["status"], string> = {
  pending: "Pending",
  reason_submitted: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
  resolved: "Resolved",
};

/** Who a case currently sits with, without exposing raw "level N" numbers. */
function routeLabel(stage: number): string {
  if (stage <= 1) return "With handler";
  if (stage === 2) return "Escalated to Manager";
  return "Escalated to Founders Office";
}

function seenKey(user: string) {
  return `crp-seen-${user}`;
}
function loadSeen(user: string): Set<number> {
  try {
    return new Set(JSON.parse(localStorage.getItem(seenKey(user)) ?? "[]"));
  } catch {
    return new Set();
  }
}
function saveSeen(user: string, ids: Set<number>) {
  localStorage.setItem(seenKey(user), JSON.stringify([...ids].slice(-500)));
}

export default function NotificationBell({
  user,
  version,
  openSignal = 0,
}: {
  user: string;
  version: number;
  /** Incrementing this from a parent (e.g. a landing chip) opens the drawer. */
  openSignal?: number;
}) {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reasonDrafts, setReasonDrafts] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);
  const [seenTick, setSeenTick] = useState(0);
  const [search, setSearch] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterMonth, setFilterMonth] = useState("");
  // Dev-only "time machine": preview the flow as if today were `simDate`.
  const devMode = import.meta.env.DEV;
  const [simDate, setSimDate] = useState<string>("");
  const toast = useToast();

  const handlerRole = isHandler(user);
  const privileged = isPrivileged(user);

  const load = useCallback(async () => {
    try {
      setItems(await api.getNotifications(user, devMode && simDate ? simDate : undefined));
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user, devMode, simDate]);

  useEffect(() => {
    setLoading(true);
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load, version]);

  function shiftSim(months: number) {
    const base = simDate ? new Date(simDate + "T00:00:00") : new Date();
    base.setDate(1);
    base.setMonth(base.getMonth() + months);
    const y = base.getFullYear();
    const m = String(base.getMonth() + 1).padStart(2, "0");
    setSimDate(`${y}-${m}-01`);
  }

  // Escape closes the drawer.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const OPEN_STATES = ["pending", "reason_submitted", "rejected"];

  // Years present in the data, newest first, so the Period picker only offers real ones.
  const yearOptions = useMemo(() => {
    const ys = new Set<number>();
    for (const n of items) ys.add(Number(n.created_at.slice(0, 4)));
    ys.add(new Date().getFullYear());
    return [...ys].sort((a, b) => b - a);
  }, [items]);

  function matchesFilter(n: Notification): boolean {
    const q = search.trim().toLowerCase();
    if (q && !(n.merchant_name.toLowerCase().includes(q) || n.handler.toLowerCase().includes(q))) {
      return false;
    }
    if (filterYear) {
      if (n.created_at.slice(0, 4) !== filterYear) return false;
      if (filterMonth && String(Number(n.created_at.slice(5, 7))) !== filterMonth) return false;
    }
    return true;
  }

  const visible = items.filter(matchesFilter);
  const actionable = visible.filter((n) => OPEN_STATES.includes(n.status));
  const history = visible.filter((n) => !OPEN_STATES.includes(n.status));

  // Badge counts open cases (unfiltered) this user hasn't opened the drawer on.
  const seen = loadSeen(user);
  void seenTick;
  const badge = items.filter((n) => OPEN_STATES.includes(n.status) && !seen.has(n.id)).length;

  function openDrawer() {
    setOpen(true);
    const s = loadSeen(user);
    for (const n of items) s.add(n.id);
    saveSeen(user, s);
    setSeenTick((t) => t + 1);
  }

  // Open when a parent bumps the signal (e.g. the landing "need action" chip).
  useEffect(() => {
    if (openSignal > 0) openDrawer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  async function sendReason(id: number) {
    const reason = (reasonDrafts[id] ?? "").trim();
    if (!reason) {
      toast("Type a reason first", "error");
      return;
    }
    setBusyId(id);
    try {
      await api.submitReason(id, reason);
      toast("Reason submitted for approval");
      setReasonDrafts((d) => ({ ...d, [id]: "" }));
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function decide(id: number, action: "approve" | "reject") {
    setBusyId(id);
    try {
      if (action === "approve") {
        await api.approveReason(id);
        toast("Approved. Reminders stop for this brand and period.");
      } else {
        await api.rejectReason(id);
        toast("Rejected. Escalation continues until it is resolved.");
      }
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusyId(null);
    }
  }

  function renderItem(n: Notification, actionableItem: boolean) {
    const canSubmitReason = handlerRole && (n.status === "pending" || n.status === "rejected");
    const canDecide = privileged && n.status === "reason_submitted";
    return (
      <div key={n.id} className={`notif-card ${actionableItem ? "actionable" : ""}`}>
        <div className="notif-card-head">
          <HandlerAvatar name={n.handler} size={26} />
          <div className="notif-card-title">
            <b>{n.merchant_name}</b>
            <span className="muted">
              {n.handler} · <span className="mono">{formatRailwayTime(n.created_at)}</span>
            </span>
          </div>
          <span className={`status-chip status-${n.status}`}>{STATUS_LABEL[n.status]}</span>
        </div>

        <p className="notif-card-msg">{n.message}</p>
        {n.reason && (
          <p className="notif-card-reason">
            <b>Reason{privileged ? ` from ${n.handler}` : ""}:</b> {n.reason}
          </p>
        )}

        <div className="notif-card-foot">
          <span className={`route-chip route-${Math.min(n.escalation_level, 3)}`}>
            {routeLabel(n.escalation_level)}
          </span>
        </div>

        {canSubmitReason && (
          <div className="notif-reason-row">
            <input
              placeholder={n.status === "rejected" ? "Rejected. Add a new reason or enter the data" : "Reason (if something is blocking you)"}
              aria-label="Reason for missing data"
              value={reasonDrafts[n.id] ?? ""}
              onChange={(e) => setReasonDrafts((d) => ({ ...d, [n.id]: e.target.value }))}
            />
            <button className="btn btn-sm" onClick={() => sendReason(n.id)} disabled={busyId === n.id}>
              {busyId === n.id ? "Sending" : "Submit"}
            </button>
          </div>
        )}

        {canDecide && (
          <div className="notif-reason-row">
            <button className="btn btn-sm btn-green" onClick={() => decide(n.id, "approve")} disabled={busyId === n.id}>
              {busyId === n.id ? "Working" : "Approve"}
            </button>
            <button className="btn btn-sm btn-reject" onClick={() => decide(n.id, "reject")} disabled={busyId === n.id}>
              Reject
            </button>
          </div>
        )}

        {privileged && n.status !== "reason_submitted" && actionableItem && (
          <p className="notif-hint">Waiting for {n.handler} to enter data or submit a reason.</p>
        )}
      </div>
    );
  }

  const drawer = (
    <div className={`notif-scrim ${open ? "show" : ""}`} onMouseDown={() => setOpen(false)}>
      <aside
        className="notif-drawer"
        style={{ transform: open ? "translateX(0)" : "translateX(100%)" }}
        role="dialog"
        aria-label="Notifications"
        aria-hidden={!open}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="notif-drawer-head">
          <div>
            <h3>Notifications</h3>
            <span className="muted">{actionable.length} need action · {history.length} in history</span>
          </div>
          <button className="notif-close" onClick={() => setOpen(false)} aria-label="Close">
            <span aria-hidden="true">&#10005;</span>
          </button>
        </div>

        <div className="notif-filters">
          <input
            placeholder="Search merchant or handler"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search notifications"
          />
          <PeriodPicker
            year={filterYear}
            month={filterMonth}
            yearOptions={yearOptions}
            onChange={(y, m) => {
              setFilterYear(y);
              setFilterMonth(m);
            }}
          />
        </div>

        {devMode && (
          <div className="notif-timemachine">
            <span className="tm-label" title="Dev-only: preview the escalation flow as if it were a future month">
              🕑 Time machine
            </span>
            <button className="btn btn-sm" onClick={() => shiftSim(-1)} aria-label="Back one month">−1 mo</button>
            <span className="tm-now">
              {simDate
                ? new Date(simDate + "T00:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" })
                : "Real date"}
            </span>
            <button className="btn btn-sm" onClick={() => shiftSim(1)} aria-label="Forward one month">+1 mo</button>
            {simDate && (
              <button className="btn btn-sm" onClick={() => setSimDate("")} aria-label="Reset to real date">Reset</button>
            )}
          </div>
        )}

        <div className="notif-drawer-body">
          {loading && (
            <>
              <div className="skeleton" style={{ height: 92, marginBottom: 8 }} />
              <div className="skeleton" style={{ height: 92 }} />
            </>
          )}

          {!loading && loadError && (
            <div className="notif-card">
              <p className="notif-card-msg">Couldn't load notifications: {loadError}</p>
              <button className="btn btn-sm" onClick={() => { setLoading(true); load(); }}>Retry</button>
            </div>
          )}

          {!loading && !loadError && (
            <>
              <h4 className="notif-section">Needs your action</h4>
              {actionable.length === 0 ? (
                <p className="notif-empty">Nothing needs your attention.</p>
              ) : (
                actionable.map((n) => renderItem(n, true))
              )}

              <h4 className="notif-section">History</h4>
              {history.length === 0 ? (
                <p className="notif-empty">No past notifications.</p>
              ) : (
                history.map((n) => renderItem(n, false))
              )}
            </>
          )}
        </div>
      </aside>
    </div>
  );

  return (
    <div className="notif-wrap">
      <button
        className="notif-bell"
        onClick={openDrawer}
        aria-label={badge > 0 ? `Notifications, ${badge} unread` : "Notifications"}
        aria-haspopup="dialog"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {badge > 0 && <span className="notif-badge">{badge}</span>}
      </button>
      {createPortal(drawer, document.body)}
    </div>
  );
}
