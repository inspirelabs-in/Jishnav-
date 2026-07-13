import { useEffect, useRef, useState } from "react";
import { Message } from "../types";
import { MessageBubble } from "./MessageBubble";
import { InputBar } from "./InputBar";

/* ── Scramble / Reel ─────────────────────────────────── */
const PHRASE_POOL = [
  "Finding the best for you","Filtering it down","Hunting for savings",
  "Curating your top picks","Matching you with the best","Scanning for hidden discounts",
  "Locking in your offers","Comparing the top codes","Picking the winners",
  "Sorting the best from the rest","Chasing the biggest discount","Zeroing in on your deal",
  "Handpicking your codes","Narrowing it down","Bringing you the good stuff",
  "Sniffing out savings","Rolling the reels","Spinning up your picks",
  "Cracking the best codes","Digging up the deals","Weighing your options",
  "Stacking up the savings","Fetching your winners","Working the numbers",
  "Lining up your deals","Sealing the best offers",
];
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
let _pile: string[] = [];

function nextPhrase(): string {
  if (_pile.length === 0) _pile = [...PHRASE_POOL].sort(() => Math.random() - 0.5);
  return _pile.shift()!;
}

type Cell = { char: string; settled: boolean };

function useReelSpin(text: string, key: number, active: boolean): Cell[] {
  const [cells, setCells] = useState<Cell[]>(() => text.split("").map(c => ({ char: c, settled: true })));
  useEffect(() => {
    if (!active) { setCells(text.split("").map(c => ({ char: c, settled: true }))); return; }
    const DURATION = 580, TICK = 45, start = Date.now();
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / DURATION);
      const settle = Math.floor(t * text.length);
      setCells(text.split("").map((c, i) => {
        if (c === " " || i < settle) return { char: c, settled: true };
        return { char: CHARS[Math.floor(Math.random() * CHARS.length)], settled: false };
      }));
      if (t >= 1) clearInterval(id);
    }, TICK);
    return () => clearInterval(id);
  }, [text, key, active]);
  return cells;
}

