import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
} from "react";
import { api } from "./api";
import { clearToken, clearUser, getDeviceId, loadToken, loadUser, saveToken, saveUser } from "./storage";
import type {
  Category,
  KitchenBoard,
  LiveEvent,
  MenuItem,
  Order,
  OrderItemInput,
  OrderPriority,
  OrderStatus,
  Payment,
  PeripheralDevice,
  PrintJob,
  Refund,
  Shift,
  Table,
  TableOverview,
  User,
  WaiterBoard,
} from "../types";

// ─── State ──────────────────────────────────────────────────────────────────

export type ToastKind = "success" | "error" | "info" | "warning";

export interface ToastMessage {
  id: string;
  kind: ToastKind;
  text: string;
}

export interface AppState {
  token: string | null;
  user: User | null;
  tables: TableOverview[];
  categories: Category[];
  items: MenuItem[];
  orders: Order[];
  payments: Payment[];
  shifts: Shift[];
  currentShift: Shift | null;
  refunds: Refund[];
  devices: PeripheralDevice[];
  printJobs: PrintJob[];
  waiterBoard: WaiterBoard | null;
  kitchenBoard: KitchenBoard | null;
  toasts: ToastMessage[];
  loading: boolean;
  wsConnected: boolean;
}

type Action =
  | { type: "SET_AUTH"; token: string; user: User }
  | { type: "CLEAR_AUTH" }
  | { type: "SET_TABLES"; tables: TableOverview[] }
  | { type: "SET_CATEGORIES"; categories: Category[] }
  | { type: "SET_ITEMS"; items: MenuItem[] }
  | { type: "SET_ORDERS"; orders: Order[] }
  | { type: "UPSERT_ORDER"; order: Order }
  | { type: "SET_PAYMENTS"; payments: Payment[] }
  | { type: "SET_SHIFTS"; shifts: Shift[] }
  | { type: "SET_CURRENT_SHIFT"; shift: Shift | null }
  | { type: "SET_REFUNDS"; refunds: Refund[] }
  | { type: "SET_DEVICES"; devices: PeripheralDevice[] }
  | { type: "SET_PRINT_JOBS"; printJobs: PrintJob[] }
  | { type: "SET_WAITER_BOARD"; board: WaiterBoard }
  | { type: "SET_KITCHEN_BOARD"; board: KitchenBoard }
  | { type: "ADD_TOAST"; toast: ToastMessage }
  | { type: "REMOVE_TOAST"; id: string }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_WS"; connected: boolean };

