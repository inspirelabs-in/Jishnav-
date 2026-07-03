import { useState, useRef, useCallback } from "react";
import { Coupon } from "../types";

interface Props {
  coupon: Coupon;
  isDark: boolean;
}

const COLORS = ["#D2E600","#ff6b6b","#4ecdc4","#45b7d1","#f9ca24","#a29bfe","#fd79a8"];

function useConfetti() {
  const buttonRef = useRef<HTMLButtonElement>(null);

  const burst = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top  + rect.height / 2;

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;";
    document.body.appendChild(overlay);

    const particles = Array.from({ length: 26 }, () => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 6;
      const w = 6 + Math.random() * 6;
      return {
        x: cx, y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 3,
        r: Math.random() * 360,
        rs: (Math.random() - 0.5) * 14,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        w, h: w * 0.45,
        life: 0, maxLife: 45 + Math.random() * 25,
      };
    });

    const nodes = particles.map(p => {
      const el = document.createElement("div");
      el.style.cssText = `position:absolute;left:0;top:0;border-radius:2px;width:${p.w}px;height:${p.h}px;background:${p.color};will-change:transform,opacity;`;
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

export function CouponCard({ coupon, isDark }: Props) {
  const [copied, setCopied] = useState(false);
  const { buttonRef, burst } = useConfetti();

  const handleCopy = () => {
    navigator.clipboard.writeText(coupon.couponCode).then(() => {
      burst();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const hasCode = coupon.couponCode && coupon.couponCode.trim() !== "";

  const cardBase  = isDark ? "bg-[#262626] border-[#333]"                   : "bg-[#fafafa] border-[#e0e0e0]";
  const nameColor = isDark ? "text-[#d4d4d4]"                                : "text-[#222]";
  const codeBg    = isDark ? "bg-[#1a1a1a] border-[#444] text-[#ececec]"    : "bg-[#f0f0f0] border-[#ccc] text-[#111]";
  const divider   = isDark ? "border-[#333]"                                 : "border-[#ddd]";
  const metaText  = isDark ? "text-[#666]"                                   : "text-[#999]";
  const metaVal   = isDark ? "text-[#aaa]"                                   : "text-[#555]";

  const urgency: Record<string, string> = isDark ? {
    expires_today: "bg-red-900/30   text-red-300   border-red-700/40",
    expires_soon : "bg-amber-900/30 text-amber-300 border-amber-700/40",
    valid        : "bg-green-900/30 text-green-300 border-green-700/40",
    no_expiry    : "bg-[#2a2a2a] text-[#666] border-[#333]",
    expired      : "bg-[#2a2a2a] text-[#555] border-[#333]",
  } : {
    expires_today: "bg-red-50   text-red-700   border-red-200",
    expires_soon : "bg-amber-50 text-amber-700 border-amber-200",
    valid        : "bg-green-50 text-green-700 border-green-200",
    no_expiry    : "bg-gray-100 text-gray-500  border-gray-200",
    expired      : "bg-gray-100 text-gray-400  border-gray-200",
  };
  const urgencyClass = urgency[coupon.validityUrgency] ?? urgency.valid;

  return (
    <div className={`coupon-card-outer relative border rounded-2xl p-3.5 w-full overflow-hidden flex flex-col ${cardBase}`}>

      {/* Top glow accent line */}
      <div className="coupon-top-glow" />

      {/* Store name only */}
      <div className="mb-2">
        <span className="text-[11px] font-extrabold text-[#D2E600] uppercase tracking-widest">
          {coupon.storeName}
        </span>
      </div>

      {/* Coupon name — max 2 lines */}
      <p className={`text-[12px] font-medium leading-snug mb-2.5 line-clamp-2 ${nameColor}`}>
        {coupon.couponName}
      </p>

      {/* Validity badge */}
      <div className={`self-start text-[10px] px-2 py-0.5 rounded-md border mb-2.5 font-semibold inline-flex items-center gap-1 ${urgencyClass}`}>
        {coupon.validityUrgency === "expires_today" && "⚡ "}
        {coupon.validityUrgency === "expires_soon"  && "⏳ "}
        {coupon.validityLabel}
      </div>

      {/* Min order / max discount */}
      {(coupon.minOrderAmount || coupon.maxDiscount) && (
        <div className={`text-[10px] mb-2.5 flex flex-wrap gap-x-3 ${metaText}`}>
          {coupon.minOrderAmount && (
            <span>Min: <span className={`font-semibold ${metaVal}`}>₹{coupon.minOrderAmount.toLocaleString("en-IN")}</span></span>
          )}
          {coupon.maxDiscount && (
            <span>Max off: <span className={`font-semibold ${metaVal}`}>₹{coupon.maxDiscount.toLocaleString("en-IN")}</span></span>
          )}
        </div>
      )}

      {/* Dashed divider — mt-auto pins code row to card bottom */}
      <div className={`mt-auto border-t border-dashed mb-2.5 ${divider}`} />

      {/* Code + Copy */}
      <div className="flex items-center gap-2">
        {hasCode ? (
          <>
            {/* Gold shimmer code pill */}
            <div className="relative flex-1 rounded-xl overflow-hidden">
              <div className="gold-shimmer-sweep" />
              <code className={`block text-[11px] font-mono font-extrabold tracking-[0.18em] border border-dashed rounded-xl px-3 py-2 text-center ${codeBg}`}>
                {coupon.couponCode.toUpperCase()}
              </code>
            </div>

            <button
              ref={buttonRef}
              onClick={handleCopy}
              className={`shrink-0 text-[12px] font-bold px-4 py-2 rounded-xl border-none cursor-pointer transition-all ${
                copied
                  ? "bg-green-500 text-white shadow-[0_2px_12px_rgba(34,197,94,0.4)]"
                  : "bg-[#D2E600] hover:bg-[#e8ff00] text-black shadow-[0_2px_10px_rgba(210,230,0,0.35)]"
              }`}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </>
        ) : (
          <a
            href={coupon.couponUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-[12px] font-bold text-center bg-[#D2E600] hover:bg-[#e8ff00] text-black px-4 py-2 rounded-xl transition-colors shadow-[0_2px_10px_rgba(210,230,0,0.30)]"
          >
            Visit Deal →
          </a>
        )}
      </div>
    </div>
  );
}
