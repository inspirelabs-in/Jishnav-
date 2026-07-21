const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface Props {
  month: number; // 1-12
  year: number;
  years: number[];
  onChange: (month: number, year: number) => void;
  ariaLabel?: string;
  /** Tighter styling for use inside a table cell. */
  compact?: boolean;
}

/** Month + Year selection for data entry. Data is kept by month only, so there
 *  is deliberately no day picker anywhere entries are created or edited. */
export default function MonthYearPicker({ month, year, years, onChange, ariaLabel, compact }: Props) {
  return (
    <span className={`my-picker ${compact ? "my-picker-compact" : ""}`}>
      <select
        className="my-month"
        aria-label={ariaLabel ? `${ariaLabel} month` : "Month"}
        value={month}
        onChange={(e) => onChange(Number(e.target.value), year)}
      >
        {MONTHS_SHORT.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <select
        className="my-year"
        aria-label={ariaLabel ? `${ariaLabel} year` : "Year"}
        value={year}
        onChange={(e) => onChange(month, Number(e.target.value))}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </span>
  );
}