const initial: AppState = {
  token: loadToken(),
  user: loadUser(),
  tables: [],
  categories: [],
  items: [],
  orders: [],
  payments: [],
  shifts: [],
  currentShift: null,
  refunds: [],
  devices: [],
  printJobs: [],
  waiterBoard: null,
  kitchenBoard: null,
  toasts: [],
  loading: false,
  wsConnected: false,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "SET_AUTH":
      return { ...state, token: action.token, user: action.user };
    case "CLEAR_AUTH":
      return { ...state, token: null, user: null };
    case "SET_TABLES":
      return { ...state, tables: action.tables };
    case "SET_CATEGORIES":
      return { ...state, categories: action.categories };
    case "SET_ITEMS":
      return { ...state, items: action.items };
    case "SET_ORDERS":
      return { ...state, orders: action.orders };
    case "UPSERT_ORDER": {
      const exists = state.orders.find((o) => o.id === action.order.id);
      return {
        ...state,
        orders: exists
          ? state.orders.map((o) => (o.id === action.order.id ? action.order : o))
          : [action.order, ...state.orders],
      };
    }
    case "SET_PAYMENTS":
      return { ...state, payments: action.payments };
    case "SET_SHIFTS":
      return { ...state, shifts: action.shifts };
    case "SET_CURRENT_SHIFT":
      return { ...state, currentShift: action.shift };
    case "SET_REFUNDS":
      return { ...state, refunds: action.refunds };
    case "SET_DEVICES":
      return { ...state, devices: action.devices };
    case "SET_PRINT_JOBS":
      return { ...state, printJobs: action.printJobs };
    case "SET_WAITER_BOARD":
      return { ...state, waiterBoard: action.board };
    case "SET_KITCHEN_BOARD":
      return { ...state, kitchenBoard: action.board };
    case "ADD_TOAST":
      return { ...state, toasts: [...state.toasts, action.toast] };
    case "REMOVE_TOAST":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    case "SET_WS":
      return { ...state, wsConnected: action.connected };
    default:
      return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface AppContext {
  state: AppState;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  toast: (kind: ToastKind, text: string) => void;
  refreshTables: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  refreshMenu: () => Promise<void>;
  refreshWaiterBoard: () => Promise<void>;
  refreshKitchenBoard: () => Promise<void>;
  refreshPayments: () => Promise<void>;
  refreshShifts: () => Promise<void>;
  refreshDevices: () => Promise<void>;
  createOrder: (payload: {
    table_id: number;
    priority: OrderPriority;
    customer_note?: string;
    items: OrderItemInput[];
  }) => Promise<Order>;
  updateOrder: (
    orderId: number,
    payload: { priority?: OrderPriority; customer_note?: string; items?: OrderItemInput[] }
  ) => Promise<Order>;
  changeStatus: (orderId: number, status: OrderStatus, message?: string) => Promise<Order>;
  createPayment: (payload: {
    order_id: number;
    method: string;
    amount_received?: number;
    discount_type?: string;
    discount_value?: number;
    tip_amount?: number;
  }) => Promise<Payment>;
  updateItemStatus: (orderId: number, itemId: number, status: string) => Promise<void>;
  openShift: (cash: number) => Promise<Shift>;
  closeShift: (cash: number, note?: string) => Promise<Shift>;
}

const Ctx = createContext<AppContext | null>(null);

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const wsRef = useRef<WebSocket | null>(null);
  const toastTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const toast = useCallback((kind: ToastKind, text: string) => {
    const id = crypto.randomUUID();
    dispatch({ type: "ADD_TOAST", toast: { id, kind, text } });
    const timer = setTimeout(() => {
      dispatch({ type: "REMOVE_TOAST", id });
      toastTimers.current.delete(id);
    }, 4000);
    toastTimers.current.set(id, timer);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    clearUser();
    dispatch({ type: "CLEAR_AUTH" });
    wsRef.current?.close();
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const tokenRes = await api.login(username, password);
    const user = await api.me(tokenRes.access_token);
    saveToken(tokenRes.access_token);
    saveUser(user);
    dispatch({ type: "SET_AUTH", token: tokenRes.access_token, user });
  }, []);

  // WebSocket connection
  const connectWs = useCallback((token: string) => {
    if (wsRef.current) wsRef.current.close();
    const wsBase = api.baseUrl.replace(/^http/, "ws");
    const ws = new WebSocket(`${wsBase}/ws/orders?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => dispatch({ type: "SET_WS", connected: true });
    ws.onclose = () => {
      dispatch({ type: "SET_WS", connected: false });
      // Reconnect after 5s
      setTimeout(() => {
        const t = loadToken();
        if (t) connectWs(t);
      }, 5000);
    };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => {
      try {
        const ev: LiveEvent = JSON.parse(e.data);
        if (ev.type === "connected") return;
        const t = loadToken();
        if (!t) return;
        if (ev.type === "order.created" || ev.type === "order.updated" || ev.type === "order.status_changed" || ev.type === "order.paid") {
          api.order(t, ev.order_id).then((order) => dispatch({ type: "UPSERT_ORDER", order })).catch(() => {});
          api.tableOverview(t).then((tables) => dispatch({ type: "SET_TABLES", tables })).catch(() => {});
          const role = loadUser()?.role;
          if (role === "kitchen" || role === "manager") {
            api.kitchenBoard(t).then((board) => dispatch({ type: "SET_KITCHEN_BOARD", board })).catch(() => {});
          }
        }
      } catch {
        // ignore malformed messages
      }
    };
  }, []);

  // Bootstrap data when authenticated
  useEffect(() => {
    const { token, user } = state;
    if (!token || !user) return;

    connectWs(token);

    const loadBase = async () => {
      dispatch({ type: "SET_LOADING", loading: true });
      try {
        const [tables, categories, items] = await Promise.all([
          api.tableOverview(token),
          api.categories(token),
          api.menuItems(token, { available: true }),
        ]);
        dispatch({ type: "SET_TABLES", tables });
        dispatch({ type: "SET_CATEGORIES", categories });
        dispatch({ type: "SET_ITEMS", items });

        if (user.role === "waiter") {
          const board = await api.waiterBoard(token);
          dispatch({ type: "SET_WAITER_BOARD", board });
          dispatch({ type: "SET_ORDERS", orders: board.active_orders });
        } else if (user.role === "kitchen") {
          const [board, orders] = await Promise.all([
            api.kitchenBoard(token),
            api.orders(token, { limit: 200 }),
          ]);
          dispatch({ type: "SET_KITCHEN_BOARD", board });
          dispatch({ type: "SET_ORDERS", orders });
        } else if (user.role === "manager") {
          const [orders, devices] = await Promise.all([
            api.orders(token, { limit: 200 }),
            api.devices(token),
          ]);
          dispatch({ type: "SET_ORDERS", orders });
          dispatch({ type: "SET_DEVICES", devices });
        }
      } catch (err) {
        toast("error", "Ошибка загрузки данных");
      } finally {
        dispatch({ type: "SET_LOADING", loading: false });
      }
    };

    loadBase();
    return () => { wsRef.current?.close(); };
  }, [state.token]);

  // ── Refresh helpers ──

  const refreshTables = useCallback(async () => {
    if (!state.token) return;
    const tables = await api.tableOverview(state.token);
    dispatch({ type: "SET_TABLES", tables });
  }, [state.token]);

  const refreshOrders = useCallback(async () => {
    if (!state.token) return;
    const orders = await api.orders(state.token, { limit: 200 });
    dispatch({ type: "SET_ORDERS", orders });
  }, [state.token]);

  const refreshMenu = useCallback(async () => {
    if (!state.token) return;
    const [categories, items] = await Promise.all([
      api.categories(state.token),
      api.menuItems(state.token),
    ]);
    dispatch({ type: "SET_CATEGORIES", categories });
    dispatch({ type: "SET_ITEMS", items });
  }, [state.token]);

  const refreshWaiterBoard = useCallback(async () => {
    if (!state.token) return;
    const board = await api.waiterBoard(state.token);
    dispatch({ type: "SET_WAITER_BOARD", board });
  }, [state.token]);

  const refreshKitchenBoard = useCallback(async () => {
    if (!state.token) return;
    const board = await api.kitchenBoard(state.token);
    dispatch({ type: "SET_KITCHEN_BOARD", board });
  }, [state.token]);

  const refreshPayments = useCallback(async () => {
    if (!state.token) return;
    const payments = await api.payments(state.token);
    dispatch({ type: "SET_PAYMENTS", payments });
  }, [state.token]);

  const refreshShifts = useCallback(async () => {
    if (!state.token) return;
    const shifts = await api.shifts(state.token);
    const current = await api.currentShift(state.token);
    dispatch({ type: "SET_SHIFTS", shifts });
    dispatch({ type: "SET_CURRENT_SHIFT", shift: current });
  }, [state.token]);

  const refreshDevices = useCallback(async () => {
    if (!state.token) return;
    const devices = await api.devices(state.token);
    dispatch({ type: "SET_DEVICES", devices });
  }, [state.token]);

  // ── Mutations ──

  const createOrder = useCallback(async (payload: {
    table_id: number; priority: OrderPriority; customer_note?: string; items: OrderItemInput[];
  }) => {
    if (!state.token) throw new Error("Not authenticated");
    const order = await api.createOrder(state.token, {
      ...payload,
      client_request_id: crypto.randomUUID(),
      source_device_id: getDeviceId(),
    });
    dispatch({ type: "UPSERT_ORDER", order });
    return order;
  }, [state.token]);

  const updateOrder = useCallback(async (orderId: number, payload: {
    priority?: OrderPriority; customer_note?: string; items?: OrderItemInput[];
  }) => {
    if (!state.token) throw new Error("Not authenticated");
    const order = await api.updateOrder(state.token, orderId, payload);
    dispatch({ type: "UPSERT_ORDER", order });
    return order;
  }, [state.token]);

  const changeStatus = useCallback(async (orderId: number, status: OrderStatus, message?: string) => {
    if (!state.token) throw new Error("Not authenticated");
    const order = await api.changeOrderStatus(state.token, orderId, status, message);
    dispatch({ type: "UPSERT_ORDER", order });
    return order;
  }, [state.token]);

  const createPayment = useCallback(async (payload: {
    order_id: number; method: string; amount_received?: number; discount_type?: string; discount_value?: number; tip_amount?: number;
  }) => {
    if (!state.token) throw new Error("Not authenticated");
    const payment = await api.createPayment(state.token, payload);
    dispatch({ type: "SET_PAYMENTS", payments: [payment, ...state.payments] });
    const [order, tables] = await Promise.all([
      api.order(state.token, payload.order_id),
      api.tableOverview(state.token),
    ]);
    dispatch({ type: "UPSERT_ORDER", order });
    dispatch({ type: "SET_TABLES", tables });
    return payment;
  }, [state.token, state.payments]);

  const updateItemStatus = useCallback(async (orderId: number, itemId: number, status: string) => {
    if (!state.token) throw new Error("Not authenticated");
    await api.updateItemStatus(state.token, orderId, itemId, status);
    const order = await api.order(state.token, orderId);
    dispatch({ type: "UPSERT_ORDER", order });
  }, [state.token]);

  const openShift = useCallback(async (cash: number) => {
    if (!state.token) throw new Error("Not authenticated");
    const shift = await api.openShift(state.token, cash);
    dispatch({ type: "SET_CURRENT_SHIFT", shift });
    return shift;
  }, [state.token]);

  const closeShift = useCallback(async (cash: number, note?: string) => {
    if (!state.token) throw new Error("Not authenticated");
    if (!state.currentShift) throw new Error("No open shift");
    const shift = await api.closeShift(state.token, state.currentShift.id, cash, note);
    dispatch({ type: "SET_CURRENT_SHIFT", shift: null });
    return shift;
  }, [state.token, state.currentShift]);

  return (
    <Ctx.Provider value={{
      state,
      login,
      logout,
      toast,
      refreshTables,
      refreshOrders,
      refreshMenu,
      refreshWaiterBoard,
      refreshKitchenBoard,
      refreshPayments,
      refreshShifts,
      refreshDevices,
      createOrder,
      updateOrder,
      changeStatus,
      updateItemStatus,
      createPayment,
      openShift,
      closeShift,
    }}>
      {children}
    </Ctx.Provider>
  );
}
