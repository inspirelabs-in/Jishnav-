import { useEffect, useState } from "react";
import AnalyticsTab from "./components/AnalyticsTab";
import BrandTransferTab from "./components/BrandTransferTab";
import DashboardTab from "./components/DashboardTab";
import DataEntryTab from "./components/DataEntryTab";
import DeliveryTab from "./components/DeliveryTab";
import NotificationBell from "./components/NotificationBell";
import { ToastProvider } from "./Toast";
import { isDelivery, isPrivileged, USERS } from "./types";

type TabKey = "entry" | "analytics" | "dashboard" | "transfer" | "delivery";

const BASE_TABS: { key: TabKey; label: string }[] = [
  { key: "entry", label: "Data Entry" },
  { key: "analytics", label: "Analytics" },
  { key: "dashboard", label: "Dashboard" },
];

export default function App() {
  const [tab, setTab] = useState<TabKey>("entry");
  const [user, setUser] = useState("Swati");
  // bump to force notification refetch after entries are saved
  const [notifVersion, setNotifVersion] = useState(0);

  const privileged = isPrivileged(user);
  const delivery = isDelivery(user);
  // The Delivery role has a single focused tab; everyone else gets the workspace.
  const tabs: { key: TabKey; label: string }[] = delivery
    ? [{ key: "delivery", label: "Delivery Queue" }]
    : privileged
      ? [...BASE_TABS, { key: "transfer", label: "Brand Transfer" }]
      : BASE_TABS;

  // If the active tab is not available for this role, fall back to the first one.
  useEffect(() => {
    if (!tabs.some((t) => t.key === tab)) setTab(tabs[0].key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <ToastProvider>
      <header className="header">
        <div className="brand">
          <span className="brand-co">GrabOn</span>
          <span className="brand-name">CR Portal</span>
        </div>
        <nav className="tabs">
          {tabs.map((t) => (
            <button
              key={t.key}
              className={`tab-btn ${tab === t.key ? "active" : ""}`}
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="header-right">
          <NotificationBell user={user} version={notifVersion} />
          <div className="user-select">
            <span className="user-avatar">{user[0]}</span>
            <select value={user} onChange={(e) => setUser(e.target.value)} aria-label="Acting as">
              {USERS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="page">
        {tab === "entry" && (
          <DataEntryTab user={user} onDataChanged={() => setNotifVersion((v) => v + 1)} />
        )}
        {tab === "analytics" && <AnalyticsTab user={user} />}
        {tab === "dashboard" && <DashboardTab user={user} />}
        {tab === "transfer" && privileged && (
          <BrandTransferTab user={user} onDataChanged={() => setNotifVersion((v) => v + 1)} />
        )}
        {tab === "delivery" && delivery && <DeliveryTab user={user} />}
      </main>
    </ToastProvider>
  );
}
