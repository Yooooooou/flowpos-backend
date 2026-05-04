import {
  Activity,
  ArrowUpRight,
  BellRing,
  ChefHat,
  CircleCheck,
  Clock3,
  Database,
  LoaderCircle,
  LogOut,
  MonitorSmartphone,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  WifiOff,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "./lib/api";
import {
  clearToken,
  clearUser,
  getDeviceId,
  loadOfflineQueue,
  loadToken,
  loadUser,
  saveOfflineQueue,
  saveToken,
  saveUser
} from "./lib/storage";
import type {
  AnalyticsSummary,
  Category,
  KitchenBoard,
  MenuItem,
  OfflineDraftOrder,
  Order,
  OrderPriority,
  OrderStatus,
  TableOverview,
  User,
  WaiterBoard
} from "./types";

type DraftLine = {
  menu_item_id: number;
  quantity: number;
  note: string;
};

type Toast = {
  id: string;
  title: string;
  detail?: string;
  tone?: "info" | "success" | "warn";
};

const rolePresets = [
  { username: "waiter", password: "waiter123", label: "Waiter", icon: ShoppingBag },
  { username: "kitchen", password: "kitchen123", label: "Kitchen", icon: ChefHat },
  { username: "manager", password: "manager123", label: "Manager", icon: ShieldCheck }
];

function formatMoney(value: string | number | null | undefined) {
  if (value === null || value === undefined) {
    return "-";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 0
  }).format(Number(value));
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatAge(value: string | null | undefined) {
  if (!value) {
    return "-";
  }
  return `${Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000))} min`;
}

function statusTone(status: OrderStatus) {
  switch (status) {
    case "ready":
      return "tone-ready";
    case "in_progress":
      return "tone-progress";
    case "served":
      return "tone-served";
    case "paid":
      return "tone-paid";
    case "cancelled":
      return "tone-cancelled";
    default:
      return "tone-pending";
  }
}

function App() {
  const [token, setToken] = useState<string | null>(() => loadToken());
  const [user, setUser] = useState<User | null>(() => loadUser());
  const [loading, setLoading] = useState(Boolean(loadToken()));
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = (toast: Omit<Toast, "id">) => {
    const entry = { ...toast, id: crypto.randomUUID() };
    setToasts((current) => [...current, entry].slice(-4));
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== entry.id));
    }, 3600);
  };

  useEffect(() => {
    async function bootstrap() {
      const storedToken = loadToken();
      if (!storedToken) {
        setLoading(false);
        return;
      }
      try {
        const me = await api.me(storedToken);
        saveUser(me);
        setUser(me);
        setToken(storedToken);
      } catch {
        clearToken();
        clearUser();
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!token || !user) {
      return undefined;
    }
    const wsUrl = `${api.baseUrl.replace("http", "ws")}/ws/orders?token=${token}`;
    const socket = new WebSocket(wsUrl);
    socket.onopen = () => setConnected(true);
    socket.onclose = () => setConnected(false);
    socket.onerror = () => setConnected(false);
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string);
        if (payload.type && payload.type !== "connected") {
          notify({
            title: payload.type.replace("order.", "").replace(/_/g, " "),
            detail: `Order #${payload.order_id} • ${payload.status}`,
            tone: payload.status === "ready" ? "success" : "info"
          });
        }
      } catch {
        // ignore malformed websocket payloads
      }
      setRefreshKey((value) => value + 1);
    };
    return () => socket.close();
  }, [token, user]);

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true);
      notify({ title: "Connection restored", detail: "Queued actions can sync again.", tone: "success" });
    };
    const handleOffline = () => {
      setOnline(false);
      notify({ title: "Offline mode", detail: "New waiter orders will be queued locally.", tone: "warn" });
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const handleLogin = async (username: string, password: string) => {
    setError("");
    setLoading(true);
    try {
      const auth = await api.login(username, password);
      const me = await api.me(auth.access_token);
      saveToken(auth.access_token);
      saveUser(me);
      setToken(auth.access_token);
      setUser(me);
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearToken();
    clearUser();
    setToken(null);
    setUser(null);
    setConnected(false);
  };

  if (loading) {
    return (
      <div className="app-shell loading-shell">
        <LoaderCircle className="spin" size={34} />
      </div>
    );
  }

  if (!token || !user) {
    return <LoginScreen error={error} onLogin={handleLogin} loading={loading} />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">FP</div>
          <div>
            <div className="brand-title">Flow-POS</div>
            <div className="brand-subtitle">{user.full_name}</div>
          </div>
        </div>
        <div className="role-banner">
          <span className="role-kicker">Workspace</span>
          <strong>{user.role}</strong>
        </div>
        <div className="topbar-status">
          <StatusPill icon={MonitorSmartphone} label={connected ? "Live" : "Reconnecting"} active={connected} />
          <StatusPill icon={BellRing} label={online ? "Online" : "Offline"} active={online} />
          <button className="icon-text-button subtle" onClick={() => setRefreshKey((value) => value + 1)}>
            <RefreshCw size={16} />
            Refresh
          </button>
          <button className="icon-text-button" onClick={handleLogout}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </header>

      {user.role === "waiter" && (
        <WaiterWorkspace
          token={token}
          refreshKey={refreshKey}
          currentUser={user}
          onRefresh={setRefreshKey}
          notify={notify}
          online={online}
        />
      )}
      {user.role === "kitchen" && <KitchenWorkspace token={token} refreshKey={refreshKey} notify={notify} />}
      {user.role === "manager" && <ManagerWorkspace token={token} refreshKey={refreshKey} notify={notify} />}
      <ToastStack toasts={toasts} />
    </div>
  );
}

function LoginScreen({
  error,
  onLogin,
  loading
}: {
  error: string;
  onLogin: (username: string, password: string) => Promise<void>;
  loading: boolean;
}) {
  const [username, setUsername] = useState("waiter");
  const [password, setPassword] = useState("waiter123");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onLogin(username, password);
  };

  return (
    <div className="login-shell">
      <div className="login-panel">
        <div className="login-heading">
          <div className="brand-mark large">FP</div>
          <div>
            <h1>Flow-POS</h1>
            <p>Cafe operations console</p>
          </div>
        </div>
        <div className="preset-row">
          {rolePresets.map((preset) => {
            const Icon = preset.icon;
            return (
              <button
                key={preset.label}
                className="preset-button"
                onClick={() => {
                  setUsername(preset.username);
                  setPassword(preset.password);
                }}
                type="button"
              >
                <Icon size={16} />
                {preset.label}
              </button>
            );
          })}
        </div>
        <form className="login-form" onSubmit={submit}>
          <label>
            Username
            <input value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <div className="error-banner">{error}</div> : null}
          <button className="primary-button" type="submit" disabled={loading}>
            {loading ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}

function WaiterWorkspace({
  token,
  refreshKey,
  currentUser,
  onRefresh,
  notify,
  online
}: {
  token: string;
  refreshKey: number;
  currentUser: User;
  onRefresh: React.Dispatch<React.SetStateAction<number>>;
  notify: (toast: Omit<Toast, "id">) => void;
  online: boolean;
}) {
  const [tables, setTables] = useState<TableOverview[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [board, setBoard] = useState<WaiterBoard | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | "all">("all");
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<OrderPriority>("normal");
  const [customerNote, setCustomerNote] = useState("");
  const [draftItems, setDraftItems] = useState<DraftLine[]>([]);
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [queue, setQueue] = useState<OfflineDraftOrder[]>(() => loadOfflineQueue());
  const [barcode, setBarcode] = useState("");
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);

  const reload = async () => {
    const [tableOverview, itemList, categoryList, waiterBoard, waiterOrders] = await Promise.all([
      api.tableOverview(token),
      api.menuItems(token, {
        available_only: true,
        category_id: selectedCategoryId === "all" ? undefined : selectedCategoryId,
        q: search || undefined
      }),
      api.categories(token),
      api.waiterBoard(token),
      api.orders(token, { limit: 12 })
    ]);
    setTables(tableOverview);
    setMenuItems(itemList);
    setCategories(categoryList);
    setBoard(waiterBoard);
    setRecentOrders(waiterOrders);
    if (!selectedTableId && tableOverview[0]) {
      setSelectedTableId(tableOverview[0].id);
    }
  };

  useEffect(() => {
    void reload();
  }, [refreshKey, selectedCategoryId, search]);

  useEffect(() => {
    if (online && queue.length) {
      void syncQueue();
    }
  }, [online]);

  const draftTotal = useMemo(() => {
    return draftItems.reduce((sum, line) => {
      const item = menuItems.find((entry) => entry.id === line.menu_item_id);
      return sum + Number(item?.price ?? 0) * line.quantity;
    }, 0);
  }, [draftItems, menuItems]);

  const addLine = (item: MenuItem) => {
    setDraftItems((current) => {
      const existing = current.find((line) => line.menu_item_id === item.id);
      if (existing) {
        return current.map((line) =>
          line.menu_item_id === item.id ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      return [...current, { menu_item_id: item.id, quantity: 1, note: "" }];
    });
  };

  const loadOrderIntoEditor = (order: Order) => {
    setEditingOrderId(order.id);
    setSelectedTableId(order.table_id);
    setPriority(order.priority);
    setCustomerNote(order.customer_note ?? "");
    setDraftItems(
      order.items.map((item) => ({
        menu_item_id: item.menu_item_id,
        quantity: item.quantity,
        note: item.note ?? ""
      }))
    );
  };

  const clearDraft = () => {
    setEditingOrderId(null);
    setDraftItems([]);
    setPriority("normal");
    setCustomerNote("");
  };

  const queueOrder = () => {
    if (!selectedTableId || !draftItems.length) {
      return;
    }
    const offlineDraft: OfflineDraftOrder = {
      table_id: selectedTableId,
      client_request_id: `offline-${crypto.randomUUID()}`,
      source_device_id: getDeviceId(),
      priority,
      customer_note: customerNote || undefined,
      items: draftItems.map((line) => ({
        menu_item_id: line.menu_item_id,
        quantity: line.quantity,
        note: line.note || undefined
      }))
    };
    const nextQueue = [...queue, offlineDraft];
    setQueue(nextQueue);
    saveOfflineQueue(nextQueue);
    notify({
      title: "Order queued offline",
      detail: `Table ${selectedTableId} is stored locally until the connection comes back.`,
      tone: "warn"
    });
    clearDraft();
  };

  const removeDraftLine = (menuItemId: number) => {
    setDraftItems((current) => current.filter((entry) => entry.menu_item_id !== menuItemId));
  };

  const submitDraft = async () => {
    if (!selectedTableId || !draftItems.length) {
      return;
    }
    const payload = {
      table_id: selectedTableId,
      priority,
      customer_note: customerNote || undefined,
      items: draftItems.map((line) => ({
        menu_item_id: line.menu_item_id,
        quantity: line.quantity,
        note: line.note || undefined
      }))
    };

    setSaving(true);
    try {
      if (editingOrderId) {
        await api.updateOrder(token, editingOrderId, payload);
        notify({ title: "Order updated", detail: `Order #${editingOrderId} saved.`, tone: "success" });
      } else if (!navigator.onLine) {
        queueOrder();
        return;
      } else {
        const created = await api.createOrder(token, {
          ...payload,
          client_request_id: `online-${crypto.randomUUID()}`,
          source_device_id: getDeviceId()
        });
        notify({ title: "Order sent", detail: `Order #${created.id} moved to kitchen.`, tone: "success" });
      }
      clearDraft();
      onRefresh((value) => value + 1);
    } catch {
      if (!editingOrderId) {
        queueOrder();
      }
    } finally {
      setSaving(false);
    }
  };

  const syncQueue = async () => {
    if (!queue.length) {
      return;
    }
    const results = await api.syncOrders(token, queue);
    const pending = queue.filter((draft) => {
      const result = results.find((entry) => entry.client_request_id === draft.client_request_id);
      return result?.status === "failed";
    });
    setQueue(pending);
    saveOfflineQueue(pending);
    notify({
      title: pending.length ? "Queue partially synced" : "Offline queue synced",
      detail: pending.length ? `${pending.length} draft orders still need attention.` : "All queued orders were delivered.",
      tone: pending.length ? "warn" : "success"
    });
    onRefresh((value) => value + 1);
  };

  const changeStatus = async (order: Order, nextStatus: OrderStatus) => {
    await api.changeOrderStatus(token, order.id, nextStatus);
    notify({ title: `Order ${nextStatus}`, detail: `Order #${order.id} updated.`, tone: "success" });
    onRefresh((value) => value + 1);
  };

  const printReceipt = async (order: Order) => {
    await api.receipt(token, order.id);
    notify({ title: "Receipt queued", detail: `Print job created for order #${order.id}.`, tone: "info" });
  };

  const addByBarcode = async () => {
    if (!barcode.trim()) {
      return;
    }
    try {
      const item = await api.menuItemByBarcode(token, barcode.trim());
      addLine(item);
      setBarcode("");
      notify({ title: "Item added", detail: `${item.name} matched barcode.`, tone: "success" });
    } catch {
      notify({ title: "Barcode not found", detail: "No available menu item uses this barcode.", tone: "warn" });
    }
  };

  const selectedTable = tables.find((table) => table.id === selectedTableId) ?? null;
  const selectedTableOrder =
    board?.active_orders.find((order) => order.table_id === selectedTableId) ??
    recentOrders.find((order) => order.table_id === selectedTableId && order.status !== "paid" && order.status !== "cancelled") ??
    null;

  return (
    <main className="workspace">
      <section className="workspace-band">
        <div className="hero-strip">
          <div>
            <div className="hero-eyebrow">Floor control</div>
            <h1>Keep tables moving without breaking focus.</h1>
            <p>
              Orders, ready alerts, and offline queue stay together so the waiter can move between
              guests and kitchen without cognitive overhead.
            </p>
          </div>
          <div className="metrics-row compact hero-metrics">
            {board?.metrics.map((metric) => (
              <MetricTile key={metric.key} label={metric.label} value={metric.value} icon={Activity} />
            ))}
            <MetricTile label="Offline Queue" value={queue.length} icon={Clock3} accent={queue.length ? "warn" : "ok"} />
          </div>
        </div>
      </section>

      <section className="workspace-grid waiter-grid">
        <div className="panel">
          <PanelHeader
            title="Tables"
            subtitle="Dining room"
            action={
              <div className="action-row">
                <span className={`status-badge ${online ? "tone-ready" : "tone-cancelled"}`}>
                  {online ? "sync ready" : "offline"}
                </span>
                <button className="icon-text-button subtle" onClick={syncQueue}>
                  <RefreshCw size={16} />
                  Sync queue
                </button>
              </div>
            }
          />
          <div className="table-grid">
            {tables.map((table) => (
              <button
                key={table.id}
                className={`table-tile ${table.id === selectedTableId ? "selected" : ""}`}
                onClick={() => setSelectedTableId(table.id)}
              >
                <div className="table-tile-head">
                  <span>Table {table.number}</span>
                  <span className={`status-badge ${table.active_order_status ? statusTone(table.active_order_status) : "tone-free"}`}>
                    {table.active_order_status ?? table.status}
                  </span>
                </div>
                <div className="table-tile-meta">
                  <span>{table.seats} seats</span>
                  <span>{table.location ?? "Floor"}</span>
                </div>
                <div className="table-tile-total">{formatMoney(table.active_order_total)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <PanelHeader
            title={editingOrderId ? `Edit Order #${editingOrderId}` : "Compose Order"}
            subtitle={selectedTableId ? `Table ${tables.find((t) => t.id === selectedTableId)?.number ?? ""}` : "Select table"}
          />
          <div className="toolbar-row">
            <div className="segmented-control">
              <button
                className={selectedCategoryId === "all" ? "active" : ""}
                onClick={() => setSelectedCategoryId("all")}
              >
                All
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={selectedCategoryId === category.id ? "active" : ""}
                  onClick={() => setSelectedCategoryId(category.id)}
                >
                  {category.name}
                </button>
              ))}
            </div>
            <label className="search-input">
              <Search size={16} />
              <input
                placeholder="Search menu"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <div className="barcode-inline">
              <input
                placeholder="Barcode"
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addByBarcode();
                  }
                }}
              />
              <button className="icon-text-button subtle" onClick={() => void addByBarcode()}>
                Add
              </button>
            </div>
          </div>

          <div className="composer-layout">
            <div className="menu-grid">
              {menuItems.map((item) => (
                <button key={item.id} className="menu-tile" onClick={() => addLine(item)}>
                  <div className="menu-tile-head">
                    <span>{item.name}</span>
                    <span>{formatMoney(item.price)}</span>
                  </div>
                  <div className="menu-tile-meta">
                    <span>{item.category?.name ?? "Menu"}</span>
                    <span>{item.preparation_time_minutes} min</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="draft-panel">
              <div className="draft-lines">
                {draftItems.length ? (
                  draftItems.map((line) => {
                    const item = menuItems.find((entry) => entry.id === line.menu_item_id);
                    return (
                      <div className="draft-line" key={line.menu_item_id}>
                        <div>
                          <div className="draft-line-title">{item?.name ?? `Item ${line.menu_item_id}`}</div>
                          <input
                            value={line.note}
                            placeholder="Note"
                            onChange={(event) =>
                              setDraftItems((current) =>
                                current.map((entry) =>
                                  entry.menu_item_id === line.menu_item_id
                                    ? { ...entry, note: event.target.value }
                                    : entry
                                )
                              )
                            }
                          />
                        </div>
                        <div className="quantity-control">
                          <button
                            onClick={() =>
                              setDraftItems((current) =>
                                current
                                  .map((entry) =>
                                  entry.menu_item_id === line.menu_item_id
                                    ? { ...entry, quantity: Math.max(1, entry.quantity - 1) }
                                    : entry
                                  )
                                  .filter((entry) => entry.quantity > 0)
                              )
                            }
                          >
                            -
                          </button>
                          <span>{line.quantity}</span>
                          <button
                            onClick={() => removeDraftLine(line.menu_item_id)}
                          >
                            x
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty-state">No items yet</div>
                )}
              </div>

              <div className="draft-footer">
                <div className="priority-row">
                  <span>Priority</span>
                  <div className="segmented-control compact">
                    {(["low", "normal", "high", "urgent"] as OrderPriority[]).map((entry) => (
                      <button key={entry} className={priority === entry ? "active" : ""} onClick={() => setPriority(entry)}>
                        {entry}
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  rows={3}
                  placeholder="Guest note"
                  value={customerNote}
                  onChange={(event) => setCustomerNote(event.target.value)}
                />
                <div className="draft-total-row">
                  <span>Total</span>
                  <strong>{formatMoney(draftTotal)}</strong>
                </div>
                <div className="action-row">
                  <button className="icon-text-button subtle" onClick={clearDraft}>
                    <RefreshCw size={16} />
                    Clear
                  </button>
                  <button className="primary-button" onClick={submitDraft} disabled={!selectedTableId || !draftItems.length || saving}>
                    {saving ? <LoaderCircle className="spin" size={16} /> : <CircleCheck size={16} />}
                    {editingOrderId ? "Save order" : navigator.onLine ? "Send order" : "Queue order"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <PanelHeader title="Ready & Recent" subtitle={currentUser.full_name} />
          <div className="stack-section">
            <div className="section-label">Ready to serve</div>
            <div className="order-list">
              {board?.ready_orders.length ? (
                board.ready_orders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    actions={[{ label: "Serve", onClick: () => void changeStatus(order, "served") }]}
                  />
                ))
              ) : (
                <div className="empty-state">No ready orders</div>
              )}
            </div>
          </div>
          <div className="stack-section">
            <div className="section-label">Current table</div>
            {selectedTable && selectedTableOrder ? (
              <>
                <OrderCard
                  order={selectedTableOrder}
                  actions={[
                    selectedTableOrder.status === "pending" || selectedTableOrder.status === "in_progress"
                      ? { label: "Edit", onClick: () => loadOrderIntoEditor(selectedTableOrder) }
                      : null,
                    selectedTableOrder.status === "served"
                      ? { label: "Pay", onClick: () => void changeStatus(selectedTableOrder, "paid") }
                      : null,
                    selectedTableOrder.status === "paid"
                      ? { label: "Receipt", onClick: () => void printReceipt(selectedTableOrder) }
                      : null
                  ].filter(
                    (action): action is { label: string; onClick: () => void } => Boolean(action)
                  )}
                />
                <EventTimeline order={selectedTableOrder} />
              </>
            ) : (
              <div className="empty-state">No active ticket for this table</div>
            )}
          </div>
          <div className="stack-section">
            <div className="section-label">Recent orders</div>
            <div className="order-list">
              {recentOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  actions={[
                    order.status === "pending" || order.status === "in_progress"
                      ? {
                          label: "Edit",
                          onClick: () => loadOrderIntoEditor(order)
                        }
                      : null,
                    order.status === "ready"
                      ? {
                          label: "Serve",
                          onClick: () => void changeStatus(order, "served")
                        }
                      : null,
                    order.status === "served"
                      ? {
                          label: "Pay",
                          onClick: () => void changeStatus(order, "paid")
                        }
                      : null,
                    order.status === "paid"
                      ? {
                          label: "Receipt",
                          onClick: () => void printReceipt(order)
                        }
                      : null
                  ].filter(
                    (action): action is { label: string; onClick: () => void } => Boolean(action)
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function KitchenWorkspace({
  token,
  refreshKey,
  notify
}: {
  token: string;
  refreshKey: number;
  notify: (toast: Omit<Toast, "id">) => void;
}) {
  const [board, setBoard] = useState<KitchenBoard | null>(null);

  const reload = async () => {
    setBoard(await api.kitchenBoard(token));
  };

  useEffect(() => {
    void reload();
  }, [token, refreshKey]);

  const advance = async (orderId: number, status: OrderStatus) => {
    await api.changeOrderStatus(token, orderId, status);
    notify({ title: `Order ${status}`, detail: `Kitchen updated order #${orderId}.`, tone: "success" });
    await reload();
  };

  const sortOrders = (orders: Order[]) =>
    [...orders].sort((a, b) => {
      const priorityRank: Record<OrderPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      return (
        priorityRank[a.priority] - priorityRank[b.priority] ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });

  return (
    <main className="workspace">
      <section className="workspace-band">
        <div className="hero-strip compact-hero">
          <div>
            <div className="hero-eyebrow">Kitchen board</div>
            <h1>Prioritize fast, finish clean, signal instantly.</h1>
            <p>Urgency and order age stay visible so the kitchen sees what matters first.</p>
          </div>
          <div className="metrics-row compact hero-metrics">
            {board?.metrics.map((metric) => (
              <MetricTile key={metric.key} label={metric.label} value={metric.value} icon={ChefHat} />
            ))}
          </div>
        </div>
      </section>
      <section className="workspace-grid kitchen-grid">
        <StatusColumn
          title="Pending"
          tone="tone-pending"
          orders={sortOrders(board?.pending ?? [])}
          renderAction={(order) => (
            <button className="primary-button small" onClick={() => void advance(order.id, "in_progress")}>
              Start
            </button>
          )}
        />
        <StatusColumn
          title="In Progress"
          tone="tone-progress"
          orders={sortOrders(board?.in_progress ?? [])}
          renderAction={(order) => (
            <button className="primary-button small" onClick={() => void advance(order.id, "ready")}>
              Mark ready
            </button>
          )}
        />
        <StatusColumn
          title="Ready"
          tone="tone-ready"
          orders={sortOrders(board?.ready ?? [])}
          renderAction={() => <span className="status-note">Waiting for pickup</span>}
        />
      </section>
    </main>
  );
}

function ManagerWorkspace({
  token,
  refreshKey,
  notify
}: {
  token: string;
  refreshKey: number;
  notify: (toast: Omit<Toast, "id">) => void;
}) {
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [tables, setTables] = useState<TableOverview[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [view, setView] = useState<"overview" | "operations" | "devices">("overview");

  useEffect(() => {
    async function load() {
      const [analyticsSummary, tableOverview, peripheralDevices, latestOrders] = await Promise.all([
        api.analytics(token),
        api.tableOverview(token),
        api.devices(token),
        api.orders(token, { limit: 20 })
      ]);
      setAnalytics(analyticsSummary);
      setTables(tableOverview);
      setDevices(peripheralDevices as any[]);
      setOrders(latestOrders);
    }
    void load();
  }, [token, refreshKey]);

  useEffect(() => {
    if (analytics && analytics.active_orders > 8) {
      notify({
        title: "Peak load in progress",
        detail: `${analytics.active_orders} active orders are currently open.`,
        tone: "warn"
      });
    }
  }, [analytics]);

  return (
    <main className="workspace">
      <section className="workspace-band">
        <div className="toolbar-row spread">
          <div className="hero-strip compact-hero manager-hero">
            <div>
              <div className="hero-eyebrow">Manager console</div>
              <h1>See flow, spot delays, guide the room.</h1>
              <p>Operational metrics, current floor state, and device readiness live in one control surface.</p>
            </div>
            <div className="metrics-row compact hero-metrics">
              <MetricTile label="Revenue" value={formatMoney(analytics?.revenue)} icon={Activity} />
              <MetricTile label="Active" value={analytics?.active_orders ?? 0} icon={Clock3} />
              <MetricTile label="Paid" value={analytics?.paid_orders ?? 0} icon={CircleCheck} />
            </div>
          </div>
          <div className="segmented-control">
            <button className={view === "overview" ? "active" : ""} onClick={() => setView("overview")}>
              Overview
            </button>
            <button className={view === "operations" ? "active" : ""} onClick={() => setView("operations")}>
              Operations
            </button>
            <button className={view === "devices" ? "active" : ""} onClick={() => setView("devices")}>
              Devices
            </button>
          </div>
        </div>
      </section>

      {view === "overview" && analytics ? (
        <section className="workspace-grid manager-grid">
          <div className="panel">
            <PanelHeader title="Performance" subtitle="Service speed" />
            <div className="stats-stack">
              <StatRow label="Avg preparation" value={`${Math.round((analytics.average_preparation_seconds ?? 0) / 60)} min`} />
              <StatRow label="Avg customer wait" value={`${Math.round((analytics.average_customer_wait_seconds ?? 0) / 60)} min`} />
              <StatRow label="Completed orders" value={analytics.completed_orders} />
              <StatRow label="Health status" value={analytics.active_orders > 8 ? "Peak load" : "Stable flow"} />
            </div>
          </div>
          <div className="panel">
            <PanelHeader title="Peak Hours" subtitle="Traffic concentration" />
            <div className="bar-list">
              {analytics.peak_hours.map((entry) => (
                <div className="bar-row" key={entry.hour}>
                  <span>{String(entry.hour).padStart(2, "0")}:00</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${Math.min(100, entry.orders * 18)}%` }} />
                  </div>
                  <strong>{entry.orders}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <PanelHeader title="Popular Items" subtitle="Demand" />
            <div className="list-rows">
              {analytics.popular_items.map((entry) => (
                <div className="list-row" key={entry.id}>
                  <span>{entry.name}</span>
                  <strong>{entry.quantity}</strong>
                </div>
              ))}
            </div>
          </div>
          <div className="panel">
            <PanelHeader title="Staff Productivity" subtitle="Waiter output" />
            <div className="list-rows">
              {analytics.staff_productivity.map((entry) => (
                <div className="list-row" key={entry.waiter_id}>
                  <div>
                    <div>{entry.full_name}</div>
                    <small>{entry.orders} orders</small>
                  </div>
                  <strong>{formatMoney(entry.revenue)}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {view === "operations" ? (
        <section className="workspace-grid manager-grid">
          <div className="panel">
            <PanelHeader title="Table Overview" subtitle="Dining room status" />
            <div className="table-grid compact">
              {tables.map((table) => (
                <div key={table.id} className="table-tile static">
                  <div className="table-tile-head">
                    <span>Table {table.number}</span>
                    <span className={`status-badge ${table.active_order_status ? statusTone(table.active_order_status) : "tone-free"}`}>
                      {table.active_order_status ?? table.status}
                    </span>
                  </div>
                  <div className="table-tile-meta">
                    <span>{table.location ?? "Floor"}</span>
                    <span>{table.active_waiter_name ?? "-"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel span-2">
            <PanelHeader title="Latest Orders" subtitle="Operational log" />
            <div className="order-list dense">
              {orders.map((order) => (
                <OrderCard key={order.id} order={order} compact />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {view === "devices" ? (
        <section className="workspace-grid manager-grid">
          <div className="panel span-2">
            <PanelHeader title="Peripheral Devices" subtitle="Registered hardware" />
            <div className="list-rows">
              {devices.map((device) => (
                <div className="list-row" key={device.id}>
                  <div>
                    <div className="device-title">
                      {device.device_type === "receipt_printer" ? <Printer size={15} /> : <Database size={15} />}
                      {device.name}
                    </div>
                    <small>{device.identifier}</small>
                  </div>
                  <div className="device-meta">
                    <span className="status-badge tone-progress">{device.device_type}</span>
                    <span>{device.location ?? "-"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function MetricTile({
  label,
  value,
  icon: Icon,
  accent
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: "warn" | "ok";
}) {
  return (
    <div className={`metric-tile ${accent ?? ""}`}>
      <div className="metric-icon">
        <Icon size={16} />
      </div>
      <div>
        <div className="metric-label">{label}</div>
        <div className="metric-value">{value}</div>
      </div>
    </div>
  );
}

function EventTimeline({ order }: { order: Order }) {
  return (
    <div className="timeline-card">
      <div className="section-label">Order activity</div>
      <div className="timeline-list">
        {order.events.slice().reverse().slice(0, 5).map((event) => (
          <div key={event.id} className="timeline-row">
            <div className={`timeline-dot ${statusTone(event.to_status ?? order.status)}`} />
            <div>
              <strong>{event.event_type.replace("order.", "").replace(/_/g, " ")}</strong>
              <div className="timeline-meta">
                <span>{formatTime(event.created_at)}</span>
                {event.message ? <span>{event.message}</span> : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelHeader({
  title,
  subtitle,
  action
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="panel-header">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function StatusPill({
  icon: Icon,
  label,
  active
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
}) {
  return (
    <div className={`status-pill ${active ? "active" : ""}`}>
      <span className="status-pill-dot" />
      <Icon size={14} />
      {label}
    </div>
  );
}

function OrderCard({
  order,
  actions = [],
  compact = false
}: {
  order: Order;
  actions?: Array<{ label: string; onClick: () => void }>;
  compact?: boolean;
}) {
  return (
    <div className={`order-card ${compact ? "compact" : ""}`}>
      <div className="order-card-head">
        <div>
          <div className="order-card-title">Order #{order.id}</div>
          <div className="order-card-meta">
            <span>Table {order.table?.number ?? order.table_id}</span>
            <span>{formatTime(order.created_at)}</span>
            <span>{formatAge(order.created_at)}</span>
          </div>
        </div>
        <span className={`status-badge ${statusTone(order.status)}`}>{order.status}</span>
      </div>
      <div className="order-card-items">
        {order.items.map((item) => (
          <div key={item.id} className="order-item-row">
            <span>
              {item.quantity}x {item.menu_item?.name ?? item.menu_item_id}
            </span>
            <strong>{formatMoney(item.line_total)}</strong>
          </div>
        ))}
      </div>
      <div className="order-card-footer">
        <strong>{formatMoney(order.total_amount)}</strong>
        {actions.length ? (
          <div className="action-row">
            {actions.map((action) => (
              <button key={action.label} className="icon-text-button subtle" onClick={action.onClick}>
                <ArrowUpRight size={14} />
                {action.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast ${toast.tone ?? "info"}`}>
          <div className="toast-title-row">
            {toast.tone === "success" ? <Sparkles size={15} /> : toast.tone === "warn" ? <WifiOff size={15} /> : <BellRing size={15} />}
            <strong>{toast.title}</strong>
          </div>
          {toast.detail ? <span>{toast.detail}</span> : null}
        </div>
      ))}
    </div>
  );
}

function StatusColumn({
  title,
  tone,
  orders,
  renderAction
}: {
  title: string;
  tone: string;
  orders: Order[];
  renderAction: (order: Order) => React.ReactNode;
}) {
  return (
    <div className="panel column-panel">
      <PanelHeader title={title} subtitle={`${orders.length} tickets`} />
      <div className="order-list">
        {orders.map((order) => (
          <div key={order.id} className={`order-card ${tone} ${order.priority === "urgent" ? "priority-urgent" : ""}`}>
            <div className="order-card-head">
              <div>
                <div className="order-card-title">Table {order.table?.number ?? order.table_id}</div>
                <div className="order-card-meta">
                  <span>{order.items.length} items</span>
                  <span>{formatTime(order.created_at)}</span>
                  <span>{formatAge(order.created_at)}</span>
                </div>
              </div>
              <span className={`status-badge ${statusTone(order.status)}`}>{order.priority}</span>
            </div>
            <div className="order-card-items">
              {order.items.map((item) => (
                <div key={item.id} className="order-item-row">
                  <span>
                    {item.quantity}x {item.menu_item?.name ?? item.menu_item_id}
                  </span>
                </div>
              ))}
            </div>
            <div className="order-card-footer">{renderAction(order)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="list-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export default App;
