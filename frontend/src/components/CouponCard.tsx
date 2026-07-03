import { useState, useRef, useCallback, useEffect } from "react";
import { Coupon } from "../types";

interface Props {
  coupon: Coupon;
  isDark: boolean;
}

const CONFETTI_COLORS = ["#D2E600", "#E8A33D", "#3FB67F", "#EDEDEC", "#C97F1E"];

function useConfetti() {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const burst = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;";
    document.body.appendChild(overlay);

    const particles = Array.from({ length: 24 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 6;
      const w = 5 + Math.random() * 5;
      return {
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        r: Math.random() * 360,
        rs: (Math.random() - 0.5) * 14,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        w, h: w * 0.45,
        life: 0, maxLife: 45 + Math.random() * 25,
      };
    });

    const nodes = particles.map(p => {
      const el = document.createElement("div");
      el.style.cssText = `position:absolute;left:0;top:0;border-radius:1px;width:${p.w}px;height:${p.h}px;background:${p.color};will-change:transform,opacity;`;
      overlay.appendChild(el);
      return el;
    });

    let rafId: number;
    const tick = () => {
      let alive = false;
      particles.forEach((p, i) => {
        if (p.life >= p.maxLife) return;
        alive = true;
        p.x += p.vx; p.y += p.vy;
        p.vy += 0.25; p.vx *= 0.97; p.r += p.rs; p.life++;
        nodes[i].style.transform = `translate(${p.x}px,${p.y}px) rotate(${p.r}deg)`;
        nodes[i].style.opacity = String(1 - p.life / p.maxLife);
      });
      if (alive) rafId = requestAnimationFrame(tick);
      else overlay.remove();
    };
    rafId = requestAnimationFrame(tick);
  }, []);

  return { buttonRef, burst };
}

/** Mask all but the last 2 characters of a code, e.g. MYNTRA300 -> •••••••00 */
function maskCode(code: string): string {
  const upper = code.toUpperCase();
  if (upper.length <= 2) return upper;
  return "•".repeat(upper.length - 2) + upper.slice(-2);
}

type RevealState = "sealed" | "revealing" | "revealed";

export function CouponCard({ coupon, isDark }: Props) {
  const [state, setState]   = useState<RevealState>("sealed");
  const [copied, setCopied] = useState(false);
  const { buttonRef, burst } = useConfetti();
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (revealTimer.current) clearTimeout(revealTimer.current); }, []);

  const hasCode = coupon.couponCode && coupon.couponCode.trim() !== "";

  const handleReveal = () => {
    if (state !== "sealed" || !hasCode) return;
    setState("revealing");
    revealTimer.current = setTimeout(() => {
      if (coupon.couponUrl) {
        window.open(coupon.couponUrl, "_blank", "noopener,noreferrer");
      }
      setState("revealed");
    }, 1000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(coupon.couponCode).then(() => {
      burst();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const cardBase = isDark ? "bg-[#141416] border-[#262629]" : "bg-white border-[#E4E2DD]";
  const divider  = isDark ? "border-[#262629]" : "border-[#E4E2DD]";
  const stubBg   = isDark ? "bg-[#0B0B0C]" : "bg-[#F7F6F3]";

  return (
    <div className={`coupon-card-outer card-resolve relative border rounded-2xl p-3.5 w-full overflow-hidden flex flex-col ${cardBase}`}>

      {/* Redeemed stamp — sits inside the card's own bounds, top corner is clipped by overflow-hidden otherwise */}
      {state === "revealed" && (
        <div
          className="stamp-in absolute top-2 right-2 z-20 flex items-center justify-center w-7 h-7 rounded-full border-2 pointer-events-none"
          style={{
            borderColor: "var(--gold)",
            color: "var(--gold)",
            background: isDark ? "#141416" : "#FFFFFF",
            transform: "rotate(-10deg)",
          }}
          title="Redeemed"
        >
          <CheckIcon />
        </div>
      )}

      {/* Item name — the only text on the card besides the code itself */}
      <div className="mb-3 flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--brand)" }} />
        <span className="text-[12px] font-bold uppercase tracking-[0.14em] font-mono" style={{ color: "var(--brand)" }}>
          {coupon.storeName}
        </span>
      </div>

      <div className={`mt-auto border-t border-dashed mb-2.5 ${divider}`} />

      {/* ── Code stub: sealed / revealing / revealed ── */}
      {hasCode ? (
        state === "revealed" ? (
          <div className="relative flex items-center gap-2">
            <div className="relative flex-1 rounded-xl overflow-hidden border border-dashed" style={{ borderColor: "var(--gold)" }}>
              <code
                className={`block text-[11px] font-mono font-extrabold tracking-[0.18em] rounded-xl px-3 py-2 text-center ${isDark ? "bg-[#1C1C1F]" : "bg-[#FBF3E4]"}`}
                style={{ color: "var(--gold-deep)" }}
              >
                {coupon.couponCode.toUpperCase()}
              </code>
            </div>
            <button
              ref={buttonRef}
              onClick={handleCopy}
              className="shrink-0 text-[12px] font-bold px-4 py-2 rounded-xl border-none cursor-pointer transition-all font-mono"
              style={{
                background: copied ? "var(--success)" : "var(--brand)",
                color: copied ? "#fff" : "var(--brand-ink)",
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <button
            onClick={handleReveal}
            disabled={state === "revealing"}
            className="relative w-full flex items-center gap-2 rounded-xl border border-dashed px-3 py-2.5 group"
            style={{ borderColor: isDark ? "#3a3a3f" : "#d8d4cb", cursor: state === "revealing" ? "default" : "pointer" }}
          >
            {/* perforation notches */}
            <span className={`stub-notch -left-[7px] ${stubBg}`} />
            <span className={`stub-notch -right-[7px] ${stubBg}`} />

            {state === "revealing" && <span className="unlock-flash" />}

            <div className={`flex-1 rounded-lg px-2 py-1.5 text-center ${state === "sealed" ? "redacted-strip" : ""}`}>
              <code
                className="block text-[12px] font-mono font-extrabold tracking-[0.22em]"
                style={{ color: state === "revealing" ? "var(--gold)" : (isDark ? "#5a5a60" : "#b9b5aa") }}
              >
                {state === "revealing" ? coupon.couponCode.toUpperCase() : maskCode(coupon.couponCode)}
              </code>
            </div>

            <span
              className="shrink-0 text-[10px] font-mono font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition-colors"
              style={{
                color: state === "revealing" ? "var(--gold)" : "var(--brand-ink)",
                background: state === "revealing" ? "transparent" : "var(--brand)",
              }}
            >
              {state === "revealing" ? "Opening…" : "Reveal"}
            </span>
          </button>
        )
      ) : (
        <a
          href={coupon.couponUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-[12px] font-bold text-center px-4 py-2 rounded-xl transition-colors font-mono"
          style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
        >
          Visit Deal →
        </a>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
