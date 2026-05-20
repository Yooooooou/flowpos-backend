import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useApp } from "../lib/store";
import type {
  AnalyticsSummary,
  Category,
  MenuItem,
  MenuItemPriceHistory,
  ModifierGroup,
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

// ─── Dashboard helpers ────────────────────────────────────────────────────────

type DashPeriod = "today" | "7d" | "month";

function SparkLine({ data, color = "var(--brand)" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 72, h = 28;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`).join(" ");
  return (
    <svg width={w} height={h} style={{ display: "block", flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DonutChart({ segments }: { segments: Array<{ value: number; color: string; label: string }> }) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const denom = total || 1;
  const r = 50, cx = 65, cy = 65;
  const circ = 2 * Math.PI * r;
  let cumulative = 0;
  const arcs = segments.filter(s => s.value > 0).map(seg => {
    const dashLen = (seg.value / denom) * circ;
    const rotate = (cumulative / denom) * 360 - 90;
    cumulative += seg.value;
    return { ...seg, dashLen, rotate };
  });
  return (
    <svg width={130} height={130}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={16} />
      {arcs.map((arc, i) => (
        <circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={arc.color} strokeWidth={16}
          strokeDasharray={`${arc.dashLen} ${circ}`}
          style={{ transform: `rotate(${arc.rotate}deg)`, transformOrigin: `${cx}px ${cy}px` }}
        />
      ))}
      <text x={cx} y={cy - 3} textAnchor="middle" fontSize={18} fontWeight={700} fill="var(--ink-1)">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize={11} fill="var(--ink-3)">всего</text>
    </svg>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export function ManagerDashboard() {
  const { state } = useApp();
  const token = state.token!;
  const [period, setPeriod] = useState<DashPeriod>("today");
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [barMetric, setBarMetric] = useState<"count" | "revenue">("count");
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);
    try { setAnalytics(await api.analytics(token)); } catch { /* live data still shows */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAnalytics(); }, [token, period]);

  const orders = state.orders;
  const activeOrders = orders.filter(o => !["paid", "cancelled"].includes(o.status));
  const paidOrders = orders.filter(o => o.status === "paid");
  const revenue = paidOrders.reduce((s, o) => s + parseFloat(o.total_amount), 0);
  const tables = state.tables;
  const occupiedTables = tables.filter(t => t.status === "occupied").length;
  const shift = state.currentShift;
  const shiftOpenedTime = shift
    ? new Date(shift.opened_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
    : "—";

  // Hourly breakdown
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0, revenue: 0 }));
  orders.forEach(o => {
    const h = new Date(o.created_at).getHours();
    hourly[h].count++;
    hourly[h].revenue += parseFloat(o.total_amount);
  });
  const nowHour = now.getHours();
  const hasAnyData = hourly.some(h => h.count > 0);
  const displayHours = hasAnyData
    ? hourly.filter(h => h.count > 0 || Math.abs(h.hour - nowHour) <= 2)
    : hourly.slice(Math.max(0, nowHour - 4), nowHour + 5);
  const maxBarVal = Math.max(...displayHours.map(h => barMetric === "count" ? h.count : h.revenue), 1);

  // Kitchen load donut
  const board = state.kitchenBoard;
  const kitchenSegments = [
    { label: "Ожидает",  value: board?.pending.length ?? 0,     color: "#f59e0b" },
    { label: "Готовится", value: board?.in_progress.length ?? 0, color: "var(--brand)" },
    { label: "К выдаче",  value: board?.ready.length ?? 0,       color: "#10b981" },
  ];

  // Top dishes
  const dishMap: Record<string, { name: string; count: number }> = {};
  orders.forEach(o => o.items.forEach(i => {
    const name = i.menu_item?.name ?? `#${i.menu_item_id}`;
    if (!dishMap[name]) dishMap[name] = { name, count: 0 };
    dishMap[name].count += i.quantity;
  }));
  const topDishes = Object.values(dishMap).sort((a, b) => b.count - a.count).slice(0, 5);
  const maxDishCount = topDishes[0]?.count ?? 1;

  // Waiter productivity from live paid orders
  const waiterMap: Record<number, { name: string; orders: number; revenue: number }> = {};
  paidOrders.forEach(o => {
    const id = o.waiter_id;
    if (!waiterMap[id]) waiterMap[id] = { name: o.waiter?.full_name ?? `#${id}`, orders: 0, revenue: 0 };
    waiterMap[id].orders++;
    waiterMap[id].revenue += parseFloat(o.total_amount);
  });
  const waiters = Object.entries(waiterMap)
    .map(([id, s]) => ({ id: Number(id), ...s }))
    .sort((a, b) => b.revenue - a.revenue);
  const maxWaiterRevenue = waiters[0]?.revenue ?? 1;

  // Revenue sparkline: last 8 hours
  const sparkData = Array.from({ length: 8 }, (_, i) => hourly[(nowHour - 7 + i + 24) % 24].revenue);
  const avgWaitMins = analytics?.average_customer_wait_seconds
    ? Math.round(analytics.average_customer_wait_seconds / 60) : null;
  const PERIOD_LABELS: Record<DashPeriod, string> = { today: "Сегодня", "7d": "7 дней", month: "Месяц" };

  const waiterRows = waiters.length > 0
    ? waiters
    : (analytics?.staff_productivity ?? []).map(s => ({ id: s.waiter_id, name: s.full_name, orders: s.orders, revenue: parseFloat(s.revenue) }));
  const maxWR = waiterRows[0]?.revenue ?? 1;

  return (
    <div style={{ overflow: "auto", padding: 24, minHeight: "100%", background: "var(--bg-canvas)" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 750, color: "var(--ink-1)" }}>Обзор смены</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>
            {shift
              ? <>Смена #{shift.id} · открыта в {shiftOpenedTime} · {now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</>
              : <>Нет активной смены · {now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 3, background: "var(--bg-sunken)", borderRadius: "var(--r)", padding: 3 }}>
          {(["today", "7d", "month"] as DashPeriod[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)} style={{
              padding: "5px 14px", border: 0, borderRadius: "calc(var(--r) - 2px)", fontSize: 13, cursor: "pointer",
              background: period === p ? "var(--bg-paper)" : "transparent",
              color: period === p ? "var(--ink-1)" : "var(--ink-3)",
              fontWeight: period === p ? 600 : 400,
              boxShadow: period === p ? "var(--shadow-sm)" : "none",
            }}>{PERIOD_LABELS[p]}</button>
          ))}
        </div>
        <button className="btn sm" onClick={loadAnalytics} disabled={loading}>
          {loading ? <span className="spin" /> : <Icon name="sort" />} Обновить
        </button>
      </div>

      {/* Metric cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 14, marginBottom: 20 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>Выручка за смену</div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 750, lineHeight: 1.2 }}>{fmtKZT(revenue)}</div>
              <div style={{ fontSize: 12, color: "var(--olive)", marginTop: 4 }}>+{paidOrders.length} чеков</div>
            </div>
            <SparkLine data={sparkData} />
          </div>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>Активные заказы</div>
          <div style={{ fontSize: 28, fontWeight: 750, lineHeight: 1 }}>{activeOrders.length}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>
            {activeOrders.filter(o => o.status === "pending").length} ожидают · {activeOrders.filter(o => o.status === "in_progress").length} готовятся
          </div>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>Среднее время</div>
          <div style={{ fontSize: 28, fontWeight: 750, lineHeight: 1 }}>{avgWaitMins !== null ? `${avgWaitMins} мин` : "—"}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>ожидание клиента</div>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>Столы заняты</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <div style={{ fontSize: 28, fontWeight: 750, lineHeight: 1 }}>{occupiedTables}</div>
            <div style={{ fontSize: 16, color: "var(--ink-3)" }}>/ {tables.length}</div>
          </div>
          <div style={{ marginTop: 10, height: 5, background: "var(--bg-sunken)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${tables.length ? (occupiedTables / tables.length) * 100 : 0}%`, background: "var(--brand)", borderRadius: 999, transition: "width 0.4s" }} />
          </div>
        </div>

        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>Чеков за смену</div>
          <div style={{ fontSize: 28, fontWeight: 750, lineHeight: 1 }}>{paidOrders.length}</div>
          {analytics && (
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>{fmtKZT(analytics.revenue)} gross</div>
          )}
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 260px 280px", gap: 14, marginBottom: 14 }}>

        {/* Bar chart */}
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 650 }}>Заказы по часам</div>
            <div style={{ display: "flex", gap: 2, background: "var(--bg-sunken)", borderRadius: 6, padding: 2 }}>
              {(["count", "revenue"] as const).map(m => (
                <button key={m} onClick={() => setBarMetric(m)} style={{
                  padding: "3px 10px", border: 0, borderRadius: 4, fontSize: 12, cursor: "pointer",
                  background: barMetric === m ? "var(--bg-paper)" : "transparent",
                  color: barMetric === m ? "var(--ink-1)" : "var(--ink-3)",
                  fontWeight: barMetric === m ? 600 : 400,
                }}>{m === "count" ? "Кол-во" : "Выручка"}</button>
              ))}
            </div>
          </div>
          <div style={{ padding: "14px 14px 8px", display: "flex", alignItems: "flex-end", gap: 4, height: 160, overflowX: "auto" }}>
            {displayHours.map(h => {
              const val = barMetric === "count" ? h.count : h.revenue;
              const barH = Math.max(4, (val / maxBarVal) * 110);
              const isNow = h.hour === nowHour;
              return (
                <div key={h.hour} title={barMetric === "count" ? `${h.count} заказов` : fmtKZT(h.revenue)}
                  style={{ flex: 1, minWidth: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  {val > 0 && <div style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 600 }}>{barMetric === "count" ? h.count : ""}</div>}
                  <div style={{ height: barH, width: "100%", background: isNow ? "var(--brand)" : "var(--brand-50,#dbeafe)", borderRadius: "3px 3px 0 0", transition: "height 0.3s" }} />
                  <div style={{ fontSize: 10, color: isNow ? "var(--brand)" : "var(--ink-4)", fontWeight: isNow ? 700 : 400 }}>{String(h.hour).padStart(2, "0")}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Donut: kitchen load */}
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 650 }}>Загрузка кухни</div>
          <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <DonutChart segments={kitchenSegments} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%" }}>
              {kitchenSegments.map(s => (
                <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }} />
                    <span style={{ color: "var(--ink-2)" }}>{s.label}</span>
                  </div>
                  <span style={{ fontWeight: 700 }}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top dishes */}
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 650 }}>Топ блюд сегодня</div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {topDishes.map((d, idx) => (
              <div key={d.name}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 16, height: 16, borderRadius: 4, background: idx < 3 ? "var(--brand)" : "var(--line-2)", color: idx < 3 ? "white" : "var(--ink-3)", fontSize: 10, fontWeight: 800, display: "grid", placeItems: "center", flexShrink: 0 }}>{idx + 1}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>{d.name}</span>
                  </div>
                  <span style={{ fontWeight: 700, flexShrink: 0, marginLeft: 4 }}>{d.count}</span>
                </div>
                <div style={{ height: 5, background: "var(--bg-sunken)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(d.count / maxDishCount) * 100}%`, background: idx < 3 ? "var(--brand)" : "var(--line-2)", borderRadius: 999, transition: "width 0.4s" }} />
                </div>
              </div>
            ))}
            {topDishes.length === 0 && <div style={{ color: "var(--ink-3)", fontSize: 13, textAlign: "center" }}>Нет данных</div>}
          </div>
        </div>
      </div>

      {/* Active orders + Waiter productivity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 14 }}>

        {/* Active orders table */}
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 650 }}>Активные заказы</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{activeOrders.length} заказов</div>
          </div>
          <div style={{ overflow: "auto", maxHeight: 300 }}>
            <div className="list-head" style={{ gridTemplateColumns: "50px 68px 1fr 72px 90px 90px 60px" }}>
              <div>#</div><div>СТОЛ</div><div>ПОЗИЦИИ</div><div>ОТКРЫТ</div><div>СУММА</div><div>СТАТУС</div><div>ПРИОР</div>
            </div>
            {activeOrders.slice(0, 15).map(o => (
              <div key={o.id} className="list-row" style={{ gridTemplateColumns: "50px 68px 1fr 72px 90px 90px 60px" }}>
                <div className="mono" style={{ fontWeight: 600 }}>#{o.id}</div>
                <div>{o.table ? `Стол ${o.table.number}` : `#${o.table_id}`}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {o.items.slice(0, 2).map(i => i.menu_item?.name ?? `#${i.menu_item_id}`).join(", ")}{o.items.length > 2 ? ` +${o.items.length - 2}` : ""}
                </div>
                <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{fmtTime(o.created_at)}</div>
                <div className="num">{fmtKZT(o.total_amount)}</div>
                <div><StatusBadge status={o.status} /></div>
                <div><PriorityChip priority={o.priority} showLabel={false} /></div>
              </div>
            ))}
            {activeOrders.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>Нет активных заказов</div>
            )}
          </div>
        </div>

        {/* Waiter productivity */}
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 650 }}>Продуктивность официантов</div>
          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8, overflow: "auto", maxHeight: 300 }}>
            {waiterRows.map(w => {
              const initials = w.name.split(" ").map((x: string) => x[0] ?? "").join("").slice(0, 2).toUpperCase();
              const score = Math.min(5, Math.max(1, Math.round((w.revenue / maxWR) * 5)));
              return (
                <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--bg-sunken)", borderRadius: "var(--r)" }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--brand-50,#dbeafe)", color: "var(--brand)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.name}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>Официант</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{w.orders} заказов</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{fmtKZT(w.revenue)}</div>
                    <div style={{ fontSize: 12, color: "#f59e0b", letterSpacing: 1 }}>{"★".repeat(score)}{"☆".repeat(5 - score)}</div>
                  </div>
                </div>
              );
            })}
            {waiterRows.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>Нет данных</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Manager Orders ───────────────────────────────────────────────────────────

const ORD_PAGE_SIZE = 25;

const ORD_STATUS_OPTIONS: Array<{ value: OrderStatus | "all"; label: string }> = [
  { value: "all", label: "Все статусы" },
  { value: "pending", label: "Ожидает" },
  { value: "in_progress", label: "Готовится" },
  { value: "ready", label: "Готово" },
  { value: "served", label: "Подан" },
  { value: "paid", label: "Оплачен" },
  { value: "cancelled", label: "Отменён" },
];

const EVENT_LABEL: Record<string, string> = {
  "order.created": "Заказ создан",
  "order.status_changed": "Статус изменён",
  "order.updated": "Заказ обновлён",
  "order.paid": "Оплачен",
  "order.cancelled": "Отменён",
  "order.discount_added": "Скидка добавлена",
  "payment.refunded": "Возврат",
};
const EVENT_DOT: Record<string, string> = {
  "order.created": "var(--brand)",
  "order.paid": "var(--olive)",
  "order.cancelled": "var(--red)",
  "payment.refunded": "#f59e0b",
};
const PAYMENT_METHOD_RU: Record<string, string> = {
  cash: "Наличные", card: "Карта", mixed: "Смешанная", external: "QR / внешний",
};

function OrderDetailModal({
  order, onClose, onCancel, onRefund, onReassign, onPrint,
}: {
  order: Order;
  onClose: () => void;
  onCancel: () => void;
  onRefund: () => void;
  onReassign: () => void;
  onPrint: () => void;
}) {
  const totalItems = order.items.reduce((s, i) => s + i.quantity, 0);
  const isActive = !["paid", "cancelled"].includes(order.status);
  return (
    <Modal
      title={`Заказ #${order.id}`}
      onClose={onClose}
      width={680}
      footer={
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn sm" onClick={onPrint}><Icon name="print" /> Печать чека</button>
          {isActive && <button className="btn sm danger" onClick={onCancel}>Отменить</button>}
          {order.payment && <button className="btn sm" style={{ color: "#f59e0b", border: "1px solid #f59e0b" }} onClick={onRefund}>Возврат</button>}
          <button className="btn sm" onClick={onReassign}>Переназначить</button>
          <button className="btn ghost sm" style={{ marginLeft: "auto" }} onClick={onClose}>Закрыть</button>
        </div>
      }
    >
      {/* Header info */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 18, padding: "12px 16px", background: "var(--bg-sunken)", borderRadius: "var(--r)" }}>
        {[
          ["Стол", order.table ? `Стол ${order.table.number}` : `#${order.table_id}`],
          ["Официант", order.waiter?.full_name ?? `#${order.waiter_id}`],
          ["Статус", null],
          ["Приоритет", null],
          ["Позиций", `${totalItems} шт.`],
          ["Сумма", fmtKZT(order.total_amount)],
          ["Создан", fmtTime(order.created_at)],
        ].map(([label, val]) => (
          <div key={label as string}>
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 3 }}>{label}</div>
            {label === "Статус" ? <StatusBadge status={order.status} /> :
             label === "Приоритет" ? <PriorityChip priority={order.priority} showLabel /> :
             <div style={{ fontSize: 13, fontWeight: 500 }}>{val}</div>}
          </div>
        ))}
      </div>

      {/* Items */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Позиции</div>
        <div style={{ border: "1px solid var(--line-1)", borderRadius: "var(--r)", overflow: "hidden" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 50px 80px 80px 70px", padding: "8px 12px", background: "var(--bg-sunken)", fontSize: 11, color: "var(--ink-4)", fontWeight: 600, textTransform: "uppercase" }}>
            <div>Блюдо</div><div>Кол</div><div>Цена</div><div>Итого</div><div>Статус</div>
          </div>
          {order.items.map(i => (
            <div key={i.id} style={{ display: "grid", gridTemplateColumns: "1fr 50px 80px 80px 70px", padding: "8px 12px", borderTop: "1px solid var(--line-1)", fontSize: 13 }}>
              <div style={{ fontWeight: 500 }}>{i.menu_item?.name ?? `#${i.menu_item_id}`}{i.note && <span style={{ color: "var(--ink-4)", fontSize: 11, display: "block" }}>{i.note}</span>}</div>
              <div style={{ color: "var(--ink-3)" }}>{i.quantity}</div>
              <div className="num">{fmtKZT(i.unit_price)}</div>
              <div className="num" style={{ fontWeight: 600 }}>{fmtKZT(i.line_total)}</div>
              <div style={{ fontSize: 11, color: i.status === "served" ? "var(--olive)" : i.status === "ready" ? "var(--brand)" : "var(--ink-4)" }}>{i.status}</div>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 50px 80px 80px 70px", padding: "8px 12px", borderTop: "2px solid var(--line-1)", background: "var(--bg-sunken)", fontSize: 13 }}>
            <div style={{ gridColumn: "1/4", fontWeight: 600 }}>Итого</div>
            <div className="num" style={{ fontWeight: 700 }}>{fmtKZT(order.total_amount)}</div>
          </div>
        </div>
      </div>

      {/* Payment */}
      {order.payment && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Оплата</div>
          <div style={{ padding: "12px 16px", background: "var(--bg-sunken)", borderRadius: "var(--r)", display: "flex", gap: 24, flexWrap: "wrap", fontSize: 13 }}>
            {[
              ["Метод", PAYMENT_METHOD_RU[order.payment.method] ?? order.payment.method],
              ["Подытог", fmtKZT(order.payment.subtotal_amount)],
              ["Скидка", parseFloat(order.payment.discount_amount) > 0 ? `−${fmtKZT(order.payment.discount_amount)}` : "—"],
              ["Итого", fmtKZT(order.payment.final_amount)],
              ["Получено", fmtKZT(order.payment.amount_received)],
              ["Сдача", fmtKZT(order.payment.change_due)],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 2 }}>{label}</div>
                <div style={{ fontWeight: 600 }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {order.events.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>История</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {[...order.events].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map((ev, idx) => (
              <div key={ev.id} style={{ display: "flex", gap: 12, position: "relative" }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: EVENT_DOT[ev.event_type] ?? "var(--ink-4)", marginTop: 4, flexShrink: 0 }} />
                  {idx < order.events.length - 1 && <div style={{ width: 2, flex: 1, background: "var(--line-1)", margin: "2px 0" }} />}
                </div>
                <div style={{ paddingBottom: 12, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{EVENT_LABEL[ev.event_type] ?? ev.event_type}</div>
                  {ev.from_status && ev.to_status && ev.from_status !== ev.to_status && (
                    <div style={{ fontSize: 11, color: "var(--ink-4)" }}>{ev.from_status} → {ev.to_status}</div>
                  )}
                  {ev.message && <div style={{ fontSize: 12, color: "var(--ink-3)", fontStyle: "italic" }}>{ev.message}</div>}
                  <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
                    {new Date(ev.created_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

export function ManagerOrders() {
  const { state, toast } = useApp();
  const token = state.token!;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [waiterFilter, setWaiterFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [users, setUsers] = useState<User[]>([]);

  const [detailOrder, setDetailOrder] = useState<Order | null>(null);
  const [cancelModal, setCancelModal] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [deleteModal, setDeleteModal] = useState<{ order: Order; writeOff: boolean } | null>(null);
  const [refundModal, setRefundModal] = useState<Order | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [reassignModal, setReassignModal] = useState<Order | null>(null);
  const [reassignWaiterId, setReassignWaiterId] = useState("");
  const [reloadRev, setReloadRev] = useState(0);
  const [deleteMenuId, setDeleteMenuId] = useState<number | null>(null);

  useEffect(() => {
    if (!deleteMenuId) return;
    const close = () => setDeleteMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [deleteMenuId]);

  useEffect(() => {
    api.users(token).then(u => setUsers(u.filter(x => x.role === "waiter"))).catch(() => {});
  }, [token]);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(0); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  // reset page on filter change
  useEffect(() => { setPage(0); }, [statusFilter, waiterFilter, dateFrom, dateTo]);

  // load orders
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params: Record<string, string | number | boolean | undefined> = {
      limit: ORD_PAGE_SIZE + 1,
      offset: page * ORD_PAGE_SIZE,
      include_completed: true,
    };
    if (statusFilter !== "all") params.status = statusFilter;
    if (waiterFilter !== "all") params.waiter_id = Number(waiterFilter);
    if (debouncedSearch) params.q = debouncedSearch;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    api.orders(token, params)
      .then(data => {
        if (cancelled) return;
        setHasMore(data.length > ORD_PAGE_SIZE);
        setOrders(data.slice(0, ORD_PAGE_SIZE));
      })
      .catch(() => { if (!cancelled) toast("error", "Ошибка загрузки заказов"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, statusFilter, waiterFilter, debouncedSearch, dateFrom, dateTo, page, reloadRev]);

  const reload = () => setReloadRev(r => r + 1);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleCancel = async () => {
    if (!cancelModal) return;
    try {
      await api.changeOrderStatus(token, cancelModal.id, "cancelled", cancelReason || "Отменён менеджером");
      toast("success", "Заказ отменён");
      setCancelModal(null); setCancelReason("");
      if (detailOrder?.id === cancelModal.id) setDetailOrder(null);
      reload();
    } catch (e: unknown) { toast("error", e instanceof Error ? e.message : "Ошибка"); }
  };

  const handleDelete = async () => {
    if (!deleteModal) return;
    try {
      await api.deleteOrder(token, deleteModal.order.id, deleteModal.writeOff);
      toast("success", deleteModal.writeOff ? "Заказ списан" : "Заказ удалён");
      setDeleteModal(null);
      if (detailOrder?.id === deleteModal.order.id) setDetailOrder(null);
      reload();
    } catch (e: unknown) { toast("error", e instanceof Error ? e.message : "Ошибка"); }
  };

  const handleRefund = async () => {
    if (!refundModal?.payment) return;
    const amount = parseFloat(refundAmount);
    if (!amount || amount <= 0) { toast("error", "Введите корректную сумму"); return; }
    if (!refundReason.trim()) { toast("error", "Укажите причину возврата"); return; }
    try {
      await api.createRefund(token, refundModal.payment.id, { amount, reason: refundReason });
      toast("success", "Возврат оформлен");
      setRefundModal(null); setRefundAmount(""); setRefundReason("");
      reload();
    } catch (e: unknown) { toast("error", e instanceof Error ? e.message : "Ошибка"); }
  };

  const handleReassign = async () => {
    if (!reassignModal || !reassignWaiterId) return;
    try {
      const updated = await api.updateOrder(token, reassignModal.id, { waiter_id: Number(reassignWaiterId) });
      toast("success", "Официант переназначен");
      setReassignModal(null); setReassignWaiterId("");
      if (detailOrder?.id === updated.id) setDetailOrder(updated);
      reload();
    } catch (e: unknown) { toast("error", e instanceof Error ? e.message : "Ошибка"); }
  };

  const handlePrint = async (orderId: number) => {
    try { await api.receipt(token, orderId); toast("success", "Задание на печать отправлено"); }
    catch { toast("error", "Ошибка печати"); }
  };

  const exportCSV = () => {
    const rows = [
      ["ID", "Стол", "Официант", "Статус", "Приоритет", "Позиций", "Сумма (₸)", "Создан"].join(","),
      ...orders.map(o => [
        o.id,
        o.table?.number ?? o.table_id,
        `"${o.waiter?.full_name ?? o.waiter_id}"`,
        o.status,
        o.priority,
        o.items.reduce((s, i) => s + i.quantity, 0),
        parseFloat(o.total_amount).toFixed(2),
        `"${new Date(o.created_at).toLocaleString("ru-RU")}"`,
      ].join(",")),
    ].join("\n");
    const blob = new Blob(["﻿" + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Filters */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-1)", background: "var(--bg-paper)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select className="select" value={statusFilter} onChange={e => setStatusFilter(e.target.value as OrderStatus | "all")} style={{ width: 150 }}>
          {ORD_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="select" value={waiterFilter} onChange={e => setWaiterFilter(e.target.value)} style={{ width: 160 }}>
          <option value="all">Все официанты</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <input type="date" className="input" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: 140 }} title="Дата от" />
          <span style={{ color: "var(--ink-4)", fontSize: 13 }}>—</span>
          <input type="date" className="input" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: 140 }} title="Дата до" />
        </div>
        <div style={{ position: "relative" }}>
          <input className="input" placeholder="Поиск..." value={search} onChange={e => setSearch(e.target.value)} style={{ width: 180, paddingLeft: 30 }} />
          <Icon name="search" size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
        </div>
        <button className="btn sm" onClick={exportCSV} style={{ marginLeft: "auto" }}><Icon name="analytics" /> CSV</button>
        <button className="btn sm" onClick={reload} disabled={loading}>
          {loading ? <span className="spin" /> : <Icon name="sort" />} Обновить
        </button>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <div className="list-head" style={{ gridTemplateColumns: "56px 76px 140px 96px 80px 50px 104px 84px 96px" }}>
          <div>#</div><div>Стол</div><div>Официант</div><div>Статус</div><div>Приор.</div><div>Шт.</div><div>Сумма</div><div>Создан</div><div>Действие</div>
        </div>
        {orders.map(o => (
          <div
            key={o.id}
            className="list-row"
            style={{ gridTemplateColumns: "56px 76px 140px 96px 80px 50px 104px 84px 96px", cursor: "pointer" }}
            onClick={() => setDetailOrder(o)}
          >
            <div className="mono" style={{ fontWeight: 600 }}>#{o.id}</div>
            <div>{o.table ? `Стол ${o.table.number}` : `#${o.table_id}`}</div>
            <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.waiter?.full_name ?? "—"}</div>
            <div onClick={e => e.stopPropagation()}><StatusBadge status={o.status} /></div>
            <div onClick={e => e.stopPropagation()}><PriorityChip priority={o.priority} showLabel={false} /></div>
            <div style={{ color: "var(--ink-3)" }}>{o.items.reduce((s, i) => s + i.quantity, 0)}</div>
            <div className="num">{fmtKZT(o.total_amount)}</div>
            <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{fmtTime(o.created_at)}</div>
            <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
              {!["paid", "cancelled"].includes(o.status) && (
                <button className="btn sm danger" style={{ padding: "2px 8px", fontSize: 11 }}
                  onClick={() => { setCancelModal(o); setCancelReason(""); }}>
                  Отменить
                </button>
              )}
              <div style={{ position: "relative" }}>
                <button className="btn sm" style={{ padding: "2px 6px", fontSize: 11 }}
                  onClick={e => { e.stopPropagation(); setDeleteMenuId(deleteMenuId === o.id ? null : o.id); }}>
                  ✕
                </button>
                {deleteMenuId === o.id && (
                  <div style={{ position: "absolute", right: 0, top: "100%", zIndex: 999, background: "var(--bg-paper)", border: "1px solid var(--line-1)", borderRadius: "var(--r)", boxShadow: "var(--shadow-lg)", minWidth: 170, marginTop: 2 }}>
                    <button className="btn ghost" style={{ width: "100%", textAlign: "left", padding: "8px 14px", fontSize: 13, borderRadius: 0 }}
                      onClick={e => { e.stopPropagation(); setDeleteModal({ order: o, writeOff: true }); setDeleteMenuId(null); }}>
                      Удалить со списанием
                    </button>
                    <button className="btn ghost" style={{ width: "100%", textAlign: "left", padding: "8px 14px", fontSize: 13, borderRadius: 0, color: "var(--red)" }}
                      onClick={e => { e.stopPropagation(); setDeleteModal({ order: o, writeOff: false }); setDeleteMenuId(null); }}>
                      Удалить без списания
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {!loading && orders.length === 0 && (
          <div style={{ padding: 60, textAlign: "center", color: "var(--ink-3)" }}>Заказов нет</div>
        )}
        {loading && (
          <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}><span className="spin" /></div>
        )}
      </div>

      {/* Pagination */}
      <div style={{ padding: "8px 16px", borderTop: "1px solid var(--line-1)", background: "var(--bg-paper)", display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
        <button className="btn sm" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>← Назад</button>
        <span style={{ color: "var(--ink-3)" }}>Стр. {page + 1}{hasMore ? "" : ` / ${page + 1}`}</span>
        <button className="btn sm" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>Вперёд →</button>
        <span style={{ marginLeft: "auto", color: "var(--ink-4)", fontSize: 12 }}>
          {orders.length} записей на странице
        </span>
      </div>

      {/* ── Modals ────────────────────────────────────────────────────────────── */}

      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onCancel={() => { setCancelModal(detailOrder); setCancelReason(""); }}
          onRefund={() => setRefundModal(detailOrder)}
          onReassign={() => { setReassignModal(detailOrder); setReassignWaiterId(""); }}
          onPrint={() => handlePrint(detailOrder.id)}
        />
      )}

      {cancelModal && (
        <Modal title="Отменить заказ" onClose={() => setCancelModal(null)} width={400}
          footer={<><button className="btn ghost" onClick={() => setCancelModal(null)}>Отмена</button><button className="btn danger" onClick={handleCancel}>Отменить заказ</button></>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 14 }}>Заказ <strong>#{cancelModal.id}</strong> · {cancelModal.table ? `Стол ${cancelModal.table.number}` : ""}</div>
            <div className="field">
              <label className="field-label">Причина отмены</label>
              <textarea className="textarea" rows={2} placeholder="Укажите причину..." value={cancelReason} onChange={e => setCancelReason(e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {deleteModal && (
        <Modal
          title={deleteModal.writeOff ? "Удалить со списанием" : "Удалить без списания"}
          onClose={() => setDeleteModal(null)}
          width={400}
          footer={<><button className="btn ghost" onClick={() => setDeleteModal(null)}>Отмена</button><button className="btn danger" onClick={handleDelete}>Удалить</button></>}
        >
          <div style={{ fontSize: 14, lineHeight: 1.6 }}>
            {deleteModal.writeOff
              ? <>Заказ <strong>#{deleteModal.order.id}</strong> будет отмечен как <strong>отменён</strong>. Запись сохранится для учёта, продукты будут списаны.</>
              : <>Заказ <strong>#{deleteModal.order.id}</strong> будет <strong>полностью удалён</strong> из базы данных. Это действие необратимо. Доступно только для неоплаченных заказов.</>}
          </div>
        </Modal>
      )}

      {refundModal?.payment && (
        <Modal title="Оформить возврат" onClose={() => setRefundModal(null)} width={420}
          footer={<><button className="btn ghost" onClick={() => setRefundModal(null)}>Отмена</button><button className="btn primary" onClick={handleRefund}>Оформить возврат</button></>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ padding: "10px 14px", background: "var(--bg-sunken)", borderRadius: "var(--r)", fontSize: 13 }}>
              <div>Заказ <strong>#{refundModal.id}</strong> · {PAYMENT_METHOD_RU[refundModal.payment.method]}</div>
              <div style={{ marginTop: 4, color: "var(--ink-3)" }}>Оплачено: <strong>{fmtKZT(refundModal.payment.final_amount)}</strong></div>
            </div>
            <div className="field">
              <label className="field-label">Сумма возврата (₸)</label>
              <input className="input" type="number" min={0.01} max={parseFloat(refundModal.payment.final_amount)} step={0.01}
                value={refundAmount} onChange={e => setRefundAmount(e.target.value)}
                placeholder={`макс. ${parseFloat(refundModal.payment.final_amount).toFixed(2)}`} />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {[100, 50, 25].map(pct => (
                <button key={pct} className="btn sm" onClick={() => setRefundAmount((parseFloat(refundModal!.payment!.final_amount) * pct / 100).toFixed(2))}>
                  {pct}%
                </button>
              ))}
              <button className="btn sm" onClick={() => setRefundAmount(parseFloat(refundModal!.payment!.final_amount).toFixed(2))}>Полный</button>
            </div>
            <div className="field">
              <label className="field-label">Причина возврата</label>
              <textarea className="textarea" rows={2} placeholder="Укажите причину..." value={refundReason} onChange={e => setRefundReason(e.target.value)} />
            </div>
          </div>
        </Modal>
      )}

      {reassignModal && (
        <Modal title="Переназначить официанта" onClose={() => setReassignModal(null)} width={360}
          footer={<><button className="btn ghost" onClick={() => setReassignModal(null)}>Отмена</button><button className="btn primary" disabled={!reassignWaiterId} onClick={handleReassign}>Переназначить</button></>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
              Заказ <strong>#{reassignModal.id}</strong> · сейчас: <strong>{reassignModal.waiter?.full_name ?? `#${reassignModal.waiter_id}`}</strong>
            </div>
            <div className="field">
              <label className="field-label">Новый официант</label>
              <select className="select" value={reassignWaiterId} onChange={e => setReassignWaiterId(e.target.value)} style={{ width: "100%" }}>
                <option value="">— выберите —</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Manager Menu ─────────────────────────────────────────────────────────────

function ModOptionInput({ onAdd }: { onAdd: (opt: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <input className="input" placeholder="+ опция" style={{ width: 90, padding: "2px 6px", fontSize: 12 }}
        value={val} onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" && val.trim()) { onAdd(val.trim()); setVal(""); } }} />
      <button className="btn sm" style={{ padding: "2px 6px" }}
        onClick={() => { if (val.trim()) { onAdd(val.trim()); setVal(""); } }}>+</button>
    </span>
  );
}

export function ManagerMenu() {
  const { state, refreshMenu, toast } = useApp();
  const token = state.token!;

  // Category state
  const [activeCat, setActiveCat] = useState<number | undefined>(state.categories[0]?.id);
  const [editCatId, setEditCatId] = useState<number | null>(null);
  const [editCatName, setEditCatName] = useState("");
  const [showNewCat, setShowNewCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");

  // Item state
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [itemSearch, setItemSearch] = useState("");
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [showNewItem, setShowNewItem] = useState(false);
  const [form, setForm] = useState<Partial<MenuItem>>({});

  // Price history
  const [priceHistoryItem, setPriceHistoryItem] = useState<MenuItem | null>(null);
  const [priceHistory, setPriceHistory] = useState<MenuItemPriceHistory[]>([]);
  const [phLoading, setPhLoading] = useState(false);

  // CSV import
  const [importModal, setImportModal] = useState(false);
  const [importRows, setImportRows] = useState<Array<{ name: string; price: string; description: string; prep: string; error?: string }>>([]);
  const [importProgress, setImportProgress] = useState("");

  useEffect(() => {
    if (!activeCat && state.categories.length > 0) setActiveCat(state.categories[0].id);
  }, [state.categories]);

  const cats = [...state.categories].sort((a, b) => a.sort_order - b.sort_order);
  const items = state.items.filter(i =>
    i.category_id === activeCat &&
    (!itemSearch || i.name.toLowerCase().includes(itemSearch.toLowerCase()))
  );

  // ── Category actions ──────────────────────────────────────────────────────

  const reorderCat = async (cat: Category, dir: "up" | "down") => {
    const idx = cats.findIndex(c => c.id === cat.id);
    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= cats.length) return;
    const other = cats[swapIdx];
    try {
      await Promise.all([
        api.updateCategory(token, cat.id, { sort_order: other.sort_order }),
        api.updateCategory(token, other.id, { sort_order: cat.sort_order }),
      ]);
      await refreshMenu();
    } catch { toast("error", "Ошибка изменения порядка"); }
  };

  const saveCatEdit = async (catId: number) => {
    if (!editCatName.trim()) return;
    try {
      await api.updateCategory(token, catId, { name: editCatName.trim() });
      toast("success", "Категория обновлена");
      setEditCatId(null);
      await refreshMenu();
    } catch (e: unknown) { toast("error", e instanceof Error ? e.message : "Ошибка"); }
  };

  const saveNewCat = async () => {
    if (!newCatName.trim()) return;
    const maxOrder = Math.max(0, ...cats.map(c => c.sort_order));
    try {
      const created = await api.createCategory(token, { name: newCatName.trim(), sort_order: maxOrder + 10 });
      setShowNewCat(false); setNewCatName("");
      await refreshMenu();
      setActiveCat(created.id);
      toast("success", "Категория добавлена");
    } catch (e: unknown) { toast("error", e instanceof Error ? e.message : "Ошибка"); }
  };

  const deleteCat = async (cat: Category) => {
    const cnt = state.items.filter(i => i.category_id === cat.id).length;
    if (cnt > 0) { toast("error", `В категории ${cnt} блюд — сначала удалите или переместите их`); return; }
    try {
      await api.deleteCategory(token, cat.id);
      if (activeCat === cat.id) setActiveCat(cats.find(c => c.id !== cat.id)?.id);
      await refreshMenu();
      toast("success", "Категория удалена");
    } catch (e: unknown) { toast("error", e instanceof Error ? e.message : "Ошибка"); }
  };

  // ── Item actions ──────────────────────────────────────────────────────────

  const openItemForm = (item?: MenuItem) => {
    if (item) { setForm({ ...item, modifiers: item.modifiers ?? [] }); setEditItem(item); setShowNewItem(false); }
    else { setForm({ category_id: activeCat, is_available: true, preparation_time_minutes: 10, modifiers: [] }); setShowNewItem(true); setEditItem(null); }
  };
  const closeItemForm = () => { setEditItem(null); setShowNewItem(false); };

  const saveItem = async () => {
    try {
      if (editItem) {
        await api.updateMenuItem(token, editItem.id, {
          name: form.name, price: form.price, description: form.description ?? undefined,
          is_available: form.is_available, preparation_time_minutes: form.preparation_time_minutes,
          category_id: form.category_id, modifiers: (form.modifiers ?? []) as unknown[],
        });
        toast("success", "Блюдо обновлено");
      } else {
        await api.createMenuItem(token, {
          category_id: activeCat!, name: form.name!, price: form.price!,
          description: form.description ?? undefined, preparation_time_minutes: form.preparation_time_minutes,
          modifiers: (form.modifiers ?? []) as unknown[],
        });
        toast("success", "Блюдо добавлено");
      }
      await refreshMenu(); closeItemForm();
    } catch (e: unknown) { toast("error", e instanceof Error ? e.message : "Ошибка"); }
  };

  const deleteItem = async (item: MenuItem) => {
    try {
      await api.deleteMenuItem(token, item.id);
      toast("success", "Блюдо удалено");
      await refreshMenu();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Ошибка";
      toast("error", msg.includes("order history") ? "Есть история заказов — снимите флаг «Доступно»" : msg);
    }
  };

  const handleBulkAvailability = async (val: boolean) => {
    const ids = Array.from(selectedItems);
    if (!ids.length) return;
    try {
      await api.bulkItemAvailability(token, ids, val);
      toast("success", `${ids.length} блюд обновлено`);
      setSelectedItems(new Set()); await refreshMenu();
    } catch { toast("error", "Ошибка массового обновления"); }
  };

  const loadPriceHistory = async (item: MenuItem) => {
    setPriceHistoryItem(item); setPhLoading(true);
    try { setPriceHistory(await api.menuItemPriceHistory(token, item.id)); }
    catch { setPriceHistory([]); }
    finally { setPhLoading(false); }
  };

  // ── CSV ───────────────────────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = (ev.target?.result ?? "") as string;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { toast("error", "Файл пустой"); return; }
      const dataLines = (lines[0].toLowerCase().includes("name") || lines[0].toLowerCase().includes("назв")) ? lines.slice(1) : lines;
      setImportRows(dataLines.map(line => {
        const [name = "", price = "", description = "", prep = "10"] = line.split(",").map(s => s.replace(/^"|"$/g, "").trim());
        return { name, price, description, prep: prep || "10", error: !name ? "Нет названия" : (!price || isNaN(parseFloat(price))) ? "Некорректная цена" : undefined };
      }));
      setImportModal(true);
    };
    reader.readAsText(file, "utf-8");
    e.target.value = "";
  };

  const executeImport = async () => {
    const valid = importRows.filter(r => !r.error);
    let ok = 0, fail = 0;
    for (const row of valid) {
      try {
        await api.createMenuItem(token, { category_id: activeCat!, name: row.name, price: row.price, description: row.description || undefined, preparation_time_minutes: parseInt(row.prep) || 10 });
        ok++; setImportProgress(`Создано ${ok} / ${valid.length}...`);
      } catch { fail++; }
    }
    await refreshMenu();
    toast(fail === 0 ? "success" : "error", `Импортировано ${ok}, ошибок ${fail}`);
    setImportModal(false); setImportRows([]); setImportProgress("");
  };

  const exportCSV = () => {
    const rows = [
      ["Название", "Цена", "Описание", "Время (мин)", "Доступно"].join(","),
      ...items.map(i => [`"${i.name}"`, parseFloat(i.price).toFixed(2), `"${i.description ?? ""}"`, i.preparation_time_minutes, i.is_available ? "1" : "0"].join(",")),
    ].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + rows], { type: "text/csv;charset=utf-8;" }));
    a.download = `menu_${cats.find(c => c.id === activeCat)?.name ?? "export"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  // ── Modifier helpers ──────────────────────────────────────────────────────

  const mods = (form.modifiers ?? []) as ModifierGroup[];
  const addModGroup = () => setForm(f => ({ ...f, modifiers: [...mods, { name: "", options: [] }] }));
  const updateModGroup = (gi: number, val: string) => { const m = [...mods]; m[gi] = { ...m[gi], name: val }; setForm(f => ({ ...f, modifiers: m })); };
  const removeModGroup = (gi: number) => setForm(f => ({ ...f, modifiers: mods.filter((_, i) => i !== gi) }));
  const addModOption = (gi: number, opt: string) => { const m = [...mods]; m[gi] = { ...m[gi], options: [...m[gi].options, opt] }; setForm(f => ({ ...f, modifiers: m })); };
  const removeModOption = (gi: number, oi: number) => { const m = [...mods]; m[gi] = { ...m[gi], options: m[gi].options.filter((_, i) => i !== oi) }; setForm(f => ({ ...f, modifiers: m })); };

  const allSelected = items.length > 0 && items.every(i => selectedItems.has(i.id));

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>

      {/* ── Category rail ── */}
      <div style={{ width: 224, borderRight: "1px solid var(--line-1)", display: "flex", flexDirection: "column", background: "var(--bg-paper)", flexShrink: 0 }}>
        <div style={{ padding: "9px 12px", borderBottom: "1px solid var(--line-1)", fontSize: 11, fontWeight: 700, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Категории</div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {cats.map((c, idx) => (
            <div key={c.id}
              style={{ display: "flex", alignItems: "center", gap: 2, padding: "6px 8px 6px 10px", background: activeCat === c.id ? "var(--brand-50,#eff6ff)" : "transparent", borderLeft: `3px solid ${activeCat === c.id ? "var(--brand)" : "transparent"}`, cursor: "pointer" }}
              onClick={() => { setActiveCat(c.id); setSelectedItems(new Set()); }}
            >
              {editCatId === c.id ? (
                <input className="input" style={{ flex: 1, padding: "2px 6px", fontSize: 13, height: 26 }}
                  value={editCatName} autoFocus onChange={e => setEditCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveCatEdit(c.id); if (e.key === "Escape") setEditCatId(null); }}
                  onClick={e => e.stopPropagation()} />
              ) : (
                <span style={{ flex: 1, fontSize: 13, fontWeight: activeCat === c.id ? 600 : 400, color: activeCat === c.id ? "var(--brand)" : "var(--ink-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.name} <span style={{ opacity: 0.5, fontSize: 11 }}>{state.items.filter(i => i.category_id === c.id).length}</span>
                </span>
              )}
              <div style={{ display: "flex", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <button className="iconbtn borderless" style={{ padding: "2px 3px", opacity: idx === 0 ? 0.25 : 1, fontSize: 10 }} onClick={() => reorderCat(c, "up")} disabled={idx === 0}>▲</button>
                <button className="iconbtn borderless" style={{ padding: "2px 3px", opacity: idx === cats.length - 1 ? 0.25 : 1, fontSize: 10 }} onClick={() => reorderCat(c, "down")} disabled={idx === cats.length - 1}>▼</button>
                <button className="iconbtn borderless" style={{ padding: "2px 3px" }} onClick={() => { setEditCatId(c.id); setEditCatName(c.name); }}><Icon name="edit" size={12} /></button>
                <button className="iconbtn borderless" style={{ padding: "2px 3px", color: "var(--red)" }} onClick={() => deleteCat(c)}><Icon name="close" size={12} /></button>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 10px", borderTop: "1px solid var(--line-1)" }}>
          {showNewCat ? (
            <div style={{ display: "flex", gap: 4 }}>
              <input className="input" style={{ flex: 1, padding: "4px 8px", fontSize: 13 }} value={newCatName} autoFocus placeholder="Название"
                onChange={e => setNewCatName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveNewCat(); if (e.key === "Escape") { setShowNewCat(false); setNewCatName(""); } }} />
              <button className="btn sm primary" onClick={saveNewCat}>OK</button>
            </div>
          ) : (
            <button className="btn sm" style={{ width: "100%" }} onClick={() => setShowNewCat(true)}><Icon name="plus" size={13} /> Добавить</button>
          )}
        </div>
      </div>

      {/* ── Items area ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Toolbar */}
        <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--line-1)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {selectedItems.size > 0 ? (
            <>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--brand)" }}>Выбрано: {selectedItems.size}</span>
              <button className="btn sm success" onClick={() => handleBulkAvailability(true)}>Включить</button>
              <button className="btn sm danger" onClick={() => handleBulkAvailability(false)}>Выключить</button>
              <button className="btn sm ghost" onClick={() => setSelectedItems(new Set())}>Снять</button>
            </>
          ) : (
            <>
              <button className="btn primary sm" onClick={() => openItemForm()} disabled={!activeCat}><Icon name="plus" /> Добавить блюдо</button>
              <div style={{ position: "relative" }}>
                <input className="input" placeholder="Поиск..." value={itemSearch} onChange={e => setItemSearch(e.target.value)} style={{ width: 180, paddingLeft: 28, fontSize: 13 }} />
                <Icon name="search" size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
              </div>
            </>
          )}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <label className="btn sm" style={{ cursor: "pointer" }}>
              <Icon name="sort" /> Импорт CSV
              <input type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={handleFileSelect} disabled={!activeCat} />
            </label>
            <button className="btn sm" onClick={exportCSV} disabled={items.length === 0}><Icon name="analytics" /> Экспорт CSV</button>
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, overflow: "auto" }}>
          <div className="list-head" style={{ gridTemplateColumns: "36px 1.8fr 1.5fr 100px 56px 76px 90px" }}>
            <div><input type="checkbox" checked={allSelected} onChange={e => { if (e.target.checked) setSelectedItems(new Set(items.map(i => i.id))); else setSelectedItems(new Set()); }} /></div>
            <div>Название</div><div>Описание</div><div>Цена</div><div>Мин</div><div>Доступно</div><div></div>
          </div>
          {items.map(item => (
            <div key={item.id} className="list-row" style={{ gridTemplateColumns: "36px 1.8fr 1.5fr 100px 56px 76px 90px" }}>
              <div onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={selectedItems.has(item.id)} onChange={e => { const s = new Set(selectedItems); e.target.checked ? s.add(item.id) : s.delete(item.id); setSelectedItems(s); }} />
              </div>
              <div>
                <div style={{ fontWeight: 500 }}>{item.name}</div>
                {item.modifiers && item.modifiers.length > 0 && (
                  <div style={{ fontSize: 11, color: "var(--brand)", marginTop: 1 }}>{item.modifiers.map(m => m.name).join(" · ")}</div>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.description ?? "—"}</div>
              <div className="num">{fmtKZT(item.price)}</div>
              <div style={{ color: "var(--ink-3)" }}>{item.preparation_time_minutes}м</div>
              <div><span style={{ color: item.is_available ? "var(--olive)" : "var(--red)", fontWeight: 600, fontSize: 12 }}>{item.is_available ? "Да" : "Нет"}</span></div>
              <div style={{ display: "flex", gap: 2 }}>
                <button className="iconbtn borderless" title="Редактировать" onClick={() => openItemForm(item)}><Icon name="edit" size={14} /></button>
                <button className="iconbtn borderless" title="История цен" onClick={() => loadPriceHistory(item)}><Icon name="clock" size={14} /></button>
                <button className="iconbtn borderless" title="Удалить" style={{ color: "var(--red)" }} onClick={() => deleteItem(item)}><Icon name="close" size={14} /></button>
              </div>
            </div>
          ))}
          {items.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>{!activeCat ? "Выберите категорию" : itemSearch ? "Ничего не найдено" : "В этой категории нет блюд"}</div>}
        </div>
      </div>

      {/* ── Item form modal ── */}
      {(editItem || showNewItem) && (
        <Modal title={editItem ? "Редактировать блюдо" : "Новое блюдо"} onClose={closeItemForm} width={580}
          footer={<><button className="btn ghost" onClick={closeItemForm}>Отмена</button><button className="btn primary" onClick={saveItem}>Сохранить</button></>}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="field"><label className="field-label">Название</label>
              <input className="input" value={form.name ?? ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="field"><label className="field-label">Описание</label>
              <textarea className="textarea" value={form.description ?? ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <div className="field"><label className="field-label">Цена (₸)</label>
                <input className="input" type="number" min={1} value={form.price ?? ""} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} /></div>
              <div className="field"><label className="field-label">Время (мин)</label>
                <input className="input" type="number" min={1} value={form.preparation_time_minutes ?? ""} onChange={e => setForm(f => ({ ...f, preparation_time_minutes: parseInt(e.target.value) || 10 }))} /></div>
              <div className="field"><label className="field-label">Категория</label>
                <select className="select" value={form.category_id ?? activeCat} onChange={e => setForm(f => ({ ...f, category_id: Number(e.target.value) }))}>
                  {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "end" }}>
              <div className="field"><label className="field-label">Штрих-код</label>
                <input className="input" value={form.barcode ?? ""} placeholder="Необязательно" onChange={e => setForm(f => ({ ...f, barcode: e.target.value || null }))} /></div>
              <div className="field"><label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", paddingBottom: 8 }}>
                <input type="checkbox" checked={form.is_available ?? true} onChange={e => setForm(f => ({ ...f, is_available: e.target.checked }))} />
                <span style={{ fontSize: 13 }}>Доступно</span></label></div>
            </div>

            {/* Modifiers */}
            <div style={{ borderTop: "1px solid var(--line-1)", paddingTop: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>Модификаторы</span>
                <button className="btn sm" onClick={addModGroup}><Icon name="plus" size={12} /> Группа</button>
              </div>
              {mods.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-4)" }}>Нет модификаторов. Добавьте группу (напр. Размер → S, M, L).</div>}
              {mods.map((group, gi) => (
                <div key={gi} style={{ marginBottom: 10, padding: 10, border: "1px solid var(--line-1)", borderRadius: "var(--r)", background: "var(--bg-sunken)" }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                    <input className="input" placeholder="Название группы (напр. Размер)" style={{ flex: 1, fontSize: 13 }}
                      value={group.name} onChange={e => updateModGroup(gi, e.target.value)} />
                    <button className="iconbtn borderless" style={{ color: "var(--red)" }} onClick={() => removeModGroup(gi)}><Icon name="close" size={13} /></button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    {group.options.map((opt, oi) => (
                      <span key={oi} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", background: "var(--bg-paper)", border: "1px solid var(--line-1)", borderRadius: 999, fontSize: 12 }}>
                        {opt}
                        <button style={{ border: 0, background: "none", cursor: "pointer", color: "var(--ink-4)", padding: 0, lineHeight: 1, fontSize: 14 }} onClick={() => removeModOption(gi, oi)}>×</button>
                      </span>
                    ))}
                    <ModOptionInput onAdd={opt => addModOption(gi, opt)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {/* ── Price history modal ── */}
      {priceHistoryItem && (
        <Modal title={`История цен · ${priceHistoryItem.name}`} onClose={() => setPriceHistoryItem(null)} width={480}
          footer={<button className="btn ghost" onClick={() => setPriceHistoryItem(null)}>Закрыть</button>}>
          {phLoading
            ? <div style={{ padding: 40, textAlign: "center" }}><span className="spin" /></div>
            : priceHistory.length === 0
            ? <div style={{ padding: 24, textAlign: "center", color: "var(--ink-3)" }}>История изменений цены отсутствует</div>
            : <div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "7px 12px", fontSize: 11, color: "var(--ink-4)", fontWeight: 700, textTransform: "uppercase", background: "var(--bg-sunken)", borderRadius: "var(--r) var(--r) 0 0" }}>
                  <div>Старая цена</div><div>Новая цена</div><div>Кто изменил</div><div>Когда</div>
                </div>
                {priceHistory.map(h => (
                  <div key={h.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", padding: "8px 12px", borderTop: "1px solid var(--line-1)", fontSize: 13 }}>
                    <div style={{ color: "var(--red)", textDecoration: "line-through" }}>{fmtKZT(h.old_price)}</div>
                    <div style={{ color: "var(--olive)", fontWeight: 600 }}>{fmtKZT(h.new_price)}</div>
                    <div style={{ color: "var(--ink-3)", fontSize: 12 }}>{h.changed_by?.full_name ?? `#${h.changed_by_id}`}</div>
                    <div style={{ color: "var(--ink-4)", fontSize: 11 }}>{new Date(h.changed_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                ))}
              </div>}
        </Modal>
      )}

      {/* ── CSV import modal ── */}
      {importModal && (
        <Modal title="Импорт меню из CSV" onClose={() => { setImportModal(false); setImportRows([]); }} width={560}
          footer={<>
            <button className="btn ghost" onClick={() => { setImportModal(false); setImportRows([]); }}>Отмена</button>
            <button className="btn primary" disabled={!importRows.filter(r => !r.error).length || !!importProgress} onClick={executeImport}>
              {importProgress || `Импортировать ${importRows.filter(r => !r.error).length} блюд`}
            </button>
          </>}>
          <div style={{ marginBottom: 10, fontSize: 12, color: "var(--ink-3)", padding: "8px 12px", background: "var(--bg-sunken)", borderRadius: "var(--r)" }}>
            Формат: <code>Название, Цена, Описание, Время(мин)</code> — первая строка может быть заголовком.
          </div>
          <div style={{ maxHeight: 300, overflow: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.5fr 80px 1.5fr 56px 70px", padding: "6px 10px", fontSize: 11, color: "var(--ink-4)", fontWeight: 700, textTransform: "uppercase", background: "var(--bg-sunken)" }}>
              <div>Название</div><div>Цена</div><div>Описание</div><div>Мин</div><div>Статус</div>
            </div>
            {importRows.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.5fr 80px 1.5fr 56px 70px", padding: "6px 10px", borderTop: "1px solid var(--line-1)", fontSize: 12, background: r.error ? "rgba(239,68,68,0.04)" : undefined }}>
                <div>{r.name || <span style={{ color: "var(--ink-4)" }}>—</span>}</div>
                <div className="num">{r.price}</div>
                <div style={{ color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description || "—"}</div>
                <div style={{ color: "var(--ink-3)" }}>{r.prep}</div>
                <div style={{ fontSize: 11, color: r.error ? "var(--red)" : "var(--olive)", fontWeight: 600 }}>{r.error ?? "OK"}</div>
              </div>
            ))}
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
