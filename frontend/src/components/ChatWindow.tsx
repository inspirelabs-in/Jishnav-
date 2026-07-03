import { useEffect, useRef, useState, useMemo } from "react";
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

  const textColor = isDark ? "text-[#EDEDEC]" : "text-[#171614]";

  const lastMsg = messages[messages.length - 1];
  const isSearching = lastMsg?.isStreaming && !lastMsg?.content;
  const lastUserMessage = messages[messages.length - 2]?.role === "user"
    ? messages[messages.length - 2].content
    : "";

  /* ── Empty / welcome state ── */
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 pb-4 relative">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6" style={{ background: "var(--brand)" }}>
          <CouponIcon size={46} />
        </div>
        <h1 className={`font-display text-[36px] font-medium mb-2 ${textColor}`} style={{ letterSpacing: "-0.01em" }}>
          GrabonGPT
        </h1>
        <p className="font-mono text-[12px] uppercase tracking-[0.18em] mb-9" style={{ color: "var(--text-2)" }}>
          Live coupon intelligence for GrabOn
        </p>
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

          {isSearching && (
            <div className="py-2">
              <SearchTrace query={lastUserMessage} isDark={isDark} />
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

const SCRAMBLE_CHARS = "!<>-_\\/[]{}=+*^?#$%01";

/** Cipher-decode effect: characters resolve left-to-right through random glyphs. */
function useScramble(target: string, active: boolean, duration = 420): string {
  const [display, setDisplay] = useState(active ? "" : target);

  useEffect(() => {
    if (!active) { setDisplay(target); return; }
    let frame = 0;
    const totalFrames = Math.round(duration / 28);
    const resolveAt = target.split("").map((_, i) =>
      Math.floor((i / Math.max(target.length, 1)) * totalFrames * 0.55) + totalFrames * 0.3
    );
    const interval = setInterval(() => {
      frame++;
      let out = "";
      for (let i = 0; i < target.length; i++) {
        const ch = target[i];
        if (ch === " " || ch === '"') { out += ch; continue; }
        out += frame >= resolveAt[i] ? ch : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
      }
      setDisplay(out);
      if (frame >= totalFrames) { setDisplay(target); clearInterval(interval); }
    }, 28);
    return () => clearInterval(interval);
  }, [target, active, duration]);

  return display;
}

/** Eased count-up from 0 to a real backend number -- grounds the "AI is working" beat in actual data. */
function useCountUp(target: number, active: boolean, duration = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active || !target) { setValue(0); return; }
    let start: number | null = null;
    let raf: number;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);
  return value;
}

/**
 * Agentic reasoning trace — the "watch the AI work" moment.
 * Each line decodes in through a cipher-scramble effect (not a plain fade),
 * and the "scanning" line counts up to the REAL live coupon/store totals
 * fetched from /api/health -- not a fake number, actual backend state.
 * Sequential reveal isn't tied to real SSE progress events (the stream only
 * emits text/coupons/done) -- this is a personalized simulation that
 * gracefully disappears the instant real content starts streaming in.
 */
