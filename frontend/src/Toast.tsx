import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastFn = (message: string, kind?: "ok" | "error") => void;

const ToastContext = createContext<ToastFn>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<{ msg: string; kind: "ok" | "error" } | null>(null);
  const timer = useRef<number>();

  const dismissLater = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const show = useCallback<ToastFn>(
    (msg, kind = "ok") => {
      setToast({ msg, kind });
      dismissLater();
    },
    [dismissLater]
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* Kept mounted so screen readers announce updates to the live region. */}
      <div
        role={toast?.kind === "error" ? "alert" : "status"}
        aria-live={toast?.kind === "error" ? "assertive" : "polite"}
      >
        {toast && (
          <div
            className={`toast ${toast.kind === "error" ? "error" : ""}`}
            onMouseEnter={() => window.clearTimeout(timer.current)}
            onMouseLeave={dismissLater}
          >
            {toast.msg}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
