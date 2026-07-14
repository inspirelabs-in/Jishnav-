import { useState } from "react";

interface Props {
  isOpen: boolean;
  variant: "initial" | "limit_reached";
  onLogin: () => Promise<void>;
  onGuestAccess?: () => Promise<void>;
  onClose?: () => void;
}

export function AuthModal({ isOpen, variant, onLogin, onGuestAccess, onClose }: Props) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleLogin = async () => {
    setLoading(true);
    try {
      await onLogin();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const isLimitReached = variant === "limit_reached";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{
        background: "rgba(13, 13, 14, 0.45)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      {/* Modal Card */}
      <div
        className="chip-pop w-full max-w-md rounded-3xl border p-8 relative flex flex-col items-center text-center overflow-hidden"
        style={{
          background: "var(--surface)",
          borderColor: "var(--border)",
          boxShadow: "var(--shadow-xl)",
        }}
      >
        {/* Subtle decorative top glow */}
        <div
          className="absolute -top-10 left-1/2 -translate-x-1/2 w-48 h-20 rounded-full blur-[40px] opacity-40 select-none pointer-events-none"
          style={{ background: "var(--brand)" }}
        />

        {/* Close Button (top-right, only on Limit Reached screen) */}
        {isLimitReached && onClose && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center pressable icon-btn"
            style={{
              color: "var(--text-3)",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
            }}
            title="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}

        {/* Icon Mark */}
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6 float-y overflow-hidden shrink-0"
          style={{
            background: "var(--brand)",
            boxShadow: "var(--shadow-md), 0 0 0 4px var(--brand-10)",
          }}
        >
          <img
            src="/icons/grabon-icon.png"
            alt="GrabOn"
            className="w-8 h-8 object-contain pointer-events-none"
          />
        </div>

        {/* Title */}
        <h2
          className="text-2xl font-bold leading-tight mb-2"
          style={{
            color: "var(--text-1)",
            fontFamily: "GothamRnd, sans-serif",
            letterSpacing: "-0.02em",
          }}
        >
          {isLimitReached ? "Chat Limit Reached" : "Welcome to GrabonGPT"}
        </h2>

        {/* Subtitle / Description */}
        <p className="text-[14px] leading-relaxed mb-8 px-2" style={{ color: "var(--text-2)", fontFamily: "GothamRnd, sans-serif" }}>
          {isLimitReached
            ? "You've used all 4 free guest messages. Sign in with Google to continue finding the best coupons and saving on GrabOn."
            : "Sign in with Google to unlock persistent chat history, personalized deal recommendations, and unlimited coupon searches."}
        </p>

        {/* Google Sign-in Button */}
        <button
          onClick={handleLogin}
          disabled={loading}
          className="pressable w-full py-3.5 px-6 rounded-2xl flex items-center justify-center gap-3 text-[14px] font-bold border transition-all disabled:opacity-50"
          style={{
            background: "var(--text-1)",
            color: "var(--bg)",
            borderColor: "var(--text-1)",
            fontFamily: "GothamRnd, sans-serif",
          }}
        >
          {loading ? (
            <span className="flex items-center gap-1.5 py-0.5">
              <span className="dp1 block w-1.5 h-1.5 rounded-full" style={{ background: "var(--bg)" }} />
              <span className="dp2 block w-1.5 h-1.5 rounded-full" style={{ background: "var(--bg)", opacity: 0.6 }} />
              <span className="dp3 block w-1.5 h-1.5 rounded-full" style={{ background: "var(--bg)", opacity: 0.3 }} />
            </span>
          ) : (
            <>
              {/* Google G logo SVG */}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </>
          )}
        </button>

        {/* Footer Actions */}
        <div className="mt-6 flex flex-col gap-2">
          {!isLimitReached && onGuestAccess ? (
            <button
              onClick={onGuestAccess}
              className="pressable text-[13px] font-medium transition-colors"
              style={{ color: "var(--text-3)", fontFamily: "GothamRnd, sans-serif" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-2)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-3)"}
            >
              Try without Signup
            </button>
          ) : isLimitReached && onClose ? (
            <button
              onClick={onClose}
              className="pressable text-[13px] font-medium transition-colors"
              style={{ color: "var(--text-3)", fontFamily: "GothamRnd, sans-serif" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text-2)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-3)"}
            >
              Close and read chats
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