function SearchTrace({ query, isDark }: { query: string; isDark: boolean }) {
  const [stats, setStats] = useState<{ coupons: number; stores: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then(r => r.json())
      .then(d => { if (!cancelled) setStats({ coupons: d.coupons_with_codes, stores: d.stores }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const trimmed = query.length > 42 ? query.slice(0, 42).trim() + "…" : query;
  const lineTemplates = useMemo(() => [
    trimmed ? `Reading "${trimmed}"` : "Reading your request",
    "__SCANNING__",
    "Filtering expired and duplicate codes",
    "Ranking by discount and relevance",
    "Assembling your best picks",
  ], [trimmed]);

  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    setVisibleCount(1);
    const stepDelays = [500, 1100, 850, 750];
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    stepDelays.forEach((d, i) => {
      elapsed += d;
      timers.push(setTimeout(() => setVisibleCount(i + 2), elapsed));
    });
    return () => timers.forEach(clearTimeout);
  }, [lineTemplates]);

  const doneColor   = isDark ? "#55555A" : "#A6A399";
  const activeColor = isDark ? "#EDEDEC" : "#171614";

  const scanIndex   = 1;
  const scanActive  = visibleCount - 1 >= scanIndex;
  const coupons     = useCountUp(stats?.coupons ?? 0, scanActive);
  const stores      = useCountUp(stats?.stores ?? 0, scanActive);

  return (
    <div className="relative flex gap-3 items-start overflow-hidden">
      <div className="trace-sweep" />
      <CometRing />
      <div className="flex flex-col gap-1.5 font-mono text-[13px] pt-1">
        {lineTemplates.slice(0, visibleCount).map((template, i) => {
          const isActive = i === visibleCount - 1;
          const isLast   = i === lineTemplates.length - 1 && !isActive;
          return (
            <TraceLine
              key={i}
              template={template}
              isActive={isActive}
              settled={!isActive}
              color={isActive ? activeColor : doneColor}
              coupons={coupons}
              stores={stores}
              statsReady={!!stats}
              justSettled={isLast}
            />
          );
        })}
      </div>
    </div>
  );
}

function TraceLine({
  template, isActive, color, coupons, stores, statsReady,
}: {
  template: string; isActive: boolean; settled: boolean; color: string;
  coupons: number; stores: number; statsReady: boolean; justSettled: boolean;
}) {
  const isScanLine = template === "__SCANNING__";

  // Non-numeric lines are static strings -> safe to cipher-decode them.
  const scrambled = useScramble(isScanLine ? "" : template, isActive && !isScanLine);

  return (
    <div className="trace-line flex items-center gap-2.5">
      <span
        className={`shrink-0 w-1.5 h-1.5 rounded-full ${isActive ? "trace-dot" : ""}`}
        style={{ background: isActive ? "var(--brand)" : "var(--success)" }}
      />
      {isScanLine ? (
        <span style={{ color }}>
          Scanning{" "}
          <span className="font-bold" style={{ color: "var(--brand)" }}>
            {statsReady ? coupons.toLocaleString("en-IN") : "…"}
          </span>{" "}
          live codes across{" "}
          <span className="font-bold" style={{ color: "var(--brand)" }}>
            {statsReady ? stores.toLocaleString("en-IN") : "…"}
          </span>{" "}
          stores
          {isActive && <span className="trace-cursor" style={{ color: "var(--brand)" }}>▍</span>}
        </span>
      ) : (
        <span style={{ color }}>
          {scrambled}
          {isActive && <span className="trace-cursor" style={{ color: "var(--brand)" }}>▍</span>}
        </span>
      )}
    </div>
  );
}

/**
 * Comet ring around the logo, brought back from the original UI at the
 * original brand lime (#D2E600) regardless of theme -- this is the signature
 * loading motif, kept intentionally separate from the muted per-theme accent
 * used elsewhere so the logo never reads as dim during the search moment.
 * Three SVG arc segments (far tail → mid → near-head) create a smooth
 * gradient-like fade. A soft bloom + sharp head dot sit at 12 o'clock.
 */
function CometRing() {
  const S = 40;
  const cx = 20, cy = 20, r = 20;

  const pt = (deg: number) => ({
    x: +(cx + r * Math.sin((deg * Math.PI) / 180)).toFixed(3),
    y: +(cy - r * Math.cos((deg * Math.PI) / 180)).toFixed(3),
  });

  const head = pt(0);
  const cometArc = (fromDeg: number) => {
    const s = pt(fromDeg);
    const span = ((0 - fromDeg) % 360 + 360) % 360;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${head.x} ${head.y}`;
  };

  return (
    <div className="shrink-0 relative w-8 h-8" style={{ overflow: "visible" }}>
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
            <filter id="gg-glow" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="gg-bloom" x="-200%" y="-200%" width="500%" height="500%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
            </filter>
          </defs>

          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(210,230,0,0.06)" strokeWidth="1" />

          <path d={cometArc(260)} fill="none" stroke="#D2E600" strokeWidth="1.5" strokeLinecap="butt" opacity={0.07} />
          <path d={cometArc(300)} fill="none" stroke="#D2E600" strokeWidth="2" strokeLinecap="butt" opacity={0.26} />
          <path
            d={cometArc(332)}
            fill="none" stroke="#D2E600"
            strokeWidth="2.5" strokeLinecap="round"
            opacity={0.88}
            filter="url(#gg-glow)"
          />

          <circle cx={head.x} cy={head.y} r={7} fill="#D2E600" opacity={0.20} filter="url(#gg-bloom)" />
          <circle cx={head.x} cy={head.y} r={2.8} fill="#D2E600" filter="url(#gg-glow)" />
        </svg>
      </div>

      <div className="absolute inset-0 rounded-full flex items-center justify-center z-10" style={{ background: "#D2E600" }}>
        <CouponIcon size={16} />
      </div>
    </div>
  );
}
