import { AppProvider, useApp } from "./lib/store";
import { Login } from "./screens/Login";
import { WaiterTables, WaiterOrders } from "./screens/Waiter";
import { OrderCreate } from "./screens/OrderCreate";
import { OrderDetails, WaiterPayment } from "./screens/OrderDetails";
import { KitchenDisplay, KitchenHistory } from "./screens/Kitchen";
import {
  ManagerDashboard,
  ManagerOrders,
  ManagerMenu,
  ManagerTables,
  ManagerUsers,
  ManagerPayments,
  ManagerShifts,
  ManagerPeripherals,
  ManagerAnalytics,
} from "./screens/Manager";
import { useState } from "react";
import type { UserRole } from "./types";
import { Icon } from "./components/Icon";

// ─── Route types ──────────────────────────────────────────────────────────────

type RouteId =
  | "w_tables" | "w_orders" | "w_order_create" | "w_order_details" | "w_payment" | "w_payments" | "w_shifts"
  | "k_kds" | "k_history"
  | "m_dashboard" | "m_orders" | "m_kitchen" | "m_tables" | "m_menu" | "m_users" | "m_payments" | "m_shifts" | "m_peripherals" | "m_analytics";

interface Route {
  id: RouteId;
  tableId?: number;
  orderId?: number;
}

// ─── Navigation config ────────────────────────────────────────────────────────

interface NavItem {
  id: RouteId;
  label: string;
  icon: string;
  badge?: "live";
}

const WAITER_NAV: NavItem[] = [
  { id: "w_tables", label: "Столы", icon: "tables" },
  { id: "w_orders", label: "Мои заказы", icon: "orders", badge: "live" },
];

const KITCHEN_NAV: NavItem[] = [
  { id: "k_kds", label: "Дисплей кухни", icon: "kitchen" },
  { id: "k_history", label: "История", icon: "clock" },
];

const MANAGER_NAV: NavItem[] = [
  { id: "m_dashboard", label: "Обзор смены", icon: "dashboard" },
  { id: "m_orders", label: "Активные заказы", icon: "orders", badge: "live" },
  { id: "m_kitchen", label: "Кухня", icon: "kitchen" },
  { id: "m_tables", label: "Столы", icon: "tables" },
  { id: "m_menu", label: "Меню", icon: "menu" },
  { id: "m_users", label: "Сотрудники", icon: "users" },
  { id: "m_payments", label: "Платежи", icon: "money" },
  { id: "m_shifts", label: "Смены", icon: "shift" },
  { id: "m_peripherals", label: "Принтеры и устройства", icon: "print" },
  { id: "m_analytics", label: "Аналитика", icon: "analytics" },
];

const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  waiter: WAITER_NAV,
  kitchen: KITCHEN_NAV,
  manager: MANAGER_NAV,
};

const DEFAULT_ROUTE: Record<UserRole, RouteId> = {
  waiter: "w_tables",
  kitchen: "k_kds",
  manager: "m_dashboard",
};

const ROLE_SECTION_LABEL: Record<UserRole, string> = {
  manager: "Менеджер",
  waiter: "Официант",
  kitchen: "Кухня",
};

// ─── Full-screen routes (no sidebar) ─────────────────────────────────────────

const FULLSCREEN_ROUTES: RouteId[] = ["w_order_create", "w_payment"];

// ─── App shell ────────────────────────────────────────────────────────────────

