/** Plain-English "how often to update this merchant", shown on hover. */
const REPORTING_HINT: Record<string, string> = {
  "Live daily": "Update this merchant every day",
  "3/week": "Update this merchant three times a week",
  "2/week": "Update this merchant twice a week",
  Weekly: "Update this merchant once a week",
  Monthly: "Update this merchant once a month",
  "60 days": "Update this merchant every 60 days",
  "90 days": "Update this merchant every 90 days",
};

/** Reporting frequency as a plain labelled value (hover for the meaning). */
export function ReportingBadge({ reporting }: { reporting: string | null | undefined }) {
  if (!reporting) return <b>-</b>;
  return (
    <b className="reporting-badge" data-tip={REPORTING_HINT[reporting] ?? reporting} aria-label={REPORTING_HINT[reporting] ?? reporting}>
      {reporting}
    </b>
  );
}

import { handlerColor } from "../types";

/** Round initial badge tinted to the handler's stable colour. */
export function HandlerAvatar({
  name,
  size = 24,
}: {
  name: string | null | undefined;
  size?: number;
}) {
  const color = handlerColor(name);
  return (
    <span
      className="handler-avatar"
      style={{
        width: size,
        height: size,
        background: `${color}1f`,
        // the hue as text on its own pale tint fails AA at these sizes, so the
        // initial is darkened toward ink while the tint keeps the identity
        color: `color-mix(in oklab, ${color} 52%, #000)`,
        fontSize: Math.round(size * 0.42),
      }}
      data-tip={name ?? "Unassigned"}
      aria-label={name ?? "Unassigned"}
    >
      {(name ?? "?")[0]}
    </span>
  );
}

/** "Showing the latest N of M" hint, rendered under a capped list. */
export function MoreNote({ shown, total, noun = "items" }: { shown: number; total: number; noun?: string }) {
  if (total <= shown) return null;
  return (
    <p className="more-note">
      Showing the latest {shown} of {total} {noun}. Search or filter above to find the rest.
    </p>
  );
}

/** Paginator — shows "Page X of Y" with prev/next buttons. */
export function Pagination({
  page,
  total,
  perPage = 10,
  noun = "items",
  onChange,
}: {
  page: number;
  total: number;
  perPage?: number;
  noun?: string;
  onChange: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / perPage));
  if (total <= perPage) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(page * perPage, total);
  return (
    <div className="paginator">
      <span className="paginator-info">
        {from}–{to} of {total} {noun}
      </span>
      <button
        className="paginator-btn"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        aria-label="Previous page"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <span className="paginator-page">Page {page} of {pages}</span>
      <button
        className="paginator-btn"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        aria-label="Next page"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
    </div>
  );
}

export function ExternalLinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <path d="M15 3h6v6" />
      <path d="M10 14L21 3" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
