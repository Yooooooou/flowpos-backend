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
import { Icon } from "../components/Icon";
import { StatusBadge, PriorityChip, fmtKZT, fmtTime, Metric, Modal, ConfirmModal } from "../components/UI";

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <Metric label="Активные заказы" value={activeOrders.length} icon="orders" />
        <Metric label="Выручка сегодня"  value={fmtKZT(revenue)}       icon="money"  />
        <Metric label="Оплаченных"       value={paidOrders.length}      icon="check"  />
        <Metric label="Занято столов"    value={state.tables.filter(t => t.status === "occupied").length} icon="tables" />
        <Metric label="Всего заказов"    value={orders.length}          icon="analytics" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16, marginBottom: 24 }}>
        {/* Active orders */}
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 600 }}>Активные заказы</div>
            <button className="btn sm" onClick={refreshOrders}><Icon name="sort" /> Обновить</button>
          </div>
          <div style={{ overflow: "auto", maxHeight: 340 }}>
            <div className="list-head" style={{ gridTemplateColumns: "60px 80px 100px 110px 90px" }}>
              <div>Заказ</div><div>Стол</div><div>Статус</div><div>Сумма</div><div>Время</div>
            </div>
            {activeOrders.slice(0, 10).map(o => (
              <div key={o.id} className="list-row" style={{ gridTemplateColumns: "60px 80px 100px 110px 90px" }}>
                <div className="mono" style={{ fontWeight: 600 }}>#{o.id}</div>
                <div>{o.table ? `Стол ${o.table.number}` : `#${o.table_id}`}</div>
                <div><StatusBadge status={o.status} /></div>
                <div className="num">{fmtKZT(o.total_amount)}</div>
                <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{fmtTime(o.created_at)}</div>
              </div>
            ))}
            {activeOrders.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>Нет активных заказов</div>
            )}
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

  const STATUS_OPTIONS: Array<{ value: OrderStatus | "all"; label: string }> = [
    { value: "all", label: "Все статусы" },
    { value: "pending", label: "Ожидает" },
    { value: "in_progress", label: "Готовится" },
    { value: "ready", label: "Готово" },
    { value: "served", label: "Подан" },
    { value: "paid", label: "Оплачен" },
    { value: "cancelled", label: "Отменён" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-1)", background: "var(--bg-paper)", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <select className="select" value={statusFilter} onChange={e => setStatusFilter(e.target.value as OrderStatus | "all")} style={{ width: 160 }}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div style={{ position: "relative" }}>
          <input className="input" placeholder="Поиск по номеру..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 200, paddingLeft: 32 }} />
          <Icon name="search" size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
        </div>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={refreshOrders}><Icon name="sort" /> Обновить</button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <div className="list-head" style={{ gridTemplateColumns: "60px 80px 120px 100px 90px 60px 110px 90px 110px" }}>
          <div>#</div><div>Стол</div><div>Официант</div><div>Статус</div><div>Приоритет</div><div>Шт.</div><div>Сумма</div><div>Создан</div><div>Действие</div>
        </div>
        {orders.map(o => (
          <div key={o.id} className="list-row" style={{ gridTemplateColumns: "60px 80px 120px 100px 90px 60px 110px 90px 110px" }}>
            <div className="mono" style={{ fontWeight: 600 }}>#{o.id}</div>
            <div>{o.table ? `Стол ${o.table.number}` : `#${o.table_id}`}</div>
            <div style={{ fontSize: 13 }}>{o.waiter?.full_name ?? "—"}</div>
            <div><StatusBadge status={o.status} /></div>
            <div><PriorityChip priority={o.priority} showLabel={false} /></div>
            <div style={{ color: "var(--ink-3)" }}>{o.items.reduce((s, i) => s + i.quantity, 0)}</div>
            <div className="num">{fmtKZT(o.total_amount)}</div>
            <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{fmtTime(o.created_at)}</div>
            <div style={{ display: "flex", gap: 4 }}>
              {o.status === "pending" && <button className="btn sm danger" onClick={() => handleStatus(o.id, "cancelled")}>Отменить</button>}
              {o.status === "served" && <button className="btn sm success" onClick={() => handleStatus(o.id, "paid")}><Icon name="check" /> Оплачен</button>}
            </div>
          </div>
        ))}
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

  const closeForm = () => { setEditItem(null); setNewItem(false); };

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
      closeForm();
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
              background: activeCat === c.id ? "var(--brand-50)" : "none",
              border: 0,
              borderLeft: `3px solid ${activeCat === c.id ? "var(--brand)" : "transparent"}`,
              cursor: "pointer",
              color: activeCat === c.id ? "var(--brand-700)" : "var(--ink-1)",
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
            <Icon name="plus" /> Добавить блюдо
          </button>
          <button className="btn sm" style={{ marginLeft: "auto" }} onClick={refreshMenu}><Icon name="sort" /> Обновить</button>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          <div className="list-head" style={{ gridTemplateColumns: "1.5fr 2fr 100px 70px 80px 50px" }}>
            <div>Название</div><div>Описание</div><div>Цена</div><div>Время</div><div>Доступно</div><div></div>
          </div>
          {items.map(item => (
            <div key={item.id} className="list-row" style={{ gridTemplateColumns: "1.5fr 2fr 100px 70px 80px 50px" }}>
              <div style={{ fontWeight: 500 }}>{item.name}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{item.description ?? "—"}</div>
              <div className="num">{fmtKZT(item.price)}</div>
              <div style={{ color: "var(--ink-3)" }}>{item.preparation_time_minutes}м</div>
              <div>
                <span style={{ color: item.is_available ? "var(--olive)" : "var(--red)", fontWeight: 600, fontSize: 12 }}>
                  {item.is_available ? "Да" : "Нет"}
                </span>
              </div>
              <div>
                <button className="iconbtn borderless" onClick={() => { setForm({ ...item }); setEditItem(item); setNewItem(false); }}>
                  <Icon name="edit" size={15} />
                </button>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>В этой категории нет блюд</div>
          )}
        </div>
      </div>

      {(editItem || newItem) && (
        <Modal
          title={editItem ? "Редактировать блюдо" : "Новое блюдо"}
          onClose={closeForm}
          footer={
            <>
              <button className="btn ghost" onClick={closeForm}>Отмена</button>
              <button className="btn primary" onClick={save}>Сохранить</button>
            </>
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
        </Modal>
      )}
    </div>
  );
}

// ─── Manager Tables ───────────────────────────────────────────────────────────

const TABLE_STATUS_OPTIONS: { value: TableStatus; label: string }[] = [
  { value: "free",     label: "Свободен" },
  { value: "occupied", label: "Занят"    },
  { value: "reserved", label: "Бронь"    },
  { value: "cleaning", label: "Уборка"   },
];

export function ManagerTables() {
  const { state, refreshTables, toast } = useApp();
  const token = state.token!;
  const [editTable, setEditTable] = useState<Table | null>(null);
  const [form, setForm] = useState<Partial<Table>>({});
  const [showNew, setShowNew] = useState(false);

  const closeForm = () => { setEditTable(null); setShowNew(false); };

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
      closeForm();
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Ошибка");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-1)", display: "flex", gap: 8 }}>
        <button className="btn primary sm" onClick={() => { setForm({ seats: 4, status: "free" }); setShowNew(true); setEditTable(null); }}>
          <Icon name="plus" /> Добавить стол
        </button>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={refreshTables}><Icon name="sort" /> Обновить</button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <div className="list-head" style={{ gridTemplateColumns: "120px 70px 1fr 160px 50px" }}>
          <div>№ стола</div><div>Мест</div><div>Локация</div><div>Статус</div><div></div>
        </div>
        {state.tables.map(t => (
          <div key={t.id} className="list-row" style={{ gridTemplateColumns: "120px 70px 1fr 160px 50px" }}>
            <div style={{ fontWeight: 600 }}>Стол {t.number}</div>
            <div>{t.seats}</div>
            <div style={{ color: "var(--ink-3)" }}>{t.location ?? "—"}</div>
            <div>
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
            </div>
            <div>
              <button className="iconbtn borderless" onClick={() => { setForm({ ...t }); setEditTable(t as unknown as Table); setShowNew(false); }}>
                <Icon name="edit" size={15} />
              </button>
            </div>
          </div>
        ))}
        {state.tables.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Столов нет</div>
        )}
      </div>

      {(editTable || showNew) && (
        <Modal
          title={editTable ? "Редактировать стол" : "Новый стол"}
          onClose={closeForm}
          footer={
            <>
              <button className="btn ghost" onClick={closeForm}>Отмена</button>
              <button className="btn primary" onClick={saveTable}>Сохранить</button>
            </>
          }
          width={380}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="field">
              <label className="field-label">Номер стола</label>
              <input className="input" value={form.number ?? ""} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} />
            </div>
            <div className="field">
              <label className="field-label">Мест</label>
              <input className="input" type="number" value={form.seats ?? ""} onChange={e => setForm(f => ({ ...f, seats: parseInt(e.target.value) || 4 }))} />
            </div>
            <div className="field">
              <label className="field-label">Локация</label>
              <input className="input" value={form.location ?? ""} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
            </div>
          </div>
        </Modal>
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

  const closeForm = () => { setEditUser(null); setShowNew(false); };

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
      closeForm();
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Ошибка");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-1)", display: "flex" }}>
        <button className="btn primary sm" onClick={() => { setForm({ role: "waiter", is_active: true }); setShowNew(true); setEditUser(null); }}>
          <Icon name="plus" /> Добавить сотрудника
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <div className="list-head" style={{ gridTemplateColumns: "1.5fr 1fr 100px 80px 50px" }}>
          <div>Имя</div><div>Логин</div><div>Роль</div><div>Активен</div><div></div>
        </div>
        {users.map(u => (
          <div key={u.id} className="list-row" style={{ gridTemplateColumns: "1.5fr 1fr 100px 80px 50px" }}>
            <div style={{ fontWeight: 500 }}>{u.full_name}</div>
            <div style={{ color: "var(--ink-3)", fontSize: 13 }}>{u.username}</div>
            <div><span className="badge neutral">{ROLE_LABEL[u.role]}</span></div>
            <div>
              <span style={{ color: u.is_active ? "var(--olive)" : "var(--red)", fontWeight: 600, fontSize: 12 }}>
                {u.is_active ? "Да" : "Нет"}
              </span>
            </div>
            <div>
              <button className="iconbtn borderless" onClick={() => { setForm({ ...u }); setEditUser(u); setShowNew(false); }}>
                <Icon name="edit" size={15} />
              </button>
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Сотрудников нет</div>
        )}
      </div>

      {(editUser || showNew) && (
        <Modal
          title={editUser ? "Редактировать сотрудника" : "Новый сотрудник"}
          onClose={closeForm}
          footer={
            <>
              <button className="btn ghost" onClick={closeForm}>Отмена</button>
              <button className="btn primary" onClick={save}>Сохранить</button>
            </>
          }
          width={380}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="field">
              <label className="field-label">Полное имя</label>
              <input className="input" value={form.full_name ?? ""} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
            </div>
            {!editUser && (
              <>
                <div className="field">
                  <label className="field-label">Логин</label>
                  <input className="input" value={form.username ?? ""} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
                </div>
                <div className="field">
                  <label className="field-label">Пароль</label>
                  <input className="input" type="password" value={form.password ?? ""} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                </div>
              </>
            )}
            <div className="field">
              <label className="field-label">Роль</label>
              <select className="select" value={form.role ?? "waiter"} onChange={e => setForm(f => ({ ...f, role: e.target.value as User["role"] }))}>
                <option value="waiter">Официант</option>
                <option value="kitchen">Кухня</option>
                <option value="manager">Менеджер</option>
              </select>
            </div>
            {editUser && (
              <div className="field">
                <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.is_active ?? true} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} />
                  <span>Активен</span>
                </label>
              </div>
            )}
          </div>
        </Modal>
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
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-1)", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Metric label="Платежей" value={payments.length} icon="receipt" />
        <Metric label="Выручка" value={fmtKZT(totalRevenue)} icon="money" />
        <Metric label="Наличные" value={payments.filter(p => p.method === "cash").length} icon="cash" />
        <Metric label="Карта" value={payments.filter(p => p.method === "card").length} icon="card" />
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={refreshPayments}><Icon name="sort" /> Обновить</button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <div className="list-head" style={{ gridTemplateColumns: "60px 80px 120px 120px 120px 130px" }}>
          <div>ID</div><div>Заказ</div><div>Метод</div><div>Скидка</div><div>Итого</div><div>Время</div>
        </div>
        {payments.map(p => (
          <div key={p.id} className="list-row" style={{ gridTemplateColumns: "60px 80px 120px 120px 120px 130px" }}>
            <div className="mono" style={{ fontWeight: 500 }}>#{p.id}</div>
            <div className="mono">#{p.order_id}</div>
            <div>{PAYMENT_METHOD[p.method] ?? p.method}</div>
            <div style={{ color: "var(--olive)" }}>{parseFloat(p.discount_amount) > 0 ? `−${fmtKZT(p.discount_amount)}` : "—"}</div>
            <div className="num" style={{ fontWeight: 600 }}>{fmtKZT(p.final_amount)}</div>
            <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
              {new Date(p.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        ))}
        {payments.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Платежей нет</div>}
      </div>
    </div>
  );
}

