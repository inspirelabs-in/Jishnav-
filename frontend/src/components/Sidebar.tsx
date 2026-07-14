import { useState, useRef, useEffect } from "react";
import { ChatRecord } from "../types";
import { AuthState, User } from "../hooks/useAuth";

/* ── GrabOn PNG logo ─────────────────────────────────── */
function GrabOnLogo({ size = 20 }: { size?: number }) {
  return (
    <img src="/icons/grabon-icon.png" alt="GrabOn" width={size} height={size}
      style={{ objectFit: "contain", display: "block" }} />
  );
}

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onLoadChat: (r: ChatRecord) => void;
  onDeleteHistory: (id: string) => void;
  onRenameHistory: (id: string, t: string) => void;
  history: ChatRecord[];
  activeHistoryId: string | null;
  isDark: boolean;
  onToggleDark: () => void;
  authState: AuthState;
  user: User | null;
  onSignIn: () => void;
  onSignOut: () => void;
}

export function Sidebar({
  isOpen, onToggle, onNewChat, onLoadChat,
  onDeleteHistory, onRenameHistory,
  history, activeHistoryId, isDark, onToggleDark,
  authState, user, onSignIn, onSignOut,
}: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [flipKey, setFlipKey] = useState(0);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (renamingId) renameRef.current?.focus(); }, [renamingId]);

  const startRename = (item: ChatRecord, e: React.MouseEvent) => {
    e.stopPropagation(); setRenamingId(item.id); setRenameVal(item.title);
  };
  const commitRename = (id: string) => { onRenameHistory(id, renameVal); setRenamingId(null); };
  const handleKey = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter") commitRename(id);
    if (e.key === "Escape") setRenamingId(null);
  };
  const handleToggle = () => { setFlipKey(k => k + 1); onToggleDark(); };

  /* ── Collapsed rail ── */
  if (!isOpen) {
    return (
      <div className="flex flex-col items-center py-5 px-2.5 gap-3 h-full w-[60px] shrink-0 border-r"
        style={{ background: "var(--sidebar-bg)", borderColor: "var(--border)" }}>
        {/* Logo mark */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
          style={{ background: "var(--brand)", boxShadow: "var(--shadow-xs)" }}>
          <GrabOnLogo size={18} />
        </div>
        <button onClick={onToggle} className="icon-btn pressable w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ color: "var(--text-3)" }} title="Expand sidebar">
          <MenuIcon />
        </button>
        <button onClick={onNewChat} className="icon-btn pressable w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ color: "var(--text-3)" }} title="New chat">
          <PlusIcon />
        </button>

        {/* Collapsed Auth Indicator at the bottom */}
        <div className="mt-auto flex flex-col gap-3 items-center w-full">
          {authState === "authenticated" ? (
            <button
              onClick={onSignOut}
              className="w-8 h-8 rounded-full flex items-center justify-center pressable font-bold text-xs shrink-0"
              style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
              title={`Sign Out (${user?.name || "User"})`}
            >
              {user?.name ? user.name[0].toUpperCase() : "U"}
            </button>
          ) : (
            <button
              onClick={onSignIn}
              className="w-8 h-8 rounded-lg flex items-center justify-center pressable icon-btn border shrink-0"
              style={{ background: "var(--surface-2)", color: "var(--text-2)", borderColor: "var(--border)" }}
              title="Sign In"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── Expanded sidebar ── */
  return (
    <div className="sidebar-in flex flex-col h-full w-[268px] shrink-0 border-r"
      style={{ background: "var(--sidebar-bg)", borderColor: "var(--border)" }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[10px] flex items-center justify-center overflow-hidden shrink-0"
            style={{ background: "var(--brand)", boxShadow: "var(--shadow-xs)" }}>
            <GrabOnLogo size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[15px] leading-tight" style={{ fontWeight: 700, color: "var(--text-1)", letterSpacing: "-0.02em" }}>
              GrabonGPT
            </span>
            <span className="text-[10px] leading-none" style={{ color: "var(--text-3)", fontFamily: "JetBrains Mono", letterSpacing: "0.06em" }}>
              Save on everything
            </span>
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={handleToggle}
            className="icon-btn pressable w-7 h-7 rounded-md flex items-center justify-center"
            style={{ color: "var(--text-3)" }} title={isDark ? "Light" : "Dark"}>
            <span key={flipKey} className="icon-flip">
              {isDark ? <SunIcon /> : <MoonIcon />}
            </span>
          </button>
          <button onClick={onToggle}
            className="icon-btn pressable w-7 h-7 rounded-md flex items-center justify-center"
            style={{ color: "var(--text-3)" }} title="Collapse">
            <CollapseIcon />
          </button>
        </div>
      </div>

      {/* ── New Chat ── */}
      <div className="px-3 pb-3">
        <button onClick={onNewChat}
          className="pressable flex items-center gap-2.5 w-full px-3.5 py-2.5 rounded-xl text-[13px] font-medium border transition-all"
          style={{
            color: "var(--text-1)", borderColor: "var(--border)",
            background: "var(--surface)",
            boxShadow: "var(--shadow-xs)",
            fontWeight: 500,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--brand-dark)";
            (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-sm), 0 0 0 3px var(--brand-10)";
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
            (e.currentTarget as HTMLElement).style.boxShadow = "var(--shadow-xs)";
          }}
        >
          <span className="w-5 h-5 rounded-md flex items-center justify-center shrink-0"
            style={{ background: "var(--brand)", color: "var(--brand-ink)" }}>
            <PlusIcon size={12} />
          </span>
          New chat
        </button>
      </div>

      {/* ── Divider ── */}
      <div className="mx-4 border-t" style={{ borderColor: "var(--border)" }} />

      {/* ── History ── */}
      <div className="flex-1 overflow-y-auto px-3 pt-3">
        <p className="text-[10px] uppercase tracking-[0.13em] px-2 pb-2 mono"
          style={{ color: "var(--text-4)", fontWeight: 600 }}>
          Conversations
        </p>

        {history.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
            <div className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "var(--surface-2)" }}>
              <ChatBubbleIcon />
            </div>
            <p className="text-[13px]" style={{ color: "var(--text-3)" }}>
              No conversations yet
            </p>
            <p className="text-[11px]" style={{ color: "var(--text-4)" }}>
              Start a chat to find deals
            </p>
          </div>
        ) : (
          <div className="space-y-0.5 pb-4">
            {history.map((item, idx) => {
              const isActive = item.sessionId === activeHistoryId || item.id === activeHistoryId;
              return (
                <div key={item.id}
                  className={`hist-in nav-row group relative flex items-center rounded-xl ${isActive ? "active" : ""}`}
                  style={{ animationDelay: `${idx * 30}ms` }}>
                  {renamingId === item.id ? (
                    <input ref={renameRef} value={renameVal}
                      onChange={e => setRenameVal(e.target.value)}
                      onBlur={() => commitRename(item.id)}
                      onKeyDown={e => handleKey(e, item.id)}
                      onClick={e => e.stopPropagation()}
                      className="flex-1 text-[13px] px-3 py-2.5 bg-transparent outline-none"
                      style={{ color: "var(--text-1)" }} maxLength={80} />
                  ) : (
                    <button onClick={() => onLoadChat(item)}
                      className="flex-1 text-left text-[13px] px-3 py-2.5 truncate"
                      style={{ color: isActive ? "var(--text-1)" : "var(--text-2)" }}
                      title={item.title}>
                      {item.title}
                    </button>
                  )}

                  {renamingId !== item.id && (
                    <div className="absolute right-1.5 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex"
                      style={{ background: "var(--surface)", borderRadius: "6px", padding: "1px" }}>
                      <button onClick={e => startRename(item, e)}
                        className="icon-btn pressable w-6 h-6 flex items-center justify-center rounded"
                        style={{ color: "var(--text-3)" }} title="Rename">
                        <EditIcon />
                      </button>
                      <button onClick={e => { e.stopPropagation(); onDeleteHistory(item.id); }}
                        className="icon-btn pressable w-6 h-6 flex items-center justify-center rounded"
                        style={{ color: "var(--text-3)" }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--red)"}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-3)"}
                        title="Delete">
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── User Profile Widget ── */}
      <div className="px-3 pb-2 pt-2 border-t mt-auto" style={{ borderColor: "var(--border)" }}>
        {authState === "authenticated" ? (
          <div className="flex flex-col gap-2 p-2.5 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
                style={{ background: "var(--brand)", color: "var(--brand-ink)", fontFamily: "GothamRnd, sans-serif" }}>
                {user?.name ? user.name[0].toUpperCase() : "U"}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-bold truncate" style={{ color: "var(--text-1)", fontFamily: "GothamRnd, sans-serif" }}>
                  {user?.name || "User"}
                </span>
                <span className="text-[10px] font-medium truncate" style={{ color: "var(--text-3)", fontFamily: "GothamRnd, sans-serif" }}>
                  {user?.email || ""}
                </span>
              </div>
            </div>
            <button
              onClick={onSignOut}
              className="pressable w-full py-1.5 px-3 rounded-lg text-[11px] font-bold text-center border transition-colors"
              style={{
                background: "var(--red-10)",
                color: "var(--red)",
                borderColor: "transparent",
                fontFamily: "GothamRnd, sans-serif",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "var(--red)";
                (e.currentTarget as HTMLElement).style.color = "white";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "var(--red-10)";
                (e.currentTarget as HTMLElement).style.color = "var(--red)";
              }}
            >
              Sign Out
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-2.5 rounded-xl" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "var(--surface-3)", color: "var(--text-2)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-bold" style={{ color: "var(--text-1)", fontFamily: "GothamRnd, sans-serif" }}>
                  Guest Mode
                </span>
                <span className="text-[10px] font-medium" style={{ color: "var(--text-3)", fontFamily: "GothamRnd, sans-serif" }}>
                  4-message limit
                </span>
              </div>
            </div>
            <button
              onClick={onSignIn}
              className="pressable w-full py-1.5 px-3 rounded-lg text-[11px] font-bold text-center transition-all"
              style={{
                background: "var(--brand)",
                color: "var(--brand-ink)",
                fontFamily: "GothamRnd, sans-serif",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.background = "var(--brand-dark)";
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.background = "var(--brand)";
              }}
            >
              Sign In
            </button>
          </div>
        )}
      </div>

      {/* ── Footer tag ── */}
      <div className="px-4 pb-4 pt-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
          style={{ background: "var(--brand-10)", border: "1px solid var(--brand-20)" }}>
          <div className="w-4 h-4 rounded flex items-center justify-center shrink-0"
            style={{ background: "var(--brand)" }}>
            <GrabOnLogo size={8} />
          </div>
          <span className="text-[10px] mono" style={{ color: "var(--text-3)", letterSpacing: "0.08em" }}>
            Powered by GrabOn
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Icons ── */
function MenuIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>;
}
function PlusIcon({ size = 14 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>;
}
function CollapseIcon() {
  return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><polyline points="15 8 11 12 15 16"/></svg>;
}
function EditIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>;
}
function TrashIcon() {
  return <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>;
}
function SunIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>;
}
function MoonIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>;
}
function ChatBubbleIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-4)" }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>;
}
