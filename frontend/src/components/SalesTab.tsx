import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, formatRailwayTime } from "../api";
import { useToast } from "../Toast";
import {
  ACTIVITY_TYPES,
  SALES_PRIORITIES,
  SALES_STAGES,
  SALES_TEAM,
  userLabel,
  type SalesActivity,
  type SalesLead,
} from "../types";

import LedgerHeader from "./shell/LedgerHeader";

const SOURCES = ["Cold outreach", "Referral", "Inbound", "Event", "LinkedIn", "Other"];

function stageLabel(key: string): string {
  return SALES_STAGES.find((s) => s.key === key)?.label ?? key;
}
function stageColor(key: string): string {
  return SALES_STAGES.find((s) => s.key === key)?.color ?? "#8A93A8";
}
function priorityLabel(key: string): string {
  return SALES_PRIORITIES.find((p) => p.key === key)?.label ?? key;
}
function priorityColor(key: string): string {
  return SALES_PRIORITIES.find((p) => p.key === key)?.color ?? "#8A93A8";
}
function activityLabel(key: string): string {
  return ACTIVITY_TYPES.find((a) => a.key === key)?.label ?? key;
}
function activityColor(key: string): string {
  return ACTIVITY_TYPES.find((a) => a.key === key)?.color ?? "#8A93A8";
}

function relativeDate(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const days = Math.floor(diffMs / 86_400_000);
  if (days < 0) {
    const abs = Math.abs(days);
    return abs === 1 ? "Tomorrow" : `In ${abs}d`;
  }
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1mo ago" : `${months}mo ago`;
}

function toInputDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/** A single, well-formed email address (used to gate the Draft button). */
function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

interface LeadDraft {
  brand_name: string;
  category: string;
  website: string;
  source: string;
  poc1_name: string;
  poc1_email: string;
  poc1_phone: string;
  poc1_designation: string;
  poc2_name: string;
  poc2_email: string;
  poc2_phone: string;
  poc2_designation: string;
  stage: string;
  priority: string;
  assigned_to: string;
  next_followup: string;
}

function emptyDraft(user: string): LeadDraft {
  return {
    brand_name: "",
    category: "",
    website: "",
    source: "",
    poc1_name: "",
    poc1_email: "",
    poc1_phone: "",
    poc1_designation: "",
    poc2_name: "",
    poc2_email: "",
    poc2_phone: "",
    poc2_designation: "",
    stage: "new_lead",
    priority: "warm",
    assigned_to: user,
    next_followup: "",
  };
}

function leadToDraft(l: SalesLead): LeadDraft {
  return {
    brand_name: l.brand_name,
    category: l.category ?? "",
    website: l.website ?? "",
    source: l.source ?? "",
    poc1_name: l.poc1_name ?? "",
    poc1_email: l.poc1_email ?? "",
    poc1_phone: l.poc1_phone ?? "",
    poc1_designation: l.poc1_designation ?? "",
    poc2_name: l.poc2_name ?? "",
    poc2_email: l.poc2_email ?? "",
    poc2_phone: l.poc2_phone ?? "",
    poc2_designation: l.poc2_designation ?? "",
    stage: l.stage,
    priority: l.priority,
    assigned_to: l.assigned_to,
    next_followup: toInputDate(l.next_followup),
  };
}

const PRIORITY_OPTS: { value: string; label: string; color: string | null }[] = [
  { value: "all", label: "All priorities", color: null },
  ...SALES_PRIORITIES.map((p) => ({ value: p.key, label: p.label, color: p.color })),
];

/** Compact priority filter as a custom dropdown that always opens DOWNWARD
 *  (a native <select> re-anchors on the selected option, which reads as
 *  "opening upward" once a non-first option is chosen). */