function Shell() {
  const { state, logout } = useApp();
  const { user, orders, toasts } = state;

  const [route, setRouteState] = useState<Route>({ id: DEFAULT_ROUTE[user!.role] });
  const setRoute = (r: { id: string; tableId?: number; orderId?: number }) =>
    setRouteState(r as Route);

  const nav = NAV_BY_ROLE[user!.role];
  const isFullscreen = FULLSCREEN_ROUTES.includes(route.id);

  const liveCount = orders.filter(o => ["pending", "in_progress", "ready"].includes(o.status)).length;

  const initials = user!.full_name
    .split(" ")
    .slice(0, 2)
    .map(w => w[0])
    .join("")
    .toUpperCase();

  const renderScreen = () => {
    switch (route.id) {
      case "w_tables":       return <WaiterTables setRoute={setRoute} />;
      case "w_orders":       return <WaiterOrders setRoute={setRoute} />;
      case "w_order_create": return <OrderCreate tableId={route.tableId} orderId={route.orderId} setRoute={setRoute} />;
      case "w_order_details":return <OrderDetails orderId={route.orderId!} setRoute={setRoute} />;
      case "w_payment":      return <WaiterPayment orderId={route.orderId!} setRoute={setRoute} />;
      case "w_payments":     return <ManagerPayments />;
      case "w_shifts":       return <ManagerShifts />;
      case "k_kds":          return <KitchenDisplay />;
      case "k_history":      return <KitchenHistory />;
      case "m_dashboard":    return <ManagerDashboard />;
      case "m_orders":       return <ManagerOrders />;
      case "m_kitchen":      return <KitchenDisplay />;
      case "m_tables":       return <ManagerTables />;
      case "m_menu":         return <ManagerMenu />;
      case "m_users":        return <ManagerUsers />;
      case "m_payments":     return <ManagerPayments />;
      case "m_shifts":       return <ManagerShifts />;
      case "m_peripherals":  return <ManagerPeripherals />;
      case "m_analytics":    return <ManagerAnalytics />;
      default: return <div style={{ padding: 40 }}>Страница не найдена</div>;
    }
  };

  if (isFullscreen) {
    return (
      <div className={`app role-${user!.role} fullscreen`}>
        {renderScreen()}
        <Toasts toasts={toasts} />
      </div>
    );
  }

  return (
    <div className={`app role-${user!.role}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Brand */}
        <div className="brand">
          <div className="brand-mark">F</div>
          <div>
            <div className="brand-name">Flow<span style={{ color: "var(--brand)" }}>POS</span></div>
            <div className="brand-sub">Кафе · смена #41</div>
          </div>
        </div>

        {/* Nav */}
        <div className="nav-section">
          <div className="nav-section-title">{ROLE_SECTION_LABEL[user!.role]}</div>
          {nav.map(item => (
            <div
              key={item.id}
              className={`nav-item ${route.id === item.id ? "active" : ""}`}
              onClick={() => setRouteState({ id: item.id })}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
              {item.badge === "live" && liveCount > 0 && (
                <span className="nbadge">{liveCount}</span>
              )}
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {user!.role === "manager" && (
          <div className="nav-section">
            <div className="nav-item" onClick={() => setRouteState({ id: "m_peripherals" })}>
              <Icon name="settings" /><span>Настройки</span>
            </div>
          </div>
        )}

        {/* User footer */}
        <div className="me">
          <div className="avatar" style={{ background: "var(--brand-50)", color: "var(--brand-700)" }}>
            {initials}
          </div>
          <div className="me-info">
            <div className="me-name">{user!.full_name}</div>
            <div className="me-role">{ROLE_SECTION_LABEL[user!.role]}</div>
          </div>
          <button className="me-out" title="Выйти" onClick={logout}>
            <Icon name="logout" size={16} />
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main">
        {renderScreen()}
      </div>

      <Toasts toasts={toasts} />
    </div>
  );
}

// ─── Toasts ───────────────────────────────────────────────────────────────────

function Toasts({ toasts }: { toasts: Array<{ id: string; kind: string; text: string }> }) {
  return (
    <div className="toasts">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.kind === "error" ? "warn" : t.kind}`}>
          <Icon
            name={t.kind === "error" || t.kind === "warning" ? "warning" : t.kind === "success" ? "check" : "info"}
            size={16}
          />
          <div>
            <div className="tt">{t.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

function AppGate() {
  const { state } = useApp();

  if (state.loading && !state.user) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "var(--bg-canvas)" }}>
        <div style={{ textAlign: "center" }}>
          <div className="spin" style={{ width: 40, height: 40, margin: "0 auto 16px", borderRadius: "50%", border: "3px solid var(--line-2)", borderTopColor: "var(--brand)" }} />
          <div style={{ color: "var(--ink-3)" }}>Загрузка...</div>
        </div>
      </div>
    );
  }

  if (!state.token || !state.user) {
    return <Login />;
  }

  return <Shell />;
}

function App() {
  return (
    <AppProvider>
      <AppGate />
    </AppProvider>
  );
}

export default App;
