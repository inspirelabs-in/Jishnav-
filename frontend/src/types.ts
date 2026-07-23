export interface Merchant {
  merchant_id: number;
  merchant_name: string;
  breadcrumb1: number;
  breadcrumb1_name: string | null;
  breadcrumb2: number;
  breadcrumb2_name: string | null;
  affiliate_id: number;
  affiliate_name: string | null;
  url: string | null;
  reporting: string | null;
  payout: string | null;
  deal_type: string | null;
  revenue_status: string;
  owner: string | null;
}

export interface Transfer {
  id: number;
  merchant_id: number;
  merchant_name: string;
  from_handler: string | null;
  to_handler: string;
  transferred_by: string;
  transferred_at: string;
}

export interface Entry {
  id: number;
  merchant_id: number;
  merchant_name: string;
  entry_date: string;
  entry_month: number;
  entry_year: number;
  clicks: number | null;
  sales: number | null;
  cr: number | null;
  gmv: number | null;
  revenue: number | null;
  remarks: string | null;
  revenue_status: string;
  entered_by: string;
  created_at: string;
  updated_at: string | null;
  is_comeback: boolean;
  delivery_requested: boolean;
  d_clicks: number | null;
  d_sales: number | null;
  d_cr: number | null;
  d_gmv: number | null;
  d_revenue: number | null;
  delivery_filled_by: string | null;
  delivery_filled_at: string | null;
}

export interface DeliveryRequest {
  id: number;
  merchant_id: number;
  merchant_name: string;
  entry_date: string;
  entry_month: number;
  entry_year: number;
  requested_by: string;
  created_at: string;
  clicks: number | null;
  sales: number | null;
  cr: number | null;
  gmv: number | null;
  revenue: number | null;
  remarks: string | null;
  d_clicks: number | null;
  d_sales: number | null;
  d_cr: number | null;
  d_gmv: number | null;
  d_revenue: number | null;
  delivery_filled_by: string | null;
  delivery_filled_at: string | null;
  breadcrumb1_name: string | null;
  breadcrumb2_name: string | null;
  reporting: string | null;
  payout: string | null;
  deal_type: string | null;
  owner: string | null;
  url: string | null;
}

export interface StatusEvent {
  merchant_id: number;
  merchant_name: string;
  owner: string | null;
  from_status: string;
  to_status: string;
  date: string;
  changed_by: string;
}

export interface Notification {
  id: number;
  merchant_id: number;
  merchant_name: string;
  handler: string;
  message: string;
  period_label: string;
  reason: string | null;
  status: "pending" | "reason_submitted" | "approved" | "rejected" | "resolved";
  escalation_level: number;
  created_at: string;
  updated_at: string | null;
}

export interface EditLog {
  id: number;
  entry_id: number;
  merchant_id: number;
  merchant_name: string;
  edited_by: string;
  edited_at: string;
  changes: Record<string, { old: unknown; new: unknown }>;
}

/** Change to a merchant's own fields (category, reporting, payout, …). */
export interface MerchantEditLog {
  id: number;
  merchant_id: number;
  merchant_name: string;
  edited_by: string;
  edited_at: string;
  changes: Record<string, { old: unknown; new: unknown }>;
}

export interface AnalyticsPoint {
  date: string;
  clicks: number;
  sales: number;
  gmv: number;
  revenue: number;
}

export interface MetricTotals {
  clicks: number;
  sales: number;
  gmv: number;
  revenue: number;
}

export interface AnalyticsResponse {
  granularity: "day" | "month";
  series: { name: string; points: AnalyticsPoint[] }[];
  totals: MetricTotals;
  prev_totals: MetricTotals | null;
  merchants_included: string[];
  averaged_over?: number | null;
}

export type Metric = "clicks" | "sales" | "gmv" | "revenue";

/* ---------------------------------------------------------------------------
 * THE METRIC PALETTE — the app's colour vocabulary.
 *
 * A metric always wears the same hue, everywhere: the conversion spine, the
 * chart series, the column header dot, the filter chip, the in-cell bar and
 * the entry-form field. Colour means "which measure is this", never decoration.
 * These are mid-lightness hues chosen to hold up on BOTH the dark and light
 * ground (they mirror --m-* in tokens.css).
 * ------------------------------------------------------------------------- */
export const METRICS: { key: Metric; label: string; color: string }[] = [
  { key: "clicks", label: "Clicks", color: "#3D8BF5" },
  { key: "sales", label: "Sales", color: "#17B978" },
  { key: "gmv", label: "GMV", color: "#E08C0C" },
  { key: "revenue", label: "Revenue", color: "#8B6BF0" },
];

// CR is a ratio, not a magnitude — pink keeps it distinct from every total.
export const CR_COLOR = "#EE5C97";

// -------------------------------------------------- portfolio overview ----
export type OverviewMetric = "clicks" | "sales" | "cr" | "gmv" | "revenue";
export type MetricKind = "count" | "pct" | "money";

/** The overview KPIs/lines, including CR (a rate, formatted as a percentage). */
export const OVERVIEW_METRICS: {
  key: OverviewMetric;
  label: string;
  color: string;
  kind: MetricKind;
}[] = [
  { key: "clicks", label: "Clicks", color: "#3D8BF5", kind: "count" },
  { key: "sales", label: "Sales", color: "#17B978", kind: "count" },
  { key: "cr", label: "CR %", color: CR_COLOR, kind: "pct" },
  { key: "gmv", label: "GMV", color: "#E08C0C", kind: "money" },
  { key: "revenue", label: "Revenue", color: "#8B6BF0", kind: "money" },
];

