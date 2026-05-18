import { useEffect, useState } from "react";
import { useApp } from "../lib/store";
import type { Order, TableOverview } from "../types";
import { dominantStatus } from "./TableSession";
import { Icon } from "../components/Icon";
import { StatusBadge, fmtKZT, fmtTime, TABLE_STATUS_LABEL, Modal } from "../components/UI";

// ─── WaiterTables ─────────────────────────────────────────────────────────────

interface SetRoute {
  (r: { id: string; tableId?: number; orderId?: number }): void;
}

function elapsedMin(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

export function WaiterTables({ setRoute }: { setRoute: SetRoute }) {
  const { state } = useApp();

  const freeCount  = state.tables.filter(t => t.status === "free").length;
  const busyCount  = state.tables.filter(t => t.status === "occupied").length;
  const readyCount = state.orders.filter(o => o.status === "ready").length;

  return (
    <>
      <header className="topbar" style={{ height: 60 }}>
        <h1 style={{ fontSize: 18 }}>Столы</h1>
        <div style={{ display: "flex", gap: 16, marginLeft: 16, fontSize: 13, color: "var(--ink-3)" }}>
          <span><b style={{ color: "var(--ink-1)" }}>{busyCount}</b> занято</span>
          <span><b style={{ color: "var(--ink-1)" }}>{freeCount}</b> свободно</span>
          {readyCount > 0 && (
            <span style={{ color: "var(--st-ready-fg)", fontWeight: 600 }}>
              <b>{readyCount}</b> готово к подаче
            </span>
          )}
        </div>
        <div className="spacer" />
      </header>

      <div className="tables-canvas" style={{
        padding: 16,
        height: "calc(100vh - 60px)",
        overflowY: "auto",
        background: "var(--bg-canvas)",
      }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
          {state.tables.map(table => {
            const orders = state.orders.filter(
              o => o.table_id === table.id && !["paid", "cancelled"].includes(o.status)
            );
            return <TableCard key={table.id} table={table} orders={orders} setRoute={setRoute} />;
          })}
        </div>
      </div>
    </>
  );
}

// ─── TableCard ────────────────────────────────────────────────────────────────

const STATUS_ACCENT: Record<string, string> = {
  pending:     "var(--brand)",
  in_progress: "var(--amber)",
  ready:       "var(--olive)",
  served:      "var(--ink-3)",
};

function TableCard({ table, orders, setRoute }: {
  table: TableOverview;
  orders: Order[];
  setRoute: SetRoute;
}) {
  if (orders.length === 0) {
    // Free / reserved / cleaning table
    const canOpen = table.status === "free";
    return (
      <button
        onClick={() => canOpen && setRoute({ id: "w_order_create", tableId: table.id })}
        style={{
          display: "flex", flexDirection: "column",
          background: "var(--bg-sunken)",
          border: "1px solid var(--line-1)",
          borderRadius: "var(--r)",
          padding: "14px 14px 12px",
          minHeight: 170,
          cursor: canOpen ? "pointer" : "default",
          color: "inherit",
          textAlign: "left",
          transition: "box-shadow 120ms",
          opacity: canOpen ? 1 : 0.6,
        }}
        onMouseEnter={e => { if (canOpen) e.currentTarget.style.boxShadow = "var(--sh-2)"; }}
        onMouseLeave={e => { e.currentTarget.style.boxShadow = ""; }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-2)" }}>{table.number}</span>
          <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{table.location || "Зал"}</span>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          {canOpen
            ? <div style={{
                width: 48, height: 48, borderRadius: 24,
                background: "var(--line-2)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon name="plus" size={24} style={{ color: "var(--ink-3)" }} />
              </div>
            : <span style={{ fontSize: 12, color: "var(--ink-4)" }}>{TABLE_STATUS_LABEL[table.status]}</span>
          }
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 8 }}>
          {table.seats} мест
        </div>
      </button>
    );
  }

  // Occupied table — combine all active orders
  const status = dominantStatus(orders);
  const accent = STATUS_ACCENT[status] ?? "var(--brand)";
  const mins = elapsedMin(orders[0].created_at);
  const isReady = status === "ready";
  const allItems = orders.flatMap(o => o.items);
  const totalAmount = orders.reduce((s, o) => s + parseFloat(o.total_amount), 0);
  const MAX_ITEMS = 5;
  const visibleItems = allItems.slice(0, MAX_ITEMS);
  const hiddenCount  = allItems.length - MAX_ITEMS;

  return (
    <button
      onClick={() => setRoute({ id: "w_table_session", tableId: table.id })}
      style={{
        display: "flex", flexDirection: "column",
        background: "var(--bg-paper)",
        border: `1px solid ${isReady ? "var(--olive)" : "var(--line-1)"}`,
        borderTop: `3px solid ${accent}`,
        borderRadius: "var(--r)",
        padding: "12px 14px 10px",
        minHeight: 170,
        cursor: "pointer",
        color: "inherit",
        textAlign: "left",
        boxShadow: isReady ? "0 0 0 2px rgba(80,160,80,0.15)" : "var(--sh-1)",
        transition: "box-shadow 120ms",
      }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "var(--sh-2)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = isReady ? "0 0 0 2px rgba(80,160,80,0.15)" : "var(--sh-1)"; }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{table.number}</span>
          <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 6 }}>{table.location || "Зал"}</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-4)" }}>{fmtTime(orders[0].created_at)}</div>
          <div className="mono" style={{
            fontSize: 11, fontWeight: 600,
            color: mins > 30 ? "var(--pri-urgent)" : "var(--ink-3)",
            marginTop: 1,
          }}>
            {mins}м
          </div>
        </div>
      </div>

      {/* Items list */}
      <div style={{ flex: 1 }}>
        {visibleItems.map(it => (
          <div key={it.id} style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 3 }}>
            <span style={{
              minWidth: 20, height: 18, borderRadius: 3,
              background: accent, color: "#fff",
              fontSize: 10, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              {it.quantity}
            </span>
            <span style={{ fontSize: 12, lineHeight: 1.3, color: "var(--ink-1)" }}>
              {it.menu_item?.name ?? `#${it.menu_item_id}`}
            </span>
          </div>
        ))}
        {hiddenCount > 0 && (
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>+{hiddenCount} ещё</div>
        )}
      </div>

      {/* Footer: total */}
      <div style={{
        marginTop: 8, paddingTop: 8,
        borderTop: "1px dashed var(--line-1)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <StatusBadge status={status} />
        <span className="num" style={{ fontWeight: 700, fontSize: 14 }}>{fmtKZT(totalAmount)}</span>
      </div>
    </button>
  );
}

// ─── OrderDetailModal ─────────────────────────────────────────────────────────

const STATUS_RU: Record<string, string> = {
  pending: "Ожидание", in_progress: "Готовится", ready: "Готово",
  served: "Подано", paid: "Оплачено", cancelled: "Отменено",
};
const PRIORITY_RU: Record<string, string> = { low: "Низкий", normal: "Обычный", high: "Высокий", urgent: "Срочно!" };
const PRIORITY_COLOR: Record<string, string> = {
  low: "var(--ink-3)", normal: "var(--brand)",
  high: "var(--amber, #f59e0b)", urgent: "var(--red, #e03)",
};

function fmtDur(ms: number) {
  const m = Math.floor(ms / 60000);
  return m < 60 ? `${m} мин` : `${Math.floor(m / 60)}ч ${m % 60}м`;
}

export function OrderDetailModal({ order, onClose, setRoute }: {
  order: Order;
  onClose: () => void;
  setRoute?: SetRoute;
}) {
  const isActive = !["paid", "cancelled"].includes(order.status);
  const prepMs  = order.ready_at  ? new Date(order.ready_at).getTime()  - new Date(order.created_at).getTime() : null;
  const waitMs  = order.served_at && order.ready_at
    ? new Date(order.served_at).getTime()  - new Date(order.ready_at).getTime() : null;
  const totalMs = order.paid_at   ? new Date(order.paid_at).getTime()   - new Date(order.created_at).getTime() : null;

  const priColor = PRIORITY_COLOR[order.priority] ?? "var(--brand)";

  const timings = [
    { label: "Создан",   val: fmtTime(order.created_at),              sub: `${elapsedMin(order.created_at)} мин назад` },
    prepMs  != null ? { label: "Готово",   val: order.ready_at  ? fmtTime(order.ready_at)  : "—", sub: `приготовление ${fmtDur(prepMs)}`  } : null,
    waitMs  != null ? { label: "Подано",   val: order.served_at ? fmtTime(order.served_at) : "—", sub: `ожидание подачи ${fmtDur(waitMs)}` } : null,
    totalMs != null ? { label: "Оплачено", val: order.paid_at   ? fmtTime(order.paid_at)   : "—", sub: `общее время ${fmtDur(totalMs)}`   } : null,
  ].filter(Boolean) as { label: string; val: string; sub: string }[];

  return (
    <Modal
      title={`Заказ #${order.id}`}
      onClose={onClose}
      width={580}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Закрыть</button>
          {isActive && setRoute && (
            <button className="btn primary" onClick={() => { onClose(); setRoute({ id: "w_table_session", tableId: order.table_id }); }}>
              <Icon name="forward" /> Открыть стол
            </button>
          )}
        </>
      }
    >
      {/* Meta */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16, alignItems: "center" }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>
          {order.table ? `Стол ${order.table.number}` : `Стол #${order.table_id}`}
        </span>
        <StatusBadge status={order.status} />
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99,
          background: `color-mix(in srgb, ${priColor} 14%, transparent)`,
          color: priColor, border: `1px solid color-mix(in srgb, ${priColor} 40%, transparent)`,
        }}>
          {PRIORITY_RU[order.priority] ?? order.priority}
        </span>
        {order.waiter && <span style={{ fontSize: 12, color: "var(--ink-3)" }}>· {order.waiter.full_name}</span>}
      </div>

      {/* Timings */}
      {timings.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(timings.length, 2)}, 1fr)`, gap: 8, marginBottom: 14 }}>
          {timings.map((t, i) => (
            <div key={i} style={{ background: "var(--bg-canvas)", borderRadius: "var(--r)", padding: "8px 12px" }}>
              <div style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t.label}</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>{t.val}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 1 }}>{t.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Customer note */}
      {order.customer_note && (
        <div style={{ marginBottom: 12, padding: "8px 12px", background: "color-mix(in srgb, var(--amber) 10%, transparent)", borderRadius: "var(--r)", borderLeft: "3px solid var(--amber, #f59e0b)", fontSize: 13 }}>
          <span style={{ fontWeight: 600 }}>Пожелание гостя: </span>{order.customer_note}
        </div>
      )}

      {/* Cancel reason */}
      {order.cancel_reason && (
        <div style={{ marginBottom: 12, padding: "8px 12px", background: "color-mix(in srgb, var(--red, #e03) 8%, transparent)", borderRadius: "var(--r)", borderLeft: "3px solid var(--red, #e03)", fontSize: 13 }}>
          <span style={{ fontWeight: 600 }}>Причина отмены: </span>{order.cancel_reason}
        </div>
      )}

      {/* Items */}
      <div style={{ border: "1px solid var(--line-1)", borderRadius: "var(--r)", overflow: "auto", marginBottom: 14 }}>
        <div style={{ minWidth: 280, background: "var(--bg-canvas)", padding: "6px 12px", fontSize: 10, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", display: "grid", gridTemplateColumns: "1fr 50px 90px" }}>
          <span>Позиция</span><span style={{ textAlign: "center" }}>Кол.</span><span style={{ textAlign: "right" }}>Сумма</span>
        </div>
        {order.items.map(item => (
          <div key={item.id} style={{ padding: "8px 12px", borderTop: "1px solid var(--line-1)", display: "grid", gridTemplateColumns: "1fr 50px 90px", alignItems: "start" }}>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{item.menu_item?.name ?? `#${item.menu_item_id}`}</div>
              {item.note && (
                <div style={{ fontSize: 11, color: "var(--amber, #f59e0b)", marginTop: 3, display: "flex", gap: 4, alignItems: "center" }}>
                  <Icon name="note" size={10} /> {item.note}
                </div>
              )}
            </div>
            <div style={{ textAlign: "center", fontWeight: 600, fontSize: 13, paddingTop: 2 }}>×{item.quantity}</div>
            <div style={{ textAlign: "right", fontWeight: 600, fontSize: 13, paddingTop: 2 }}>{fmtKZT(item.line_total)}</div>
          </div>
        ))}
        <div style={{ padding: "8px 12px", borderTop: "1px solid var(--line-1)", background: "var(--bg-canvas)", display: "grid", gridTemplateColumns: "1fr 50px 90px", fontWeight: 700, fontSize: 14 }}>
          <span>Итого</span><span /><span style={{ textAlign: "right" }} className="num">{fmtKZT(order.total_amount)}</span>
        </div>
      </div>

      {/* Payment method */}
      {order.payment && (
        <div style={{ marginBottom: 14, padding: "10px 14px", background: "var(--bg-canvas)", borderRadius: "var(--r)", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Метод оплаты</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>
              {{ cash: "Наличные", card: "Карта", mixed: "Смешанный", external: "Внешний" }[order.payment.method] ?? order.payment.method}
            </div>
          </div>
          {order.payment.method === "cash" && parseFloat(order.payment.change_due) > 0 && (
            <>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Получено</div>
                <div style={{ fontWeight: 600, fontSize: 13 }} className="num">{fmtKZT(order.payment.amount_received)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3 }}>Сдача</div>
                <div style={{ fontWeight: 600, fontSize: 13 }} className="num">{fmtKZT(order.payment.change_due)}</div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Events log */}
      {order.events.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 7 }}>История</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {order.events.map(ev => (
              <div key={ev.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 12 }}>
                <span style={{ color: "var(--ink-4)", flexShrink: 0, paddingTop: 1, minWidth: 45 }}>{fmtTime(ev.created_at)}</span>
                <span style={{ flex: 1, color: "var(--ink-2)" }}>
                  {ev.to_status
                    ? <>{STATUS_RU[ev.from_status ?? ""] ?? ev.from_status} <span style={{ color: "var(--ink-4)" }}>→</span> <b>{STATUS_RU[ev.to_status] ?? ev.to_status}</b></>
                    : ev.event_type}
                  {ev.message && <span style={{ color: "var(--ink-3)", marginLeft: 5 }}>· {ev.message}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── WaiterOrders ─────────────────────────────────────────────────────────────

const WAITER_PAGE_SIZE = 20;

const WAITER_SORT_OPTIONS = [
  { value: "time_desc",  label: "Новые сначала" },
  { value: "time_asc",   label: "Старые сначала" },
  { value: "table_asc",  label: "По столу (А→Я)" },
  { value: "table_desc", label: "По столу (Я→А)" },
  { value: "status",     label: "По статусу" },
] as const;

type WaiterSortValue = typeof WAITER_SORT_OPTIONS[number]["value"];

const WAITER_TABS = [
  { key: "active",    label: "Активные" },
  { key: "ready",     label: "Готовы" },
  { key: "served",    label: "Поданы" },
  { key: "paid",      label: "Оплачены" },
  { key: "cancelled", label: "Отменёны" },
  { key: "all",       label: "Все" },
] as const;

export function WaiterOrders({ setRoute }: { setRoute: SetRoute }) {
  const { state } = useApp();
  const [statusFilter, setStatusFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<WaiterSortValue>("time_desc");
  const [page, setPage] = useState(1);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  useEffect(() => { setPage(1); }, [search, statusFilter, sortBy]);

  const base = state.orders.filter(o => {
    switch (statusFilter) {
      case "active":    return !["paid", "cancelled"].includes(o.status);
      case "ready":     return o.status === "ready";
      case "served":    return o.status === "served";
      case "paid":      return o.status === "paid";
      case "cancelled": return o.status === "cancelled";
      default:          return true;
    }
  });

  const filtered = base.filter(o => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      String(o.id).includes(q) ||
      (o.table ? o.table.number.toLowerCase().includes(q) : false) ||
      o.items.some(i => (i.menu_item?.name ?? "").toLowerCase().includes(q))
    );
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case "time_asc":   return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case "table_asc":  return (a.table?.number ?? String(a.table_id)).localeCompare(b.table?.number ?? String(b.table_id));
      case "table_desc": return (b.table?.number ?? String(b.table_id)).localeCompare(a.table?.number ?? String(a.table_id));
      case "status":     return a.status.localeCompare(b.status);
      default:           return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / WAITER_PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * WAITER_PAGE_SIZE, page * WAITER_PAGE_SIZE);
  const hasFilters = search !== "";

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <div className="page-head">
        <div>
          <h2>Мои заказы</h2>
          <div className="sub">Управляйте активными заказами и оплатой</div>
        </div>
        <div className="actions">
          <div className="segmented">
            {WAITER_TABS.map(t => (
              <div key={t.key} className={`seg ${statusFilter === t.key ? "active" : ""}`} onClick={() => setStatusFilter(t.key)}>
                {t.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ padding: "0 20px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 200px", minWidth: 160 }}>
          <input
            className="input"
            placeholder="Поиск по #, столу, блюду..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
          <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)", pointerEvents: "none" }} />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: 18, lineHeight: 1, padding: "0 2px" }}
            >×</button>
          )}
        </div>
        <select className="input" value={sortBy} onChange={e => setSortBy(e.target.value as WaiterSortValue)} style={{ width: 190 }}>
          {WAITER_SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "var(--ink-4)", whiteSpace: "nowrap" }}>
          {filtered.length} {filtered.length === 1 ? "заказ" : "заказов"}
        </span>
      </div>

      <div className="page-body">
        <div className="orders-list card" style={{ overflow: "hidden" }}>
          <div className="list-head" style={{ gridTemplateColumns: "70px 80px 1fr 90px 110px 120px" }}>
            <div>#</div><div>Стол</div><div>Позиции</div><div>Создан</div><div>Сумма</div><div>Статус</div>
          </div>
          {paginated.map(o => (
            <div
              key={o.id}
              className="list-row"
              style={{
                gridTemplateColumns: "70px 80px 1fr 90px 110px 120px",
                cursor: "pointer",
                alignItems: "flex-start",
              }}
              onClick={() => setDetailOrder(o)}
            >
              <div className="mono" style={{ fontWeight: 600, paddingTop: 1 }}>#{o.id}</div>
              <div style={{ paddingTop: 1 }}>{o.table ? `Стол ${o.table.number}` : `#${o.table_id}`}</div>
              <div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.items.slice(0, 3).map(i => `${i.quantity}× ${i.menu_item?.name ?? `#${i.menu_item_id}`}`).join(", ")}
                  {o.items.length > 3 && <span style={{ color: "var(--ink-3)" }}> +{o.items.length - 3}</span>}
                </div>
                {o.cancel_reason && (
                  <div style={{ fontSize: 11, color: "var(--red, #e03)", marginTop: 3, display: "flex", gap: 4, alignItems: "center" }}>
                    <Icon name="warning" size={10} /> {o.cancel_reason}
                  </div>
                )}
              </div>
              <div className="mono" style={{ fontSize: 12.5, paddingTop: 1 }}>{fmtTime(o.created_at)}</div>
              <div className="num" style={{ fontWeight: 600, paddingTop: 1 }}>{fmtKZT(o.total_amount)}</div>
              <div style={{ paddingTop: 1 }}><StatusBadge status={o.status} /></div>
            </div>
          ))}
          {!paginated.length && (
            <div className="empty" style={{ padding: 40 }}>
              <div className="empty-ico"><Icon name="orders" size={26} /></div>
              <h4>{hasFilters ? "Ничего не найдено" : "Нет заказов"}</h4>
              <p>{hasFilters ? "Попробуйте изменить фильтры." : "Все заказы на этом фильтре закрыты."}</p>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, fontSize: 13 }}>
            <button className="btn sm" onClick={() => setPage(1)} disabled={page === 1}>«</button>
            <button className="btn sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹ Назад</button>
            <span style={{ color: "var(--ink-3)", padding: "0 8px" }}>Стр. <b>{page}</b> из <b>{totalPages}</b></span>
            <button className="btn sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Вперёд ›</button>
            <button className="btn sm" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
          </div>
        )}
      </div>

      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          setRoute={setRoute}
        />
      )}
    </div>
  );
}
