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

type AnPeriod = "today" | "7d" | "month" | "custom";

function Delta({ pct, prefix = "к прошлому периоду" }: { pct: number; prefix?: string }) {
  const up = pct >= 0;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: up ? "var(--olive)" : "var(--red)", display: "inline-flex", alignItems: "center", gap: 2 }}>
      {up ? "↑" : "↓"}{Math.abs(pct).toFixed(1)}%
      <span style={{ color: "var(--ink-4)", fontWeight: 400, marginLeft: 2 }}>{prefix}</span>
    </span>
  );
}

function KpiCard({ label, value, delta, sub, highlight }: { label: string; value: string; delta?: number; sub?: string; highlight?: boolean }) {
  return (
    <div className="card" style={{ padding: 16, borderLeft: highlight ? "3px solid var(--brand)" : undefined }}>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 6, fontWeight: 500, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 750, lineHeight: 1.2, marginBottom: 4 }}>{value}</div>
      {delta !== undefined && <Delta pct={delta} />}
      {sub && <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function AnalyticsAreaChart({ data }: { data: Array<{ x: string; revenue: number; profit: number; cost: number }> }) {
  if (!data.length) return null;
  const W = 800, H = 180, PL = 60, PR = 16, PT = 12, PB = 28;
  const maxV = Math.max(...data.map(d => d.revenue), 1);
  const gx = (i: number) => PL + (i / Math.max(data.length - 1, 1)) * (W - PL - PR);
  const gy = (v: number) => PT + (1 - v / maxV) * (H - PT - PB);
  const fmt = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : v.toFixed(0);
  const line = (fn: (d: typeof data[0]) => number) =>
    data.map((d, i) => `${i ? "L" : "M"}${gx(i).toFixed(1)},${gy(fn(d)).toFixed(1)}`).join(" ");
  const area = `${line(d => d.revenue)} L${gx(data.length - 1).toFixed(1)},${(H - PB).toFixed(1)} L${gx(0).toFixed(1)},${(H - PB).toFixed(1)} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const xStep = Math.ceil(data.length / 8);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible", display: "block" }}>
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.15} />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
        </linearGradient>
      </defs>
      {ticks.map(f => (
        <g key={f}>
          <line x1={PL} y1={gy(f * maxV)} x2={W - PR} y2={gy(f * maxV)} stroke="var(--line-1)" strokeWidth={1} />
          <text x={PL - 6} y={gy(f * maxV) + 4} textAnchor="end" fontSize={10} fill="var(--ink-4)">{fmt(f * maxV)}</text>
        </g>
      ))}
      <path d={area} fill="url(#areaGrad)" />
      <path d={line(d => d.revenue)} fill="none" stroke="var(--brand)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d={line(d => d.profit)} fill="none" stroke="#10b981" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6 3" />
      <path d={line(d => d.cost)} fill="none" stroke="#f59e0b" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3 3" />
      {data.map((d, i) => (i % xStep === 0 || i === data.length - 1) && (
        <text key={i} x={gx(i)} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--ink-4)">{d.x}</text>
      ))}
    </svg>
  );
}

function buildChartData(period: AnPeriod, pkHours: Array<{ hour: number; orders: number }>, revenue: number, paidOrders: number): Array<{ x: string; revenue: number; profit: number; cost: number }> {
  const avgPerOrder = paidOrders > 0 ? revenue / paidOrders : 1500;
  if (period === "today") {
    return pkHours.filter(h => h.hour >= 7 && h.hour <= 23).map(h => {
      const r = h.orders * avgPerOrder;
      return { x: `${String(h.hour).padStart(2, "0")}:00`, revenue: r, profit: r * 0.42, cost: r * 0.29 };
    });
  }
  const days = period === "7d" ? 7 : 30;
  const dayLabels7 = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const seed = revenue || 500_000;
  return Array.from({ length: days }, (_, i) => {
    const v = Math.max(0, (seed / days) * (0.72 + Math.sin(i * 0.9 + 1.1) * 0.22 + Math.cos(i * 1.6 + 0.4) * 0.13));
    return { x: period === "7d" ? dayLabels7[i % 7] : String(i + 1), revenue: v, profit: v * 0.42, cost: v * 0.29 };
  });
}

const INSIGHTS = [
  { color: "var(--red)", icon: "↑", text: "Food Cost выше нормы на 3.2 п.п. — проверьте закупочные цены" },
  { color: "#f59e0b", icon: "↓", text: "Средний чек упал на 7% по сравнению с прошлой неделей" },
  { color: "#f59e0b", icon: "!", text: "Скидка «−10% на обед» снижает маржу без роста среднего чека" },
  { color: "var(--red)", icon: "↑", text: "Списания по молочной продукции выросли на 24%" },
  { color: "var(--brand)", icon: "★", text: "Паста карбонара: высокие продажи, но низкая маржа — пересчитайте себестоимость" },
  { color: "var(--brand)", icon: "★", text: "Круассаны попали в C-категорию ABC-анализа — кандидат на вывод из меню" },
  { color: "var(--olive)", icon: "↑", text: "В воскресенье вечером 18:00–21:00 не хватает персонала" },
];

const ABC_ITEMS = [
  { name: "Паста Карбонара", cat: "Горячее", sold: 312, revenue: 624000, margin: 48, share: 12.9, rec: "Пересчитать себестоимость", cls: "A" },
  { name: "Капучино", cat: "Кофе", sold: 487, revenue: 389600, margin: 76, share: 8.1, rec: "Усилить продажу", cls: "A" },
  { name: "Греческий салат", cat: "Салаты", sold: 241, revenue: 361500, margin: 69, share: 7.5, rec: "Усилить продажу", cls: "A" },
  { name: "Том Ям", cat: "Супы", sold: 198, revenue: 316800, margin: 58, share: 6.6, rec: "Оставить", cls: "A" },
  { name: "Стейк из сёмги", cat: "Горячее", sold: 156, revenue: 280800, margin: 62, share: 5.8, rec: "Оставить", cls: "B" },
  { name: "Тирамису", cat: "Десерты", sold: 203, revenue: 243600, margin: 71, share: 5.1, rec: "Усилить продажу", cls: "B" },
  { name: "Борщ", cat: "Супы", sold: 178, revenue: 213600, margin: 55, share: 4.4, rec: "Оставить", cls: "B" },
  { name: "Пицца Маргарита", cat: "Горячее", sold: 134, revenue: 187600, margin: 52, share: 3.9, rec: "Проверить себестоимость", cls: "B" },
  { name: "Круассан", cat: "Завтраки", sold: 89, revenue: 62300, margin: 44, share: 1.3, rec: "Кандидат на вывод", cls: "C" },
  { name: "Морс домашний", cat: "Напитки", sold: 67, revenue: 40200, margin: 82, share: 0.8, rec: "Продвигать", cls: "C" },
  { name: "Чизкейк Нью-Йорк", cat: "Десерты", sold: 54, revenue: 75600, margin: 66, share: 1.6, rec: "Оставить", cls: "C" },
  { name: "Окрошка", cat: "Супы", sold: 31, revenue: 27900, margin: 50, share: 0.6, rec: "Кандидат на вывод", cls: "C" },
];

const PROFIT_MATRIX = [
  { name: "Капучино", popularity: 87, margin: 76, quad: "star" },
  { name: "Паста Карбонара", popularity: 82, margin: 48, quad: "cost" },
  { name: "Греческий салат", popularity: 71, margin: 69, quad: "star" },
  { name: "Тирамису", popularity: 68, margin: 71, quad: "star" },
  { name: "Борщ", popularity: 65, margin: 55, quad: "cost" },
  { name: "Том Ям", popularity: 62, margin: 58, quad: "cost" },
  { name: "Морс домашний", popularity: 22, margin: 82, quad: "push" },
  { name: "Круассан", popularity: 18, margin: 44, quad: "drop" },
  { name: "Окрошка", popularity: 12, margin: 50, quad: "drop" },
  { name: "Чизкейк", popularity: 28, margin: 66, quad: "push" },
];

const DISCOUNT_ROWS = [
  { name: "−10% на обед (12:00–15:00)", uses: 203, discount: 48720, addRevenue: 12400, avgCheck: 2390, effective: false },
  { name: "День рождения −15%", uses: 44, discount: 29040, addRevenue: 61200, avgCheck: 4390, effective: true },
  { name: "2+1 на кофе", uses: 312, discount: 37440, addRevenue: 93600, avgCheck: 1890, effective: true },
  { name: "Бизнес-ланч фиксированный", uses: 178, discount: 22250, addRevenue: 31200, avgCheck: 2150, effective: true },
  { name: "Комплимент от заведения", uses: 67, discount: 19040, addRevenue: 0, avgCheck: 0, effective: false },
];

const LOSS_REASONS = [
  { reason: "Ошибка приготовления", amount: 28400, pct: 0.59 },
  { reason: "Возврат гостя", amount: 19200, pct: 0.40 },
  { reason: "Порча / истёк срок", amount: 15600, pct: 0.32 },
  { reason: "Перепроизводство", amount: 11200, pct: 0.23 },
  { reason: "Бой / повреждение", amount: 7400, pct: 0.15 },
];

const LOSS_PRODUCTS = [
  { name: "Молоко 1л", amount: 8400 },
  { name: "Сёмга (кг)", amount: 6200 },
  { name: "Сливки 33%", amount: 4800 },
  { name: "Тесто слоёное", amount: 3600 },
  { name: "Тирамису заготовка", amount: 2900 },
];

const QUICK_REPORTS = [
  { icon: "money",    title: "Отчёт по выручке",         desc: "Выручка gross / net по периодам" },
  { icon: "analytics",title: "Отчёт по марже",           desc: "Маржинальность по категориям" },
  { icon: "menu",     title: "ABC-анализ меню",           desc: "Классификация позиций по выручке" },
  { icon: "refund",   title: "Списания и потери",         desc: "Причины и суммы списаний" },
  { icon: "users",    title: "Эффективность персонала",   desc: "Выручка и upsell по сотрудникам" },
  { icon: "shift",    title: "План vs факт",              desc: "Выполнение планового показателя" },
  { icon: "kitchen",  title: "Продажи по категориям",     desc: "Доля и маржа каждой категории" },
  { icon: "tables",   title: "Аналитика гостей",          desc: "Лояльность, LTV, частота визитов" },
  { icon: "receipt",  title: "Отчёт по скидкам",         desc: "Эффективность акций и скидок" },
  { icon: "print",    title: "Экспорт для бухгалтера",   desc: "Сводная таблица Excel / CSV" },
];

export function ManagerAnalytics() {
  const { state } = useApp();
  const token = state.token!;
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<AnPeriod>("month");
  const [abcTab, setAbcTab] = useState<"A" | "B" | "C">("A");
  const [alertOpen, setAlertOpen] = useState(true);

  const loadAnalytics = async () => {
    setLoading(true);
    try { setAnalytics(await api.analytics(token)); } catch { /* show zeros */ }
    finally { setLoading(false); }
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

  // ── Derived metrics ──────────────────────────────────────────────────────────
  const revenue     = parseFloat(analytics?.revenue ?? "0");
  const paidOrders  = analytics?.paid_orders ?? 0;
  const refunds     = parseFloat(analytics?.refunds_total ?? "0");
  const avgCheck    = paidOrders > 0 ? revenue / paidOrders : 0;
  const foodCostPct = 29.4;
  const laborCostPct= 23.8;
  const foodCost    = revenue * foodCostPct / 100;
  const laborCost   = revenue * laborCostPct / 100;
  const discountAmt = revenue * 0.034;
  const grossProfit = revenue - foodCost;
  const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
  const netProfit   = revenue - foodCost - laborCost - revenue * 0.12;
  const netMargin   = revenue > 0 ? (netProfit / revenue) * 100 : 0;
  const losses      = revenue * 0.018;
  const planRevenue = revenue > 0 ? revenue / 0.728 : 12_000_000;
  const planPct     = revenue > 0 ? Math.min(100, (revenue / planRevenue) * 100) : 72.8;
  const forecast    = revenue > 0 ? revenue * 1.31 : planRevenue * 0.95;

  // Chart data
  const chartData = buildChartData(period, analytics?.peak_hours ?? [], revenue, paidOrders);

  // Category sales (proportions derived from real revenue)
  const catSales = [
    { name: "Горячее",  rev: revenue * 0.28, margin: 68, color: "#3b82f6" },
    { name: "Напитки",  rev: revenue * 0.22, margin: 72, color: "#10b981" },
    { name: "Кофе",     rev: revenue * 0.18, margin: 78, color: "#f59e0b" },
    { name: "Салаты",   rev: revenue * 0.12, margin: 65, color: "#8b5cf6" },
    { name: "Десерты",  rev: revenue * 0.09, margin: 70, color: "#ec4899" },
    { name: "Супы",     rev: revenue * 0.07, margin: 62, color: "#06b6d4" },
    { name: "Завтраки", rev: revenue * 0.04, margin: 60, color: "#f97316" },
  ];
  const catTotal = catSales.reduce((s, c) => s + c.rev, 1);

  // Channel breakdown
  const channels = [
    { name: "Зал",        rev: revenue * 0.72, orders: Math.round(paidOrders * 0.72), avgChk: avgCheck * 1.08, margin: 68, time: "24 мин", color: "#3b82f6" },
    { name: "Доставка",   rev: revenue * 0.19, orders: Math.round(paidOrders * 0.19), avgChk: avgCheck * 0.94, margin: 52, time: "48 мин", color: "#10b981" },
    { name: "Самовывоз",  rev: revenue * 0.09, orders: Math.round(paidOrders * 0.09), avgChk: avgCheck * 0.87, margin: 64, time: "18 мин", color: "#f59e0b" },
  ];
  const chanTotal = channels.reduce((s, c) => s + c.rev, 1);

  // Staff rows (from real API + mock upsell/errors)
  const staffRows = (analytics?.staff_productivity ?? []).map((s, i) => ({
    name: s.full_name,
    shifts: 3 + i,
    revenue: parseFloat(s.revenue),
    avgChk: s.orders > 0 ? parseFloat(s.revenue) / s.orders : 0,
    orders: s.orders,
    upsell: [18, 24, 12, 31, 9][i % 5],
    errors: [1, 0, 2, 0, 1][i % 5],
    rph: s.orders > 0 ? parseFloat(s.revenue) / (8 * (3 + i)) : 0,
  }));
  const maxStaffRev = staffRows.reduce((m, s) => Math.max(m, s.revenue), 1);

  // Heatmap: days × hours (7 × 16 cells from 8:00–23:00)
  const dayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const hourRange = Array.from({ length: 16 }, (_, i) => i + 8);
  const peakMap: Record<number, number> = {};
  (analytics?.peak_hours ?? []).forEach(h => { peakMap[h.hour] = h.orders; });
  const heatMax = Math.max(...Object.values(peakMap), 1);
  const heatData = dayLabels.map((_, di) => hourRange.map(h => {
    const base = (peakMap[h] ?? 0) / heatMax;
    const dayFactor = di < 5 ? 0.8 + Math.sin(di * 0.6) * 0.15 : 1.0 + (di - 4) * 0.1;
    return Math.min(1, base * dayFactor * (0.85 + Math.sin(h * 0.7 + di) * 0.15));
  }));

  const PERIOD_LABELS: Record<AnPeriod, string> = { today: "Сегодня", "7d": "7 дней", month: "Месяц", custom: "Период" };
  const abcItems = ABC_ITEMS.filter(i => i.cls === abcTab);
  const maxLossAmt = Math.max(...LOSS_REASONS.map(r => r.amount), 1);

  return (
    <div style={{ overflow: "auto", padding: 24, background: "var(--bg-canvas)", minHeight: "100%" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 750, color: "var(--ink-1)" }}>Аналитика</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>Финансы · Меню · Персонал · Гости — управленческая отчётность за период</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 3, background: "var(--bg-sunken)", borderRadius: "var(--r)", padding: 3 }}>
            {(["today", "7d", "month"] as AnPeriod[]).map(p => (
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
          <button className="btn sm" style={{ background: "var(--brand)", color: "#fff", border: 0 }}>
            <Icon name="print" /> Экспорт отчёта
          </button>
        </div>
      </div>

      {/* ── Insights alert ── */}
      <div className="card" style={{ marginBottom: 20, overflow: "hidden" }}>
        <button onClick={() => setAlertOpen(v => !v)} style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
          background: "none", border: 0, cursor: "pointer", textAlign: "left",
          borderBottom: alertOpen ? "1px solid var(--line-1)" : "none",
        }}>
          <div style={{ width: 8, height: 8, borderRadius: 999, background: "var(--red)", flexShrink: 0 }} />
          <span style={{ fontWeight: 650, fontSize: 14 }}>На что обратить внимание</span>
          <span style={{ fontSize: 12, color: "var(--ink-3)", marginLeft: 4 }}>{INSIGHTS.length} предупреждений</span>
          <span style={{ marginLeft: "auto", fontSize: 18, color: "var(--ink-3)", lineHeight: 1 }}>{alertOpen ? "−" : "+"}</span>
        </button>
        {alertOpen && (
          <div style={{ padding: "10px 16px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {INSIGHTS.map((ins, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", background: ins.color, color: "#fff", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{ins.icon}</div>
                <span style={{ fontSize: 13, color: "var(--ink-2)", paddingTop: 2 }}>{ins.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 1. Financial KPIs ── */}
      <div style={{ fontSize: 13, fontWeight: 650, color: "var(--ink-3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Финансовые показатели за период
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(185px, 1fr))", gap: 12, marginBottom: 20 }}>
        <KpiCard label="Выручка за период" value={fmtKZT(revenue)} delta={12.4} sub="без учёта возвратов" highlight />
        <KpiCard label="Средний чек" value={fmtKZT(avgCheck)} delta={-3.1} sub={`${paidOrders} чеков`} />
        <KpiCard label="Количество чеков" value={String(paidOrders)} delta={8.7} sub="оплаченных заказов" />
        <KpiCard label="Валовая прибыль" value={fmtKZT(grossProfit)} delta={9.2} sub={`маржа ${grossMargin.toFixed(1)}%`} />
        <KpiCard label="Маржинальность" value={`${netMargin.toFixed(1)}%`} delta={-1.4} sub="чистая прибыль / выручка" />
        <KpiCard label="Food Cost" value={`${foodCostPct}%`} delta={2.1} sub={fmtKZT(foodCost)} />
        <KpiCard label="Labor Cost" value={`${laborCostPct}%`} delta={0.6} sub={fmtKZT(laborCost)} />
        <KpiCard label="Скидки и комплименты" value={fmtKZT(discountAmt)} delta={-5.3} sub="3.4% от выручки" />
        <KpiCard label="Возвраты и удаления" value={refunds > 0 ? `−${fmtKZT(refunds)}` : "0 ₸"} delta={refunds > 0 ? 14.2 : 0} sub="от оплаченных заказов" />
        <KpiCard label="Потери / списания" value={fmtKZT(losses)} delta={18.1} sub="1.8% от выручки" />
      </div>

      {/* ── 2. Revenue & Profit chart ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 650 }}>Выручка и прибыль</div>
          <div style={{ display: "flex", gap: 16, marginLeft: "auto", flexWrap: "wrap" }}>
            {[
              { color: "var(--brand)", label: "Выручка", dash: false },
              { color: "#10b981",       label: "Валовая прибыль", dash: true },
              { color: "#f59e0b",       label: "Себестоимость", dash: true },
            ].map(l => (
              <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                <svg width={24} height={8}>
                  <line x1={0} y1={4} x2={24} y2={4} stroke={l.color} strokeWidth={l.dash ? 2 : 2.5} strokeDasharray={l.dash ? "5 3" : undefined} />
                </svg>
                <span style={{ color: "var(--ink-3)" }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: "16px 18px 8px" }}>
          <AnalyticsAreaChart data={chartData} />
        </div>
      </div>

      {/* ── 3. Plan vs Fact + Category donut ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ fontWeight: 650, marginBottom: 16 }}>План vs Факт</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 18 }}>
            {[
              { label: "Плановая выручка",       value: fmtKZT(planRevenue), color: "var(--ink-3)" },
              { label: "Фактическая выручка",     value: fmtKZT(revenue),     color: "var(--ink-1)" },
              { label: "Выполнение плана",        value: `${planPct.toFixed(1)}%`, color: planPct >= 80 ? "var(--olive)" : planPct >= 60 ? "#f59e0b" : "var(--red)" },
              { label: "Прогноз до конца месяца", value: fmtKZT(forecast),    color: "var(--brand)" },
            ].map(row => (
              <div key={row.label} style={{ padding: 14, background: "var(--bg-sunken)", borderRadius: "var(--r)" }}>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 6 }}>{row.label}</div>
                <div style={{ fontSize: 17, fontWeight: 750, color: row.color }}>{row.value}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8, display: "flex", justifyContent: "space-between" }}>
            <span>Выполнение плана</span><span style={{ fontWeight: 650, color: "var(--ink-1)" }}>{planPct.toFixed(1)}%</span>
          </div>
          <div style={{ height: 10, background: "var(--bg-sunken)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${planPct}%`, background: planPct >= 80 ? "var(--olive)" : planPct >= 60 ? "#f59e0b" : "var(--red)", borderRadius: 999, transition: "width 0.5s" }} />
          </div>
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--ink-3)" }}>
            Отклонение: <span style={{ fontWeight: 650, color: "var(--red)" }}>−{fmtKZT(planRevenue - revenue)}</span>
          </div>
        </div>

        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 650 }}>Продажи по категориям</div>
          <div style={{ padding: 14, display: "flex", gap: 14, alignItems: "center" }}>
            <DonutChart segments={catSales.map(c => ({ value: Math.round(c.rev), color: c.color, label: c.name }))} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
              {catSales.map(c => (
                <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, color: "var(--ink-2)" }}>{c.name}</span>
                  <span style={{ color: "var(--ink-3)" }}>{((c.rev / catTotal) * 100).toFixed(0)}%</span>
                  <span style={{ color: "var(--olive)", fontSize: 11 }}>{c.margin}%м</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 4. ABC analysis ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontWeight: 650 }}>ABC-анализ меню</div>
          <div style={{ display: "flex", gap: 2, background: "var(--bg-sunken)", borderRadius: 6, padding: 2, marginLeft: "auto" }}>
            {(["A", "B", "C"] as const).map(tab => (
              <button key={tab} onClick={() => setAbcTab(tab)} style={{
                padding: "4px 16px", border: 0, borderRadius: 4, fontSize: 13, cursor: "pointer",
                background: abcTab === tab ? (tab === "A" ? "var(--brand)" : tab === "B" ? "#10b981" : "#f59e0b") : "transparent",
                color: abcTab === tab ? "#fff" : "var(--ink-3)", fontWeight: 600,
              }}>
                {tab === "A" ? "A — Лидеры" : tab === "B" ? "B — Середняки" : "C — Аутсайдеры"}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {abcTab === "A" ? "Дают 80% выручки" : abcTab === "B" ? "Стабильный спрос" : "Слабые позиции"}
          </div>
        </div>
        <div style={{ overflow: "auto" }}>
          <div className="list-head" style={{ gridTemplateColumns: "1.5fr 100px 70px 120px 70px 80px 1fr" }}>
            <div>Блюдо</div><div>Категория</div><div>Продано</div><div>Выручка</div><div>Маржа %</div><div>Доля %</div><div>Рекомендация</div>
          </div>
          {abcItems.map(item => (
            <div key={item.name} className="list-row" style={{ gridTemplateColumns: "1.5fr 100px 70px 120px 70px 80px 1fr" }}>
              <div style={{ fontWeight: 500 }}>{item.name}</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{item.cat}</div>
              <div>{item.sold} шт.</div>
              <div className="num">{fmtKZT(item.revenue)}</div>
              <div style={{ color: item.margin >= 65 ? "var(--olive)" : item.margin >= 50 ? "#f59e0b" : "var(--red)", fontWeight: 600 }}>{item.margin}%</div>
              <div>{item.share}%</div>
              <div>
                <span style={{
                  fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 600,
                  background: item.rec.includes("вывод") || item.rec.includes("Пересч") ? "#fef2f2" : item.rec.includes("Усил") ? "#f0fdf4" : "#eff6ff",
                  color: item.rec.includes("вывод") || item.rec.includes("Пересч") ? "var(--red)" : item.rec.includes("Усил") ? "var(--olive)" : "var(--brand)",
                }}>{item.rec}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 5. Profitability matrix + Staff ── */}
      <div style={{ display: "grid", gridTemplateColumns: "480px 1fr", gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 650 }}>Анализ маржинальности блюд</div>
          <div style={{ padding: 14 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, fontSize: 12 }}>
              {[
                { quad: "push", label: "Продвигать", sub: "Низкая популярность, высокая маржа", bg: "#f0fdf4", border: "#bbf7d0", icon: "↑" },
                { quad: "star", label: "Звёзды",     sub: "Высокая популярность, высокая маржа", bg: "#eff6ff", border: "#bfdbfe", icon: "★" },
                { quad: "drop", label: "Убрать / заменить", sub: "Низкая популярность, низкая маржа", bg: "#fff7ed", border: "#fed7aa", icon: "✕" },
                { quad: "cost", label: "Пересчитать себестоимость", sub: "Высокая популярность, низкая маржа", bg: "#fef2f2", border: "#fecaca", icon: "!" },
              ].map(q => (
                <div key={q.quad} style={{ padding: 12, background: q.bg, borderRadius: "var(--r)", border: `1px solid ${q.border}`, minHeight: 120 }}>
                  <div style={{ fontWeight: 650, marginBottom: 2 }}>{q.icon} {q.label}</div>
                  <div style={{ color: "var(--ink-4)", fontSize: 11, marginBottom: 8 }}>{q.sub}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {PROFIT_MATRIX.filter(i => i.quad === q.quad).map(i => (
                      <div key={i.name} style={{ fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                        <span>{i.name}</span>
                        <span style={{ color: "var(--ink-3)" }}>{i.margin}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 650 }}>Персонал за период</div>
          {staffRows.length > 0 ? (
            <>
              <div className="list-head" style={{ gridTemplateColumns: "1.4fr 55px 110px 100px 55px 60px 65px 90px" }}>
                <div>Сотрудник</div><div>Смен</div><div>Выручка</div><div>Ср. чек</div><div>Чеков</div><div>Upsell</div><div>Ошибки</div><div>₸/час</div>
              </div>
              {staffRows.map(s => (
                <div key={s.name} className="list-row" style={{ gridTemplateColumns: "1.4fr 55px 110px 100px 55px 60px 65px 90px" }}>
                  <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <div style={{ width: 6, height: 6, borderRadius: 999, background: `hsl(${(s.revenue / maxStaffRev) * 120},70%,48%)`, display: "inline-block", marginRight: 6 }} />
                    {s.name}
                  </div>
                  <div>{s.shifts}</div>
                  <div className="num">{fmtKZT(s.revenue)}</div>
                  <div className="num">{fmtKZT(s.avgChk)}</div>
                  <div>{s.orders}</div>
                  <div style={{ color: s.upsell > 20 ? "var(--olive)" : "var(--ink-3)", fontWeight: s.upsell > 20 ? 600 : 400 }}>{s.upsell}%</div>
                  <div style={{ color: s.errors > 0 ? "var(--red)" : "var(--ink-3)" }}>{s.errors}</div>
                  <div className="num" style={{ fontSize: 11 }}>{fmtKZT(s.rph)}</div>
                </div>
              ))}
            </>
          ) : (
            <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>Нет данных по персоналу</div>
          )}
        </div>
      </div>

      {/* ── 10. Heatmap ── */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 650 }}>Почасовая и дневная загрузка</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Пиковые часы: Пт–Вс, 18:00–21:00</div>
        </div>
        <div style={{ padding: 16, overflowX: "auto" }}>
          <div style={{ display: "flex", gap: 4, marginBottom: 4, paddingLeft: 36 }}>
            {hourRange.map(h => (
              <div key={h} style={{ width: 30, textAlign: "center", fontSize: 10, color: "var(--ink-4)", flexShrink: 0 }}>
                {String(h).padStart(2, "0")}
              </div>
            ))}
          </div>
          {heatData.map((row, di) => (
            <div key={di} style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
              <div style={{ width: 28, fontSize: 11, color: "var(--ink-3)", flexShrink: 0, textAlign: "right" }}>{dayLabels[di]}</div>
              {row.map((intensity, hi) => {
                const heat = Math.round(intensity * 5);
                const bgMap = ["var(--bg-sunken)", "#dbeafe", "#93c5fd", "#3b82f6", "#1d4ed8", "#1e3a8a"];
                const fgMap = ["var(--ink-4)", "var(--ink-3)", "var(--ink-2)", "#fff", "#fff", "#fff"];
                return (
                  <div key={hi} title={`${dayLabels[di]} ${hourRange[hi]}:00 — загрузка ${(intensity * 100).toFixed(0)}%`}
                    style={{ width: 30, height: 26, borderRadius: 4, background: bgMap[heat] ?? bgMap[5], flexShrink: 0, display: "grid", placeItems: "center" }}>
                    {intensity > 0.4 && <span style={{ fontSize: 9, fontWeight: 700, color: fgMap[heat] }}>{(intensity * 100).toFixed(0)}</span>}
                  </div>
                );
              })}
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, paddingLeft: 36 }}>
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Низкая</span>
            {["var(--bg-sunken)", "#dbeafe", "#93c5fd", "#3b82f6", "#1d4ed8", "#1e3a8a"].map((bg, i) => (
              <div key={i} style={{ width: 18, height: 12, borderRadius: 3, background: bg }} />
            ))}
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Высокая</span>
          </div>
        </div>
      </div>

      {/* ── 7. Discounts + 8. Losses ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 650 }}>Скидки, акции и комплименты</div>
          <div style={{ overflow: "auto" }}>
            <div className="list-head" style={{ gridTemplateColumns: "1.6fr 55px 100px 90px 80px 80px" }}>
              <div>Акция</div><div>Исп.</div><div>Сумма скидки</div><div>Доп. выручка</div><div>Ср. чек</div><div>Эффект</div>
            </div>
            {DISCOUNT_ROWS.map(d => (
              <div key={d.name} className="list-row" style={{ gridTemplateColumns: "1.6fr 55px 100px 90px 80px 80px" }}>
                <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                <div>{d.uses}</div>
                <div className="num" style={{ color: "var(--red)" }}>−{fmtKZT(d.discount)}</div>
                <div className="num" style={{ color: "var(--olive)" }}>{d.addRevenue > 0 ? `+${fmtKZT(d.addRevenue)}` : "—"}</div>
                <div className="num">{d.avgCheck > 0 ? fmtKZT(d.avgCheck) : "—"}</div>
                <div>
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, fontWeight: 600,
                    background: d.effective ? "#f0fdf4" : "#fef2f2", color: d.effective ? "var(--olive)" : "var(--red)" }}>
                    {d.effective ? "✓ Работает" : "✗ Убыток"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontWeight: 650 }}>Потери и списания</div>
            <span style={{ fontSize: 11, padding: "3px 10px", borderRadius: 999, background: "#fef2f2", color: "var(--red)", fontWeight: 600 }}>
              ⚠ Выше нормы на 18%
            </span>
          </div>
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            {LOSS_REASONS.map(r => (
              <div key={r.reason}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 5 }}>
                  <span style={{ color: "var(--ink-2)" }}>{r.reason}</span>
                  <span style={{ fontWeight: 650 }}>{fmtKZT(r.amount)}</span>
                </div>
                <div style={{ height: 6, background: "var(--bg-sunken)", borderRadius: 999, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${(r.amount / maxLossAmt) * 100}%`, background: "var(--red)", borderRadius: 999, opacity: 0.7 }} />
                </div>
              </div>
            ))}
            <div style={{ borderTop: "1px solid var(--line-1)", paddingTop: 10, marginTop: 4 }}>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 6, fontWeight: 600 }}>Топ-5 продуктов по списаниям</div>
              {LOSS_PRODUCTS.map((p, i) => (
                <div key={p.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "3px 0" }}>
                  <span style={{ color: "var(--ink-2)" }}>{i + 1}. {p.name}</span>
                  <span style={{ fontWeight: 600 }}>{fmtKZT(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── 12. Channels + 11. Guests ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 650 }}>Каналы продаж</div>
          <div style={{ padding: 14, display: "flex", gap: 16, alignItems: "flex-start" }}>
            <DonutChart segments={channels.map(c => ({ value: Math.round(c.rev), color: c.color, label: c.name }))} />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              {channels.map(c => (
                <div key={c.name} style={{ padding: 10, background: "var(--bg-sunken)", borderRadius: "var(--r)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                    <span style={{ fontWeight: 650, fontSize: 13 }}>{c.name}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-3)" }}>{((c.rev / chanTotal) * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                    {[
                      { k: "Выручка", v: fmtKZT(c.rev) },
                      { k: "Ср. чек", v: fmtKZT(c.avgChk) },
                      { k: "Маржа", v: `${c.margin}%` },
                    ].map(kv => (
                      <div key={kv.k}>
                        <div style={{ fontSize: 10, color: "var(--ink-4)" }}>{kv.k}</div>
                        <div style={{ fontSize: 12, fontWeight: 650 }}>{kv.v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 650 }}>Гости и лояльность</div>
          <div style={{ padding: 24, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, minHeight: 240 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--bg-sunken)", display: "grid", placeItems: "center", fontSize: 28 }}>👥</div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontWeight: 650, marginBottom: 6 }}>Аналитика гостей недоступна</div>
              <div style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 280 }}>
                Подключите программу лояльности, чтобы видеть новых и повторных гостей, LTV и частоту визитов
              </div>
            </div>
            <button className="btn sm" style={{ background: "var(--brand)", color: "#fff", border: 0 }}>Подключить лояльность</button>
          </div>
        </div>
      </div>

      {/* ── 14. Quick reports ── */}
      <div style={{ fontSize: 13, fontWeight: 650, color: "var(--ink-3)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>
        Быстрые отчёты
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {QUICK_REPORTS.map(r => (
          <button key={r.title} className="card" style={{
            padding: 16, textAlign: "left", cursor: "pointer", border: "1px solid var(--line-1)",
            background: "var(--bg-paper)", display: "flex", gap: 12, alignItems: "flex-start",
            transition: "box-shadow 0.15s",
          }}
          onMouseEnter={e => (e.currentTarget.style.boxShadow = "var(--shadow-md)")}
          onMouseLeave={e => (e.currentTarget.style.boxShadow = "")}
          >
            <div style={{ width: 36, height: 36, borderRadius: "var(--r)", background: "var(--brand-50,#dbeafe)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Icon name={r.icon} size={16} style={{ color: "var(--brand)" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 650, fontSize: 13, marginBottom: 2 }}>{r.title}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{r.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
