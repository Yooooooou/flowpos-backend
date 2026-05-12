import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/store";
import type {
  Category,
  MenuItem,
  Order,
  OrderStatus,
  Shift,
  Table,
  TableStatus,
  User,
} from "../types";

function fmtKZT(v: string | number | null | undefined) {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(n);
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Ожидает", in_progress: "Готовится", ready: "Готово",
  served: "Подан", paid: "Оплачен", cancelled: "Отменён",
};

const PRI_LABEL: Record<string, string> = { low: "Низкий", normal: "Обычный", high: "Высокий", urgent: "Срочно" };
const ROLE_LABEL: Record<string, string> = { manager: "Менеджер", waiter: "Официант", kitchen: "Кухня" };

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function ManagerDashboard() {
  const { state, refreshOrders } = useApp();

  const orders = state.orders;
  const activeOrders = orders.filter(o => !["paid", "cancelled"].includes(o.status));
  const paidOrders = orders.filter(o => o.status === "paid");
  const revenue = paidOrders.reduce((s, o) => s + parseFloat(o.total_amount), 0);

  const itemCounts: Record<string, number> = {};
  orders.forEach(o => o.items.forEach(i => {
    const name = i.menu_item?.name ?? `#${i.menu_item_id}`;
    itemCounts[name] = (itemCounts[name] ?? 0) + i.quantity;
  }));
  const topItems = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCount = topItems[0]?.[1] ?? 1;

  return (
    <div style={{ overflow: "auto", padding: 24 }}>
      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Активные заказы", value: activeOrders.length, accent: "var(--brand)" },
          { label: "Выручка сегодня", value: fmtKZT(revenue), accent: "var(--green)" },
          { label: "Оплаченных", value: paidOrders.length, accent: "var(--green)" },
          { label: "Занято столов", value: state.tables.filter(t => t.status === "occupied").length, accent: "var(--amber)" },
          { label: "Всего заказов", value: orders.length, accent: "var(--ink-3)" },
        ].map(m => (
          <div key={m.label} className="card metric">
            <div className="metric-label">{m.label}</div>
            <div className="metric-value" style={{ color: m.accent }}>{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, marginBottom: 24 }}>
        {/* Active orders table */}
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 600 }}>Активные заказы</div>
            <button className="btn sm" onClick={refreshOrders}>Обновить</button>
          </div>
          <div style={{ overflow: "auto", maxHeight: 340 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr className="list-head">
                  <th>Заказ</th><th>Стол</th><th>Статус</th><th>Сумма</th><th>Время</th>
                </tr>
              </thead>
              <tbody>
                {activeOrders.slice(0, 10).map(o => (
                  <tr key={o.id} className="list-row">
                    <td style={{ fontWeight: 600 }}>#{o.id}</td>
                    <td>{o.table ? `Стол ${o.table.number}` : `#${o.table_id}`}</td>
                    <td><span className={`badge ${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
                    <td>{fmtKZT(o.total_amount)}</td>
                    <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{new Date(o.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</td>
                  </tr>
                ))}
                {activeOrders.length === 0 && (
                  <tr><td colSpan={5} style={{ padding: 24, textAlign: "center", color: "var(--ink-3)" }}>Нет активных заказов</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top items */}
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 600 }}>Топ блюд</div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {topItems.map(([name, cnt]) => (
              <div key={name}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>{name}</span>
                  <span style={{ fontWeight: 600, color: "var(--ink-3)" }}>{cnt}</span>
                </div>
                <div style={{ height: 6, background: "var(--bg-sunken)", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(cnt / maxCount) * 100}%`, background: "var(--brand)", borderRadius: 3 }} />
                </div>
              </div>
            ))}
            {topItems.length === 0 && <div style={{ color: "var(--ink-3)", fontSize: 13, textAlign: "center" }}>Нет данных</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Manager Orders ───────────────────────────────────────────────────────────

export function ManagerOrders() {
  const { state, refreshOrders, changeStatus, toast } = useApp();
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [search, setSearch] = useState("");

  const orders = state.orders.filter(o => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (search && !String(o.id).includes(search) && !(o.table?.number ?? "").includes(search)) return false;
    return true;
  });

  const handleStatus = async (orderId: number, status: OrderStatus) => {
    try {
      await changeStatus(orderId, status);
      toast("success", "Статус обновлён");
    } catch {
      toast("error", "Ошибка обновления статуса");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-1)", background: "var(--bg-paper)", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select className="select" value={statusFilter} onChange={e => setStatusFilter(e.target.value as OrderStatus | "all")} style={{ width: 160 }}>
          <option value="all">Все статусы</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input className="input" placeholder="Поиск по номеру..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 200 }} />
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={refreshOrders}>Обновить</button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr className="list-head">
              <th>№</th><th>Стол</th><th>Официант</th><th>Статус</th><th>Приоритет</th><th>Позиций</th><th>Сумма</th><th>Создан</th><th>Действие</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(o => (
              <tr key={o.id} className="list-row">
                <td style={{ fontWeight: 600 }}>#{o.id}</td>
                <td>{o.table ? `Стол ${o.table.number}` : `#${o.table_id}`}</td>
                <td style={{ fontSize: 13 }}>{o.waiter?.full_name ?? "—"}</td>
                <td><span className={`badge ${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
                <td><span className={`pri ${o.priority}`}>{PRI_LABEL[o.priority]}</span></td>
                <td>{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                <td>{fmtKZT(o.total_amount)}</td>
                <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{new Date(o.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</td>
                <td>
                  {o.status === "pending" && <button className="btn sm" onClick={() => handleStatus(o.id, "cancelled")}>Отменить</button>}
                  {o.status === "served" && <button className="btn success sm" onClick={() => handleStatus(o.id, "paid")}>Оплачен</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {orders.length === 0 && <div style={{ padding: 60, textAlign: "center", color: "var(--ink-3)" }}>Заказов нет</div>}
      </div>
    </div>
  );
}

// ─── Manager Menu ─────────────────────────────────────────────────────────────

export function ManagerMenu() {
  const { state, refreshMenu, toast } = useApp();
  const token = state.token!;
  const [activeCat, setActiveCat] = useState<number | undefined>(state.categories[0]?.id);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [newItem, setNewItem] = useState(false);
  const [form, setForm] = useState<Partial<MenuItem>>({});

  const items = state.items.filter(i => i.category_id === activeCat);

  const save = async () => {
    try {
      if (editItem) {
        await api.updateMenuItem(token, editItem.id, {
          name: form.name, price: form.price, description: form.description ?? undefined,
          is_available: form.is_available, preparation_time_minutes: form.preparation_time_minutes,
        });
        toast("success", "Блюдо обновлено");
      } else {
        await api.createMenuItem(token, {
          category_id: activeCat!,
          name: form.name!,
          price: form.price!,
          description: form.description ?? undefined,
          preparation_time_minutes: form.preparation_time_minutes,
        });
        toast("success", "Блюдо добавлено");
      }
      await refreshMenu();
      setEditItem(null);
      setNewItem(false);
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Ошибка");
    }
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Category rail */}
      <div style={{ width: 200, borderRight: "1px solid var(--line-1)", overflow: "auto", background: "var(--bg-paper)", padding: "12px 0" }}>
        {state.categories.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveCat(c.id)}
            style={{
              width: "100%",
              padding: "10px 16px",
              textAlign: "left",
              background: activeCat === c.id ? "var(--brand)15" : "none",
              border: 0,
              borderLeft: `3px solid ${activeCat === c.id ? "var(--brand)" : "transparent"}`,
              cursor: "pointer",
              color: activeCat === c.id ? "var(--brand)" : "var(--ink-1)",
              fontWeight: activeCat === c.id ? 600 : 400,
              fontSize: 13,
            }}
          >
            {c.name}
            <span style={{ marginLeft: 6, fontSize: 11, opacity: 0.6 }}>{state.items.filter(i => i.category_id === c.id).length}</span>
          </button>
        ))}
      </div>

      {/* Items table */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line-1)", display: "flex", gap: 8 }}>
          <button className="btn primary sm" onClick={() => { setForm({ category_id: activeCat, is_available: true }); setNewItem(true); setEditItem(null); }}>
            + Добавить блюдо
          </button>
          <button className="btn sm" style={{ marginLeft: "auto" }} onClick={refreshMenu}>Обновить</button>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr className="list-head">
                <th>Название</th><th>Описание</th><th>Цена</th><th>Время</th><th>Доступно</th><th></th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="list-row">
                  <td style={{ fontWeight: 500 }}>{item.name}</td>
                  <td style={{ fontSize: 12, color: "var(--ink-3)", maxWidth: 200 }}>{item.description ?? "—"}</td>
                  <td>{fmtKZT(item.price)}</td>
                  <td>{item.preparation_time_minutes}м</td>
                  <td>
                    <span style={{ color: item.is_available ? "var(--green)" : "var(--red)", fontWeight: 600, fontSize: 12 }}>
                      {item.is_available ? "Да" : "Нет"}
                    </span>
                  </td>
                  <td>
                    <button className="btn sm" onClick={() => { setForm({ ...item }); setEditItem(item); setNewItem(false); }}>
                      ✏️
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>В этой категории нет блюд</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit modal */}
      {(editItem || newItem) && (
        <div className="scrim" onClick={() => { setEditItem(null); setNewItem(false); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">{editItem ? "Редактировать блюдо" : "Новое блюдо"}</div>
              <button className="iconbtn borderless" onClick={() => { setEditItem(null); setNewItem(false); }}>✕</button>
            </div>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field">
                <label className="field-label">Название</label>
                <input className="input" value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div className="field">
                <label className="field-label">Описание</label>
                <textarea className="textarea" value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div className="field">
                  <label className="field-label">Цена (₸)</label>
                  <input className="input" type="number" value={form.price ?? ""} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label">Время готовки (мин)</label>
                  <input className="input" type="number" value={form.preparation_time_minutes ?? ""} onChange={e => setForm(f => ({ ...f, preparation_time_minutes: parseInt(e.target.value) || 0 }))} />
                </div>
              </div>
              {editItem && (
                <div className="field">
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={form.is_available ?? true} onChange={e => setForm(f => ({ ...f, is_available: e.target.checked }))} />
                    <span>Доступно для заказа</span>
                  </label>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => { setEditItem(null); setNewItem(false); }}>Отмена</button>
              <button className="btn primary" onClick={save}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Manager Tables ───────────────────────────────────────────────────────────

const TABLE_STATUS_OPTIONS: { value: TableStatus; label: string }[] = [
  { value: "free", label: "Свободен" },
  { value: "occupied", label: "Занят" },
  { value: "reserved", label: "Бронь" },
  { value: "cleaning", label: "Уборка" },
];

export function ManagerTables() {
  const { state, refreshTables, toast } = useApp();
  const token = state.token!;
  const [editTable, setEditTable] = useState<Table | null>(null);
  const [form, setForm] = useState<Partial<Table>>({});
  const [showNew, setShowNew] = useState(false);

  const saveTable = async () => {
    try {
      if (editTable) {
        await api.updateTable(token, editTable.id, { number: form.number, seats: form.seats, location: form.location ?? undefined, status: form.status });
        toast("success", "Стол обновлён");
      } else {
        await api.createTable(token, { number: form.number!, seats: form.seats ?? 4, location: form.location ?? undefined });
        toast("success", "Стол добавлен");
      }
      await refreshTables();
      setEditTable(null);
      setShowNew(false);
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Ошибка");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-1)", display: "flex", gap: 8 }}>
        <button className="btn primary sm" onClick={() => { setForm({ seats: 4, status: "free" }); setShowNew(true); setEditTable(null); }}>
          + Добавить стол
        </button>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={refreshTables}>Обновить</button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr className="list-head"><th>№ стола</th><th>Мест</th><th>Локация</th><th>Статус</th><th></th></tr>
          </thead>
          <tbody>
            {state.tables.map(t => (
              <tr key={t.id} className="list-row">
                <td style={{ fontWeight: 600 }}>Стол {t.number}</td>
                <td>{t.seats}</td>
                <td style={{ color: "var(--ink-3)" }}>{t.location ?? "—"}</td>
                <td>
                  <select
                    className="select"
                    value={t.status}
                    onChange={async e => {
                      try {
                        await api.updateTable(token, t.id, { status: e.target.value as TableStatus });
                        await refreshTables();
                      } catch { toast("error", "Ошибка"); }
                    }}
                    style={{ width: 140 }}
                  >
                    {TABLE_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </td>
                <td>
                  <button className="btn sm" onClick={() => { setForm({ ...t }); setEditTable(t as unknown as Table); setShowNew(false); }}>✏️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editTable || showNew) && (
        <div className="scrim" onClick={() => { setEditTable(null); setShowNew(false); }}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">{editTable ? "Редактировать стол" : "Новый стол"}</div>
              <button className="iconbtn borderless" onClick={() => { setEditTable(null); setShowNew(false); }}>✕</button>
            </div>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field"><label className="field-label">Номер стола</label>
                <input className="input" value={form.number ?? ""} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} />
              </div>
              <div className="field"><label className="field-label">Мест</label>
                <input className="input" type="number" value={form.seats ?? ""} onChange={e => setForm(f => ({ ...f, seats: parseInt(e.target.value) || 4 }))} />
              </div>
              <div className="field"><label className="field-label">Локация</label>
                <input className="input" value={form.location ?? ""} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => { setEditTable(null); setShowNew(false); }}>Отмена</button>
              <button className="btn primary" onClick={saveTable}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Manager Users ────────────────────────────────────────────────────────────

export function ManagerUsers() {
  const { state, toast } = useApp();
  const token = state.token!;
  const [users, setUsers] = useState<User[]>([]);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<Partial<User & { password: string }>>({});

  useEffect(() => {
    api.users(token).then(setUsers).catch(() => toast("error", "Ошибка загрузки пользователей"));
  }, [token]);

  const save = async () => {
    try {
      if (editUser) {
        await api.updateUser(token, editUser.id, { full_name: form.full_name, role: form.role, is_active: form.is_active });
        toast("success", "Сотрудник обновлён");
      } else {
        await api.createUser(token, { username: form.username!, password: form.password!, full_name: form.full_name!, role: form.role! });
        toast("success", "Сотрудник добавлен");
      }
      const updated = await api.users(token);
      setUsers(updated);
      setEditUser(null);
      setShowNew(false);
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Ошибка");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-1)", display: "flex" }}>
        <button className="btn primary sm" onClick={() => { setForm({ role: "waiter", is_active: true }); setShowNew(true); setEditUser(null); }}>
          + Добавить сотрудника
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr className="list-head"><th>Имя</th><th>Логин</th><th>Роль</th><th>Активен</th><th></th></tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="list-row">
                <td style={{ fontWeight: 500 }}>{u.full_name}</td>
                <td style={{ color: "var(--ink-3)" }}>{u.username}</td>
                <td><span className={`badge ${u.role}`}>{ROLE_LABEL[u.role]}</span></td>
                <td>
                  <span style={{ color: u.is_active ? "var(--green)" : "var(--red)", fontWeight: 600, fontSize: 12 }}>
                    {u.is_active ? "Да" : "Нет"}
                  </span>
                </td>
                <td>
                  <button className="btn sm" onClick={() => { setForm({ ...u }); setEditUser(u); setShowNew(false); }}>✏️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(editUser || showNew) && (
        <div className="scrim" onClick={() => { setEditUser(null); setShowNew(false); }}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">{editUser ? "Редактировать сотрудника" : "Новый сотрудник"}</div>
              <button className="iconbtn borderless" onClick={() => { setEditUser(null); setShowNew(false); }}>✕</button>
            </div>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field"><label className="field-label">Полное имя</label>
                <input className="input" value={form.full_name ?? ""} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
              </div>
              {!editUser && <>
                <div className="field"><label className="field-label">Логин</label>
                  <input className="input" value={form.username ?? ""} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
                </div>
                <div className="field"><label className="field-label">Пароль</label>
                  <input className="input" type="password" value={form.password ?? ""} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              </>}
              <div className="field"><label className="field-label">Роль</label>
                <select className="select" value={form.role ?? "waiter"} onChange={e => setForm(f => ({ ...f, role: e.target.value as User["role"] }))}>
                  <option value="waiter">Официант</option>
                  <option value="kitchen">Кухня</option>
                  <option value="manager">Менеджер</option>
                </select>
              </div>
              {editUser && <div className="field">
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.is_active ?? true} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                  <span>Активен</span>
                </label>
              </div>}
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => { setEditUser(null); setShowNew(false); }}>Отмена</button>
              <button className="btn primary" onClick={save}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Manager Payments ─────────────────────────────────────────────────────────

export function ManagerPayments() {
  const { state, refreshPayments } = useApp();

  useEffect(() => { refreshPayments(); }, []);

  const payments = state.payments;
  const totalRevenue = payments.reduce((s, p) => s + parseFloat(p.final_amount), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-1)", display: "flex", gap: 16, flexWrap: "wrap" }}>
        {[
          { label: "Всего платежей", value: payments.length },
          { label: "Выручка", value: fmtKZT(totalRevenue) },
          { label: "Наличные", value: payments.filter(p => p.method === "cash").length },
          { label: "Карта", value: payments.filter(p => p.method === "card").length },
        ].map(m => (
          <div key={m.label} style={{ background: "var(--bg-sunken)", borderRadius: "var(--r)", padding: "8px 16px" }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{m.label}</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{m.value}</div>
          </div>
        ))}
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={refreshPayments}>Обновить</button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr className="list-head"><th>ID</th><th>Заказ</th><th>Метод</th><th>Скидка</th><th>Итого</th><th>Время</th></tr>
          </thead>
          <tbody>
            {payments.map(p => (
              <tr key={p.id} className="list-row">
                <td style={{ fontWeight: 500 }}>#{p.id}</td>
                <td>#{p.order_id}</td>
                <td>{PAYMENT_METHOD[p.method] ?? p.method}</td>
                <td style={{ color: "var(--green)" }}>{parseFloat(p.discount_amount) > 0 ? `−${fmtKZT(p.discount_amount)}` : "—"}</td>
                <td style={{ fontWeight: 600 }}>{fmtKZT(p.final_amount)}</td>
                <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{new Date(p.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
              </tr>
            ))}
            {payments.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Платежей нет</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const PAYMENT_METHOD: Record<string, string> = { cash: "Наличные", card: "Карта", qr: "QR / Kaspi", account: "На счёт" };

// ─── Manager Shifts ───────────────────────────────────────────────────────────

export function ManagerShifts() {
  const { state, refreshShifts, openShift, closeShift, toast } = useApp();
  const [openCash, setOpenCash] = useState("");
  const [closeCash, setCloseCash] = useState("");
  const [closeNote, setCloseNote] = useState("");
  const [showClose, setShowClose] = useState(false);

  useEffect(() => { refreshShifts(); }, []);

  const handleOpen = async () => {
    try {
      await openShift(parseFloat(openCash) || 0);
      toast("success", "Смена открыта");
      setOpenCash("");
      await refreshShifts();
    } catch (e: unknown) { toast("error", e instanceof Error ? e.message : "Ошибка"); }
  };

  const handleClose = async () => {
    try {
      await closeShift(parseFloat(closeCash) || 0, closeNote || undefined);
      toast("success", "Смена закрыта");
      setShowClose(false);
      await refreshShifts();
    } catch (e: unknown) { toast("error", e instanceof Error ? e.message : "Ошибка"); }
  };

  const current = state.currentShift;
  const shifts = state.shifts;

  return (
    <div style={{ overflow: "auto", padding: 24 }}>
      {/* Current shift card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 600 }}>Текущая смена</div>
        <div style={{ padding: 18 }}>
          {current ? (
            <div>
              <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
                <div><div style={{ fontSize: 12, color: "var(--ink-3)" }}>Статус</div><div style={{ fontWeight: 600, color: "var(--green)" }}>Открыта</div></div>
                <div><div style={{ fontSize: 12, color: "var(--ink-3)" }}>Открыта в</div><div style={{ fontWeight: 500 }}>{new Date(current.opened_at).toLocaleString("ru-RU")}</div></div>
                <div><div style={{ fontSize: 12, color: "var(--ink-3)" }}>Касса при открытии</div><div style={{ fontWeight: 500 }}>{fmtKZT(current.opening_cash_amount)}</div></div>
              </div>
              <button className="btn danger" onClick={() => setShowClose(true)}>Закрыть смену</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ color: "var(--ink-3)", fontSize: 14 }}>Нет активной смены</div>
              <input className="input" type="number" placeholder="Сумма в кассе ₸" value={openCash} onChange={e => setOpenCash(e.target.value)} style={{ width: 200 }} />
              <button className="btn primary" onClick={handleOpen}>Открыть смену</button>
            </div>
          )}
        </div>
      </div>

      {/* Shift history */}
      <div className="card">
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 600 }}>История смен</div>
        <div style={{ overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr className="list-head"><th>ID</th><th>Статус</th><th>Открыта</th><th>Закрыта</th><th>Открытие ₸</th><th>Закрытие ₸</th></tr>
            </thead>
            <tbody>
              {shifts.map((s: Shift) => (
                <tr key={s.id} className="list-row">
                  <td>#{s.id}</td>
                  <td><span style={{ color: s.status === "open" ? "var(--green)" : "var(--ink-3)", fontWeight: 600, fontSize: 12 }}>{s.status === "open" ? "Открыта" : "Закрыта"}</span></td>
                  <td style={{ fontSize: 13 }}>{new Date(s.opened_at).toLocaleString("ru-RU")}</td>
                  <td style={{ fontSize: 13, color: "var(--ink-3)" }}>{s.closed_at ? new Date(s.closed_at).toLocaleString("ru-RU") : "—"}</td>
                  <td>{fmtKZT(s.opening_cash_amount)}</td>
                  <td>{s.closing_cash_amount ? fmtKZT(s.closing_cash_amount) : "—"}</td>
                </tr>
              ))}
              {shifts.length === 0 && <tr><td colSpan={6} style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Смен нет</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {showClose && (
        <div className="scrim" onClick={() => setShowClose(false)}>
          <div className="modal" style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <div className="modal-title">Закрыть смену</div>
              <button className="iconbtn borderless" onClick={() => setShowClose(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="field"><label className="field-label">Сумма в кассе ₸</label>
                <input className="input" type="number" value={closeCash} onChange={e => setCloseCash(e.target.value)} />
              </div>
              <div className="field"><label className="field-label">Примечание</label>
                <textarea className="textarea" value={closeNote} onChange={e => setCloseNote(e.target.value)} rows={2} />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn" onClick={() => setShowClose(false)}>Отмена</button>
              <button className="btn danger" onClick={handleClose}>Закрыть смену</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Manager Peripherals ──────────────────────────────────────────────────────

export function ManagerPeripherals() {
  const { state, refreshDevices } = useApp();

  const DEVICE_TYPE: Record<string, string> = {
    receipt_printer: "Принтер чеков",
    cash_drawer: "Денежный ящик",
    barcode_scanner: "Сканер штрихкода",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-1)", display: "flex" }}>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={refreshDevices}>Обновить</button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr className="list-head"><th>Название</th><th>Тип</th><th>ID устройства</th><th>Локация</th><th>Статус</th></tr>
          </thead>
          <tbody>
            {state.devices.map(d => (
              <tr key={d.id} className="list-row">
                <td style={{ fontWeight: 500 }}>{d.name}</td>
                <td>{DEVICE_TYPE[d.device_type] ?? d.device_type}</td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{d.identifier}</td>
                <td style={{ color: "var(--ink-3)" }}>{d.location ?? "—"}</td>
                <td>
                  <span style={{ color: d.is_active ? "var(--green)" : "var(--red)", fontWeight: 600, fontSize: 12 }}>
                    {d.is_active ? "Активно" : "Неактивно"}
                  </span>
                </td>
              </tr>
            ))}
            {state.devices.length === 0 && <tr><td colSpan={5} style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Устройств нет</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Manager Analytics ────────────────────────────────────────────────────────

export function ManagerAnalytics() {
  const { state } = useApp();
  const token = state.token!;
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof api.analytics>> | null>(null);

  useEffect(() => {
    api.analytics(token).then(setAnalytics).catch(() => {});
  }, [token]);

  if (!analytics) {
    return <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Загрузка аналитики...</div>;
  }

  const maxOrders = Math.max(...analytics.peak_hours.map(h => h.orders), 1);

  return (
    <div style={{ overflow: "auto", padding: 24 }}>
      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        {[
          { label: "Активных заказов", value: analytics.active_orders },
          { label: "Завершённых", value: analytics.completed_orders },
          { label: "Оплаченных", value: analytics.paid_orders },
          { label: "Выручка", value: fmtKZT(analytics.revenue) },
          { label: "Среднее ожидание", value: analytics.average_customer_wait_seconds ? `${Math.round(analytics.average_customer_wait_seconds / 60)} мин` : "—" },
          { label: "Среднее время готовки", value: analytics.average_preparation_seconds ? `${Math.round(analytics.average_preparation_seconds / 60)} мин` : "—" },
        ].map(m => (
          <div key={m.label} className="card metric">
            <div className="metric-label">{m.label}</div>
            <div className="metric-value">{m.value}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* Peak hours chart */}
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 600 }}>Пиковые часы</div>
          <div style={{ padding: 16, display: "flex", alignItems: "flex-end", gap: 4, height: 140 }}>
            {analytics.peak_hours.map(h => (
              <div key={h.hour} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: "100%",
                  height: `${Math.max(4, (h.orders / maxOrders) * 96)}px`,
                  background: "var(--brand)",
                  borderRadius: "3px 3px 0 0",
                  opacity: 0.8,
                }} />
                <div style={{ fontSize: 9, color: "var(--ink-4)" }}>{h.hour}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Popular items */}
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 600 }}>Популярные блюда</div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {analytics.popular_items.slice(0, 6).map((item, idx) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: "var(--brand)", color: "white", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>
                  {idx + 1}
                </div>
                <div style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{item.quantity}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Staff productivity */}
      {analytics.staff_productivity.length > 0 && (
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 600 }}>Производительность персонала</div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr className="list-head"><th>Сотрудник</th><th>Заказов</th><th>Выручка</th></tr>
            </thead>
            <tbody>
              {analytics.staff_productivity.map(s => (
                <tr key={s.waiter_id} className="list-row">
                  <td style={{ fontWeight: 500 }}>{s.full_name}</td>
                  <td>{s.orders}</td>
                  <td>{fmtKZT(s.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
