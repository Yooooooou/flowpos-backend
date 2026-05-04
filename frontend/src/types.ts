export type UserRole = "manager" | "waiter" | "kitchen";

export type OrderStatus =
  | "pending"
  | "in_progress"
  | "ready"
  | "served"
  | "paid"
  | "cancelled";

export type OrderPriority = "low" | "normal" | "high" | "urgent";

export type TableStatus = "free" | "occupied" | "reserved" | "cleaning";

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface Table {
  id: number;
  number: string;
  seats: number;
  status: TableStatus;
  location: string | null;
}

export interface TableOverview extends Table {
  active_order_id: number | null;
  active_order_status: OrderStatus | null;
  active_order_total: string | null;
  active_waiter_name: string | null;
}

export interface Category {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
}

export interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  barcode: string | null;
  description: string | null;
  price: string;
  preparation_time_minutes: number;
  is_available: boolean;
  category?: Category | null;
}

export interface OrderItemInput {
  menu_item_id: number;
  quantity: number;
  note?: string;
}

export interface OrderItem {
  id: number;
  menu_item_id: number;
  quantity: number;
  unit_price: string;
  line_total: string;
  note: string | null;
  menu_item?: MenuItem | null;
}

export interface OrderEvent {
  id: number;
  actor_id: number | null;
  event_type: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus | null;
  message: string | null;
  created_at: string;
}

export interface Order {
  id: number;
  table_id: number;
  waiter_id: number;
  client_request_id: string | null;
  source_device_id: string | null;
  status: OrderStatus;
  priority: OrderPriority;
  customer_note: string | null;
  total_amount: string;
  created_at: string;
  updated_at: string;
  ready_at: string | null;
  served_at: string | null;
  paid_at: string | null;
  table?: Table | null;
  waiter?: User | null;
  items: OrderItem[];
  events: OrderEvent[];
}

export interface DashboardMetric {
  key: string;
  label: string;
  value: string | number;
}

export interface WaiterBoard {
  active_orders: Order[];
  ready_orders: Order[];
  occupied_tables: TableOverview[];
  metrics: DashboardMetric[];
}

export interface KitchenBoard {
  pending: Order[];
  in_progress: Order[];
  ready: Order[];
  metrics: DashboardMetric[];
}

export interface AnalyticsSummary {
  active_orders: number;
  completed_orders: number;
  paid_orders: number;
  revenue: string;
  average_preparation_seconds: number | null;
  average_customer_wait_seconds: number | null;
  popular_items: Array<{ id: number; name: string; quantity: number }>;
  peak_hours: Array<{ hour: number; orders: number }>;
  staff_productivity: Array<{
    waiter_id: number;
    full_name: string;
    orders: number;
    revenue: string;
  }>;
}

export interface PeripheralDevice {
  id: number;
  name: string;
  device_type: "receipt_printer" | "cash_drawer" | "barcode_scanner";
  identifier: string;
  location: string | null;
  is_active: boolean;
  created_at: string;
}

export interface OfflineDraftOrder {
  table_id: number;
  client_request_id: string;
  source_device_id: string;
  priority: OrderPriority;
  customer_note?: string;
  items: OrderItemInput[];
}

export interface SyncResult {
  client_request_id: string | null;
  status: "created" | "duplicate" | "failed";
  order?: Order | null;
  error?: string | null;
}

export interface LiveEvent {
  type: string;
  order_id: number;
  status: OrderStatus;
  table_id: number;
  waiter_id: number;
  priority: OrderPriority;
  total_amount: string;
}