export interface OverviewCell {
  clicks: number;
  sales: number;
  cr: number;
  gmv: number;
  revenue: number;
}
export interface OverviewMonthAgg extends OverviewCell {
  month: string; // "YYYY-MM"
}
export interface OverviewMerchantRow {
  merchant: string;
  months: Record<string, OverviewCell | undefined>; // keyed by "YYYY-MM"
}
export interface OverviewResponse {
  months: string[]; // completed months, oldest -> newest
  aggregate: OverviewMonthAgg[];
  totals: OverviewCell;
  prev_totals: OverviewCell | null;
  by_merchant: OverviewMerchantRow[];
}

// Chart chrome (SVG presentation attrs can't resolve CSS vars). Alpha-based
// neutrals so the same values read correctly on the dark AND light ground.
export const CHART_CHROME = {
  grid: "rgba(128,140,165,0.16)",
  axis: "rgba(128,140,165,0.28)",
  tick: "#8A93A8",
  cursor: "rgba(128,140,165,0.26)",
};

export const HANDLERS = ["Swati", "Yamini", "Meena"];
export const MANAGER = "Manager";
export const FOUNDERS = "Founders Office";
export const DELIVERY = "Delivery";
export const SALES_TEAM = ["Sales1", "Sales2"];
export const USERS = [...HANDLERS, MANAGER, FOUNDERS, DELIVERY, ...SALES_TEAM];

/** Friendly display names for otherwise codename-y accounts. The stored id
 *  stays the same (e.g. "Sales1"); only what humans see changes. */
export const USER_LABELS: Record<string, string> = {
  Sales1: "Pravallika",
};
export function userLabel(user: string | null | undefined): string {
  if (!user) return user ?? "";
  return USER_LABELS[user] ?? user;
}

/** Manager and Founders Office can see everyone's data and reassign brands. */
export function isPrivileged(user: string): boolean {
  return user === MANAGER || user === FOUNDERS;
}
export function isHandler(user: string): boolean {
  return HANDLERS.includes(user);
}
export function isDelivery(user: string): boolean {
  return user === DELIVERY;
}

/** Stable colour per handler, used for avatars and transfer visuals. */
export const HANDLER_COLORS: Record<string, string> = {
  Swati: "#3D8BF5",
  Yamini: "#8B6BF0",
  Meena: "#17B978",
};
export function handlerColor(name: string | null | undefined): string {
  return (name && HANDLER_COLORS[name]) || "#8A93A8";
}

// -------------------------------------------------- sales pipeline ----
export function isSales(user: string): boolean {
  return SALES_TEAM.includes(user);
}

/* Stage colour is a real taxonomy: it warms as a lead moves down the pipeline,
 * from cold blue (new) through violet and amber to the lime of a close. */
export const SALES_STAGES: { key: string; label: string; color: string }[] = [
  { key: "new_lead", label: "New lead", color: "#3D8BF5" },
  { key: "contacted", label: "Contacted", color: "#8B6BF0" },
  { key: "no_response", label: "No response", color: "#8A93A8" },
  { key: "responded", label: "Responded", color: "#12B5A5" },
  { key: "negotiating", label: "Negotiating", color: "#E08C0C" },
  { key: "closed_won", label: "Closed", color: "#7EAE12" },
  { key: "closed_lost", label: "Declined", color: "#E8484B" },
  { key: "parked", label: "Parked", color: "#79839B" },
];

export const SALES_PRIORITIES: { key: string; label: string; color: string }[] = [
  { key: "hot", label: "Hot", color: "#E8484B" },
  { key: "warm", label: "Warm", color: "#E08C0C" },
  { key: "cold", label: "Cold", color: "#3D8BF5" },
];

export const ACTIVITY_TYPES: { key: string; label: string; color: string }[] = [
  { key: "call", label: "Call", color: "#8B6BF0" },
  { key: "email_sent", label: "Email sent", color: "#3D8BF5" },
  { key: "reply_received", label: "Reply received", color: "#12B5A5" },
  { key: "meeting", label: "Meeting", color: "#E08C0C" },
  { key: "whatsapp", label: "WhatsApp", color: "#17B978" },
  { key: "note", label: "Note", color: "#79839B" },
];

export interface SalesLead {
  id: number;
  brand_name: string;
  category: string | null;
  website: string | null;
  source: string | null;
  poc1_name: string | null;
  poc1_email: string | null;
  poc1_phone: string | null;
  poc1_designation: string | null;
  poc2_name: string | null;
  poc2_email: string | null;
  poc2_phone: string | null;
  poc2_designation: string | null;
  stage: string;
  priority: string;
  assigned_to: string;
  last_contact_date: string | null;
  next_followup: string | null;
  touchpoints: number;
  created_at: string;
  updated_at: string | null;
}

export interface SalesActivity {
  id: number;
  lead_id: number;
  activity_type: string;
  activity_date: string;
  summary: string | null;
  outcome: string | null;
  next_action: string | null;
  logged_by: string;
  created_at: string;
}

export const REPORTING_OPTIONS = [
  "Live daily",
  "2/week",
  "3/week",
  "Weekly",
  "Monthly",
  "60 days",
  "90 days",
];

export const DEAL_TYPES = ["Coupon based", "Link based", "Coupon and Link based"];
