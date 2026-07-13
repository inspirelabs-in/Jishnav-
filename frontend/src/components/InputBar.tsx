import { useState, useRef, useEffect, KeyboardEvent } from "react";

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  isLoading: boolean;
  isDark: boolean;
  disabled?: boolean;
}

export function InputBar({ onSend, onStop, isLoading, isDark, disabled }: Props) {
  const [value, setValue] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 196)}px`;
  }, [value]);

  const handleSend = () => {
    const t = value.trim();
    if (!t) return;
    setValue("");
    onSend(t);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!isLoading) handleSend(); }
  };

  const canSend = value.trim().length > 0 && !disabled && !isLoading;

  return (
    <div
      className="input-shell flex flex-col rounded-2xl border"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <textarea
        ref={textRef}
        rows={1}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Ask me about coupons and deals…"
        disabled={disabled}
        className="w-full resize-none outline-none bg-transparent text-[15px] px-4 pt-3.5 pb-2 leading-relaxed max-h-[196px] overflow-y-auto"
        style={{
          color: "var(--text-1)",
          fontFamily: "GothamRnd, sans-serif",
          fontWeight: 400,
        }}
      />

      <div className="flex items-center justify-between px-4 pb-3.5">
        {/* Hint text */}
        <span className="text-[11px] mono select-none" style={{ color: "var(--text-4)" }}>
          {isLoading
            ? <span className="flex items-center gap-1.5">
                <span className="dp1 inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--brand-dark)" }} />
                <span className="dp2 inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--brand-dark)" }} />
                <span className="dp3 inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--brand-dark)" }} />
                <span style={{ color: "var(--text-3)" }}>Generating…</span>
              </span>
            : "Enter ↵ to send  ·  Shift+Enter for new line"
          }
        </span>

        {/* Action button */}
        <button
          onClick={handleSend}
          disabled={!canSend || isLoading}
          className="send-btn pressable flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            background: (canSend && !isLoading) ? "var(--brand)" : "var(--surface-2)",
            color: (canSend && !isLoading) ? "var(--brand-ink)" : "var(--text-3)",
            fontFamily: "GothamRnd, sans-serif",
            fontWeight: 700,
          }}
        >
          <SendIcon active={canSend && !isLoading} /> Send
        </button>
      </div>
    </div>
  );
}

function SendIcon({ active }: { active: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path d="M12 20V4M12 4L6 10M12 4L18 10"
        stroke={active ? "#0D0D0E" : "currentColor"}
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
    </svg>
  );
}
