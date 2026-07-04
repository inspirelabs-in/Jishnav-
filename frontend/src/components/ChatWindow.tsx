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
  // The comet ring shows the instant a message starts streaming with no
  // content yet -- immediate feedback on send, never a blank gap. The
  // rotating status TEXT only joins in once the backend confirms (via the
  // "meta" SSE event) that this is a genuine coupon search -- never for
  // "hi", "what are you", "tell me a joke", or any other conversational
  // turn that never touches the coupon database. Undefined (not yet known)
  // is treated the same as false: just the ring, no search phrasing, until
  // it's confirmed one way or the other.
  const isStreamingEmpty = lastMsg?.isStreaming && !lastMsg?.content;
  const isSearching = isStreamingEmpty && lastMsg?.isCouponSearch === true;
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

          {isStreamingEmpty && (
            <div className="py-2">
              <SearchTrace query={lastUserMessage} isDark={isDark} showText={!!isSearching} />
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
 * Search-loading line — a single row, no panel, no background, no numbers.
 * The comet ring shows immediately regardless of query type. The status
 * text only appears once the backend confirms this is a genuine coupon
 * search, and rolls between phases like a slot-machine reel -- each new
 * phrase slides up into a clipped viewport, replacing the last, rather than
 * an accumulating list or a character-scramble effect.
 */
function SearchTrace({ query, isDark, showText }: { query: string; isDark: boolean; showText: boolean }) {
  const trimmed = query.length > 42 ? query.slice(0, 42).trim() + "…" : query;
  const phrases = useMemo(() => [
    trimmed ? `Reading "${trimmed}"` : "Reading your request",
    "Cross-referencing the live database",
    "Filtering expired and duplicate codes",
    "Ranking by discount and relevance",
    "Locking in your best picks",
  ], [trimmed]);

  const [phaseIndex, setPhaseIndex] = useState(0);
  useEffect(() => {
    if (!showText) return;
    setPhaseIndex(0);
    const stepDelays = [900, 1100, 900, 850];
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    stepDelays.forEach((d, i) => {
      elapsed += d;
      timers.push(setTimeout(() => setPhaseIndex(i + 1), elapsed));
    });
    return () => timers.forEach(clearTimeout);
  }, [phrases, showText]);

  const textColor = isDark ? "#EDEDEC" : "#171614";

  return (
    <div className="flex items-center gap-3">
      <CometRing small />
      {showText && (
        <div className="relative overflow-hidden" style={{ height: "1.5em" }}>
          <div
            key={phaseIndex}
            className="slot-roll-in font-mono text-[13px] flex items-center gap-2 whitespace-nowrap"
            style={{ color: textColor }}
          >
            {phrases[phaseIndex]}
            <span className="trace-cursor" style={{ color: "var(--brand)" }}>▍</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Comet ring around the logo, kept at the original brand lime (#D2E600)
 * regardless of theme so it never reads as dim during the search moment.
 * Three SVG arc segments (far tail → mid → near-head) create a smooth
 * gradient-like fade. A soft bloom + sharp head dot sit at 12 o'clock.
 */
function CometRing({ small = false }: { small?: boolean }) {
  const box = small ? 24 : 32;
  const S = small ? 30 : 40;
  const cx = S / 2, cy = S / 2, r = S / 2;
  const offset = -(S - box) / 2;

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
    <div className="shrink-0 relative" style={{ width: box, height: box, overflow: "visible" }}>
      <div
        className="absolute animate-spin pointer-events-none"
        style={{
          top: offset, left: offset, width: S, height: S,
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
        <CouponIcon size={small ? 13 : 16} />
      </div>
    </div>
  );
}
