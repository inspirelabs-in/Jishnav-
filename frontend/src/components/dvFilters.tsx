import { useEffect, useRef, useState } from "react";
import TokenAutocomplete from "./TokenAutocomplete";

export interface MY {
  m: number;
  y: number;
}

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const iso1 = (p: MY) => `${p.y}-${String(p.m).padStart(2, "0")}-01`;
export const isoLast = (p: MY) =>
  `${p.y}-${String(p.m).padStart(2, "0")}-${String(new Date(p.y, p.m, 0).getDate()).padStart(2, "0")}`;

// ------------------------------------------- one labelled filter row ----
export function FilterField({
  label,
  options,
  selected,
  onChange,
  multi = false,
  onMulti,
  toggleLabel,
  singlePlaceholder,
  multiPlaceholder,
  clearQueryOnFocus,
  showClear,
  disabled,
  disabledHint,
  all,
  onAll,
  allLabel,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  multi?: boolean;
  onMulti?: (on: boolean) => void;
  toggleLabel?: string;
  singlePlaceholder: string;
  multiPlaceholder?: string;
  clearQueryOnFocus?: boolean;
  showClear?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  all?: boolean;
  onAll?: (on: boolean) => void;
  allLabel?: string;
}) {
  const off = disabled || all;
  return (
    <div className={`dv-field ${disabled ? "dv-field-off" : ""}`}>
      <TokenAutocomplete
        label={label}
        labelRequired={false}
        options={options}
        selected={off ? [] : selected}
        onChange={onChange}
        single={!multi}
        placeholder={disabled ? disabledHint ?? "" : all ? `All ${label.toLowerCase()}s` : multi ? multiPlaceholder ?? singlePlaceholder : singlePlaceholder}
        clearQueryOnFocus={clearQueryOnFocus}
        disabled={off}
      />
      <div className="dv-toggles">
        {onMulti && (
          <label className="dv-multi">
            <button
              type="button"
              className={`toggle toggle-sm ${multi ? "" : "off"}`}
              onClick={() => onMulti(!multi)}
              role="switch"
              aria-checked={multi}
              aria-label={toggleLabel}
              disabled={off}
            />
            <span className="compare-label">{toggleLabel}</span>
          </label>
        )}
        {onAll && (
          <label className="dv-multi">
            <button
              type="button"
              className={`toggle toggle-sm ${all ? "" : "off"}`}
              onClick={() => onAll(!all)}
              role="switch"
              aria-checked={!!all}
              aria-label={allLabel}
            />
            <span className="compare-label">{allLabel}</span>
          </label>
        )}
        {showClear && (
          <button
            type="button"
            className="dv-clear"
            onClick={() => onChange([])}
            disabled={disabled || selected.length === 0}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------- single month popover ----
export function SingleMonthSelect({ value, years, onChange }: {
  value: MY; years: number[]; onChange: (v: MY) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pickYear, setPickYear] = useState(value.y);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const label = `${MONTHS_SHORT[value.m - 1]} ${value.y}`;

  return (
    <div className="rp-wrap" ref={wrapRef}>
      <button
        type="button"
        className="rp-trigger"
        onClick={() => { setOpen((o) => !o); setPickYear(value.y); }}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span>{label}</span>
        <svg className="rp-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="rp-panel" role="dialog" aria-label="Choose a month">
          <div className="rp-section-label">Year</div>
          <div className="rp-years">
            {[...years].sort((a, b) => a - b).map((y) => (
              <button key={y} type="button" className={`rp-chip ${pickYear === y ? "on" : ""}`} onClick={() => setPickYear(y)}>{y}</button>
            ))}
          </div>
          <div className="rp-section-label">Month</div>
          <div className="rp-months">
            {MONTHS_SHORT.map((m, i) => (
              <button
                key={m}
                type="button"
                className={`rp-chip rp-month ${value.y === pickYear && value.m === i + 1 ? "on" : ""}`}
                onClick={() => { onChange({ m: i + 1, y: pickYear }); setOpen(false); }}
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

// ------------------------------------------------- compact range picker ----
export function RangeSelect({ from, to, years, onFrom, onTo }: {
  from: MY; to: MY; years: number[]; onFrom: (v: MY) => void; onTo: (v: MY) => void;
}) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"from" | "to">("from");
  const [pickYear, setPickYear] = useState(() => (side === "from" ? from : to).y);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function switchSide(s: "from" | "to") {
    setSide(s);
    setPickYear((s === "from" ? from : to).y);
  }

  function pickMonth(m: number) {
    if (side === "from") {
      onFrom({ m, y: pickYear });
      setSide("to");
      setPickYear(to.y);
    } else {
      onTo({ m, y: pickYear });
      setOpen(false);
    }
  }

  const current = side === "from" ? from : to;
  const label = `${MONTHS_SHORT[from.m - 1]} ${from.y} – ${MONTHS_SHORT[to.m - 1]} ${to.y}`;

  return (
    <div className="rp-wrap" ref={wrapRef}>
      <button
        type="button"
        className="rp-trigger"
        onClick={() => { setOpen((o) => !o); setSide("from"); setPickYear(from.y); }}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
        <span>{label}</span>
        <svg className="rp-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="rp-panel" role="dialog" aria-label="Choose date range">
          <div className="rp-tabs">
            <button type="button" className={`rp-tab ${side === "from" ? "on" : ""}`} onClick={() => switchSide("from")}>
              <span className="rp-tab-label">From</span>
              <span className="rp-tab-value">{MONTHS_SHORT[from.m - 1]} {from.y}</span>
            </button>
            <span className="rp-tab-arrow" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
            <button type="button" className={`rp-tab ${side === "to" ? "on" : ""}`} onClick={() => switchSide("to")}>
              <span className="rp-tab-label">To</span>
              <span className="rp-tab-value">{MONTHS_SHORT[to.m - 1]} {to.y}</span>
            </button>
          </div>

          <div className="rp-section-label">Year</div>
          <div className="rp-years">
            {[...years].sort((a, b) => a - b).map((y) => (
              <button key={y} type="button" className={`rp-chip ${pickYear === y ? "on" : ""}`} onClick={() => setPickYear(y)}>{y}</button>
            ))}
          </div>

          <div className="rp-section-label">Month</div>
          <div className="rp-months">
            {MONTHS_SHORT.map((m, i) => (
              <button
                key={m}
                type="button"
                className={`rp-chip rp-month ${current.y === pickYear && current.m === i + 1 ? "on" : ""}`}
                onClick={() => pickMonth(i + 1)}
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
