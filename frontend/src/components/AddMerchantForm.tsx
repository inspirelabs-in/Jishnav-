import { useState } from "react";
import { api } from "../api";
import { useToast } from "../Toast";
import { DEAL_TYPES, REPORTING_OPTIONS, type Merchant } from "../types";

interface Props {
  user: string;
  initialName: string;
  onCreated: (m: Merchant) => void;
  onCancel: () => void;
}

export default function AddMerchantForm({ user, initialName, onCreated, onCancel }: Props) {
  const [form, setForm] = useState({
    merchant_id: "",
    merchant_name: initialName,
    breadcrumb1: "",
    breadcrumb1_name: "",
    breadcrumb2: "",
    breadcrumb2_name: "",
    affiliate_id: "",
    affiliate_name: "",
    reporting: "",
    payout: "",
    deal_type: "",
    revenue_status: "Revenue",
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function save() {
    if (!form.merchant_name.trim() || !form.reporting || !form.deal_type || !form.payout.trim()) {
      toast("Merchant name, Reporting, Deal type and Payout are required", "error");
      return;
    }
    setSaving(true);
    try {
      const merchant = await api.createMerchant({
        merchant_id: form.merchant_id.trim() ? Number(form.merchant_id) : null,
        merchant_name: form.merchant_name.trim(),
        breadcrumb1: Number(form.breadcrumb1) || 0,
        breadcrumb1_name: form.breadcrumb1_name.trim() || null,
        breadcrumb2: Number(form.breadcrumb2) || 0,
        breadcrumb2_name: form.breadcrumb2_name.trim() || null,
        affiliate_id: Number(form.affiliate_id) || 0,
        affiliate_name: form.affiliate_name.trim() || null,
        reporting: form.reporting,
        payout: form.payout.trim(),
        deal_type: form.deal_type,
        revenue_status: form.revenue_status,
        owner: user,
      });
      toast(`Merchant "${merchant.merchant_name}" added`);
      onCreated(merchant);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <h3>Add New Merchant</h3>
      <p className="card-sub">
        You (<b>{user}</b>) will be set as this merchant's owner/handler.
      </p>
      <div className="form-grid">
        <div className="field">
          <label>Merchant ID</label>
          <input
            type="number"
            placeholder="Auto if blank"
            value={form.merchant_id}
            onChange={(e) => set("merchant_id", e.target.value)}
          />
        </div>
        <div className="field grow">
          <label className="req">Merchant Name</label>
          <input value={form.merchant_name} onChange={(e) => set("merchant_name", e.target.value)} />
        </div>
        <div className="field">
          <label>Breadcrumb1 Name</label>
          <input
            placeholder="e.g. Fashion"
            value={form.breadcrumb1_name}
            onChange={(e) => set("breadcrumb1_name", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Breadcrumb2 Name</label>
          <input
            placeholder="e.g. Footwear"
            value={form.breadcrumb2_name}
            onChange={(e) => set("breadcrumb2_name", e.target.value)}
          />
        </div>
        <div className="field">
          <label>Affiliate ID</label>
          <input type="number" value={form.affiliate_id} onChange={(e) => set("affiliate_id", e.target.value)} />
        </div>
        <div className="field">
          <label>Affiliate Name</label>
          <input value={form.affiliate_name} onChange={(e) => set("affiliate_name", e.target.value)} />
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label className="req">Reporting</label>
          <select value={form.reporting} onChange={(e) => set("reporting", e.target.value)}>
            <option value="">Select…</option>
            {REPORTING_OPTIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="req">Deal Type</label>
          <select value={form.deal_type} onChange={(e) => set("deal_type", e.target.value)}>
            <option value="">Select…</option>
            {DEAL_TYPES.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="req">Payout</label>
          <input placeholder="e.g. 6% or Rs.150/signup" value={form.payout} onChange={(e) => set("payout", e.target.value)} />
        </div>
        <div className="field">
          <label className="req">Revenue Status</label>
          <select value={form.revenue_status} onChange={(e) => set("revenue_status", e.target.value)}>
            <option>Revenue</option>
            <option>Non-revenue</option>
          </select>
        </div>
        <div className="field" style={{ justifyContent: "flex-end", flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? "Saving" : "Save Merchant"}
          </button>
        </div>
      </div>
    </div>
  );
}
