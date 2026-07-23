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
import AppShell from "./components/shell/AppShell";
import type { NavGroup } from "./components/shell/Sidebar";
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

const TITLES: Record<TabKey, string> = {
  home: "Home",
  entry: "Data Entry",
  analytics: "Data View",
  dashboard: "Merchant Info",
  transfer: "Brand Transfer",
  delivery: "Delivery Queue",
  saleshome: "Home",
  sales: "Sales Pipeline",
};

export default function App() {
  const [tab, setTab] = useState<TabKey>("home");
  const [user, setUser] = useState("Swati");
  // bump to force notification refetch after entries are saved
  const [notifVersion, setNotifVersion] = useState(0);
  // Deep-link state for the Sales landing -> pipeline (pre-applied filters).
  const [salesInit, setSalesInit] = useState<{ stage?: string; priority?: string }>({});
  const [salesNav, setSalesNav] = useState(0);
  // Bumped when the landing asks to open the notification drawer.
  const [notifOpenSignal, setNotifOpenSignal] = useState(0);

  const privileged = isPrivileged(user);
  const delivery = isDelivery(user);
  const sales = isSales(user);

  // Sidebar sections per role (mirrors the old tab sets exactly).
  const CS_WORKSPACE = [
    { key: "home", label: "Home" },
    { key: "entry", label: "Data Entry" },
    { key: "analytics", label: "Data View" },
    { key: "dashboard", label: "Merchant Info" },
  ];
  const groups: NavGroup[] = delivery
    ? [{ title: "Workspace", items: [{ key: "delivery", label: "Delivery Queue" }] }]
    : sales
      ? [{ title: "Workspace", items: [{ key: "saleshome", label: "Home" }, { key: "sales", label: "Sales Pipeline" }] }]
      : privileged
        ? [
            { title: "Workspace", items: CS_WORKSPACE },
            { title: "Manage", items: [{ key: "transfer", label: "Brand Transfer" }] },
          ]
        : [{ title: "Workspace", items: CS_WORKSPACE }];

  const flatKeys = groups.flatMap((g) => g.items.map((i) => i.key));
  const roleLabel = delivery
    ? "Delivery"
    : sales
      ? "Sales"
      : user === "Manager"
        ? "Manager"
        : user === "Founders Office"
          ? "Founders"
          : "Handler";

  function openSales(init?: { stage?: string; priority?: string }) {
    if (init) {
      setSalesInit(init);
      setSalesNav((n) => n + 1);
    }
    setTab("sales");
  }

  // If the active section is not available for this role, fall back to the first.
  useEffect(() => {
    if (!flatKeys.includes(tab)) setTab(flatKeys[0] as TabKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <ToastProvider>
      <AppShell
        groups={groups}
        activeKey={tab}
        title={TITLES[tab]}
        onNavigate={(k) => setTab(k as TabKey)}
        user={user}
        users={USERS}
        userLabel={userLabel}
        userRole={roleLabel}
        onUserChange={setUser}
        topbarRight={
          <NotificationBell user={user} version={notifVersion} openSignal={notifOpenSignal} />
        }
      >
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
      </AppShell>
    </ToastProvider>
  );
}
