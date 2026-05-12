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

// ─── Route types ──────────────────────────────────────────────────────────────

type RouteId =
  | "w_tables" | "w_orders" | "w_order_create" | "w_order_details" | "w_payment"
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
}

const WAITER_NAV: NavItem[] = [
  { id: "w_tables", label: "Столы", icon: "🪑" },
  { id: "w_orders", label: "Заказы", icon: "📋" },
];

const KITCHEN_NAV: NavItem[] = [
  { id: "k_kds", label: "Дисплей", icon: "👨‍🍳" },
  { id: "k_history", label: "История", icon: "📜" },
];

const MANAGER_NAV: NavItem[] = [
  { id: "m_dashboard", label: "Дашборд", icon: "📊" },
  { id: "m_orders", label: "Заказы", icon: "📋" },
  { id: "m_tables", label: "Столы", icon: "🪑" },
  { id: "m_menu", label: "Меню", icon: "🍽" },
  { id: "m_users", label: "Сотрудники", icon: "👥" },
  { id: "m_payments", label: "Платежи", icon: "💳" },
  { id: "m_shifts", label: "Смены", icon: "🔄" },
  { id: "m_peripherals", label: "Устройства", icon: "🖨" },
  { id: "m_analytics", label: "Аналитика", icon: "📈" },
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

// ─── Full-screen routes (no sidebar) ─────────────────────────────────────────

const FULLSCREEN_ROUTES: RouteId[] = ["w_order_create", "w_payment"];

// ─── App shell ────────────────────────────────────────────────────────────────

function Shell() {
  const { state, logout } = useApp();
  const { user, token, toasts } = state;

  const [route, setRouteState] = useState<Route>({ id: DEFAULT_ROUTE[user!.role] });
  const setRoute = (r: { id: string; tableId?: number; orderId?: number }) =>
    setRouteState(r as Route);

  const nav = NAV_BY_ROLE[user!.role];
  const isFullscreen = FULLSCREEN_ROUTES.includes(route.id);

  const renderScreen = () => {
    switch (route.id) {
      // Waiter
      case "w_tables": return <WaiterTables setRoute={setRoute} />;
      case "w_orders": return <WaiterOrders setRoute={setRoute} />;
      case "w_order_create": return <OrderCreate tableId={route.tableId} orderId={route.orderId} setRoute={setRoute} />;
      case "w_order_details": return <OrderDetails orderId={route.orderId!} setRoute={setRoute} />;
      case "w_payment": return <WaiterPayment orderId={route.orderId!} setRoute={setRoute} />;
      // Kitchen
      case "k_kds": return <KitchenDisplay />;
      case "k_history": return <KitchenHistory />;
      // Manager
      case "m_dashboard": return <ManagerDashboard />;
      case "m_orders": return <ManagerOrders />;
      case "m_tables": return <ManagerTables />;
      case "m_menu": return <ManagerMenu />;
      case "m_users": return <ManagerUsers />;
      case "m_payments": return <ManagerPayments />;
      case "m_shifts": return <ManagerShifts />;
      case "m_peripherals": return <ManagerPeripherals />;
      case "m_analytics": return <ManagerAnalytics />;
      default: return <div style={{ padding: 40 }}>Страница не найдена</div>;
    }
  };

  if (isFullscreen) {
    return (
      <div className={`app role-${user!.role}`}>
        {renderScreen()}
        <ToastStack toasts={toasts} />
      </div>
    );
  }

  return (
    <div className={`app role-${user!.role}`}>
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand-mark">
          <span style={{ fontWeight: 800, fontSize: 17 }}>Flow<span style={{ opacity: 0.55 }}>POS</span></span>
        </div>

        <nav style={{ flex: 1, padding: "8px 0" }}>
          {nav.map(item => (
            <button
              key={item.id}
              className={`nav-item ${route.id === item.id ? "active" : ""}`}
              onClick={() => setRouteState({ id: item.id })}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* User info + logout */}
        <div style={{ padding: "12px 14px", borderTop: "1px solid var(--line-1)" }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{user!.full_name}</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 10 }}>
            {ROLE_LABEL[user!.role]} · {state.wsConnected ? (
              <span style={{ color: "var(--green)" }}>●</span>
            ) : (
              <span style={{ color: "var(--red)" }}>●</span>
            )}
          </div>
          <button
            className="btn sm"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={logout}
          >
            Выйти
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main">
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          {renderScreen()}
        </div>
      </div>

      <ToastStack toasts={toasts} />
    </div>
  );
}

const ROLE_LABEL: Record<UserRole, string> = { manager: "Менеджер", waiter: "Официант", kitchen: "Кухня" };

// ─── Toast stack ──────────────────────────────────────────────────────────────

function ToastStack({ toasts }: { toasts: Array<{ id: string; kind: string; text: string }> }) {
  return (
    <div style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      zIndex: 9999,
      pointerEvents: "none",
    }}>
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast ${t.kind}`}
          style={{ pointerEvents: "auto", animation: "slideIn 220ms ease" }}
        >
          {t.text}
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
