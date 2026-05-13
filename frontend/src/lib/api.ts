import type {
  AnalyticsSummary,
  Category,
  KitchenBoard,
  MenuItem,
  OfflineDraftOrder,
  Order,
  OrderDiscount,
  OrderItemInput,
  OrderStatus,
  Payment,
  PeripheralDevice,
  PrintJob,
  Refund,
  Shift,
  SyncResult,
  Table,
  TableOverview,
  TableStatus,
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
  order(token: string, orderId: number) {
    return request<Order>(`/orders/${orderId}`, {}, token);
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
  },

  // Users CRUD
  users(token: string) {
    return request<User[]>("/users", {}, token);
  },
  createUser(token: string, payload: { username: string; password: string; full_name: string; role: string }) {
    return request<User>("/users", { method: "POST", body: JSON.stringify(payload) }, token);
  },
  updateUser(token: string, userId: number, payload: Partial<{ full_name: string; role: string; is_active: boolean; password: string }>) {
    return request<User>(`/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) }, token);
  },

  // Tables CRUD
  createTable(token: string, payload: { number: string; seats: number; location?: string }) {
    return request<Table>("/tables", { method: "POST", body: JSON.stringify(payload) }, token);
  },
  updateTable(token: string, tableId: number, payload: Partial<{ number: string; seats: number; location: string; status: TableStatus }>) {
    return request<Table>(`/tables/${tableId}`, { method: "PATCH", body: JSON.stringify(payload) }, token);
  },

  // Menu CRUD
  createCategory(token: string, payload: { name: string; sort_order?: number }) {
    return request<Category>("/menu/categories", { method: "POST", body: JSON.stringify(payload) }, token);
  },
  updateCategory(token: string, catId: number, payload: Partial<{ name: string; sort_order: number; is_active: boolean }>) {
    return request<Category>(`/menu/categories/${catId}`, { method: "PATCH", body: JSON.stringify(payload) }, token);
  },
  createMenuItem(token: string, payload: { category_id: number; name: string; price: string; preparation_time_minutes?: number; description?: string; barcode?: string }) {
    return request<MenuItem>("/menu/items", { method: "POST", body: JSON.stringify(payload) }, token);
  },
  updateMenuItem(token: string, itemId: number, payload: Partial<{ name: string; price: string; description: string; is_available: boolean; category_id: number; preparation_time_minutes: number }>) {
    return request<MenuItem>(`/menu/items/${itemId}`, { method: "PATCH", body: JSON.stringify(payload) }, token);
  },

  // Payments
  payments(token: string, params: Record<string, string | number | undefined> = {}) {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) query.set(k, String(v)); });
    const suffix = query.size ? `?${query}` : "";
    return request<Payment[]>(`/pos/payments${suffix}`, {}, token);
  },
  async createPayment(token: string, payload: { order_id: number; method: string; amount_received?: number; discount_type?: string; discount_value?: number; tip_amount?: number }) {
    if (payload.discount_type && payload.discount_value && payload.discount_value > 0) {
      await api.createDiscount(token, payload.order_id, {
        discount_type: payload.discount_type as "amount" | "percent",
        value: payload.discount_value,
        reason: "Manager-approved POS discount",
      });
    }

    const method = payload.method === "qr" || payload.method === "account" ? "external" : payload.method;
    const amountReceived = payload.amount_received ?? 0;
    return request<Payment>(
      `/pos/orders/${payload.order_id}/payments`,
      {
        method: "POST",
        body: JSON.stringify({
          method,
          amount_received: amountReceived,
          service_fee_amount: payload.tip_amount ?? 0,
        }),
      },
      token
    );
  },

  // Discounts
  createDiscount(token: string, orderId: number, payload: { discount_type: "amount" | "percent"; value: number; reason?: string }) {
    return request<OrderDiscount>(`/pos/orders/${orderId}/discounts`, { method: "POST", body: JSON.stringify(payload) }, token);
  },

  // Refunds
  refunds(token: string) {
    return request<Refund[]>("/pos/refunds", {}, token);
  },
  createRefund(token: string, paymentId: number, payload: { amount: number; reason: string }) {
    return request<Refund>(`/pos/payments/${paymentId}/refunds`, { method: "POST", body: JSON.stringify(payload) }, token);
  },

  // Shifts
  shifts(token: string) {
    return request<Shift[]>("/pos/shifts", {}, token);
  },
  async currentShift(token: string) {
    try {
      return await request<Shift>("/pos/shifts/current", {}, token);
    } catch (err) {
      if (err instanceof Error && err.message.includes("No open shift")) {
        return null;
      }
      throw err;
    }
  },
  openShift(token: string, opening_cash_amount: number) {
    return request<Shift>("/pos/shifts/open", { method: "POST", body: JSON.stringify({ opening_cash_amount }) }, token);
  },
  closeShift(token: string, shiftId: number, closing_cash_amount: number, note?: string) {
    return request<Shift>(`/pos/shifts/${shiftId}/close`, { method: "POST", body: JSON.stringify({ closing_cash_amount, note }) }, token);
  },
  shiftReport(token: string, shiftId: number) {
    return request<{ shift_id: number; status: string; payments_total: string; refunds_total: string; net_total: string; payments_by_method: Array<{ method: string; count: number; total: string }>; orders_paid: number }>(`/pos/shifts/${shiftId}/report`, {}, token);
  },

  // Print jobs
  printJobs(token: string) {
    return request<PrintJob[]>("/peripherals/jobs", {}, token);
  },
};
