import { useState, useRef, useEffect } from "react";
import { CouponIcon } from "./CouponIcon";
import { ChatRecord } from "../types";

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  onNewChat: () => void;
  onLoadChat: (record: ChatRecord) => void;
  onDeleteHistory: (id: string) => void;
  onRenameHistory: (id: string, newTitle: string) => void;
  history: ChatRecord[];
  activeHistoryId: string | null;
  isDark: boolean;
  onToggleDark: () => void;
}

export function Sidebar({
  isOpen, onToggle, onNewChat, onLoadChat,
  onDeleteHistory, onRenameHistory,
  history, activeHistoryId, isDark, onToggleDark,
}: Props) {
  const s = isDark ? dark : light;
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const startRename = (item: ChatRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(item.id);
    setRenameValue(item.title);
  };

  const commitRename = (id: string) => {
    onRenameHistory(id, renameValue);
    setRenamingId(null);
  };

  const handleRenameKey = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter") commitRename(id);
    if (e.key === "Escape") setRenamingId(null);
  };

  /* ── Collapsed rail ── */
  if (!isOpen) {
    return (
      <div className={`flex flex-col items-center py-4 px-3 gap-3 h-full w-[60px] shrink-0 border-r ${s.sidebar} ${s.border}`}>
        <div className="w-9 h-9 rounded-xl bg-[#D2E600] flex items-center justify-center shrink-0">
          <CouponIcon size={26} />
        </div>
        <button onClick={onToggle} className={`w-9 h-9 flex items-center justify-center rounded-xl mt-1 ${s.iconBtn}`} title="Open sidebar">
          <SidebarOpenIcon />
        </button>
        <button onClick={onNewChat} className={`w-9 h-9 flex items-center justify-center rounded-xl ${s.iconBtn}`} title="New chat">
          <NewChatIcon />
        </button>
      </div>
    );
  }

  /* ── Expanded sidebar ── */
  return (
    <div className={`flex flex-col h-full w-[280px] shrink-0 border-r ${s.sidebar} ${s.border}`}>

      {/* ── Top: Logo + Toggle + Collapse ── */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#D2E600] flex items-center justify-center shrink-0">
            <CouponIcon size={22} />
          </div>
          <span className={`text-[17px] font-bold ${s.logoText}`} style={{ fontFamily: "'Inter', sans-serif", letterSpacing: "-0.02em" }}>GrabGPT</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleDark}
            className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${s.darkToggleBtn}`}
            title={isDark ? "Light mode" : "Dark mode"}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button onClick={onToggle} className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors ${s.iconBtn}`} title="Collapse sidebar">
            <SidebarCloseIcon />
          </button>
        </div>
      </div>

      {/* ── New Chat button ── */}
      <div className="px-3 pb-1">
        <button
          onClick={onNewChat}
          className={`flex items-center gap-3 w-full px-4 py-3.5 rounded-xl text-[16px] font-medium transition-colors ${s.navItem}`}
        >
          <span className={s.navIcon}><NewChatIcon size={20} /></span>
          New chat
        </button>
      </div>

      {/* ── Divider ── */}
      <div className={`mx-4 my-2 border-t ${s.divider}`} />

      {/* ── History ── */}
      <div className="flex-1 overflow-y-auto px-3 py-1">
        <p className={`text-[12px] font-semibold uppercase tracking-[0.1em] px-3 py-2.5 ${s.sectionLabel}`}>
          History
        </p>

        {history.length === 0 ? (
          <p className={`text-[15px] px-3 py-2 ${s.emptyText}`}>No conversations yet</p>
        ) : (
          <div className="space-y-0.5">
            {history.map(item => (
              <div
                key={item.id}
                className={`group relative flex items-center rounded-xl transition-colors ${
                  item.id === activeHistoryId ? s.historyItemActive : s.historyItem
                }`}
              >
                {/* ── Title / Rename input ── */}
                {renamingId === item.id ? (
                  <input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(item.id)}
                    onKeyDown={e => handleRenameKey(e, item.id)}
                    onClick={e => e.stopPropagation()}
                    className={`flex-1 text-[14px] px-4 py-3 bg-transparent outline-none rounded-xl ${s.renameInput}`}
                    maxLength={80}
                  />
                ) : (
                  <button
                    onClick={() => onLoadChat(item)}
                    className="flex-1 text-left text-[14px] px-4 py-3 truncate pr-2"
                    title={item.title}
                  >
                    {item.title}
                  </button>
                )}

                {/* ── Hover actions (rename + delete) ── */}
                {renamingId !== item.id && (
                  <div className={`absolute right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${s.actionsBg}`}>
                    <button
                      onClick={e => startRename(item, e)}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${s.actionBtn}`}
                      title="Rename"
                    >
                      <PencilIcon />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onDeleteHistory(item.id); }}
                      className={`w-7 h-7 flex items-center justify-center rounded-lg transition-colors ${s.deleteBtn}`}
                      title="Delete"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

/* ── Theme tokens ── */
const dark = {
  sidebar:          "bg-[#171717]",
  border:           "border-[#2a2a2a]",
  divider:          "border-[#2a2a2a]",
  logoText:         "text-[#ececec]",
  iconBtn:          "text-[#8e8ea0] hover:bg-[#2a2a2a] hover:text-white transition-colors",
  navItem:          "text-[#b0b0c0] hover:bg-[#2a2a2a]",
  navIcon:          "text-[#8e8ea0]",
  sectionLabel:     "text-[#4a4a4a]",
  emptyText:        "text-[#4a4a4a]",
  historyItem:      "text-[#c5c5d2] hover:bg-[#2a2a2a]",
  historyItemActive:"text-white bg-[#2a2a2a] font-medium",
  darkToggleBtn:    "text-[#8e8ea0] hover:bg-[#2a2a2a] hover:text-[#D2E600] transition-colors",
  renameInput:      "text-[#ececec]",
  actionsBg:        "bg-[#2a2a2a] rounded-lg px-0.5",
  actionBtn:        "text-[#8e8ea0] hover:text-white hover:bg-[#3a3a3a]",
  deleteBtn:        "text-[#8e8ea0] hover:text-red-400 hover:bg-[#3a3a3a]",
};

const light = {
  sidebar:          "bg-[#f9f9f9]",
  border:           "border-[#e5e5e5]",
  divider:          "border-[#e5e5e5]",
  logoText:         "text-[#111]",
  iconBtn:          "text-[#666] hover:bg-[#ebebeb] hover:text-[#111] transition-colors",
  navItem:          "text-[#4a4a4a] hover:bg-[#ebebeb]",
  navIcon:          "text-[#555]",
  sectionLabel:     "text-[#aaa]",
  emptyText:        "text-[#bbb]",
  historyItem:      "text-[#333] hover:bg-[#ebebeb]",
  historyItemActive:"text-[#111] bg-[#ebebeb] font-medium",
  darkToggleBtn:    "text-[#666] hover:bg-[#ebebeb] hover:text-[#b8a000] transition-colors",
  renameInput:      "text-[#111]",
  actionsBg:        "bg-[#ebebeb] rounded-lg px-0.5",
  actionBtn:        "text-[#666] hover:text-[#111] hover:bg-[#ddd]",
  deleteBtn:        "text-[#666] hover:text-red-500 hover:bg-[#ddd]",
};

/* ── Icons ── */
function SidebarCloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <polyline points="15 8 11 12 15 16" />
    </svg>
  );
}

function SidebarOpenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <polyline points="13 8 17 12 13 16" />
    </svg>
  );
}

function NewChatIcon({ size = 17 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
