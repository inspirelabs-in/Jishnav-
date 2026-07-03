import { useEffect, useRef } from "react";
import { Message } from "../types";
import { MessageBubble } from "./MessageBubble";
import { InputBar } from "./InputBar";
import { CouponIcon } from "./CouponIcon";

interface Props {
  messages: Message[];
  isLoading: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  isDark: boolean;
}

export function ChatWindow({ messages, isLoading, onSend, onStop, isDark }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const textColor   = isDark ? "text-[#ececec]" : "text-[#111]";
  const subtleColor = isDark ? "text-[#8e8ea0]" : "text-[#aaa]";

  /* ── Empty / welcome state ── */
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4">
        <div className="w-16 h-16 rounded-2xl bg-[#D2E600] flex items-center justify-center mb-5 shadow-md">
          <CouponIcon size={46} />
        </div>
        <h1 className={`text-[30px] font-bold mb-8 ${textColor}`} style={{ fontFamily: "'Inter', sans-serif", letterSpacing: "-0.02em" }}>
          GrabGPT
        </h1>
        <div className="w-full max-w-2xl">
          <InputBar onSend={onSend} onStop={onStop} isLoading={isLoading} isDark={isDark} />
        </div>
      </div>
    );
  }

  /* ── Chat state ── */
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {messages.map(m => (
            <MessageBubble key={m.id} message={m} isDark={isDark} />
          ))}

          {/* ── Loading indicator — Card Dispenser ── */}
          {messages[messages.length - 1]?.isStreaming &&
           !messages[messages.length - 1]?.content && (
            <div className="flex gap-3 py-3 items-center" style={{ overflow: "visible" }}>
              <CometRing />
              <CardDispenser />
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input pinned at bottom */}
      <div className="shrink-0 px-6 pb-4 pt-2">
        <div className="max-w-3xl mx-auto">
          <InputBar onSend={onSend} onStop={onStop} isLoading={isLoading} isDark={isDark} />
        </div>
      </div>
    </div>
  );
}

/**
 * Premium comet ring animation around the logo.
 *
 * Three SVG arc segments (far tail → mid → near-head) create a smooth
 * gradient-like fade. A soft bloom + sharp head dot sit at 12 o'clock.
 * The whole SVG container spins at 1 rev/s; the logo is a stationary sibling.
 * Uses explicit arc path math (no dashoffset tricks) for cross-browser reliability.
 */
function CometRing() {
  const S = 40;
  const cx = 20, cy = 20, r = 20;

  // Point on orbit at `deg` degrees clockwise from 12 o'clock
  const pt = (deg: number) => ({
    x: +(cx + r * Math.sin((deg * Math.PI) / 180)).toFixed(3),
    y: +(cy - r * Math.cos((deg * Math.PI) / 180)).toFixed(3),
  });

  // SVG arc path from `fromDeg` to 0° (12 o'clock = head), always CW
  const head = pt(0); // (20, 0) — top of orbit
  const cometArc = (fromDeg: number) => {
    const s = pt(fromDeg);
    const span = ((0 - fromDeg) % 360 + 360) % 360;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${head.x} ${head.y}`;
  };

  return (
    <div className="shrink-0 relative w-8 h-8" style={{ overflow: "visible" }}>
      {/* Spinning comet — SVG arcs + head dot, all rotate together */}
      <div
        className="absolute animate-spin pointer-events-none"
        style={{
          top: -4, left: -4, width: S, height: S,
          animationDuration: "1s",
          animationTimingFunction: "linear",
          overflow: "visible",
        }}
      >
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`} style={{ overflow: "visible" }}>
          <defs>
            {/* Glow: blur layer merged with sharp original */}
            <filter id="gg-glow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* Bloom: soft wide blur only — no sharp layer */}
            <filter id="gg-bloom" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
            </filter>
          </defs>

          {/* Ghost orbit track */}
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(210,230,0,0.06)" strokeWidth="1" />

          {/* Far tail — ~100° arc, barely visible */}
          <path
            d={cometArc(260)}
            fill="none" stroke="#D2E600"
            strokeWidth="1.5" strokeLinecap="butt"
            opacity={0.07}
          />

          {/* Mid tail — ~60° arc */}
          <path
            d={cometArc(300)}
            fill="none" stroke="#D2E600"
            strokeWidth="2" strokeLinecap="butt"
            opacity={0.26}
          />

          {/* Near-head arc — ~28°, bright + glowing */}
          <path
            d={cometArc(332)}
            fill="none" stroke="#D2E600"
            strokeWidth="2.5" strokeLinecap="round"
            opacity={0.88}
            filter="url(#gg-glow)"
          />

          {/* Soft light bloom around head */}
          <circle cx={head.x} cy={head.y} r={7} fill="#D2E600" opacity={0.20} filter="url(#gg-bloom)" />

          {/* Sharp bright head dot */}
          <circle cx={head.x} cy={head.y} r={2.8} fill="#D2E600" filter="url(#gg-glow)" />
        </svg>
      </div>

      {/* Logo — completely stationary, above comet layers */}
      <div className="absolute inset-0 rounded-full bg-[#D2E600] flex items-center justify-center z-10">
        <CouponIcon size={16} />
      </div>
    </div>
  );
}

