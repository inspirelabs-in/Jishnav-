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
          GrabGPT
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

/**
 * Agentic reasoning trace — the "watch the AI work" moment.
 * Sequential status lines reveal one at a time (not tied to real backend
 * events, since the SSE stream only emits text/coupons/done — this is a
 * plausible, personalized simulation of the search that gracefully
 * disappears the instant real content starts streaming in).
 */
function SearchTrace({ query, isDark }: { query: string; isDark: boolean }) {
  const lines = useMemo(() => {
    const trimmed = query.length > 42 ? query.slice(0, 42).trim() + "…" : query;
    return [
      trimmed ? `Reading "${trimmed}"` : "Reading your request",
      "Scanning GrabOn's live coupon database",
      "Filtering expired and duplicate codes",
      "Ranking by discount and relevance",
      "Assembling your picks",
    ];
  }, [query]);

  const [visibleCount, setVisibleCount] = useState(1);

  useEffect(() => {
    setVisibleCount(1);
    const stepDelays = [550, 1000, 900, 850]; // gaps between lines 2..5
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    stepDelays.forEach((d, i) => {
      elapsed += d;
      timers.push(setTimeout(() => setVisibleCount(i + 2), elapsed));
    });
    return () => timers.forEach(clearTimeout);
  }, [lines]);

  const doneColor   = isDark ? "#55555A" : "#A6A399";
  const activeColor = isDark ? "#EDEDEC" : "#171614";

  return (
    <div className="flex gap-3 items-start">
      <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5" style={{ background: "var(--brand)" }}>
        <CouponIcon size={20} />
      </div>
      <div className="flex flex-col gap-1.5 font-mono text-[13px] pt-1">
        {lines.slice(0, visibleCount).map((line, i) => {
          const isActive = i === visibleCount - 1;
          return (
            <div key={i} className="trace-line flex items-center gap-2.5">
              <span
                className={`shrink-0 w-1.5 h-1.5 rounded-full ${isActive ? "trace-dot" : ""}`}
                style={{ background: isActive ? "var(--brand)" : "var(--success)" }}
              />
              <span style={{ color: isActive ? activeColor : doneColor }}>
                {line}
                {isActive && <span className="trace-cursor" style={{ color: "var(--brand)" }}>▍</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
