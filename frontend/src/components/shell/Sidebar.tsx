import { useLayoutEffect, useRef, useState } from "react";
import wordmark from "../../assets/inspirelabs-wordmark.png";
import BrandMark from "./BrandMark";
import { NavIcon } from "./NavIcons";

export type NavItem = { key: string; label: string; count?: number; flag?: boolean };
export type NavGroup = { title: string; items: NavItem[] };

type Props = {
  groups: NavGroup[];
  activeKey: string;
  collapsed: boolean;
  onNavigate: (key: string) => void;
  onToggleCollapse: () => void;
  // acting-as
  user: string;
  users: string[];
  userLabel: (u: string) => string;
  userRole: string;
  onUserChange: (u: string) => void;
};

export default function Sidebar({
  groups, activeKey, collapsed, onNavigate, onToggleCollapse,
  user, users, userLabel, userRole, onUserChange,
}: Props) {
  const navRef = useRef<HTMLDivElement>(null);
  const [indY, setIndY] = useState<number | null>(null);

  // slide the "you are here" tick to the active item. offsetTop is measured
  // from the nav's border, but the indicator's absolute origin sits at the
  // padding edge — subtract the padding so the two share one baseline.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>(`.sb-item[data-key="${activeKey}"]`);
    if (nav && el) {
      const padTop = parseFloat(getComputedStyle(nav).paddingTop) || 0;
      setIndY(el.offsetTop - padTop + (el.offsetHeight - 20) / 2);
    } else setIndY(null);
  }, [activeKey, groups, collapsed]);

  return (
    <aside className="sidebar">
      {/* Brand: the Inspirelabs wordmark + CRM when open; when collapsed the
          symbol alone stands in AND becomes the button that re-opens the rail. */}
      <div className="sb-brand">
        <button
          type="button"
          className="sb-logo"
          onClick={collapsed ? onToggleCollapse : undefined}
          aria-label={collapsed ? "Open sidebar" : undefined}
          data-tip={collapsed ? "Open" : undefined}
          data-tip-pos="bottom"
          tabIndex={collapsed ? 0 : -1}
        >
          <span className="sb-symbol"><BrandMark size={28} /></span>
          <span className="sb-word">
            <img className="sb-wordmark" src={wordmark} alt="Inspirelabs" draggable={false} />
            <span className="sb-crm">CRM</span>
          </span>
        </button>

        {/* collapse control — a panel handle, not a bare chevron; open-only */}
        <button
          type="button"
          className="sb-collapse"
          onClick={onToggleCollapse}
          aria-label="Collapse sidebar"
          data-tip="Collapse"
          data-tip-pos="bottom"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <path d="M10 4v16" />
            <path d="M16.5 9.5 14 12l2.5 2.5" />
          </svg>
        </button>
      </div>

      <div className="sb-nav" ref={navRef}>
        <span className={`sb-indicator ${indY === null ? "is-hidden" : ""}`} style={indY !== null ? { transform: `translateY(${indY}px)` } : undefined} />
        {groups.map((g) => (
          <div className="sb-group" key={g.title}>
            <div className="sb-group-h">{g.title}</div>
            {g.items.map((it) => (
              <button
                key={it.key}
                data-key={it.key}
                className={`sb-item ${activeKey === it.key ? "is-active" : ""}`}
                onClick={() => onNavigate(it.key)}
                aria-current={activeKey === it.key ? "page" : undefined}
                data-tip={collapsed ? it.label : undefined}
              >
                <NavIcon name={it.key} />
                <span className="sb-label">{it.label}</span>
                {it.count != null && (
                  <span className={`sb-count ${it.flag ? "is-flag" : ""}`}>{it.count}</span>
                )}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="sb-foot">
        <div className="sb-user-wrap">
          <button className="sb-user" type="button" data-tip={collapsed ? userLabel(user) : undefined}>
            <span className="sb-avatar">{userLabel(user)[0]}</span>
            <span className="sb-user-txt">
              <span className="sb-user-name">{userLabel(user)}</span>
            </span>
            <svg className="sb-user-caret" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 9l4-4 4 4M8 15l4 4 4-4" /></svg>
          </button>
          <select
            className="sb-user-select"
            value={user}
            onChange={(e) => onUserChange(e.target.value)}
            aria-label={`Acting as ${userLabel(user)}, ${userRole}`}
          >
            {users.map((u) => (
              <option key={u} value={u}>{userLabel(u)}</option>
            ))}
          </select>
        </div>
      </div>
    </aside>
  );
}
