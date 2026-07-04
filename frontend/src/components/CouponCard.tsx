import { useState, useRef, useCallback, useEffect } from "react";
import { Coupon } from "../types";

interface Props {
  coupons: Coupon[];
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

/**
 * No individual cards -- one consolidated "manifest" panel holding every
 * pick as a row, separated by hairline dashed dividers (the dividers alone
 * carry the ticket-tear-off motif; no per-item box/shadow/border needed).
 * Reads as one AI-assembled readout, not a grid of app widgets.
 */
export function CouponManifest({ coupons, isDark }: Props) {
  const panelBg     = isDark ? "bg-[#141416] border-[#262629]" : "bg-white border-[#E4E2DD]";
  const dividerCol  = isDark ? "border-[#262629]" : "border-[#E4E2DD]";

  return (
    <div className={`rounded-2xl border overflow-hidden ${panelBg}`}>
      {coupons.map((c, i) => (
        <ManifestRow
          key={c.couponId}
          coupon={c}
          isDark={isDark}
          bordered={i < coupons.length - 1}
          dividerCol={dividerCol}
          index={i}
        />
      ))}
    </div>
  );
}

function ManifestRow({
  coupon, isDark, bordered, dividerCol, index,
}: {
  coupon: Coupon; isDark: boolean; bordered: boolean; dividerCol: string; index: number;
}) {
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

  return (
    <div
      className={`row-zoom-in flex items-center gap-3 px-4 py-3.5 ${bordered ? `border-b border-dashed ${dividerCol}` : ""}`}
      style={{ animationDelay: `${index * 140}ms` }}
    >
      {/* Item name */}
      <div className="flex items-center gap-2 shrink-0 min-w-[84px] max-w-[38%]">
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--brand)" }} />
        <span className="text-[12px] font-bold uppercase tracking-[0.12em] font-mono truncate" style={{ color: "var(--brand)" }}>
          {coupon.storeName}
        </span>
      </div>

      {/* Code stub: sealed / revealing / revealed */}
      <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
        {hasCode ? (
          state === "revealed" ? (
            <>
              <span
                className="stamp-in shrink-0 flex items-center justify-center w-6 h-6 rounded-full border-2"
                style={{ borderColor: "var(--gold)", color: "var(--gold)", transform: "rotate(-10deg)" }}
                title="Redeemed"
              >
                <CheckIcon />
              </span>
              <code
                className="font-mono font-extrabold tracking-[0.16em] text-[12px] px-3 py-1.5 rounded-lg border border-dashed truncate"
                style={{ color: "var(--gold-deep)", borderColor: "var(--gold)" }}
              >
                {coupon.couponCode.toUpperCase()}
              </code>
              <button
                ref={buttonRef}
                onClick={handleCopy}
                className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-lg border-none cursor-pointer transition-all font-mono"
                style={{
                  background: copied ? "var(--success)" : "var(--brand)",
                  color: copied ? "#fff" : "var(--brand-ink)",
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </>
          ) : (
            <button
              onClick={handleReveal}
              disabled={state === "revealing"}
              className="relative flex items-center gap-2 rounded-lg px-1"
              style={{ cursor: state === "revealing" ? "default" : "pointer" }}
            >
              {state === "revealing" && <span className="unlock-flash" />}
              <code
                className={`font-mono font-extrabold tracking-[0.18em] text-[12px] px-3 py-1.5 rounded-lg ${state === "sealed" ? "redacted-strip" : ""}`}
                style={{ color: state === "revealing" ? "var(--gold)" : (isDark ? "#5a5a60" : "#b9b5aa") }}
              >
                {state === "revealing" ? coupon.couponCode.toUpperCase() : maskCode(coupon.couponCode)}
              </code>
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
            className="text-[12px] font-bold px-3 py-1.5 rounded-lg transition-colors font-mono"
            style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
          >
            Visit Deal →
          </a>
        )}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
