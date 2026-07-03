import { useState, KeyboardEvent, useRef, useEffect } from "react";

interface Props {
  onSend: (text: string) => void;
  onStop: () => void;
  isLoading: boolean;
  isDark: boolean;
  disabled?: boolean;
}

export function InputBar({ onSend, onStop, isLoading, isDark, disabled }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const handleSend = () => {
    const text = value.trim();
    if (!text) return;
    setValue("");
    onSend(text);
  };

  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isLoading) return;
      handleSend();
    }
  };

  const canSend = value.trim().length > 0 && !disabled && !isLoading;

  const wrapBg     = isDark ? "bg-[#141416] border-[#262629] focus-within:border-[#3a3a3f]" : "bg-white border-[#E4E2DD] focus-within:border-[#c9c5ba]";
  const textCls    = isDark ? "text-[#EDEDEC] placeholder-[#55555A]" : "text-[#171614] placeholder-[#A6A399]";

  return (
    <div className={`relative flex flex-col rounded-2xl border shadow-sm transition-colors ${wrapBg}`}>
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKey}
        placeholder="Ask me about coupons and deals…"
        disabled={disabled}
        className={`w-full resize-none outline-none bg-transparent text-[15px] px-4 pt-3.5 pb-3 leading-relaxed max-h-[200px] overflow-y-hidden ${textCls}`}
      />

      <div className="flex items-center justify-end px-3 pb-3">
        {isLoading ? (
          <button
            onClick={onStop}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${isDark ? "bg-[#EDEDEC] hover:bg-white" : "bg-[#171614] hover:bg-black"}`}
            title="Stop generating"
          >
            <StopIcon isDark={isDark} />
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-8 h-8 flex items-center justify-center rounded-full transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{ backgroundColor: canSend ? "var(--brand)" : (isDark ? "#262629" : "#E4E2DD") }}
            title="Send message"
          >
            <SendIcon active={canSend} />
          </button>
        )}
      </div>
    </div>
  );
}

function SendIcon({ active }: { active: boolean }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M12 20V4M12 4L6 10M12 4L18 10"
        stroke={active ? "#000" : "#888"}
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StopIcon({ isDark }: { isDark: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={isDark ? "#0B0B0C" : "#F7F6F3"}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}