function CardDispenser() {
  const items = [
    { type: "card",   delay: 0,    yOff: -5,  size: 30 },
    { type: "ticket", delay: 380,  yOff: 6,   size: 26 },
    { type: "card",   delay: 760,  yOff: -10, size: 22 },
    { type: "ticket", delay: 1140, yOff: 4,   size: 24 },
    { type: "card",   delay: 1520, yOff: -7,  size: 18 },
  ];

  return (
    <div style={{ position: "relative", width: 260, height: 44, overflow: "visible", flexShrink: 0 }}>
      <div className="dispenser-trail" />

      {items.map((item, i) => (
        <div
          key={i}
          className="dispenser-item"
          style={{
            animationDelay: `${item.delay}ms`,
            top: `calc(50% + ${item.yOff}px)`,
            width: item.size,
            height: Math.round(item.size * 0.5),
          }}
        >
          {/* Face — visible during flight, hidden before scatter */}
          <div className="dispenser-face" style={{ animationDelay: `${item.delay}ms` }}>
            {item.type === "card" ? <CouponSVG /> : <VoucherSVG />}
          </div>

          {/* 12 glowing particle dots that scatter radially on dissolve */}
          {Array.from({ length: 12 }, (_, p) => (
            <div
              key={p}
              className={`dispenser-particle dispenser-particle-${p}`}
              style={{ animationDelay: `${item.delay}ms` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* Coupon with semicircle notches on left + right sides, % symbol */
function CouponSVG() {
  return (
    <svg viewBox="0 0 44 22" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      <defs>
        <filter id="cv-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Coupon body: rounded corners + outward semicircle notches on L and R sides */}
      <path
        d="M4 1 H40 Q43 1 43 4 V9 A2.5 2.5 0 0 1 43 13 V18 Q43 21 40 21 H4 Q1 21 1 18 V13 A2.5 2.5 0 0 1 1 9 V4 Q1 1 4 1 Z"
        fill="rgba(210,230,0,0.08)"
        stroke="#D2E600" strokeWidth="1.1"
        filter="url(#cv-glow)"
      />
      {/* Perforated divider — vertical dashes */}
      <line x1="15" y1="2" x2="15" y2="20" stroke="#D2E600" strokeWidth="0.6" strokeDasharray="1.5 1.5" opacity="0.55" />
      {/* Big % in right (main) area */}
      <text x="29" y="15.5" fontSize="10" fill="#D2E600" opacity="0.95"
        fontWeight="bold" fontFamily="monospace" textAnchor="middle">%</text>
      {/* Stub lines in left area */}
      <line x1="3" y1="8"  x2="12" y2="8"  stroke="#D2E600" strokeWidth="0.5" opacity="0.40" />
      <line x1="3" y1="11" x2="12" y2="11" stroke="#D2E600" strokeWidth="0.5" opacity="0.30" />
      <line x1="3" y1="14" x2="12" y2="14" stroke="#D2E600" strokeWidth="0.5" opacity="0.22" />
    </svg>
  );
}

/* Voucher-style coupon with ₹ symbol */
function VoucherSVG() {
  return (
    <svg viewBox="0 0 44 22" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: "100%", height: "100%" }}>
      <defs>
        <filter id="vc-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.8" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Same coupon body shape */}
      <path
        d="M4 1 H40 Q43 1 43 4 V9 A2.5 2.5 0 0 1 43 13 V18 Q43 21 40 21 H4 Q1 21 1 18 V13 A2.5 2.5 0 0 1 1 9 V4 Q1 1 4 1 Z"
        fill="rgba(210,230,0,0.08)"
        stroke="#D2E600" strokeWidth="1.1"
        filter="url(#vc-glow)"
      />
      {/* Perforated divider */}
      <line x1="15" y1="2" x2="15" y2="20" stroke="#D2E600" strokeWidth="0.6" strokeDasharray="1.5 1.5" opacity="0.55" />
      {/* ₹ symbol in right area */}
      <text x="29" y="15.5" fontSize="9" fill="#D2E600" opacity="0.92"
        fontWeight="bold" fontFamily="monospace" textAnchor="middle">₹</text>
      {/* Stub barcode lines in left area */}
      <line x1="3"   y1="7"  x2="12" y2="7"  stroke="#D2E600" strokeWidth="0.9" opacity="0.45" />
      <line x1="3"   y1="9"  x2="12" y2="9"  stroke="#D2E600" strokeWidth="0.4" opacity="0.28" />
      <line x1="3"   y1="11" x2="12" y2="11" stroke="#D2E600" strokeWidth="0.7" opacity="0.38" />
      <line x1="3"   y1="13" x2="12" y2="13" stroke="#D2E600" strokeWidth="0.4" opacity="0.22" />
      <line x1="3"   y1="15" x2="12" y2="15" stroke="#D2E600" strokeWidth="0.9" opacity="0.40" />
    </svg>
  );
}