const PAYMENT_METHOD: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  mixed: "Смешанная",
  external: "QR / внешний платеж",
};

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
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 600 }}>Текущая смена</div>
        <div style={{ padding: 18 }}>
          {current ? (
            <div>
              <div style={{ display: "flex", gap: 24, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Статус</div>
                  <div style={{ fontWeight: 600, color: "var(--olive)" }}>Открыта</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Открыта в</div>
                  <div style={{ fontWeight: 500 }}>{new Date(current.opened_at).toLocaleString("ru-RU")}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Касса при открытии</div>
                  <div style={{ fontWeight: 500 }}>{fmtKZT(current.opening_cash_amount)}</div>
                </div>
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

      <div className="card">
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 600 }}>История смен</div>
        <div style={{ overflow: "auto" }}>
          <div className="list-head" style={{ gridTemplateColumns: "60px 90px 1fr 1fr 120px 120px" }}>
            <div>ID</div><div>Статус</div><div>Открыта</div><div>Закрыта</div><div>Открытие ₸</div><div>Закрытие ₸</div>
          </div>
          {shifts.map((s: Shift) => (
            <div key={s.id} className="list-row" style={{ gridTemplateColumns: "60px 90px 1fr 1fr 120px 120px" }}>
              <div className="mono">#{s.id}</div>
              <div>
                <span style={{ color: s.status === "open" ? "var(--olive)" : "var(--ink-3)", fontWeight: 600, fontSize: 12 }}>
                  {s.status === "open" ? "Открыта" : "Закрыта"}
                </span>
              </div>
              <div style={{ fontSize: 13 }}>{new Date(s.opened_at).toLocaleString("ru-RU")}</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{s.closed_at ? new Date(s.closed_at).toLocaleString("ru-RU") : "—"}</div>
              <div className="num">{fmtKZT(s.opening_cash_amount)}</div>
              <div className="num">{s.closing_cash_amount ? fmtKZT(s.closing_cash_amount) : "—"}</div>
            </div>
          ))}
          {shifts.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Смен нет</div>}
        </div>
      </div>

      {showClose && (
        <Modal
          title="Закрыть смену"
          onClose={() => setShowClose(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setShowClose(false)}>Отмена</button>
              <button className="btn danger" onClick={handleClose}>Закрыть смену</button>
            </>
          }
          width={380}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="field">
              <label className="field-label">Сумма в кассе ₸</label>
              <input className="input" type="number" value={closeCash} onChange={e => setCloseCash(e.target.value)} />
            </div>
            <div className="field">
              <label className="field-label">Примечание</label>
              <textarea className="textarea" value={closeNote} onChange={e => setCloseNote(e.target.value)} rows={2} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Manager Peripherals ──────────────────────────────────────────────────────

export function ManagerPeripherals() {
  const { state, refreshDevices } = useApp();

  const DEVICE_TYPE: Record<string, string> = {
    receipt_printer: "Принтер чеков",
    cash_drawer:     "Денежный ящик",
    barcode_scanner: "Сканер штрихкода",
  };

  const DEVICE_ICON: Record<string, string> = {
    receipt_printer: "print",
    cash_drawer:     "cash",
    barcode_scanner: "barcode",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-1)", display: "flex" }}>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={refreshDevices}><Icon name="sort" /> Обновить</button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        <div className="list-head" style={{ gridTemplateColumns: "1.5fr 1.5fr 1.5fr 1fr 100px" }}>
          <div>Название</div><div>Тип</div><div>ID устройства</div><div>Локация</div><div>Статус</div>
        </div>
        {state.devices.map(d => (
          <div key={d.id} className="list-row" style={{ gridTemplateColumns: "1.5fr 1.5fr 1.5fr 1fr 100px" }}>
            <div style={{ fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
              <Icon name={DEVICE_ICON[d.device_type] ?? "device"} size={15} style={{ color: "var(--ink-3)" }} />
              {d.name}
            </div>
            <div>{DEVICE_TYPE[d.device_type] ?? d.device_type}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-3)" }}>{d.identifier}</div>
            <div style={{ color: "var(--ink-3)" }}>{d.location ?? "—"}</div>
            <div>
              <span style={{ color: d.is_active ? "var(--olive)" : "var(--red)", fontWeight: 600, fontSize: 12 }}>
                {d.is_active ? "Активно" : "Неактивно"}
              </span>
            </div>
          </div>
        ))}
        {state.devices.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Устройств нет</div>}
      </div>
    </div>
  );
}

// ─── Manager Analytics ────────────────────────────────────────────────────────

export function ManagerAnalytics() {
  const { state, refreshOrders, toast } = useApp();
  const token = state.token!;
  const [analytics, setAnalytics] = useState<Awaited<ReturnType<typeof api.analytics>> | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const data = await api.analytics(token);
      setAnalytics(data);
      await refreshOrders();
    } catch {
      toast("error", "Не удалось загрузить аналитику");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAnalytics(); }, [token]);

  if (loading && !analytics) {
    return (
      <div style={{ padding: 60, textAlign: "center", color: "var(--ink-3)" }}>
        <span className="spin" style={{ display: "inline-block", marginBottom: 12 }} />
        <div>Загрузка аналитики...</div>
      </div>
    );
  }

  if (!analytics) {
    return <div style={{ padding: 40, color: "var(--ink-3)" }}>Нет данных аналитики</div>;
  }

  const maxOrders = Math.max(...analytics.peak_hours.map(h => h.orders), 1);
  const revenue = parseFloat(analytics.revenue);
  const refunds = parseFloat(analytics.refunds_total ?? "0");
  const netRevenue = Math.max(0, revenue - refunds);
  const activeByStatus = ["pending", "in_progress", "ready", "served"].map(status => ({
    status,
    count: state.orders.filter(o => o.status === status).length,
  }));
  const maxStatusCount = Math.max(...activeByStatus.map(s => s.count), 1);
  const paymentTotal = analytics.payments.reduce((sum, row) => sum + parseFloat(row.total), 0) || 1;

  return (
    <div style={{ overflow: "auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 750 }}>Аналитика смены</div>
          <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Деньги, скорость кухни, нагрузка зала и продуктивность команды</div>
        </div>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={loadAnalytics} disabled={loading}>
          {loading ? <span className="spin" /> : <Icon name="sort" />} Обновить
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
        <Metric label="Выручка gross" value={fmtKZT(revenue)} icon="money" />
        <Metric label="Возвраты" value={refunds ? `−${fmtKZT(refunds)}` : "0 ₸"} icon="refund" />
        <Metric label="Выручка net" value={fmtKZT(netRevenue)} icon="receipt" />
        <Metric label="Активные заказы" value={analytics.active_orders} icon="orders" />
        <Metric label="Оплачено заказов" value={analytics.paid_orders} icon="check" />
        <Metric
          label="Среднее ожидание"
          value={analytics.average_customer_wait_seconds ? `${Math.round(analytics.average_customer_wait_seconds / 60)} мин` : "—"}
          icon="clock"
        />
        <Metric
          label="Среднее время готовки"
          value={analytics.average_preparation_seconds ? `${Math.round(analytics.average_preparation_seconds / 60)} мин` : "—"}
          icon="kitchen"
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.25fr) minmax(320px, 0.75fr)", gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontWeight: 650 }}>Пиковые часы</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>заказы по часу</div>
          </div>
          <div style={{ padding: 16, display: "flex", alignItems: "flex-end", gap: 6, height: 190 }}>
            {analytics.peak_hours.map(h => (
              <div key={h.hour} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 11, color: h.orders ? "var(--ink-2)" : "var(--ink-4)", fontWeight: 600 }}>{h.orders || ""}</div>
                <div style={{
                  width: "100%",
                  height: `${Math.max(5, (h.orders / maxOrders) * 120)}px`,
                  background: "var(--brand)",
                  borderRadius: "3px 3px 0 0",
                  opacity: h.orders ? 0.85 : 0.18,
                }} />
                <div style={{ fontSize: 10, color: "var(--ink-4)" }}>{String(h.hour).padStart(2, "0")}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 650 }}>Оплаты по методам</div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {analytics.payments.map(row => (
              <div key={row.method}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                  <span>{PAYMENT_METHOD[row.method] ?? row.method}</span>
                  <span className="num" style={{ fontWeight: 650 }}>{fmtKZT(row.total)}</span>
                </div>
                <div style={{ height: 8, background: "var(--bg-sunken)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.max(6, parseFloat(row.total) / paymentTotal * 100)}%`, background: "var(--olive)", borderRadius: 999 }} />
                </div>
                <div style={{ marginTop: 4, fontSize: 11, color: "var(--ink-4)" }}>{row.count} платежей</div>
              </div>
            ))}
            {analytics.payments.length === 0 && <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Платежей пока нет</div>}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 0.8fr) minmax(0, 1.2fr)", gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 650 }}>Воронка активных заказов</div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            {activeByStatus.map(row => (
              <div key={row.status}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <StatusBadge status={row.status as OrderStatus} />
                  <span style={{ fontWeight: 700 }}>{row.count}</span>
                </div>
                <div style={{ height: 8, background: "var(--bg-sunken)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.max(4, row.count / maxStatusCount * 100)}%`, background: "var(--brand)", borderRadius: 999 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 650 }}>Популярные блюда</div>
          <div style={{ padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
            {analytics.popular_items.slice(0, 8).map((item, idx) => (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, background: "var(--bg-sunken)", borderRadius: "var(--r)" }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: idx < 3 ? "var(--brand)" : "var(--line-2)", color: idx < 3 ? "white" : "var(--ink-2)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
                  {idx + 1}
                </div>
                <div style={{ minWidth: 0, flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                <div className="num" style={{ fontWeight: 700 }}>{item.quantity}</div>
              </div>
            ))}
            {analytics.popular_items.length === 0 && <div style={{ color: "var(--ink-3)", fontSize: 13 }}>Нет продаж по блюдам</div>}
          </div>
        </div>
      </div>

      {analytics.staff_productivity.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 650 }}>Продуктивность персонала</div>
          <div className="list-head" style={{ gridTemplateColumns: "1fr 80px 140px" }}>
            <div>Сотрудник</div><div>Заказов</div><div>Выручка</div>
          </div>
          {analytics.staff_productivity.map(s => (
            <div key={s.waiter_id} className="list-row" style={{ gridTemplateColumns: "1fr 80px 140px" }}>
              <div style={{ fontWeight: 500 }}>{s.full_name}</div>
              <div>{s.orders}</div>
              <div className="num">{fmtKZT(s.revenue)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