/* ── SearchTrace (loading animation) ────────────────── */
function SearchTrace({ showText }: { showText: boolean }) {
  const [phrase, setPhrase] = useState(() => nextPhrase());
  const [spinKey, setSpinKey] = useState(0);
  const [phaseIdx, setPhaseIdx] = useState(0);

  useEffect(() => {
    if (!showText) return;
    setPhaseIdx(0);
    const delays = [1000, 1100, 1000];
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    delays.forEach((d, i) => {
      elapsed += d;
      timers.push(setTimeout(() => {
        const next = nextPhrase();
        setPhrase(next);
        setSpinKey(k => k + 1);
        setPhaseIdx(i + 1);
      }, elapsed));
    });
    return () => timers.forEach(clearTimeout);
  }, [showText]);

  const cells = useReelSpin(phrase, spinKey, showText);

  return (
    <div className="pill-in flex items-center gap-3.5 w-fit">
      <CometRing />

      <div className="flex flex-col gap-0.5">
        {/* Agent label */}
        <span className="agent-label mono text-[10px] font-bold uppercase tracking-[0.16em]"
          style={{ color: "var(--brand-dark)" }}>
          ◈ Searching for deals
        </span>

        {showText ? (
          /* Scramble phrase */
          <div className="flex items-baseline"
            style={{ fontWeight: 700, fontSize: "14px", letterSpacing: "-0.01em", lineHeight: 1.2 }}>
            {cells.map((cell, i) => (
              <span key={i}
                className={!cell.settled && cell.char !== " " ? "glyph-spin" : ""}
                style={{
                  color: cell.settled ? "var(--text-1)" : "var(--brand-dark)",
                  opacity: cell.char === " " ? 1 : cell.settled ? 1 : 0.5,
                  display: "inline-block",
                  minWidth: cell.char === " " ? "0.3em" : undefined,
                  transition: cell.settled ? "color 0.1s ease, opacity 0.1s ease" : undefined,
                }}>
                {cell.char}
              </span>
            ))}
            <span className="trace-cursor" style={{ color: "var(--brand-dark)", marginLeft: 2 }}>▍</span>
          </div>
        ) : (
          /* Dot pulse trio */
          <div className="flex items-center gap-1.5 py-0.5">
            <span className="dp1 block rounded-full" style={{ width: 7, height: 7, background: "var(--brand)" }} />
            <span className="dp2 block rounded-full" style={{ width: 7, height: 7, background: "var(--brand)", opacity: 0.6 }} />
            <span className="dp3 block rounded-full" style={{ width: 7, height: 7, background: "var(--brand)", opacity: 0.3 }} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── CometRing ───────────────────────────────────────── */
function CometRing() {
  const S = 46, cx = 23, cy = 23, r = 21;
  const pt = (deg: number) => ({
    x: +(cx + r * Math.sin((deg * Math.PI) / 180)).toFixed(3),
    y: +(cy - r * Math.cos((deg * Math.PI) / 180)).toFixed(3),
  });
  const head = pt(0);
  const arc = (from: number) => {
    const s = pt(from);
    const span = ((0 - from) % 360 + 360) % 360;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${head.x} ${head.y}`;
  };

  return (
    <div className="relative shrink-0" style={{ width: 36, height: 36 }}>
      {/* Pulse rings */}
      <div className="pulse-ring absolute rounded-full border"
        style={{ inset: 0, borderColor: "rgba(210,230,0,0.2)" }} />
      {/* Spinning comet */}
      <div className="absolute animate-spin" style={{ inset: "-5px", animationDuration: "0.95s", animationTimingFunction: "linear" }}>
        <svg width={S} height={S} viewBox={`0 0 ${S} ${S}`}>
          <defs>
            <filter id="cometGlow">
              <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="b"/>
              <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(210,230,0,0.07)" strokeWidth="1.2"/>
          <path d={arc(260)} fill="none" stroke="var(--brand)" strokeWidth="1.5" opacity={0.08}/>
          <path d={arc(300)} fill="none" stroke="var(--brand)" strokeWidth="2.2" opacity={0.28}/>
          <path d={arc(332)} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinecap="round" opacity={0.95} filter="url(#cometGlow)"/>
          <circle cx={head.x} cy={head.y} r={3.5} fill="var(--brand)" filter="url(#cometGlow)"/>
        </svg>
      </div>
      {/* Center GrabOn PNG */}
      <div className="absolute inset-0 flex items-center justify-center rounded-full"
        style={{ background: "var(--brand)" }}>
        <img src="/icons/grabon-icon.png" alt="GrabOn" width={20} height={20} style={{ objectFit: "contain" }} />
      </div>
    </div>
  );
}

/* ── Welcome Screen ──────────────────────────────────── */
function WelcomeScreen({ onSend, onStop, isLoading, isDark, isLimitReached, onOpenAuth }: {
  onSend: (t: string) => void;
  onStop: () => void;
  isLoading: boolean;
  isDark: boolean;
  isLimitReached: boolean;
  onOpenAuth: () => void;
}) {
  const phrase = "YOUR AI DEAL HUNTER, POWERED BY GRABON";

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12 welcome-bg relative overflow-hidden">
      {/* Subtle grid bg */}
      <div className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }} aria-hidden />

      <div className="relative z-10 w-full max-w-2xl flex flex-col items-center justify-center">
        {/* GrabOn Logo (transparent PNG, no background) above the chat bar */}
        <div className="fade-up flex justify-center mb-6" style={{ animationDelay: "100ms" }}>
          <img
            src="/icons/grabon-logo-white-bg.png"
            alt="GrabOn"
            className="h-16 w-auto object-contain filter drop-shadow-sm select-none pointer-events-none"
          />
        </div>

        {/* Mind-blowing cinematic subtitle transition */}
        <div className="flex flex-wrap justify-center gap-x-[0.3em] gap-y-1 mb-8 max-w-lg text-center select-none">
          {phrase.split(" ").map((word, wordIdx) => (
            <span key={wordIdx} className="inline-flex whitespace-nowrap">
              {word.split("").map((char, charIdx) => {
                const absoluteIndex = phrase.indexOf(word) + charIdx;
                return (
                  <span
                    key={charIdx}
                    className="inline-block animate-cinematic-reveal text-[12px] font-medium tracking-[0.14em]"
                    style={{
                      animationDelay: `${150 + absoluteIndex * 18}ms`,
                    }}
                  >
                    {char}
                  </span>
                );
              })}
            </span>
          ))}
        </div>

        {/* Input Bar centered */}
        <div className="fade-up w-full" style={{ animationDelay: "450ms" }}>
          {isLimitReached && (
            <div
              className="mb-3 p-3.5 rounded-2xl text-center text-[13px] font-medium border flex items-center justify-center gap-2"
              style={{
                background: "var(--brand-10)",
                borderColor: "var(--brand-20)",
                color: "var(--text-1)",
              }}
            >
              🔒 Guest limit reached.{" "}
              <button
                onClick={onOpenAuth}
                className="underline font-bold hover:text-brand-dark text-[13px] ml-1"
                style={{ color: "var(--text-1)" }}
              >
                Sign in to continue chatting
              </button>
            </div>
          )}
          <InputBar
            onSend={onSend}
            onStop={onStop}
            isLoading={isLoading}
            isDark={isDark}
            disabled={isLimitReached}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Main ChatWindow ─────────────────────────────────── */
interface Props {
  messages: Message[];
  isLoading: boolean;
  onSend: (t: string) => void;
  onStop: () => void;
  isDark: boolean;
  isLimitReached: boolean;
  onOpenAuth: () => void;
}

export function ChatWindow({ messages, isLoading, onSend, onStop, isDark, isLimitReached, onOpenAuth }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const lastMsg = messages[messages.length - 1];
  const isStreamingEmpty = lastMsg?.isStreaming && !lastMsg?.content;
  const isSearch = isStreamingEmpty && lastMsg?.isCouponSearch === true;

  if (messages.length === 0) {
    return (
      <WelcomeScreen
        onSend={onSend}
        onStop={onStop}
        isLoading={isLoading}
        isDark={isDark}
        isLimitReached={isLimitReached}
        onOpenAuth={onOpenAuth}
      />
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ background: "var(--bg)" }}>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-5 py-6 space-y-1">
          {messages.map(m => (
            <MessageBubble key={m.id} message={m} isDark={isDark} />
          ))}
          {isStreamingEmpty && (
            <div className="py-3 pl-12">
              <SearchTrace showText={!!isSearch} />
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Sticky input — transparent bg, no top border line */}
      <div className="shrink-0 px-5 py-4" style={{ background: "var(--bg)" }}>
        <div className="max-w-3xl mx-auto">
          {isLimitReached && (
            <div
              className="mb-3 p-3.5 rounded-2xl text-center text-[13px] font-medium border flex items-center justify-center gap-2 animate-cinematic-reveal"
              style={{
                background: "var(--brand-10)",
                borderColor: "var(--brand-20)",
                color: "var(--text-1)",
              }}
            >
              🔒 Guest limit reached.{" "}
              <button
                onClick={onOpenAuth}
                className="underline font-bold hover:text-brand-dark text-[13px] ml-1"
                style={{ color: "var(--text-1)" }}
              >
                Sign in to continue chatting
              </button>
            </div>
          )}
          <InputBar
            onSend={onSend}
            onStop={onStop}
            isLoading={isLoading}
            isDark={isDark}
            disabled={isLimitReached}
          />
        </div>
      </div>
    </div>
  );
}
