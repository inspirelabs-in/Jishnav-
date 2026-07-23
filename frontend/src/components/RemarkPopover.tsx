import { useEffect, useRef, useState } from "react";

interface Anchor {
  x: number;
  y: number;
  width: number;
  openUp: boolean;
}

/** Truncated remarks cell: click to read the full note in a floating card
 *  that pins open from the cell like a note tacked to the ledger, and
 *  un-pins on close. Read-only; editing still only happens via row Edit. */
export default function RemarkCell({ text }: { text: string | null }) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [closing, setClosing] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number>();

  const isEmpty = !text;
  // Rough fit for the fixed-width cell at this font/size; longer needs the popover.
  const truncated = !isEmpty && text!.length > 26;

  function open() {
    const r = btnRef.current!.getBoundingClientRect();
    window.clearTimeout(closeTimer.current);
    setClosing(false);
    setAnchor({
      x: r.left,
      y: r.bottom,
      width: Math.max(r.width, 220),
      openUp: r.bottom > window.innerHeight - 160,
    });
  }

  function close() {
    setClosing(true);
    closeTimer.current = window.setTimeout(() => setAnchor(null), 200);
  }

  useEffect(() => {
    if (!anchor || closing) return;
    const onDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".remark-popover, .remark-cell")) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [anchor, closing]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  if (isEmpty) return <span className="muted">-</span>;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`remark-cell ${truncated ? "is-truncated" : ""}`}
        onClick={truncated ? (anchor ? close : open) : undefined}
        data-tip={truncated ? "Click to read the full remark" : undefined}
      >
        {text}
      </button>
      {anchor && (
        <div
          className={`remark-popover ${closing ? "leaving" : ""} ${anchor.openUp ? "open-up" : ""}`}
          style={{
            left: Math.min(anchor.x, window.innerWidth - 300),
            top: anchor.openUp ? undefined : anchor.y + 6,
            bottom: anchor.openUp ? window.innerHeight - anchor.y + 6 : undefined,
          }}
          role="dialog"
          aria-label="Full remark"
        >
          <span className="remark-pin" aria-hidden="true" />
          <p>{text}</p>
        </div>
      )}
    </>
  );
}
