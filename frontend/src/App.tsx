import { useEffect, useState } from "react";
import AnalyticsTab from "./components/AnalyticsTab";
import BrandTransferTab from "./components/BrandTransferTab";
import CSLandingPage, { type CSTab } from "./components/CSLandingPage";
import DashboardTab from "./components/DashboardTab";
import DataEntryTab from "./components/DataEntryTab";
import DeliveryTab from "./components/DeliveryTab";
import NotificationBell from "./components/NotificationBell";
import SalesLandingPage from "./components/SalesLandingPage";
import SalesTab from "./components/SalesTab";
import { ToastProvider } from "./Toast";
import { isDelivery, isPrivileged, isSales, USERS, userLabel } from "./types";

type TabKey =
  | "home"
  | "entry"
  | "analytics"
  | "dashboard"
  | "transfer"
  | "delivery"
  | "saleshome"
  | "sales";

const HOME_TAB: { key: TabKey; label: string } = { key: "home", label: "Home" };

// CS feature tabs (the landing sits in front of these).
const CS_FEATURE_TABS: { key: TabKey; label: string }[] = [
  { key: "entry", label: "Data Entry" },
  { key: "analytics", label: "Data View" },
  { key: "dashboard", label: "Merchant Info" },
];

export default function App() {
  const [tab, setTab] = useState<TabKey>("home");
  const [user, setUser] = useState("Swati");
  // bump to force notification refetch after entries are saved
  const [notifVersion, setNotifVersion] = useState(0);
  // Deep-link state for the Sales landing -> pipeline (pre-applied filters).
  // A bump on salesNav remounts SalesTab so the filters re-apply each jump.
  const [salesInit, setSalesInit] = useState<{ stage?: string; priority?: string }>({});
  const [salesNav, setSalesNav] = useState(0);
  // Bumped when the landing asks to open the notification drawer.
  const [notifOpenSignal, setNotifOpenSignal] = useState(0);

  const privileged = isPrivileged(user);
  const delivery = isDelivery(user);
  const sales = isSales(user);
  // Each role gets its own tab set. Handlers / Manager / Founders land on the CS
  // Home; Sales1 / Sales2 land on the Sales Home; Delivery goes straight to work.
  const tabs: { key: TabKey; label: string }[] = delivery
    ? [{ key: "delivery", label: "Delivery Queue" }]
    : sales
      ? [{ key: "saleshome", label: "Home" }, { key: "sales", label: "Sales Pipeline" }]
      : privileged
        ? [HOME_TAB, ...CS_FEATURE_TABS, { key: "transfer", label: "Brand Transfer" }]
        : [HOME_TAB, ...CS_FEATURE_TABS];

  function openSales(init?: { stage?: string; priority?: string }) {
    if (init) {
      setSalesInit(init);
      setSalesNav((n) => n + 1);
    }
    setTab("sales");
  }

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
          <NotificationBell user={user} version={notifVersion} openSignal={notifOpenSignal} />
          <div className="user-select">
            <span className="user-avatar">{userLabel(user)[0]}</span>
            <select value={user} onChange={(e) => setUser(e.target.value)} aria-label="Acting as">
              {USERS.map((u) => (
                <option key={u} value={u}>{userLabel(u)}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="page">
        {tab === "home" && !sales && !delivery && (
          <CSLandingPage
            user={user}
            onNavigate={(t: CSTab) => setTab(t)}
            onOpenNotifications={() => setNotifOpenSignal((s) => s + 1)}
          />
        )}
        {tab === "saleshome" && sales && (
          <SalesLandingPage user={user} onOpen={openSales} />
        )}
        {tab === "entry" && (
          <DataEntryTab user={user} onDataChanged={() => setNotifVersion((v) => v + 1)} />
        )}
        {tab === "analytics" && <AnalyticsTab user={user} />}
        {tab === "dashboard" && <DashboardTab user={user} />}
        {tab === "transfer" && privileged && (
          <BrandTransferTab user={user} onDataChanged={() => setNotifVersion((v) => v + 1)} />
        )}
        {tab === "delivery" && delivery && <DeliveryTab user={user} />}
        {tab === "sales" && sales && (
          <SalesTab
            key={salesNav}
            user={user}
            initialStage={salesInit.stage}
            initialPriority={salesInit.priority}
          />
        )}
      </main>
    </ToastProvider>
  );
}
