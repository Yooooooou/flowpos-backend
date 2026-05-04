import type {
  AnalyticsSummary,
  Category,
  KitchenBoard,
  MenuItem,
  OfflineDraftOrder,
  Order,
  OrderItemInput,
  OrderStatus,
  PeripheralDevice,
  SyncResult,
  Table,
  TableOverview,
  TokenResponse,
  User,
  WaiterBoard
} from "../types";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  (window.location.port === "5173" ? "http://127.0.0.1" : window.location.origin);

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  baseUrl: API_BASE,
  async login(username: string, password: string) {
    const body = new URLSearchParams({
      username,
      password
    });
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Invalid username or password");
    }
    return (await response.json()) as TokenResponse;
  },
  me(token: string) {
    return request<User>("/auth/me", {}, token);
  },
  tables(token: string) {
    return request<Table[]>("/tables", {}, token);
  },
  tableOverview(token: string) {
    return request<TableOverview[]>("/tables/overview", {}, token);
  },
  menuItems(token: string, params: Record<string, string | boolean | number | undefined> = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        query.set(key, String(value));
      }
    });
    const suffix = query.size ? `?${query.toString()}` : "";
    return request<MenuItem[]>(`/menu/items${suffix}`, {}, token);
  },
  categories(token: string) {
    return request<Category[]>("/menu/categories", {}, token);
  },
  createOrder(
    token: string,
    payload: {
      table_id: number;
      priority: string;
      customer_note?: string;
      items: OrderItemInput[];
      client_request_id?: string;
      source_device_id?: string;
    }
  ) {
    return request<Order>("/orders", { method: "POST", body: JSON.stringify(payload) }, token);
  },
  syncOrders(token: string, orders: OfflineDraftOrder[]) {
    return request<SyncResult[]>(
      "/orders/sync",
      {
        method: "POST",
        body: JSON.stringify({ orders })
      },
      token
    );
  },
  orders(token: string, params: Record<string, string | boolean | number | undefined> = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== "") {
        query.set(key, String(value));
      }
    });
    const suffix = query.size ? `?${query.toString()}` : "";
    return request<Order[]>(`/orders${suffix}`, {}, token);
  },
  waiterBoard(token: string) {
    return request<WaiterBoard>("/orders/board/waiter", {}, token);
  },
  kitchenBoard(token: string) {
    return request<KitchenBoard>("/orders/board/kitchen", {}, token);
  },
  updateOrder(
    token: string,
    orderId: number,
    payload: {
      table_id?: number;
      priority?: string;
      customer_note?: string;
      items?: OrderItemInput[];
    }
  ) {
    return request<Order>(`/orders/${orderId}`, { method: "PATCH", body: JSON.stringify(payload) }, token);
  },
  changeOrderStatus(token: string, orderId: number, status: OrderStatus, message?: string) {
    return request<Order>(
      `/orders/${orderId}/status`,
      { method: "PATCH", body: JSON.stringify({ status, message }) },
      token
    );
  },
  analytics(token: string) {
    return request<AnalyticsSummary>("/analytics/summary", {}, token);
  },
  devices(token: string) {
    return request<PeripheralDevice[]>("/peripherals/devices", {}, token);
  },
  receipt(token: string, orderId: number) {
    return request(`/peripherals/orders/${orderId}/receipt`, { method: "POST" }, token);
  },
  menuItemByBarcode(token: string, barcode: string) {
    return request<MenuItem>(`/menu/items/barcode/${barcode}`, {}, token);
  }
};
