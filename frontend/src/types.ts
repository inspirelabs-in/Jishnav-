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
  user: string;
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

export const METRICS: { key: Metric; label: string; color: string }[] = [
  { key: "clicks", label: "Clicks", color: "#2E7DE0" },
  { key: "sales", label: "Sales", color: "#188952" },
  { key: "gmv", label: "GMV", color: "#D97706" },
  { key: "revenue", label: "Revenue", color: "#8B4FC9" },
];

// CR gets its own color so it never collides with Revenue's purple.
export const CR_COLOR = "#0891B2";

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
  { key: "clicks", label: "Clicks", color: "#2E7DE0", kind: "count" },
  { key: "sales", label: "Sales", color: "#188952", kind: "count" },
  { key: "cr", label: "CR %", color: CR_COLOR, kind: "pct" },
  { key: "gmv", label: "GMV", color: "#D97706", kind: "money" },
  { key: "revenue", label: "Revenue", color: "#8B4FC9", kind: "money" },
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

// Chart chrome constants (SVG presentation attrs can't resolve CSS vars).
// Values mirror styles.css tokens: tick = --ink-3, grid/axis/cursor = rules.
export const CHART_CHROME = {
  grid: "#eef1f5",
  axis: "#e4e7ec",
  tick: "#667085",
  cursor: "#c6cdd9",
};

export const HANDLERS = ["Swati", "Yamini", "Meena"];
export const MANAGER = "Manager";
export const FOUNDERS = "Founders Office";
export const DELIVERY = "Delivery";
export const USERS = [...HANDLERS, MANAGER, FOUNDERS, DELIVERY];

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
  Swati: "#2E7DE0",
  Yamini: "#8B4FC9",
  Meena: "#188952",
};
export function handlerColor(name: string | null | undefined): string {
  return (name && HANDLER_COLORS[name]) || "#667085";
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
