import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useToast } from "../Toast";
import { DEAL_TYPES, HANDLERS, REPORTING_OPTIONS, isHandler, type Merchant } from "../types";
import { ReportingBadge } from "./Icons";
import MonthYearPicker from "./MonthYearPicker";

interface Props {
  user: string;
  prefillMerchant: Merchant | null;
  onAddNewMerchant: (name: string) => void;
  onSaved: () => void;
}

export default function EntryForm({ user, prefillMerchant, onAddNewMerchant, onSaved }: Props) {
  const [query, setQuery] = useState(prefillMerchant?.merchant_name ?? "");
  const [results, setResults] = useState<Merchant[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [noMatch, setNoMatch] = useState(false);
  const [merchant, setMerchant] = useState<Merchant | null>(prefillMerchant);
  const searchTimer = useRef<number>();

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y, y - 1, y - 2];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [clicks, setClicks] = useState("");
  const [sales, setSales] = useState("");
  const [gmv, setGmv] = useState("");
  const [revenue, setRevenue] = useState("");
  const [remarks, setRemarks] = useState("");
  const [isRevenue, setIsRevenue] = useState(prefillMerchant?.revenue_status !== "Non-revenue");
  const [deliveryTeam, setDeliveryTeam] = useState(false);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const cr =
    clicks && sales && Number(clicks) > 0
      ? ((Number(sales) / Number(clicks)) * 100).toFixed(2)
      : "";

  useEffect(() => {
    if (prefillMerchant) {
      selectMerchant(prefillMerchant);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillMerchant]);

  function selectMerchant(m: Merchant) {
    setMerchant(m);
    setQuery(m.merchant_name);
    setDropdownOpen(false);
    setNoMatch(false);
    setIsRevenue(m.revenue_status !== "Non-revenue");
  }

  function onQueryChange(value: string) {
    setQuery(value);
    setMerchant(null);
    setNoMatch(false);
    window.clearTimeout(searchTimer.current);
    if (!value.trim()) {
      setResults([]);
      setDropdownOpen(false);
      return;
    }
    searchTimer.current = window.setTimeout(async () => {
      try {
        const { results } = await api.searchMerchants(value.trim());
        setResults(results);
        setNoMatch(results.length === 0);
        setDropdownOpen(true);
      } catch {
        /* ignore while typing */
      }
    }, 250);
  }

  // A handler can only enter data for the brands they own; selecting someone
  // else's brand locks the form (Manager / Founders Office are not handlers).
  const foreignBrand = !!merchant && isHandler(user) && merchant.owner !== user;

  // Already parked as non-revenue: the only meaningful next action is to flip
  // back to Revenue and log its return, so a repeat non-revenue save is blocked.
  const alreadyNonRev = merchant?.revenue_status === "Non-revenue";
  const blockedNonRev = !!merchant && alreadyNonRev && !isRevenue;

  async function save() {
    if (!merchant) {
      toast("Search and select a merchant first", "error");
      return;
    }
    if (foreignBrand) {
      toast(
        `${merchant.merchant_name} is handled by ${merchant.owner}. You can only enter data for your own brands.`,
        "error"
      );
      return;
    }
    if (blockedNonRev) {
      toast(
        `${merchant.merchant_name} is already non-revenue. Switch to Revenue and enter data when it resumes.`,
        "error"
      );
      return;
    }
    if (isRevenue && (!clicks || !sales || !gmv || !revenue)) {
      toast("Clicks, Sales, GMV and Revenue are mandatory for revenue merchants", "error");
      return;
    }
    setSaving(true);
    try {
      await api.createEntry({
        merchant_id: merchant.merchant_id,
        entry_date: `${year}-${String(month).padStart(2, "0")}-01`,
        clicks: clicks === "" ? null : Number(clicks),
        sales: sales === "" ? null : Number(sales),
        gmv: gmv === "" ? null : Number(gmv),
        revenue: revenue === "" ? null : Number(revenue),
        remarks: remarks.trim() || null,
        revenue_status: isRevenue ? "Revenue" : "Non-revenue",
        entered_by: user,
        delivery_requested: deliveryTeam,
      });
      toast(
        deliveryTeam
          ? `Saved. Delivery team notified to add their numbers for ${merchant.merchant_name}.`
          : `Saved entry for ${merchant.merchant_name}`
      );
      // Keep local status in sync so the notice/guard react without re-selecting.
      setMerchant({ ...merchant, revenue_status: isRevenue ? "Revenue" : "Non-revenue" });
      setClicks("");
      setSales("");
      setGmv("");
      setRevenue("");
      setRemarks("");
      setDeliveryTeam(false);
      onSaved();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3>Add Performance Data</h3>
      <div className="entry-top">
        <div className="field autocomplete field-merchant">
          <label className="req" htmlFor="ef-merchant">Merchant</label>
          <input
            id="ef-merchant"
            placeholder="Type a merchant name"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onFocus={() => query && results.length > 0 && setDropdownOpen(true)}
            onBlur={() => window.setTimeout(() => setDropdownOpen(false), 180)}
          />
          {dropdownOpen && (
            <div className="ac-dropdown">
              {results.map((m) => (
                <div key={m.merchant_id} className="ac-option" onMouseDown={() => selectMerchant(m)}>
                  <span>{m.merchant_name}</span>
                  <small>
                    {m.breadcrumb1_name} · {m.owner}
                  </small>
                </div>
              ))}
              {noMatch && (
                <div className="ac-empty">
                  This merchant is currently not available in the DB.
                  <br />
                  <button
                    className="btn btn-primary btn-sm"
                    onMouseDown={() => onAddNewMerchant(query.trim())}
                  >
                    + Add New Merchant
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="field field-date">
          <label className="req" id="ef-period-label">Period</label>
          <MonthYearPicker
            month={month}
            year={year}
            years={yearOptions}
            ariaLabel="Entry period"
            onChange={(m, y) => {
              setMonth(m);
              setYear(y);
            }}
          />
        </div>

        <div className="field field-status">
          <label id="ef-status-label">Status</label>
          <div className="toggle-wrap">
            <button
              className={`toggle ${isRevenue ? "" : "off"}`}
              onClick={() => setIsRevenue((v) => !v)}
              disabled={foreignBrand}
              role="switch"
              aria-checked={isRevenue}
              aria-label={`Revenue status: ${isRevenue ? "Revenue" : "Non-revenue"}`}
            />
            <span className="toggle-label" style={{ color: isRevenue ? "var(--green)" : "var(--ink-3)" }}>
              {isRevenue ? "Revenue" : "Non-revenue"}
            </span>
          </div>
        </div>
      </div>

      {merchant && (
        <MerchantInfoStrip merchant={merchant} user={user} onUpdated={(m) => setMerchant(m)} />
      )}
      {foreignBrand && (
        <p className="entry-notice entry-notice-block">
          <b>{merchant!.merchant_name}</b> is handled by <b>{merchant!.owner}</b>. You can only
          enter data for the brands you handle, so this form is locked. Ask {merchant!.owner} or a
          manager to record it.
        </p>
      )}
      {merchant && !foreignBrand && !isRevenue && (
        <p className={`entry-notice ${blockedNonRev ? "entry-notice-block" : ""}`}>
          {blockedNonRev ? (
            <>
              <b>{merchant.merchant_name}</b> is already marked non-revenue. It stays parked
              with its original non-revenue log. Switch the toggle to <b>Revenue</b> and enter
              data to record the day it resumes.
            </>
          ) : (
            <>
              Saving will mark <b>{merchant.merchant_name}</b> non-revenue from this date.
              Metric fields become optional and overdue reminders pause until it is toggled
              back to Revenue.
            </>
          )}
        </p>
      )}

      {merchant && !foreignBrand && isRevenue && (
        <div className="delivery-row">
          <button
            className={`toggle toggle-sm ${deliveryTeam ? "" : "off"}`}
            onClick={() => setDeliveryTeam((v) => !v)}
            role="switch"
            aria-checked={deliveryTeam}
            aria-label="Delivery team also works this brand"
          />
          <span className="compare-label">Delivery team data</span>
          <span className="delivery-hint">
            {deliveryTeam
              ? "On save, the Delivery team is asked to add their own numbers for this entry."
              : "Turn on if the Delivery team also worked this brand this period."}
          </span>
        </div>
      )}

      <div className="entry-metrics">
        <div className="field">
          <label className={isRevenue ? "req" : ""} htmlFor="ef-clicks">Clicks</label>
          <input id="ef-clicks" type="number" min="0" value={clicks} disabled={foreignBrand} onChange={(e) => setClicks(e.target.value)} />
        </div>
        <div className="field">
          <label className={isRevenue ? "req" : ""} htmlFor="ef-sales">Sales</label>
          <input id="ef-sales" type="number" min="0" value={sales} disabled={foreignBrand} onChange={(e) => setSales(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ef-cr">CR %</label>
          <input id="ef-cr" value={cr} readOnly placeholder="auto" />
        </div>
        <div className="field">
          <label className={isRevenue ? "req" : ""} htmlFor="ef-gmv">GMV</label>
          <input id="ef-gmv" type="number" min="0" value={gmv} disabled={foreignBrand} onChange={(e) => setGmv(e.target.value)} />
        </div>
        <div className="field">
          <label className={isRevenue ? "req" : ""} htmlFor="ef-revenue">Revenue</label>
          <input id="ef-revenue" type="number" min="0" value={revenue} disabled={foreignBrand} onChange={(e) => setRevenue(e.target.value)} />
        </div>
      </div>

      <div className="entry-lastrow">
        <div className="field">
          <label htmlFor="ef-remarks">Remarks (optional)</label>
          <input id="ef-remarks" value={remarks} disabled={foreignBrand} onChange={(e) => setRemarks(e.target.value)} placeholder="Anything worth noting" />
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving || blockedNonRev || foreignBrand}>
          {saving ? "Saving" : "Save Entry"}
        </button>
      </div>
    </div>
  );
}

function MerchantInfoStrip({ merchant, user, onUpdated }: { merchant: Merchant; user: string; onUpdated: (m: Merchant) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    category: merchant.breadcrumb1_name ?? "",
    sub_category: merchant.breadcrumb2_name ?? "",
    reporting: merchant.reporting ?? "",
    payout: merchant.payout ?? "",
    deal_type: merchant.deal_type ?? "",
    owner: merchant.owner ?? "",
  });
  const toast = useToast();

  useEffect(() => {
    setEditing(false);
    setDraft({
      category: merchant.breadcrumb1_name ?? "",
      sub_category: merchant.breadcrumb2_name ?? "",
      reporting: merchant.reporting ?? "",
      payout: merchant.payout ?? "",
      deal_type: merchant.deal_type ?? "",
      owner: merchant.owner ?? "",
    });
  }, [merchant.merchant_id]);

  function startEdit() {
    setDraft({
      category: merchant.breadcrumb1_name ?? "",
      sub_category: merchant.breadcrumb2_name ?? "",
      reporting: merchant.reporting ?? "",
      payout: merchant.payout ?? "",
      deal_type: merchant.deal_type ?? "",
      owner: merchant.owner ?? "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    if (saving) return;
    setSaving(true);
    try {
      const updated = await api.updateMerchant(merchant.merchant_id, {
        category: draft.category,
        sub_category: draft.sub_category,
        reporting: draft.reporting,
        payout: draft.payout,
        deal_type: draft.deal_type,
        owner: draft.owner,
        edited_by: user,
      });
      onUpdated(updated);
      setEditing(false);
      toast("Merchant details updated");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="merchant-info merchant-info-edit">
        <span className="info-pill">ID <b className="mono">{merchant.merchant_id}</b></span>
        <span className="info-pill info-pill-edit">
          <label>Category</label>
          <input value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))} placeholder="Category" />
        </span>
        <span className="info-pill info-pill-edit">
          <label>Sub</label>
          <input value={draft.sub_category} onChange={(e) => setDraft((d) => ({ ...d, sub_category: e.target.value }))} placeholder="Sub-category" />
        </span>
        <span className="info-pill info-pill-edit">
          <label>Reporting</label>
          <select value={draft.reporting} onChange={(e) => setDraft((d) => ({ ...d, reporting: e.target.value }))}>
            <option value="">—</option>
            {REPORTING_OPTIONS.map((r) => <option key={r}>{r}</option>)}
          </select>
        </span>
        <span className="info-pill info-pill-edit">
          <label>Payout</label>
          <input value={draft.payout} onChange={(e) => setDraft((d) => ({ ...d, payout: e.target.value }))} placeholder="e.g. 2%" />
        </span>
        <span className="info-pill info-pill-edit">
          <label>Deal</label>
          <select value={draft.deal_type} onChange={(e) => setDraft((d) => ({ ...d, deal_type: e.target.value }))}>
            <option value="">—</option>
            {DEAL_TYPES.map((d) => <option key={d}>{d}</option>)}
          </select>
        </span>
        <span className="info-pill info-pill-edit">
          <label>Owner</label>
          <select value={draft.owner} onChange={(e) => setDraft((d) => ({ ...d, owner: e.target.value }))}>
            <option value="">—</option>
            {HANDLERS.map((h) => <option key={h}>{h}</option>)}
          </select>
        </span>
        <span className="info-pill-actions">
          <button className="btn btn-sm btn-green" onClick={saveEdit} disabled={saving}>{saving ? "Saving" : "Save"}</button>
          <button className="btn btn-sm" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
        </span>
      </div>
    );
  }

  return (
    <div className="merchant-info">
      <span className="info-pill">ID <b className="mono">{merchant.merchant_id}</b></span>
      <span className="info-pill">Category <b>{merchant.breadcrumb1_name ?? "-"}</b></span>
      {merchant.breadcrumb2_name && (
        <span className="info-pill">Sub <b>{merchant.breadcrumb2_name}</b></span>
      )}
      <span className="info-pill">Reporting <ReportingBadge reporting={merchant.reporting} /></span>
      <span className="info-pill">Payout <b>{merchant.payout ?? "-"}</b></span>
      <span className="info-pill">Deal <b>{merchant.deal_type ?? "-"}</b></span>
      <span className="info-pill">Owner <b>{merchant.owner ?? "-"}</b></span>
      <button className="btn btn-sm info-edit-btn" onClick={startEdit}>Edit</button>
    </div>
  );
}
