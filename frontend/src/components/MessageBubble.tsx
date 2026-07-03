import { Message } from "../types";
import { CouponCard } from "./CouponCard";
import { CouponIcon } from "./CouponIcon";

interface Props {
  message: Message;
  isDark: boolean;
}

export function MessageBubble({ message, isDark }: Props) {
  const isUser = message.role === "user";

  if (isUser) {
    const bubble = isDark ? "bg-[#1C1C1F] text-[#EDEDEC]" : "bg-[#F0EEE9] text-[#171614]";
    return (
      <div className="flex justify-end py-1">
        <div className={`max-w-[70%] rounded-3xl px-5 py-3 text-[15px] leading-relaxed whitespace-pre-wrap ${bubble}`}>
          {message.content}
        </div>
      </div>
    );
  }

  const textColor = isDark ? "text-[#EDEDEC]" : "text-[#171614]";

  // While the message is streaming but has no content yet, SearchTrace in
  // ChatWindow handles the loading indicator — don't render an empty bubble.
  if (message.isStreaming && !message.content) return null;

  return (
    <div className="flex gap-4 py-3">
      <div className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-0.5" style={{ background: "var(--brand)" }}>
        <CouponIcon size={20} />
      </div>
      <div className="flex-1 min-w-0 space-y-4">
        {(message.content || message.isStreaming) && (
          <div className={`text-[15px] leading-[1.75] whitespace-pre-wrap ${textColor}`}>
            {message.content}
            {message.isStreaming && (
              <span className="inline-block w-[2px] h-[1em] ml-0.5 align-middle animate-pulse" style={{ background: "var(--brand)" }} />
            )}
          </div>
        )}
        {message.coupons && message.coupons.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {message.coupons.map(c => (
              <CouponCard key={c.couponId} coupon={c} isDark={isDark} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
