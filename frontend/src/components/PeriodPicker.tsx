import { useEffect, useRef, useState } from "react";

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface Props {
  year: string; // "" = all years
  month: string; // "" = all months (1-12 otherwise)
  yearOptions: number[];
  onChange: (year: string, month: string) => void;
}

/** Compact period filter: a single button opens a panel with year tabs and a
 *  3-column month grid (All on top), instead of two long native dropdowns. */
export default function PeriodPicker({ year, month, yearOptions, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = !year
    ? "All time"
    : month
      ? `${MONTHS_SHORT[Number(month) - 1]} ${year}`
      : `All ${year}`;

  function pickYear(y: string) {
    // Clearing the year clears the month too (a month needs a year).
    onChange(y, y ? month : "");
  }

  return (
    <div className="period-picker" ref={wrapRef}>
      <label className="period-caption" htmlFor="period-trigger">Period</label>
      <button
        id="period-trigger"
        type="button"
        className={`period-trigger ${year ? "has-value" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span>{label}</span>
        <svg className="period-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="period-panel" role="dialog" aria-label="Choose a period">
          <div className="period-section-label">Year</div>
          <div className="period-years">
            <button
              type="button"
              className={`period-year ${!year ? "on" : ""}`}
              onClick={() => pickYear("")}
            >
              All
            </button>
            {yearOptions.map((y) => (
              <button
                key={y}
                type="button"
                className={`period-year ${String(y) === year ? "on" : ""}`}
                onClick={() => pickYear(String(y))}
              >
                {y}
              </button>
            ))}
          </div>

          <div className="period-section-label">Month</div>
          <button
            type="button"
            className={`period-month period-month-all ${year && !month ? "on" : ""}`}
            disabled={!year}
            onClick={() => onChange(year, "")}
          >
            All months
          </button>
          <div className="period-months">
            {MONTHS_SHORT.map((m, i) => (
              <button
                key={m}
                type="button"
                className={`period-month ${month === String(i + 1) ? "on" : ""}`}
                disabled={!year}
                onClick={() => {
                  onChange(year, String(i + 1));
                  setOpen(false);
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
