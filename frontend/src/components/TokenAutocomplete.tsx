import { useEffect, useId, useMemo, useRef, useState } from "react";

interface Props {
  label?: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  single?: boolean;
  /** Shown when the user types a second value while in single mode. */
  multiHint?: string;
}

/** Autocomplete that works as single-select (input shows the value) or
 *  multi-select (selected values become removable chips INSIDE the field).
 *  Full combobox keyboard support: arrows to highlight, Enter to pick,
 *  Escape to close, Backspace on an empty query removes the last chip. */
export default function TokenAutocomplete({
  label,
  options,
  selected,
  onChange,
  placeholder,
  single = false,
  multiHint,
}: Props) {
  const [query, setQuery] = useState(single ? selected[0] ?? "" : "");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  // When the compare toggle flips, reset the typed text: switching to compare
  // turns the picked value into a chip (clear the box), switching back to single
  // shows the remaining value as text. Prevents "[Myntra x] myntra" duplication.
  useEffect(() => {
    setQuery(single ? selected[0] ?? "" : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [single]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((o) => !selected.includes(o))
      .filter((o) => !q || o.toLowerCase().includes(q))
      .slice(0, 8);
  }, [options, selected, query]);

  const showHint =
    !!multiHint && single && selected.length === 1 && query.trim() !== "" &&
    query !== selected[0];

  function pick(option: string) {
    if (single) {
      onChange([option]);
      setQuery(option);
    } else {
      onChange([...selected, option]);
      setQuery("");
    }
    setOpen(false);
    setHi(0);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHi((h) => (h + 1) % Math.max(matches.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => (h - 1 + Math.max(matches.length, 1)) % Math.max(matches.length, 1));
    } else if (e.key === "Enter") {
      if (open && matches[hi]) {
        e.preventDefault();
        pick(matches[hi]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "Backspace" && !single && query === "" && selected.length > 0) {
      onChange(selected.slice(0, -1));
    }
  }

  const dropdownOpen = open && matches.length > 0;

  return (
    <div className="field grow">
      {label && <label className="req" htmlFor={`${listId}-input`}>{label}</label>}
      <div className="token-wrap">
        <div
          className="token-field"
          onClick={() => inputRef.current?.focus()}
        >
          {!single &&
            selected.map((s) => (
              <span key={s} className="token-chip">
                {s}
                <button
                  type="button"
                  aria-label={`Remove ${s}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onChange(selected.filter((x) => x !== s));
                  }}
                >
                  <span aria-hidden="true">&#10005;</span>
                </button>
              </span>
            ))}
          <input
            ref={inputRef}
            id={`${listId}-input`}
            role="combobox"
            aria-expanded={dropdownOpen}
            aria-controls={`${listId}-list`}
            aria-autocomplete="list"
            aria-activedescendant={dropdownOpen ? `${listId}-opt-${hi}` : undefined}
            placeholder={selected.length === 0 || single ? placeholder : ""}
            value={query}
            onChange={(e) => {
              // In single mode the current pick stays until a new one is
              // chosen, so the compare hint can react to a second brand.
              setQuery(e.target.value);
              setOpen(true);
              setHi(0);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 180)}
            onKeyDown={onKeyDown}
          />
        </div>
        {dropdownOpen && (
          <ul className="ac-dropdown" role="listbox" id={`${listId}-list`}>
            {matches.map((o, i) => (
              <li
                key={o}
                id={`${listId}-opt-${i}`}
                role="option"
                aria-selected={i === hi}
                className={`ac-option ${i === hi ? "hl" : ""}`}
                onMouseDown={() => pick(o)}
                onMouseEnter={() => setHi(i)}
              >
                {o}
              </li>
            ))}
          </ul>
        )}
      </div>
      {showHint && <p className="field-hint">{multiHint}</p>}
    </div>
  );
}
