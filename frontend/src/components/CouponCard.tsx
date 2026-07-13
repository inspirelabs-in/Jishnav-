import { useState, useRef, useEffect } from "react";
import { Coupon } from "../types";



/* ── Mask helper ── */
function maskCode(code: string) {
  const u = code.toUpperCase();
  if (u.length <= 3) return u;
  return "•".repeat(u.length - 3) + u.slice(-3);
}

/* ── Urgency badge ── */
function urgencyConfig(u: Coupon["validityUrgency"]) {
  switch (u) {
    case "expires_today": return { label: "Expires Today", color: "var(--red)", bg: "var(--red-10)", border: "rgba(220,38,38,0.2)" };
    case "expires_soon":  return { label: "Expires Soon",  color: "var(--gold)", bg: "var(--gold-10)", border: "rgba(217,119,6,0.2)" };
    default: return null;
  }
}


/* ─────────────────────────────────────────────────────────
   CouponPanel — list deal tickets
   ───────────────────────────────────────────────────────── */
interface PanelProps { coupons: Coupon[]; isDark: boolean; }

export function CouponPanel({ coupons, isDark }: PanelProps) {
  return (
    <div className="w-full max-w-2xl">
      <div className="flex flex-col gap-2.5">
        {coupons.map((c, i) => (
          <DealTicket key={c.couponId} coupon={c} isDark={isDark} index={i} />
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   DealTicket — physical coupon ticket, ultra compact
   ───────────────────────────────────────────────────────── */
type RevealState = "sealed" | "revealing" | "revealed";

function DealTicket({ coupon, isDark, index }: { coupon: Coupon; isDark: boolean; index: number }) {
  const [reveal, setReveal] = useState<RevealState>("sealed");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (reveal !== "revealing") return;

    let active = true;
    let hasLostFocus = false;

    const handleBlur = () => {
      hasLostFocus = true;
    };

    const handleFocus = () => {
      if (!active) return;
      if (hasLostFocus) {
        setReveal("revealed");
      }
    };

    const handleVisibility = () => {
      if (!active) return;
      if (document.visibilityState === "hidden") {
        hasLostFocus = true;
      } else if (document.visibilityState === "visible") {
        if (hasLostFocus) {
          setReveal("revealed");
        }
      }
    };

    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      active = false;
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [reveal]);

  const hasCode = !!(coupon.couponCode?.trim());
  const urgency = urgencyConfig(coupon.validityUrgency);


  const showDiscount = coupon.discountDisplay
    && coupon.discountDisplay.length < 30
    && !coupon.couponName.toLowerCase().includes(coupon.discountDisplay.toLowerCase().slice(0, 8));



  // Safe Copy Helper with fallbacks for non-secure contexts
  const performCopy = (text: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2200);
        }).catch(err => {
          console.warn("Secure clipboard copy failed:", err);
          fallbackCopy(text);
        });
      } else {
        fallbackCopy(text);
      }
    } catch (err) {
      console.warn("Copy crashed, executing fallback:", err);
      fallbackCopy(text);
    }
  };

  const fallbackCopy = (text: string) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand("copy");
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      document.body.removeChild(textArea);
    } catch (err) {
      console.warn("Fallback copy failed:", err);
    }
  };

  // Automatically copies the code, opens link, and reveals code
  const handleReveal = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (reveal === "revealing") {
      setReveal("revealed");
      return;
    }
    if (reveal !== "sealed" || !hasCode) return;
    
    // 1. Open link synchronously first (avoids popup blockers)
    if (coupon.couponUrl) {
      try {
        window.open(coupon.couponUrl, "_blank", "noopener,noreferrer");
      } catch (err) {
        console.warn("Popup block/failed:", err);
      }
    }

    // 2. Copy code (guaranteed to be caught if it throws)
    performCopy(coupon.couponCode);

    // 3. Set reveal state to revealing
    setReveal("revealing");
  };

  const handleCopy = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    performCopy(coupon.couponCode);
  };

  return (
    <div
      className="deal-card card-rise relative rounded-2xl border overflow-hidden"
      style={{ animationDelay: `${index * 100}ms`, background: "var(--surface)", borderColor: "var(--border)" }}
    >
      {/* Lime top accent bar */}
      <div className="h-[3px] w-full" style={{ background: "linear-gradient(90deg, var(--brand) 0%, var(--brand-dark) 100%)" }} />

      <div className="flex items-center min-h-[72px]">
        {/* ══ LEFT ZONE ══ */}
        <div className="flex-1 px-4 py-3 flex flex-col gap-1.5 min-w-0">

          {/* Store row */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              {/* Store initial */}
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-[13px] font-bold"
                style={{ background: "var(--brand-10)", color: "var(--brand-dark)", border: "1px solid var(--brand-20)", fontFamily: "GothamRnd, sans-serif" }}>
                {coupon.storeName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-bold leading-tight truncate"
                  style={{ color: "var(--text-1)", fontFamily: "GothamRnd, sans-serif", letterSpacing: "-0.01em" }}>
                  {coupon.storeName}
                </p>
              </div>
            </div>

            {/* Badges */}
            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              {urgency && (
                <span className="text-[9px] font-bold mono uppercase tracking-wider px-2 py-0.5 rounded-md"
                  style={{ color: urgency.color, background: urgency.bg, border: `1px solid ${urgency.border}` }}>
                  {urgency.label}
                </span>
              )}
              {coupon.hotOffer && (
                <span className="text-[9px] font-bold mono uppercase tracking-wider px-2 py-0.5 rounded-md"
                  style={{ color: "var(--gold)", background: "var(--gold-10)", border: "1px solid rgba(217,119,6,0.2)" }}>
                  Hot offer
                </span>
              )}
              {coupon.exclusive && (
                <span className="text-[9px] font-bold mono uppercase tracking-wider px-2 py-0.5 rounded-md"
                  style={{ color: "var(--brand-dark)", background: "var(--brand-10)", border: "1px solid var(--brand-20)" }}>
                  Exclusive
                </span>
              )}
            </div>
          </div>

          {/* Single description */}
          <p className="text-[12px] leading-snug" style={{ color: "var(--text-2)", fontFamily: "GothamRnd, sans-serif" }}>
            {coupon.couponName}
          </p>

          {/* Discount label */}
          {showDiscount && (
            <p className="text-[11px] font-bold mono"
              style={{ color: "var(--brand-dark)", letterSpacing: "0.02em" }}>
              {coupon.discountDisplay}
            </p>
          )}
        </div>

        {/* ══ PERFORATION ══ */}
        <div className="relative h-full flex items-center self-stretch">
          <div className="absolute -top-px left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full"
            style={{ background: "var(--bg)", border: "1px solid var(--border)", top: "-7px" }} />
          <div className="absolute left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full"
            style={{ background: "var(--bg)", border: "1px solid var(--border)", bottom: "-7px" }} />
          <div className="h-full w-px" style={{
            backgroundImage: "repeating-linear-gradient(to bottom, var(--border) 0, var(--border) 4px, transparent 4px, transparent 9px)"
          }} />
        </div>

        {/* ══ RIGHT ZONE: Compact single-line code combo ══ */}
        <div className="w-[192px] shrink-0 px-4 py-3 flex items-center justify-center">
          {!hasCode ? (
            /* Visit deal button */
            <a href={coupon.couponUrl} target="_blank" rel="noopener noreferrer"
              className="reveal-btn pressable w-full text-center py-2 rounded-xl text-[12px] font-bold"
              style={{ background: "var(--brand)", color: "var(--brand-ink)", fontFamily: "GothamRnd, sans-serif" }}>
              Visit Deal
            </a>
          ) : (
            /* Overlapping Button + Code combo */
            <div
              className="relative w-full h-[36px] flex items-center rounded-lg border border-dashed overflow-hidden"
              style={{
                borderColor: reveal === "revealed" ? "var(--brand-dark)" : "var(--border)",
                background: reveal === "revealed" ? "var(--brand-10)" : "var(--surface-2)",
              }}>

              {/* Coupon Code — always rendered in background, right-aligned */}
              <div
                className="absolute inset-0 flex items-center justify-end pr-3 font-mono font-bold text-[12px] tracking-[0.06em] select-none"
                style={{
                  color: "var(--brand-dark)",
                  pointerEvents: "none",
                }}>
                {coupon.couponCode.toUpperCase()}
              </div>

              {/* COPY CODE button — overlaps the code from the left */}
              {reveal !== "revealed" ? (
                <button
                  onClick={(e) => handleReveal(e)}
                  className="absolute left-0 top-0 h-full font-bold text-[10px] uppercase tracking-wider pressable rounded-lg z-10"
                  style={{
                    width: "calc(100% - 40px)",
                    background: "linear-gradient(135deg, var(--brand) 0%, var(--brand-dark) 100%)",
                    color: "var(--brand-ink)",
                    fontFamily: "GothamRnd, sans-serif",
                    boxShadow: "2px 0 6px rgba(0, 0, 0, 0.12)",
                    transition: "width 0.35s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease",
                    cursor: "pointer",
                  }}>
                  Copy Code
                </button>
              ) : (
                /* After reveal: show copy icon button on the left */
                <button
                  onClick={(e) => handleCopy(e)}
                  className="absolute left-1 top-1/2 -translate-y-1/2 flex items-center justify-center rounded-full z-10 pressable"
                  title="Copy code"
                  style={{
                    width: "28px",
                    height: "28px",
                    background: copied
                      ? "linear-gradient(135deg, #16A34A 0%, #15803d 100%)"
                      : "linear-gradient(135deg, var(--brand) 0%, var(--brand-dark) 100%)",
                    color: copied ? "#ffffff" : "var(--brand-ink)",
                    transition: "background 0.2s ease",
                    cursor: "pointer",
                  }}>
                  {copied ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
