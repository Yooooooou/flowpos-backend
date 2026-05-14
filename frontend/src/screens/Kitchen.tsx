import { useCallback, useEffect, useState } from "react";
import { useApp } from "../lib/store";
import { api } from "../lib/api";
import type { Order } from "../types";
import { Icon } from "../components/Icon";
import { StatusBadge, fmtTime } from "../components/UI";

function useTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
}

function elapsedSec(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
}

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const SLA = {
  pending:     { warn: 3 * 60,  late: 6 * 60 },
  in_progress: { warn: 12 * 60, late: 18 * 60 },
  ready:       { warn: 3 * 60,  late: 6 * 60 },
} as Record<string, { warn: number; late: number }>;

// ─── KDS Card ─────────────────────────────────────────────────────────────────

function KDSCard({ order, onAction }: { order: Order; onAction: (id: number, status: string) => void }) {
  useTick();
  const [expanded, setExpanded] = useState(true);

  const elapsed = elapsedSec(order.created_at);
  const sla = SLA[order.status] ?? SLA.in_progress;
  const isLate = elapsed > sla.late;
  const isWarn = elapsed > sla.warn && !isLate;
  const urgent = order.priority === "urgent";

  const timerColor = isLate ? "var(--pri-urgent)" : isWarn ? "var(--amber)" : "var(--ink-2)";
  const accentColor = urgent ? "var(--pri-urgent)" : isLate ? "var(--pri-urgent)" : isWarn ? "var(--amber)" : "var(--brand)";
  const cardBorder = urgent || isLate ? "var(--pri-urgent)" : isWarn ? "var(--amber)" : "var(--line-1)";

  return (
    <div style={{
      background: "var(--bg-paper)",
      border: `1px solid ${cardBorder}`,
      borderLeft: `4px solid ${accentColor}`,
      borderRadius: "var(--r)",
      boxShadow: urgent || isLate ? "0 2px 12px rgba(220,50,50,0.12)" : "var(--sh-1)",
      overflow: "hidden",
    }}>

      {/* Header — clickable to collapse/expand */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: "12px 14px",
          display: "flex", alignItems: "center", gap: 10,
          cursor: "pointer",
          userSelect: "none",
          background: expanded ? "transparent" : "var(--bg-canvas)",
        }}
      >
        {/* Left: order # + badges + table */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 5, marginBottom: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>#{order.id}</span>
            {urgent && (
              <span style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 3, background: "var(--pri-urgent)", color: "#fff", letterSpacing: "0.05em" }}>
                СРОЧНО
              </span>
            )}
            {order.priority === "high" && !urgent && (
              <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: "var(--amber-soft)", color: "var(--amber)" }}>
                Высокий
              </span>
            )}
            {!expanded && (
              <span style={{ fontSize: 11, color: "var(--ink-4)", fontWeight: 500 }}>
                · {order.items.length} поз.
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
            {order.table
              ? <><b style={{ color: "var(--ink-2)" }}>Стол {order.table.number}</b>{order.table.location ? ` · ${order.table.location}` : ""}</>
              : `Стол #${order.table_id}`}
          </div>
        </div>

        {/* Right: timer + time + chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: timerColor, lineHeight: 1 }}>
              {fmtDuration(elapsed)}
            </div>
            <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 1 }}>{fmtTime(order.created_at)}</div>
          </div>
          <Icon name={expanded ? "up" : "down"} size={16} style={{ color: "var(--ink-4)", flexShrink: 0 }} />
        </div>
      </div>

      {/* Expandable body */}
      {expanded && (
        <>
          {/* Items */}
          <div style={{ borderTop: "1px solid var(--line-1)", padding: "8px 14px" }}>
            {order.items.map((it, i) => (
              <div key={it.id} style={{
                padding: "5px 0",
                borderBottom: i < order.items.length - 1 ? "1px dashed var(--line-1)" : "none",
              }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span className="mono" style={{ minWidth: 26, fontSize: 13, fontWeight: 700, color: "var(--brand)", flexShrink: 0 }}>
                    ×{it.quantity}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
                    {it.menu_item?.name ?? `#${it.menu_item_id}`}
                  </span>
                </div>
                {it.note && (
                  <div style={{ marginLeft: 36, marginTop: 3, fontSize: 12, color: "var(--amber)", fontWeight: 500, display: "flex", gap: 4, alignItems: "center" }}>
                    <Icon name="note" size={11} /> {it.note}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Customer note */}
          {order.customer_note && (
            <div style={{
              padding: "8px 14px",
              background: "var(--amber-soft)",
              borderTop: "1px solid var(--amber-line)",
              fontSize: 12.5, color: "var(--amber)", display: "flex", gap: 6, alignItems: "flex-start",
            }}>
              <Icon name="warning" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontWeight: 500 }}>{order.customer_note}</span>
            </div>
          )}

          {/* Action button — large & bright */}
          {order.status === "pending" && (
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line-1)" }}>
              <button
                className="btn primary"
                style={{ width: "100%", minHeight: 52, fontSize: 15, fontWeight: 700, borderRadius: "var(--r)", justifyContent: "center", gap: 8 }}
                onClick={e => { e.stopPropagation(); onAction(order.id, "in_progress"); }}
              >
                <Icon name="play" size={18} /> Начать готовку
              </button>
            </div>
          )}
          {order.status === "in_progress" && (
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line-1)" }}>
              <button
                className="btn success"
                style={{ width: "100%", minHeight: 52, fontSize: 15, fontWeight: 700, borderRadius: "var(--r)", justifyContent: "center", gap: 8 }}
                onClick={e => { e.stopPropagation(); onAction(order.id, "ready"); }}
              >
                <Icon name="check" size={18} /> Готово — к выдаче
              </button>
            </div>
          )}
          {order.status === "ready" && (
            <div style={{
              padding: "10px 14px", borderTop: "1px solid var(--line-1)",
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 13, fontWeight: 600, color: "var(--st-served-fg)",
              background: "var(--st-ready-bg)",
            }}>
              <Icon name="check" size={15} /> Ожидает официанта
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const KDS_TABS = [
  { status: "pending",     label: "Ожидает",   fg: "var(--st-pending-fg)",  bg: "var(--st-pending-bg)" },
  { status: "in_progress", label: "Готовится", fg: "var(--st-progress-fg)", bg: "var(--st-progress-bg)" },
  { status: "ready",       label: "К выдаче",  fg: "var(--st-ready-fg)",    bg: "var(--st-ready-bg)" },
];

// ─── KitchenDisplay ───────────────────────────────────────────────────────────

export function KitchenDisplay() {
  const { state, refreshKitchenBoard, changeStatus, toast } = useApp();
  const board = state.kitchenBoard;
  const [activeTab, setActiveTab] = useState("in_progress");

  useEffect(() => {
    const id = setInterval(refreshKitchenBoard, 15000);
    return () => clearInterval(id);
  }, [refreshKitchenBoard]);

  const handleAction = async (orderId: number, status: string) => {
    try {
      await changeStatus(orderId, status as Order["status"]);
      await refreshKitchenBoard();
      // auto-switch to next tab if queue emptied
    } catch {
      toast("error", "Ошибка обновления статуса");
    }
  };

  const tabs = KDS_TABS.map(t => ({
    ...t,
    orders: (board?.[t.status as keyof typeof board] as Order[] | undefined) ?? [],
  }));

  const activeTabData = tabs.find(t => t.status === activeTab) ?? tabs[1];
  const urgentCount = tabs.flatMap(t => t.orders).filter(o => o.priority === "urgent").length;
  const readyToday = board?.metrics.find(m => m.key === "ready_today")?.value ?? 0;

  return (
    <>
      {/* Topbar */}
      <header className="topbar" style={{ height: 60 }}>
        <h1 style={{ fontSize: 18 }}>Дисплей кухни</h1>
        {urgentCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 14, fontSize: 13, color: "var(--pri-urgent)", fontWeight: 600 }}>
            <Icon name="fire" size={15} /> {urgentCount} срочных
          </div>
        )}
        <div className="spacer" />
        <div className="conn"><span className="dot" /> Live</div>
        <button className="btn sm" onClick={refreshKitchenBoard}>
          <Icon name="sort" /> Обновить
        </button>
      </header>

      {/* Body: sidebar tabs + order list */}
      <div style={{
        display: "flex",
        height: "calc(100vh - 60px)",
        background: "var(--bg-canvas)",
        overflow: "hidden",
      }}>

        {/* ── Left sidebar: status tabs ── */}
        <div style={{
          width: 190,
          flexShrink: 0,
          borderRight: "1px solid var(--line-1)",
          background: "var(--bg-paper)",
          display: "flex",
          flexDirection: "column",
          padding: "12px 10px",
          gap: 4,
        }}>
          {tabs.map(tab => {
            const active = activeTab === tab.status;
            const hasUrgent = tab.orders.some(o => o.priority === "urgent");
            return (
              <button
                key={tab.status}
                onClick={() => setActiveTab(tab.status)}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "13px 14px",
                  borderRadius: "var(--r)",
                  border: active ? `1.5px solid ${tab.fg}` : "1.5px solid transparent",
                  cursor: "pointer",
                  background: active ? tab.bg : "transparent",
                  color: active ? tab.fg : "var(--ink-2)",
                  fontWeight: active ? 700 : 500,
                  fontSize: 14,
                  transition: "all 0.15s",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  {hasUrgent && <Icon name="fire" size={13} style={{ color: "var(--pri-urgent)" }} />}
                  <span>{tab.label}</span>
                </div>
                <span style={{
                  minWidth: 24, height: 24, borderRadius: 12,
                  background: active ? tab.fg : "var(--line-2)",
                  color: active ? "#fff" : "var(--ink-3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 700,
                }}>
                  {tab.orders.length}
                </span>
              </button>
            );
          })}

          <div style={{ flex: 1 }} />

          <div style={{
            padding: "10px 14px",
            borderTop: "1px solid var(--line-1)",
            fontSize: 12, color: "var(--ink-3)",
            textAlign: "center",
          }}>
            Готово сегодня<br />
            <b className="num" style={{ fontSize: 20, color: "var(--ink-1)" }}>{readyToday}</b>
          </div>
        </div>

        {/* ── Right: scrollable card list ── */}
        <div style={{
          flex: 1,
          minWidth: 0,
          overflowY: "auto",
          scrollbarWidth: "thin" as React.CSSProperties["scrollbarWidth"],
          padding: "14px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>
          {/* Section header */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            paddingBottom: 6,
            borderBottom: `2px solid ${activeTabData.fg}`,
          }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: activeTabData.fg }}>
              {activeTabData.label}
            </span>
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
              {activeTabData.orders.length} заказов
            </span>
          </div>

          {activeTabData.orders.length ? activeTabData.orders.map(o => (
            <KDSCard key={o.id} order={o} onAction={handleAction} />
          )) : (
            <div style={{
              flex: 1, display: "grid", placeItems: "center",
              color: "var(--ink-4)", textAlign: "center", padding: 60,
            }}>
              <div>
                <Icon name="check" size={32} style={{ opacity: 0.3 }} />
                <div style={{ marginTop: 10, fontSize: 14 }}>Нет заказов</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── KitchenHistory ───────────────────────────────────────────────────────────

export function KitchenHistory() {
  const { state } = useApp();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!state.token) return;
    setLoading(true);
    try {
      const data = await api.orders(state.token, { include_completed: true, limit: 60 });
      setOrders(data.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
    } finally {
      setLoading(false);
    }
  }, [state.token]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>История</h2>
          <div className="sub">Все заказы прошедшие через кухню</div>
        </div>
        <div className="actions">
          <button className="btn sm" onClick={load} disabled={loading}>
            <Icon name="sort" /> {loading ? "Загрузка..." : "Обновить"}
          </button>
        </div>
      </div>
      <div className="page-body">
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="list-head" style={{ gridTemplateColumns: "70px 80px 1fr 120px 110px" }}>
            <div>#</div><div>Стол</div><div>Позиции</div><div>Статус</div><div>Готово в</div>
          </div>
          {orders.map(o => (
            <div key={o.id} className="list-row" style={{ gridTemplateColumns: "70px 80px 1fr 120px 110px" }}>
              <div className="mono" style={{ fontWeight: 600 }}>#{o.id}</div>
              <div>{o.table ? `Стол ${o.table.number}` : `#${o.table_id}`}</div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {o.items.map(i => `${i.quantity}× ${i.menu_item?.name ?? `#${i.menu_item_id}`}`).join(", ")}
              </div>
              <div><StatusBadge status={o.status} /></div>
              <div className="mono" style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                {o.ready_at ? fmtTime(o.ready_at) : "—"}
              </div>
            </div>
          ))}
          {!loading && !orders.length && (
            <div className="empty" style={{ padding: 40 }}>
              <div className="empty-ico"><Icon name="clock" size={26} /></div>
              <h4>История пуста</h4>
              <p>Заказы появятся здесь после приготовления.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