function PriorityDropdown({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = PRIORITY_OPTS.find((o) => o.value === value) ?? PRIORITY_OPTS[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="pdd" ref={ref}>
      <button
        type="button"
        className="pdd-btn"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filter by priority"
      >
        {current.color ? (
          <span className="pdd-dot" style={{ background: current.color }} />
        ) : (
          <span className="pdd-dot pdd-dot-empty" />
        )}
        <span className="pdd-label">{current.label}</span>
        <svg className="pdd-caret" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul className="pdd-menu" role="listbox">
          {PRIORITY_OPTS.map((o) => (
            <li
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              className={`pdd-opt ${o.value === value ? "on" : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.color ? (
                <span className="pdd-dot" style={{ background: o.color }} />
              ) : (
                <span className="pdd-dot pdd-dot-empty" />
              )}
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function SalesTab({
  user,
  initialStage,
  initialPriority,
}: {
  user: string;
  /** Optional pre-applied filters when deep-linked from the landing page. */
  initialStage?: string;
  initialPriority?: string;
}) {
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // filters
  const [filterStage, setFilterStage] = useState(initialStage ?? "all");
  const [filterPriority, setFilterPriority] = useState(initialPriority ?? "all");
  const [filterSearch, setFilterSearch] = useState("");

  // form
  const [showForm, setShowForm] = useState(false);
  const [editingLead, setEditingLead] = useState<SalesLead | null>(null);
  const [draft, setDraft] = useState<LeadDraft>(emptyDraft(user));
  const [saving, setSaving] = useState(false);

  // expanded lead (activity timeline)
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [activities, setActivities] = useState<SalesActivity[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(false);

  // activity form
  const [showActivityForm, setShowActivityForm] = useState(false);
  const [actDraft, setActDraft] = useState({
    activity_type: "call",
    activity_date: "",
    summary: "",
    outcome: "",
    next_action: "",
    next_followup: "",
  });
  const [savingActivity, setSavingActivity] = useState(false);

  // email compose (shown full-width below the lead form)
  const [emailCompose, setEmailCompose] = useState<{
    poc: 1 | 2;
    toName: string;
    toEmail: string;
    subject: string;
    body: string;
  } | null>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const composeRef = useRef<HTMLDivElement | null>(null);

  // delete confirm
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const toast = useToast();
  const filterTimer = useRef<number>();

  const load = useCallback(async () => {
    try {
      const data = await api.listLeads({
        assigned_to: user,
        stage: filterStage,
        priority: filterPriority,
        search: filterSearch || undefined,
      });
      setLeads(data);
      setErr(null);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [user, filterStage, filterPriority, filterSearch]);

  useEffect(() => {
    setLoading(true);
    window.clearTimeout(filterTimer.current);
    filterTimer.current = window.setTimeout(load, 250);
    return () => window.clearTimeout(filterTimer.current);
  }, [load]);

  // When the composer opens (or switches POC), bring it into view so the user
  // doesn't have to scroll down to find it. Keyed on `poc` so typing in the
  // subject/body (which also updates emailCompose) never re-triggers a scroll.
  useEffect(() => {
    if (!emailCompose) return;
    composeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emailCompose?.poc]);

  // stage counts for the pills
  const stageCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) c[l.stage] = (c[l.stage] ?? 0) + 1;
    return c;
  }, [leads]);

  function openCreate() {
    setEditingLead(null);
    setDraft(emptyDraft(user));
    setShowForm(true);
  }
  function openEdit(lead: SalesLead) {
    setEditingLead(lead);
    setDraft(leadToDraft(lead));
    setShowForm(true);
  }
  function closeForm() {
    setShowForm(false);
    setEditingLead(null);
  }

  async function saveLead() {
    if (!draft.brand_name.trim()) {
      toast("Brand name is required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        brand_name: draft.brand_name.trim(),
        category: draft.category || null,
        source: draft.source || null,
        poc1_name: draft.poc1_name || null,
        poc1_email: draft.poc1_email || null,
        poc1_phone: draft.poc1_phone || null,
        poc1_designation: draft.poc1_designation || null,
        poc2_name: draft.poc2_name || null,
        poc2_email: draft.poc2_email || null,
        poc2_phone: draft.poc2_phone || null,
        poc2_designation: draft.poc2_designation || null,
        stage: draft.stage,
        priority: draft.priority,
        assigned_to: draft.assigned_to,
        next_followup: draft.next_followup || null,
      };
      if (editingLead) {
        await api.updateLead(editingLead.id, payload);
        toast("Lead updated");
      } else {
        await api.createLead(payload);
        toast("Lead added to pipeline");
      }
      closeForm();
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteLead(id: number) {
    setDeleting(true);
    try {
      await api.deleteLead(id);
      toast("Lead deleted");
      setConfirmDeleteId(null);
      if (expandedId === id) setExpandedId(null);
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  }

  async function toggleExpand(id: number) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setShowActivityForm(false);
    setLoadingActivities(true);
    try {
      setActivities(await api.listActivities(id));
    } catch {
      setActivities([]);
    } finally {
      setLoadingActivities(false);
    }
  }

  function openActivityForm() {
    setActDraft({
      activity_type: "call",
      activity_date: "",
      summary: "",
      outcome: "",
      next_action: "",
      next_followup: "",
    });
    setShowActivityForm(true);
  }

  async function saveActivity() {
    if (!expandedId) return;
    setSavingActivity(true);
    try {
      await api.createActivity(expandedId, {
        activity_type: actDraft.activity_type,
        activity_date: actDraft.activity_date || null,
        summary: actDraft.summary || null,
        outcome: actDraft.outcome || null,
        next_action: actDraft.next_action || null,
        next_followup: actDraft.next_followup || null,
        logged_by: user,
      });
      toast("Activity logged");
      setShowActivityForm(false);
      setActivities(await api.listActivities(expandedId));
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSavingActivity(false);
    }
  }

  async function quickStageChange(lead: SalesLead, newStage: string) {
    try {
      await api.updateLead(lead.id, { stage: newStage });
      toast(`${lead.brand_name} moved to ${stageLabel(newStage)}`);
      load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  function setD(field: keyof LeadDraft, value: string) {
    setDraft((prev) => ({ ...prev, [field]: value }));
  }

  function openEmailFromDraft(poc: 1 | 2) {
    const name = poc === 1 ? draft.poc1_name : draft.poc2_name;
    const email = poc === 1 ? draft.poc1_email : draft.poc2_email;
    if (!email) return;
    const firstName = (name || "").split(" ")[0] || "there";
    const category = draft.category ? ` in the ${draft.category} space` : "";
    const brand = draft.brand_name || "your brand";
    setEmailCompose({
      poc,
      toName: name || "",
      toEmail: email,
      subject: `Partnership opportunity -- GrabOn x ${brand}`,
      body:
        `Hi ${firstName},\n\n` +
        `I'm reaching out from GrabOn, India's leading coupon and deals platform with 30M+ monthly users.\n\n` +
        `We'd love to explore a partnership with ${brand}${category}. ` +
        `Our affiliate program helps brands drive incremental sales through exclusive coupon campaigns, ` +
        `and we've seen strong results with similar brands in your vertical.\n\n` +
        `Would you be open to a quick 15-minute call this week to discuss how we can work together?\n\n` +
        `Looking forward to hearing from you.\n\n` +
        `Best regards`,
    });
  }

  async function copyEmail() {
    if (!emailCompose) return;
    try {
      await navigator.clipboard.writeText(
        `To: ${emailCompose.toEmail}\nSubject: ${emailCompose.subject}\n\n${emailCompose.body}`
      );
      toast("Email copied to clipboard");
    } catch {
      toast("Failed to copy", "error");
    }
  }

  // No mail service is wired up yet, so "Send" is a realistic stub: it shows a
  // brief sending state, confirms, and logs an email activity when we're
  // editing an existing lead (a brand-new lead has no id to log against yet).
  async function sendEmail() {
    if (!emailCompose || sendingEmail) return;
    setSendingEmail(true);
    try {
      await new Promise((r) => setTimeout(r, 650));
      if (editingLead) {
        try {
          await api.createActivity(editingLead.id, {
            activity_type: "email_sent",
            summary: `Sent "${emailCompose.subject}" to ${emailCompose.toName || emailCompose.toEmail}`,
            outcome: "Email sent",
            next_action: "Await reply",
            logged_by: user,
          });
          if (expandedId === editingLead.id) {
            setActivities(await api.listActivities(editingLead.id));
          }
        } catch {
          /* activity logging is best-effort for the stub */
        }
      }
      toast(`Email sent to ${emailCompose.toEmail}`);
      setEmailCompose(null);
      load(); // reflect any auto-advance (e.g. new lead -> contacted)
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <>
      <LedgerHeader
        title="Sales Pipeline"
        description="Every lead you own, from first outreach to closed — with the full activity trail."
        figures={[
          { label: "Leads", value: String(leads.length) },
          { label: "Hot", value: String(leads.filter((l) => l.priority === "hot").length) },
          { label: "Closed", value: String(leads.filter((l) => l.stage === "closed_won").length) },
        ]}
        actions={<button className="btn btn-primary" onClick={openCreate}>+ Add lead</button>}
      />

      {/* ---- filters ---- */}
      <div className="sales-header">

        <div className="sales-stage-pills">
          {SALES_STAGES.map((s) => (
            <button
              key={s.key}
              className={`sales-pill ${filterStage === s.key ? "active" : ""}`}
              style={{ "--pill-color": s.color } as React.CSSProperties}
              onClick={() => setFilterStage(filterStage === s.key ? "all" : s.key)}
            >
              <span className="sales-pill-dot" />
              {s.label}
              {(stageCounts[s.key] ?? 0) > 0 && (
                <span className="sales-pill-count">{stageCounts[s.key]}</span>
              )}
            </button>
          ))}
        </div>

        <div className="sales-filters">
          <input
            placeholder="Search brand or POC"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            aria-label="Search leads"
          />
          <PriorityDropdown value={filterPriority} onChange={setFilterPriority} />
        </div>
      </div>

      {/* ---- lead form (create / edit) ---- */}
      {showForm && (
        <div className="sales-form">
          <h3>{editingLead ? `Edit: ${editingLead.brand_name}` : "Add new lead"}</h3>
          <div className="sales-form-grid">
            <div className="sf-section">
              <h4>Brand info</h4>
              <div className="sf-row-3">
                <div className="field">
                  <label>Brand name *</label>
                  <input value={draft.brand_name} onChange={(e) => setD("brand_name", e.target.value)} />
                </div>
                <div className="field">
                  <label>Category</label>
                  <input value={draft.category} onChange={(e) => setD("category", e.target.value)} placeholder="E-commerce, Travel..." />
                </div>
                <div className="field">
                  <label>Source</label>
                  <select value={draft.source} onChange={(e) => setD("source", e.target.value)}>
                    <option value="">Select source</option>
                    {SOURCES.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div className="sf-section">
              <h4>POC 1</h4>
              <div className="sf-row">
                <div className="field"><label>Name</label><input value={draft.poc1_name} onChange={(e) => setD("poc1_name", e.target.value)} /></div>
                <div className="field">
                  <label>Email</label>
                  <div className="sf-email-wrap">
                    <input type="email" value={draft.poc1_email} onChange={(e) => setD("poc1_email", e.target.value)} placeholder="name@brand.com" />
                    {draft.poc1_email.trim() && (
                      <button
                        type="button"
                        className={`sf-draft-btn ${isValidEmail(draft.poc1_email) ? "ready" : ""}`}
                        onClick={() => openEmailFromDraft(1)}
                        disabled={!isValidEmail(draft.poc1_email)}
                        data-tip={isValidEmail(draft.poc1_email) ? "Draft outreach email" : "Enter a valid email to draft"}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                        Draft email
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="sf-row">
                <div className="field"><label>Phone</label><input value={draft.poc1_phone} onChange={(e) => setD("poc1_phone", e.target.value)} /></div>
                <div className="field"><label>Designation</label><input value={draft.poc1_designation} onChange={(e) => setD("poc1_designation", e.target.value)} placeholder="Marketing Manager, BD Head..." /></div>
              </div>
            </div>

            <div className="sf-section">
              <h4>POC 2</h4>
              <div className="sf-row">
                <div className="field"><label>Name</label><input value={draft.poc2_name} onChange={(e) => setD("poc2_name", e.target.value)} /></div>
                <div className="field">
                  <label>Email</label>
                  <div className="sf-email-wrap">
                    <input type="email" value={draft.poc2_email} onChange={(e) => setD("poc2_email", e.target.value)} placeholder="name@brand.com" />
                    {draft.poc2_email.trim() && (
                      <button
                        type="button"
                        className={`sf-draft-btn ${isValidEmail(draft.poc2_email) ? "ready" : ""}`}
                        onClick={() => openEmailFromDraft(2)}
                        disabled={!isValidEmail(draft.poc2_email)}
                        data-tip={isValidEmail(draft.poc2_email) ? "Draft outreach email" : "Enter a valid email to draft"}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                        Draft email
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="sf-row">
                <div className="field"><label>Phone</label><input value={draft.poc2_phone} onChange={(e) => setD("poc2_phone", e.target.value)} /></div>
                <div className="field"><label>Designation</label><input value={draft.poc2_designation} onChange={(e) => setD("poc2_designation", e.target.value)} /></div>
              </div>
            </div>

            <div className="sf-section">
              <h4>Pipeline</h4>
              <div className="sf-row">
                <div className="field">
                  <label>Stage</label>
                  <select value={draft.stage} onChange={(e) => setD("stage", e.target.value)}>
                    {SALES_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Priority</label>
                  <select value={draft.priority} onChange={(e) => setD("priority", e.target.value)}>
                    {SALES_PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="sf-row">
                <div className="field">
                  <label>Assigned to</label>
                  <select value={draft.assigned_to} onChange={(e) => setD("assigned_to", e.target.value)}>
                    {SALES_TEAM.map((s) => <option key={s} value={s}>{userLabel(s)}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Next follow-up</label>
                  <input type="date" value={draft.next_followup} onChange={(e) => setD("next_followup", e.target.value)} />
                </div>
              </div>
            </div>
          </div>
          {emailCompose && (
            <div className="email-compose" ref={composeRef}>
              <div className="ec-header">
                <div className="ec-title">
                  <span className="ec-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  </span>
                  <span className="ec-h">New email</span>
                  <span className="ec-to">
                    to {emailCompose.toName ? <b>{emailCompose.toName}</b> : null} <span className="mono">{emailCompose.toEmail}</span>
                  </span>
                </div>
                <button className="ec-x" onClick={() => setEmailCompose(null)} aria-label="Close compose" data-tip="Close">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
              </div>
              <div className="ec-field">
                <label htmlFor="ec-subject">Subject</label>
                <input id="ec-subject" value={emailCompose.subject} onChange={(e) => setEmailCompose({ ...emailCompose, subject: e.target.value })} />
              </div>
              <div className="ec-field">
                <label htmlFor="ec-body">Message</label>
                <textarea id="ec-body" className="ec-body" rows={9} value={emailCompose.body} onChange={(e) => setEmailCompose({ ...emailCompose, body: e.target.value })} />
              </div>
              <div className="ec-foot">
                <span className="ec-hint">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                  Demo mode - no mail service connected yet. Send logs the outreach; Copy drops it on your clipboard.
                </span>
                <div className="ec-actions">
                  <button className="btn btn-sm" onClick={copyEmail} disabled={sendingEmail}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Copy
                  </button>
                  <button className="btn btn-sm btn-green ec-send" onClick={sendEmail} disabled={sendingEmail}>
                    {sendingEmail ? (
                      "Sending..."
                    ) : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                        Send email
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="sf-actions">
            <button className="btn btn-primary" onClick={saveLead} disabled={saving}>
              {saving ? "Saving..." : editingLead ? "Update lead" : "Add lead"}
            </button>
            <button className="btn" onClick={closeForm} disabled={saving}>Cancel</button>
          </div>
        </div>
      )}

      {/* ---- leads table ---- */}
      {err && <div className="empty-state is-error">Failed to load leads: {err}</div>}

      {loading && (
        <div className="card">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: 52, marginBottom: 6 }} />
          ))}
        </div>
      )}

      {!loading && !err && (
        <div className="card">
          <div className="table-wrap" style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.2s" }}>
            <table className="data sales-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Brand</th>
                  <th>POC</th>
                  <th>Stage</th>
                  <th>Priority</th>
                  <th>Last activity</th>
                  <th className="sales-tp-col">Touchpoints</th>
                  <th>Next follow-up</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {leads.length === 0 && (
                  <tr>
                    <td colSpan={9} className="muted" style={{ textAlign: "center", padding: 24 }}>
                      No leads match these filters. Add your first lead to get started.
                    </td>
                  </tr>
                )}
                {leads.map((lead) => {
                  const isExpanded = expandedId === lead.id;
                  const isOverdue = lead.next_followup && new Date(lead.next_followup) < new Date(new Date().toDateString());
                  return (
                    <Fragment key={lead.id}>
                      <tr className={`sales-row ${isExpanded ? "expanded" : ""} ${isOverdue ? "overdue" : ""}`}>
                        <td>
                          <button
                            className={`sales-expand-btn ${isExpanded ? "open" : ""}`}
                            onClick={() => toggleExpand(lead.id)}
                            aria-label={isExpanded ? "Collapse" : "Expand timeline"}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m9 18 6-6-6-6" />
                            </svg>
                          </button>
                        </td>
                        <td>
                          <div className="sales-brand-cell">
                            <b>{lead.brand_name}</b>
                            {lead.category && <span className="muted">{lead.category}</span>}
                          </div>
                        </td>
                        <td>
                          <div className="sales-poc-cell">
                            {lead.poc1_name && <span>{lead.poc1_name}</span>}
                            {lead.poc1_email && <span className="muted">{lead.poc1_email}</span>}
                          </div>
                        </td>
                        <td>
                          <span className="sales-stage-chip" style={{ "--chip-color": stageColor(lead.stage) } as React.CSSProperties}>
                            {stageLabel(lead.stage)}
                          </span>
                        </td>
                        <td>
                          <span className="sales-priority-chip" style={{ "--chip-color": priorityColor(lead.priority) } as React.CSSProperties}>
                            {priorityLabel(lead.priority)}
                          </span>
                        </td>
                        <td className="mono muted">{relativeDate(lead.last_contact_date)}</td>
                        <td className="sales-tp-col mono">{lead.touchpoints}</td>
                        <td className={`mono ${isOverdue ? "text-danger" : "muted"}`}>
                          {lead.next_followup ? relativeDate(lead.next_followup) : "-"}
                        </td>
                        <td>
                          {confirmDeleteId === lead.id ? (
                            <span className="btn-row">
                              <span className="del-confirm">Delete?</span>
                              <button className="btn btn-sm btn-danger" disabled={deleting} onClick={() => deleteLead(lead.id)}>
                                {deleting ? "..." : "Yes"}
                              </button>
                              <button className="btn btn-sm" disabled={deleting} onClick={() => setConfirmDeleteId(null)}>No</button>
                            </span>
                          ) : (
                            <span className="btn-row">
                              <button className="btn btn-sm" onClick={() => openEdit(lead)}>Edit</button>
                              <button className="btn btn-sm btn-icon btn-del" onClick={() => setConfirmDeleteId(lead.id)} aria-label="Delete lead" data-tip="Delete lead">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                              </button>
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* ---- expanded activity timeline ---- */}
                      {isExpanded && (
                        <tr className="sales-timeline-row">
                          <td colSpan={9}>
                            <div className="sales-timeline">
                              <div className="sales-tl-header">
                                <h4>Activity timeline</h4>
                                <div className="sales-tl-actions">
                                  {/* Quick stage buttons */}
                                  {lead.stage === "new_lead" && (
                                    <button className="btn btn-sm" onClick={() => quickStageChange(lead, "contacted")}>Mark contacted</button>
                                  )}
                                  {lead.stage === "contacted" && (
                                    <>
                                      <button className="btn btn-sm" onClick={() => quickStageChange(lead, "responded")}>Mark responded</button>
                                      <button className="btn btn-sm" onClick={() => quickStageChange(lead, "no_response")}>No response</button>
                                    </>
                                  )}
                                  {lead.stage === "no_response" && (
                                    <>
                                      <button className="btn btn-sm" onClick={() => quickStageChange(lead, "contacted")}>Follow up again</button>
                                      <button className="btn btn-sm" onClick={() => quickStageChange(lead, "responded")}>Got a reply</button>
                                    </>
                                  )}
                                  {lead.stage === "responded" && (
                                    <button className="btn btn-sm" onClick={() => quickStageChange(lead, "negotiating")}>Move to negotiating</button>
                                  )}
                                  {lead.stage === "negotiating" && (
                                    <>
                                      <button className="btn btn-sm btn-green" onClick={() => quickStageChange(lead, "closed_won")}>Closed</button>
                                      <button className="btn btn-sm btn-reject" onClick={() => quickStageChange(lead, "closed_lost")}>Declined</button>
                                    </>
                                  )}
                                  <button className="btn btn-sm btn-primary" onClick={openActivityForm}>+ Log activity</button>
                                </div>
                              </div>

                              {/* POC detail card */}
                              <div className="sales-poc-detail">
                                <div className="spd-group">
                                  <span className="spd-label">POC 1</span>
                                  <span>{lead.poc1_name || "-"}</span>
                                  {lead.poc1_email && <span className="muted">{lead.poc1_email}</span>}
                                  {lead.poc1_phone && <span className="muted">{lead.poc1_phone}</span>}
                                  {lead.poc1_designation && <span className="muted">{lead.poc1_designation}</span>}
                                </div>
                                <div className="spd-group">
                                  <span className="spd-label">POC 2</span>
                                  <span>{lead.poc2_name || "-"}</span>
                                  {lead.poc2_email && <span className="muted">{lead.poc2_email}</span>}
                                  {lead.poc2_phone && <span className="muted">{lead.poc2_phone}</span>}
                                  {lead.poc2_designation && <span className="muted">{lead.poc2_designation}</span>}
                                </div>
                                {lead.website && (
                                  <div className="spd-group">
                                    <span className="spd-label">Website</span>
                                    <span className="muted">{lead.website}</span>
                                  </div>
                                )}
                                {lead.source && (
                                  <div className="spd-group">
                                    <span className="spd-label">Source</span>
                                    <span className="muted">{lead.source}</span>
                                  </div>
                                )}
                              </div>

                              {/* Activity form */}
                              {showActivityForm && (
                                <div className="saf">
                                  <div className="saf-head">
                                    <span className="saf-title">Log an activity</span>
                                    <span className="saf-sub">Record a call, email, meeting or note for <b>{lead.brand_name}</b>.</span>
                                  </div>
                                  <div className="saf-grid">
                                    <div className="field">
                                      <label>Type</label>
                                      <select value={actDraft.activity_type} onChange={(e) => setActDraft((d) => ({ ...d, activity_type: e.target.value }))}>
                                        {ACTIVITY_TYPES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
                                      </select>
                                    </div>
                                    <div className="field">
                                      <label>When</label>
                                      <input type="datetime-local" value={actDraft.activity_date} onChange={(e) => setActDraft((d) => ({ ...d, activity_date: e.target.value }))} />
                                    </div>
                                    <div className="field saf-wide">
                                      <label>Summary</label>
                                      <input value={actDraft.summary} onChange={(e) => setActDraft((d) => ({ ...d, summary: e.target.value }))} placeholder="What happened? What did they say?" />
                                    </div>
                                    <div className="field">
                                      <label>Outcome</label>
                                      <input value={actDraft.outcome} onChange={(e) => setActDraft((d) => ({ ...d, outcome: e.target.value }))} placeholder="Interested, no answer, follow-up needed..." />
                                    </div>
                                    <div className="field">
                                      <label>Next follow-up</label>
                                      <input type="date" value={actDraft.next_followup} onChange={(e) => setActDraft((d) => ({ ...d, next_followup: e.target.value }))} />
                                    </div>
                                    <div className="field saf-wide">
                                      <label>Next action</label>
                                      <input value={actDraft.next_action} onChange={(e) => setActDraft((d) => ({ ...d, next_action: e.target.value }))} placeholder="What to do next, and by when" />
                                    </div>
                                  </div>
                                  <div className="saf-actions">
                                    <button className="btn btn-primary btn-sm" onClick={saveActivity} disabled={savingActivity}>
                                      {savingActivity ? "Saving..." : "Log activity"}
                                    </button>
                                    <button className="btn btn-sm" onClick={() => setShowActivityForm(false)} disabled={savingActivity}>Cancel</button>
                                  </div>
                                </div>
                              )}

                              {/* Timeline entries */}
                              {loadingActivities && (
                                <div className="skeleton" style={{ height: 60, marginTop: 8 }} />
                              )}
                              {!loadingActivities && activities.length === 0 && (
                                <p className="muted" style={{ padding: "12px 0" }}>No activities logged yet. Click "Log activity" to start tracking.</p>
                              )}
                              {!loadingActivities && activities.length > 0 && (
                                <div className="sales-tl-list">
                                  {activities.map((a) => (
                                    <div key={a.id} className="sales-tl-entry">
                                      <div className="stl-dot" style={{ borderColor: activityColor(a.activity_type) }} />
                                      <div className="stl-content">
                                        <div className="stl-head">
                                          <span className="stl-type" style={{ background: activityColor(a.activity_type) + "18", color: activityColor(a.activity_type) }}>
                                            {activityLabel(a.activity_type)}
                                          </span>
                                          <span className="mono muted">{formatRailwayTime(a.activity_date)}</span>
                                          {a.outcome && <span className="muted stl-outcome">{a.outcome}</span>}
                                        </div>
                                        {a.summary && <p className="stl-summary">{a.summary}</p>}
                                        {a.next_action && (
                                          <p className="stl-next">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                            {a.next_action}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
