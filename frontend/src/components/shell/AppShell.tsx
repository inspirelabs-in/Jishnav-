import { type ReactNode, useEffect, useState } from "react";
import Sidebar, { type NavGroup } from "./Sidebar";

type Props = {
  groups: NavGroup[];
  activeKey: string;
  title: string;
  onNavigate: (key: string) => void;
  user: string;
  users: string[];
  userLabel: (u: string) => string;
  userRole: string;
  onUserChange: (u: string) => void;
  topbarRight?: ReactNode;
  children: ReactNode;
};

export default function AppShell({
  groups, activeKey, title, onNavigate,
  user, users, userLabel, userRole, onUserChange,
  topbarRight, children,
}: Props) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("cr.sidebar") === "collapsed");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("cr.sidebar", collapsed ? "collapsed" : "expanded");
  }, [collapsed]);

  // close the mobile drawer on navigation
  function navigate(key: string) {
    onNavigate(key);
    setMobileOpen(false);
  }

  // Escape closes the mobile drawer
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  return (
    <div className={`shell ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`}>
      <div className="sb-scrim" onClick={() => setMobileOpen(false)} aria-hidden="true" />

      <Sidebar
        groups={groups}
        activeKey={activeKey}
        collapsed={collapsed}
        onNavigate={navigate}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        user={user}
        users={users}
        userLabel={userLabel}
        userRole={userRole}
        onUserChange={onUserChange}
      />

      <div className="main-col">
        <header className="topbar">
          <button className="tb-menu" type="button" aria-label="Open menu" onClick={() => setMobileOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
          </button>
          <div className="tb-crumb">
            CR Portal <span className="sep">/</span> <b>{title}</b>
          </div>
          <div className="tb-right">{topbarRight}</div>
        </header>

        <main className="shell-content">{children}</main>
      </div>
    </div>
  );
}
