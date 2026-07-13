import { Message, CrossSellSuggestion } from "../types";
import { CouponPanel } from "./CouponCard";

function GAvatar() {
  return (
    <div className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-0.5 overflow-hidden"
      style={{ background: "var(--brand)", boxShadow: "0 0 0 2.5px var(--brand-20)" }}>
      <img src="/icons/grabon-icon.png" alt="GrabOn" width={22} height={22} style={{ objectFit: "contain" }} />
    </div>
  );
}

function CrossSellChips({ suggestions, onSend }: {
  suggestions: CrossSellSuggestion[];
  onSend: (text: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => onSend(`${s.keyword} coupons on ${s.store_name}`)}
          className="cross-sell-chip"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            padding: "7px 14px",
            borderRadius: "20px",
            border: "1px solid var(--border)",
            background: "var(--surface-1)",
            color: "var(--text-2)",
            fontSize: "13px",
            fontFamily: "GothamRnd, sans-serif",
            fontWeight: 400,
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = "var(--brand-10, rgba(0,150,100,0.08))";
            e.currentTarget.style.borderColor = "var(--brand, #009664)";
            e.currentTarget.style.color = "var(--brand, #009664)";
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = "var(--surface-1)";
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.color = "var(--text-2)";
          }}
        >
          <span style={{ fontSize: "14px", lineHeight: 1 }}>&#8594;</span>
          {s.label}
        </button>
      ))}
    </div>
  );
}

interface Props {
  message: Message;
  isDark: boolean;
  onSend: (text: string) => void;
}

export function MessageBubble({ message, isDark, onSend }: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="msg-user flex justify-end py-1.5">
        <div
          className="max-w-[72%] rounded-2xl rounded-tr-sm px-5 py-3.5 text-[15px] leading-relaxed whitespace-pre-wrap"
          style={{
            background: "var(--surface-2)",
            color: "var(--text-1)",
            fontFamily: "GothamRnd, sans-serif",
            fontWeight: 400,
            boxShadow: "var(--shadow-sm)",
            border: "1px solid var(--border)",
          }}>
          {message.content}
        </div>
      </div>
    );
  }

  if (message.isStreaming && !message.content) return null;

  return (
    <div className="msg-bot flex gap-3.5 py-2">
      <GAvatar />
      <div className="flex-1 min-w-0 space-y-4">
        {(message.content || message.isStreaming) && (
          <div
            className="text-[15px] leading-[1.85] whitespace-pre-wrap pt-1"
            style={{
              color: "var(--text-2)",
              fontFamily: "GothamRnd, sans-serif",
              fontWeight: 400,
            }}>
            {message.content}
            {message.isStreaming && <span className="stream-cursor" />}
          </div>
        )}
        {message.coupons && message.coupons.length > 0 && (
          <CouponPanel coupons={message.coupons} isDark={isDark} />
        )}
        {!message.isStreaming && message.crossSellSuggestions && message.crossSellSuggestions.length > 0 && (
          <CrossSellChips suggestions={message.crossSellSuggestions} onSend={onSend} />
        )}
      </div>
    </div>
  );
}
