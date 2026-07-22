import type {
  AnalyticsResponse,
  DeliveryRequest,
  EditLog,
  Entry,
  Merchant,
  MerchantEditLog,
  Notification,
  OverviewResponse,
  SalesActivity,
  SalesLead,
  StatusEvent,
  Transfer,
} from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  searchMerchants: (q: string) =>
    request<{ results: Merchant[]; exact_match: boolean }>(
      `/api/merchants/search?q=${encodeURIComponent(q)}`
    ),

  listMerchants: (owner?: string) =>
    request<Merchant[]>(
      owner && owner !== "All"
        ? `/api/merchants?owner=${encodeURIComponent(owner)}`
        : "/api/merchants"
    ),

  updateMerchant: (
    merchantId: number,
    payload: { category?: string; sub_category?: string; reporting?: string; payout?: string; deal_type?: string; owner?: string; edited_by?: string }
  ) =>
    request<Merchant>(`/api/merchants/${merchantId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  listCategories: () => request<string[]>("/api/categories"),

  transferMerchant: (merchant_id: number, to_handler: string, by: string) =>
    request<{ merchant_id: number; merchant_name: string; from_handler: string | null; to_handler: string }>(
      "/api/transfers",
      { method: "POST", body: JSON.stringify({ merchant_id, to_handler, by }) }
    ),

  listTransfers: () => request<Transfer[]>("/api/transfers"),

  listDeliveryRequests: (status: "pending" | "done" = "pending") =>
    request<DeliveryRequest[]>(`/api/delivery-requests?status=${status}`),

  fillDelivery: (
    entryId: number,
    payload: { clicks: number | null; sales: number | null; gmv: number | null; revenue: number | null; filled_by: string }
  ) =>
    request<{ id: number; d_cr: number | null }>(`/api/entries/${entryId}/delivery`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateDelivery: (
    entryId: number,
    payload: { clicks: number | null; sales: number | null; gmv: number | null; revenue: number | null; filled_by: string }
  ) =>
    request<{ id: number; d_cr: number | null }>(`/api/entries/${entryId}/delivery`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteDelivery: (entryId: number, filledBy: string) =>
    request<{ deleted: boolean }>(
      `/api/entries/${entryId}/delivery?filled_by=${encodeURIComponent(filledBy)}`,
      { method: "DELETE" }
    ),

  statusHistory: (params: { owner?: string; merchant?: string }) => {
    const s = new URLSearchParams();
    if (params.owner) s.set("owner", params.owner);
    if (params.merchant) s.set("merchant", params.merchant);
    return request<StatusEvent[]>(`/api/status-history?${s}`);
  },

  createMerchant: (payload: Record<string, unknown>) =>
    request<Merchant>("/api/merchants", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  createEntry: (payload: Record<string, unknown>) =>
    request<{ id: number; cr: number | null }>("/api/entries", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  listEntries: (filters: {
    merchant?: string;
    handler?: string;
    date_from?: string;
    date_to?: string;
  }) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(k, v);
    }
    return request<Entry[]>(`/api/entries?${params}`);
  },

  updateEntry: (id: number, payload: Record<string, unknown>) =>
    request<{ updated: boolean; cr?: number | null }>(`/api/entries/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteEntry: (id: number, enteredBy: string) =>
    request<{ deleted: boolean }>(
      `/api/entries/${id}?entered_by=${encodeURIComponent(enteredBy)}`,
      { method: "DELETE" }
    ),

  listEditLogs: (params?: {
    owner?: string;
    edited_by?: string;
    merchant?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
  }) => {
    const s = new URLSearchParams();
    if (params?.owner) s.set("owner", params.owner);
    if (params?.edited_by) s.set("edited_by", params.edited_by);
    if (params?.merchant) s.set("merchant", params.merchant);
    if (params?.date_from) s.set("date_from", params.date_from);
    if (params?.date_to) s.set("date_to", params.date_to);
    if (params?.limit) s.set("limit", String(params.limit));
    const qs = s.toString();
    return request<EditLog[]>(`/api/edit-logs${qs ? `?${qs}` : ""}`);
  },

  listMerchantEditLogs: (params?: {
    owner?: string;
    merchant?: string;
    date_from?: string;
    date_to?: string;
    limit?: number;
  }) => {
    const s = new URLSearchParams();
    if (params?.owner) s.set("owner", params.owner);
    if (params?.merchant) s.set("merchant", params.merchant);
    if (params?.date_from) s.set("date_from", params.date_from);
    if (params?.date_to) s.set("date_to", params.date_to);
    if (params?.limit) s.set("limit", String(params.limit));
    const qs = s.toString();
    return request<MerchantEditLog[]>(`/api/merchant-edit-logs${qs ? `?${qs}` : ""}`);
  },

  getNotifications: (user: string, asOf?: string) =>
    request<Notification[]>(
      `/api/notifications?user=${encodeURIComponent(user)}${asOf ? `&as_of=${asOf}` : ""}`
    ),

  submitReason: (id: number, reason: string) =>
    request<{ status: string }>(`/api/notifications/${id}/reason`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  approveReason: (id: number) =>
    request<{ status: string }>(`/api/notifications/${id}/approve`, {
      method: "POST",
    }),

  rejectReason: (id: number) =>
    request<{ status: string }>(`/api/notifications/${id}/reject`, {
      method: "POST",
    }),

  analytics: (params: {
    mode: string;
    brands?: string[];
    categories?: string[];
    owner?: string;
    date_from?: string;
    date_to?: string;
  }) => {
    const search = new URLSearchParams();
    search.set("mode", params.mode);
    (params.brands ?? []).forEach((b) => search.append("brands", b));
    (params.categories ?? []).forEach((c) => search.append("categories", c));
    if (params.owner) search.set("owner", params.owner);
    if (params.date_from) search.set("date_from", params.date_from);
    if (params.date_to) search.set("date_to", params.date_to);
    return request<AnalyticsResponse>(`/api/analytics?${search}`);
  },

  // -------------------------------------------------- sales pipeline ----

  listLeads: (filters: {
    assigned_to?: string;
    stage?: string;
    priority?: string;
    search?: string;
  }) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) {
      if (v) s.set(k, v);
    }
    return request<SalesLead[]>(`/api/sales/leads?${s}`);
  },

  createLead: (payload: Record<string, unknown>) =>
    request<SalesLead>("/api/sales/leads", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateLead: (id: number, payload: Record<string, unknown>) =>
    request<SalesLead>(`/api/sales/leads/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteLead: (id: number) =>
    request<{ deleted: boolean }>(`/api/sales/leads/${id}`, { method: "DELETE" }),

  listActivities: (leadId: number) =>
    request<SalesActivity[]>(`/api/sales/leads/${leadId}/activities`),

  createActivity: (leadId: number, payload: Record<string, unknown>) =>
    request<SalesActivity>(`/api/sales/leads/${leadId}/activities`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  overview: (params: {
    owner?: string;
    months?: number;
    date_from?: string;
    date_to?: string;
    merchant?: string;
    brands?: string[];
    categories?: string[];
    handlers?: string[];
  }) => {
    const s = new URLSearchParams();
    if (params.owner) s.set("owner", params.owner);
    if (params.months) s.set("months", String(params.months));
    if (params.date_from) s.set("date_from", params.date_from);
    if (params.date_to) s.set("date_to", params.date_to);
    if (params.merchant) s.set("merchant", params.merchant);
    for (const b of params.brands ?? []) s.append("brands", b);
    for (const c of params.categories ?? []) s.append("categories", c);
    for (const h of params.handlers ?? []) s.append("handlers", h);
    return request<OverviewResponse>(`/api/analytics/overview?${s}`);
  },
};

export function formatNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n * 100) / 100}`;
}

/** Indian money notation: ₹ with Lakh (L) / Crore (Cr) units. */
export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  const abs = Math.abs(n);
  if (abs >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return `₹${Math.round(n * 100) / 100}`;
}

/** Period-over-period delta in percent; null when no baseline. */
export function deltaPct(current: number, previous: number | undefined | null): number | null {
  if (previous === undefined || previous === null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Jul-2026" from a 1-12 month and a year. */
export function formatMonthYear(month: number, year: number): string {
  return `${MONTH_ABBR[month - 1]}-${year}`;
}

/** "Jul-2026" from an ISO date/month string ("2026-07" or "2026-07-01"). */
export function formatMonthYearISO(iso: string): string {
  return formatMonthYear(Number(iso.slice(5, 7)), Number(iso.slice(0, 4)));
}

/** Full month name from an ISO "YYYY-MM" string, e.g. "July 2026". */
export function formatMonthLong(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/** A conversion-rate percentage, e.g. "6.42%". */
export function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return "-";
  return `${(Math.round(n * 100) / 100).toFixed(2)}%`;
}

/** 24-hour "railway timing": 19 Jul 2026, 16:53. */
export function formatRailwayTime(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTH_ABBR[d.getMonth()];
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} ${month} ${d.getFullYear()}, ${time}`;
}

/** Date only, e.g. "19 Jul 2026" (for date-precise values with no time). */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}
