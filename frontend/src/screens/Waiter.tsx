import { useState } from "react";
import { useApp } from "../lib/store";
import type { Order, TableOverview, TableStatus } from "../types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtKZT(v: string | number | null | undefined) {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(n);
}

const TABLE_STATUS_LABEL: Record<TableStatus, string> = {
  free: "Свободен",
  occupied: "Занят",
  reserved: "Бронь",
  cleaning: "Уборка",
};

const STATUS_COLOR: Record<TableStatus, string> = {
  free: "var(--green)",
  occupied: "var(--brand)",
  reserved: "var(--amber)",
  cleaning: "var(--ink-4)",
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "Ожидает",
  in_progress: "Готовится",
  ready: "Готов",
  served: "Подан",
  paid: "Оплачен",
  cancelled: "Отменён",
};

// ─── WaiterTables ─────────────────────────────────────────────────────────────

interface WaiterTablesProps {
  setRoute: (r: { id: string; tableId?: number; orderId?: number }) => void;
}

export function WaiterTables({ setRoute }: WaiterTablesProps) {
  const { state, refreshTables } = useApp();
  const [filter, setFilter] = useState<"all" | TableStatus>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TableOverview | null>(null);

  const tables = state.tables.filter(t => {
    if (filter !== "all" && t.status !== filter) return false;
    if (search && !t.number.toLowerCase().includes(search.toLowerCase()) && !(t.location ?? "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = { all: state.tables.length, free: 0, occupied: 0, reserved: 0, cleaning: 0 };
  state.tables.forEach(t => counts[t.status]++);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Filter bar */}
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-1)", background: "var(--bg-paper)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div className="segmented">
          {(["all", "free", "occupied", "reserved", "cleaning"] as const).map(s => (
            <button key={s} className={filter === s ? "active" : ""} onClick={() => setFilter(s)}>
              {s === "all" ? "Все" : TABLE_STATUS_LABEL[s]}
              <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 4 }}>{counts[s]}</span>
            </button>
          ))}
        </div>
        <input
          className="input"
          placeholder="Поиск стола..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: 180 }}
        />
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn sm" onClick={refreshTables}>Обновить</button>
        </div>
      </div>

      {/* Table grid */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {tables.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--ink-3)" }}>Столы не найдены</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {tables.map(table => (
              <button
                key={table.id}
                onClick={() => setSelected(table)}
                style={{
                  background: "var(--bg-paper)",
                  border: `2px solid ${table.status === "occupied" ? "var(--brand)" : "var(--line-1)"}`,
                  borderRadius: "var(--r)",
                  padding: 16,
                  textAlign: "left",
                  cursor: "pointer",
                  color: "inherit",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  minHeight: 130,
                  transition: "all 120ms ease",
                  boxShadow: "var(--sh-1)",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "var(--sh-2)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "var(--sh-1)"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: 18 }}>№{table.number}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLOR[table.status], background: `${STATUS_COLOR[table.status]}20`, padding: "2px 8px", borderRadius: 999 }}>
                    {TABLE_STATUS_LABEL[table.status]}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{table.seats} мест · {table.location || "Зал"}</div>
                {table.active_order_status && (
                  <div style={{ marginTop: "auto", fontSize: 12 }}>
                    <div style={{ color: "var(--ink-3)" }}>Заказ #{table.active_order_id}</div>
                    <div style={{ fontWeight: 600, color: "var(--ink-1)" }}>{ORDER_STATUS_LABEL[table.active_order_status]}</div>
                    {table.active_order_total && <div className="num" style={{ fontSize: 11, color: "var(--ink-3)" }}>{fmtKZT(table.active_order_total)}</div>}
                  </div>
                )}
                {table.status === "free" && (
                  <button
                    className="btn primary sm"
                    style={{ marginTop: "auto" }}
                    onClick={e => { e.stopPropagation(); setRoute({ id: "w_order_create", tableId: table.id }); }}
                  >
                    + Заказ
                  </button>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table detail modal */}
      {selected && (
        <TableModal
          table={selected}
          orders={state.orders.filter(o => o.table_id === selected.id)}
          onClose={() => setSelected(null)}
          setRoute={setRoute}
        />
      )}
    </div>
  );
}

function TableModal({ table, orders, onClose, setRoute }: {
  table: TableOverview;
  orders: Order[];
  onClose: () => void;
  setRoute: (r: { id: string; tableId?: number; orderId?: number }) => void;
}) {
  const { changeStatus, toast, refreshTables } = useApp();
  const activeOrders = orders.filter(o => !["paid", "cancelled"].includes(o.status));

  const handleStatus = async (orderId: number, status: string) => {
    try {
      await changeStatus(orderId, status as Order["status"]);
      toast("success", `Статус обновлён`);
      await refreshTables();
    } catch {
      toast("error", "Ошибка обновления статуса");
    }
  };

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="modal-title">Стол №{table.number}</div>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{table.seats} мест · {table.location || "Зал"}</div>
          </div>
          <button className="iconbtn borderless modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {activeOrders.length === 0 ? (
            <div style={{ padding: "20px 0", textAlign: "center", color: "var(--ink-3)" }}>
              Активных заказов нет
            </div>
          ) : (
            activeOrders.map(order => (
              <div key={order.id} style={{ border: "1px solid var(--line-1)", borderRadius: "var(--r)", padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>Заказ #{order.id}</span>
                  <span className={`badge ${order.status}`}>{ORDER_STATUS_LABEL[order.status]}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 10 }}>
                  {order.items.map(i => i.menu_item?.name ?? `#${i.menu_item_id}`).join(", ")}
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className="btn sm" onClick={() => { setRoute({ id: "w_order_details", orderId: order.id }); onClose(); }}>Детали</button>
                  {order.status === "ready" && (
                    <button className="btn success sm" onClick={() => handleStatus(order.id, "served")}>Подан</button>
                  )}
                  {order.status === "served" && (
                    <button className="btn primary sm" onClick={() => { setRoute({ id: "w_payment", orderId: order.id }); onClose(); }}>Оплата</button>
                  )}
                </div>
              </div>
            ))
          )}
          <button
            className="btn primary block"
            style={{ marginTop: 8 }}
            onClick={() => { setRoute({ id: "w_order_create", tableId: table.id }); onClose(); }}
          >
            + Новый заказ
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── WaiterOrders ─────────────────────────────────────────────────────────────

interface WaiterOrdersProps {
  setRoute: (r: { id: string; tableId?: number; orderId?: number }) => void;
}

export function WaiterOrders({ setRoute }: WaiterOrdersProps) {
  const { state, refreshOrders } = useApp();
  const [filter, setFilter] = useState<"active" | "all">("active");

  const orders = state.orders.filter(o => {
    if (filter === "active") return !["paid", "cancelled", "served"].includes(o.status);
    return true;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-1)", background: "var(--bg-paper)", display: "flex", gap: 12, alignItems: "center" }}>
        <div className="segmented">
          <button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>Активные</button>
          <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Все</button>
        </div>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={refreshOrders}>Обновить</button>
      </div>

      <div style={{ flex: 1, overflow: "auto" }}>
        {orders.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: "var(--ink-3)" }}>Заказов нет</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr className="list-head">
                <th>Заказ</th>
                <th>Стол</th>
                <th>Статус</th>
                <th>Позиций</th>
                <th>Сумма</th>
                <th>Время</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map(order => (
                <tr key={order.id} className="list-row" onClick={() => setRoute({ id: "w_order_details", orderId: order.id })} style={{ cursor: "pointer" }}>
                  <td style={{ fontWeight: 600 }}>#{order.id}</td>
                  <td>{order.table ? `Стол ${order.table.number}` : `#${order.table_id}`}</td>
                  <td><span className={`badge ${order.status}`}>{ORDER_STATUS_LABEL[order.status]}</span></td>
                  <td>{order.items.reduce((s, i) => s + i.quantity, 0)}</td>
                  <td className="num">{fmtKZT(order.total_amount)}</td>
                  <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{new Date(order.created_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td>
                    <button className="btn sm" onClick={e => { e.stopPropagation(); setRoute({ id: "w_order_details", orderId: order.id }); }}>
                      Открыть
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
