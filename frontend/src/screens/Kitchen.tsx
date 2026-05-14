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
  pending:     { warn: 3 * 60, late: 6 * 60 },
  in_progress: { warn: 12 * 60, late: 18 * 60 },
  ready:       { warn: 3 * 60, late: 6 * 60 },
} as Record<string, { warn: number; late: number }>;

// ─── KDS Card ─────────────────────────────────────────────────────────────────
// Collapsed: order #, table, timer, start time + action button
// Expanded:  + items list + customer note

function KDSCard({ order, onAction }: { order: Order; onAction: (id: number, status: string) => void }) {
  useTick();
  // Pending orders default open (cook needs to see what to prepare)
  // In-progress and ready default closed (just need the action button + timer)
  const [expanded, setExpanded] = useState(order.status === "pending");

  const elapsed = elapsedSec(order.created_at);
  const sla = SLA[order.status] ?? SLA.in_progress;
  const isLate = elapsed > sla.late;
  const isWarn = elapsed > sla.warn && !isLate;
  const urgent = order.priority === "urgent";

  const timerColor = isLate ? "var(--pri-urgent)" : isWarn ? "var(--amber)" : "var(--ink-2)";
  const borderLeftColor = urgent ? "var(--pri-urgent)" : isLate ? "var(--pri-urgent)" : isWarn ? "var(--amber)" : "var(--brand)";
  const outerBorder = isLate || urgent ? "var(--pri-urgent)" : "var(--line-1)";

  return (
    <div style={{
      background: "var(--bg-paper)",
      border: `1px solid ${outerBorder}`,
      borderLeft: `4px solid ${borderLeftColor}`,
      borderRadius: "var(--r)",
      boxShadow: "var(--sh-1)",
      overflow: "hidden",
    }}>

      {/* ── Header — always visible, click to expand/collapse ── */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: "10px 14px",
          display: "flex", alignItems: "center", gap: 10,
          cursor: "pointer", userSelect: "none",
          borderBottom: expanded ? "1px solid var(--line-1)" : "none",
        }}
      >
        {/* Left: order # + badges + table */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
              #{order.id}
            </span>
            {urgent && (
              <span className="badge" style={{ background: "var(--pri-urgent)", color: "white", borderColor: "var(--pri-urgent)", padding: "1px 6px", fontSize: 10 }}>
                <Icon name="fire" size={9} /> СРОЧНО
              </span>
            )}
            {order.priority === "high" && !urgent && (
              <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: "var(--amber-soft)", color: "var(--amber)" }}>
                Высокий
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {order.table
              ? <><b style={{ color: "var(--ink-2)" }}>Стол {order.table.number}</b> · {order.table.location}</>
              : `Стол #${order.table_id}`}
            {/* Item count hint when collapsed */}
            {!expanded && (
              <span style={{ marginLeft: 6, color: "var(--ink-4)" }}>
                · {order.items.reduce((s, i) => s + i.quantity, 0)} поз.
              </span>
            )}
          </div>
        </div>

        {/* Right: timer + chevron */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ textAlign: "right" }}>
            <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: timerColor, lineHeight: 1 }}>
              {fmtDuration(elapsed)}
            </div>
            <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>
              {fmtTime(order.created_at)}
            </div>
          </div>
          <div style={{ color: "var(--ink-4)", display: "flex" }}>
            <Icon name={expanded ? "up" : "down"} size={14} />
          </div>
        </div>
      </div>

      {/* ── Expandable: items + customer note ── */}
      {expanded && (
        <>
          <div style={{ padding: "6px 14px 8px" }}>
            {order.items.map((it, i) => (
              <div key={it.id} style={{ padding: "5px 0", borderBottom: i < order.items.length - 1 ? "1px dashed var(--line-1)" : "none" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div className="mono" style={{
                    minWidth: 28, height: 22, borderRadius: 4, background: "var(--bg-sunken)",
                    display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: "var(--ink-1)",
                    flexShrink: 0,
                  }}>×{it.quantity}</div>
                  <div style={{ flex: 1, fontWeight: 600, fontSize: 13.5, paddingTop: 2 }}>
                    {it.menu_item?.name ?? `#${it.menu_item_id}`}
                  </div>
                </div>
                {it.note && (
                  <div style={{ marginLeft: 36, marginTop: 3, fontSize: 11.5, color: "var(--amber)", fontWeight: 500, display: "flex", gap: 5, alignItems: "center" }}>
                    <Icon name="note" size={10} /> {it.note}
                  </div>
                )}
              </div>
            ))}
          </div>

          {order.customer_note && (
            <div style={{ margin: "0 14px 10px", padding: "5px 10px", background: "var(--amber-soft)", border: "1px solid var(--amber-line)", borderRadius: 4, fontSize: 12 }}>
              <span style={{ fontSize: 10, color: "var(--amber)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginRight: 6 }}>Внимание</span>
              {order.customer_note}
            </div>
          )}
        </>
      )}

      {/* ── Action button — always visible ── */}
      {order.status === "pending" && (
        <div style={{ padding: "8px 14px 10px", borderTop: expanded ? "1px solid var(--line-1)" : "none", background: "var(--st-progress-bg)" }}>
          <button
            className="btn primary block"
            style={{ minHeight: 42, fontWeight: 700, fontSize: 14 }}
            onClick={() => onAction(order.id, "in_progress")}
          >
            <Icon name="play" /> Начать готовку
          </button>
        </div>
      )}
      {order.status === "in_progress" && (
        <div style={{ padding: "8px 14px 10px", borderTop: expanded ? "1px solid var(--line-1)" : "none", background: "var(--st-ready-bg)" }}>
          <button
            className="btn success block"
            style={{ minHeight: 42, fontWeight: 700, fontSize: 14 }}
            onClick={() => onAction(order.id, "ready")}
          >
            <Icon name="check" /> Готово — к выдаче
          </button>
        </div>
      )}
      {order.status === "ready" && (
        <div style={{ padding: "8px 14px", borderTop: expanded ? "1px solid var(--line-1)" : "none", display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--st-served-fg)" }}>
          <Icon name="check" size={13} /> Ожидает официанта
        </div>
      )}
    </div>
  );
}

// ─── KDS Column ───────────────────────────────────────────────────────────────

const KDS_COLUMNS = [
  { status: "pending",     label: "Ожидает",   fg: "var(--st-pending-fg)",  bg: "var(--st-pending-bg)" },
  { status: "in_progress", label: "Готовится", fg: "var(--st-progress-fg)", bg: "var(--st-progress-bg)" },
  { status: "ready",       label: "К выдаче",  fg: "var(--st-ready-fg)",    bg: "var(--st-ready-bg)" },
];

// ─── KitchenDisplay ───────────────────────────────────────────────────────────

export function KitchenDisplay() {
  const { state, refreshKitchenBoard, changeStatus, toast } = useApp();
  const board = state.kitchenBoard;

  useEffect(() => {
    const id = setInterval(refreshKitchenBoard, 15000);
    return () => clearInterval(id);
  }, [refreshKitchenBoard]);

  const handleAction = async (orderId: number, status: string) => {
    try {
      await changeStatus(orderId, status as Order["status"]);
      await refreshKitchenBoard();
    } catch {
      toast("error", "Ошибка обновления статуса");
    }
  };

  const cols = KDS_COLUMNS.map(c => ({
    ...c,
    orders: (board?.[c.status as keyof typeof board] as Order[] | undefined) ?? [],
  }));

  const totalActive = cols.slice(0, 2).reduce((s, c) => s + c.orders.length, 0);
  const urgentCount = cols.slice(0, 2).flatMap(c => c.orders).filter(o => o.priority === "urgent").length;
  const readyToday = board?.metrics.find(m => m.key === "ready_today")?.value ?? 0;

  return (
    <>
      {/* Topbar */}
      <header className="topbar" style={{ height: 60 }}>
        <h1 style={{ fontSize: 18 }}>Дисплей кухни</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginLeft: 12, fontSize: 13, color: "var(--ink-3)" }}>
          <div><b style={{ color: "var(--ink-1)" }}>{totalActive}</b> в работе</div>
          {urgentCount > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--pri-urgent)" }}>
              <Icon name="fire" size={14} /> <b>{urgentCount}</b> срочных
            </div>
          )}
        </div>
        <div className="spacer" />
        <div className="conn"><span className="dot" /> Live</div>
        <button className="btn sm" onClick={refreshKitchenBoard}>
          <Icon name="sort" /> Обновить
        </button>
      </header>

      {/* Kanban */}
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12,
        padding: 16,
        height: "calc(100vh - 60px - 56px)",
        overflow: "hidden",
        background: "var(--bg-canvas)",
      }}>
        {cols.map(col => (
          <div key={col.status} style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>
            {/* Column header */}
            <div style={{
              padding: "10px 14px",
              background: col.bg, color: col.fg,
              borderRadius: "var(--r) var(--r) 0 0",
              border: `1px solid ${col.fg}`,
              borderBottom: "none",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontWeight: 600,
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: col.fg }} />
                {col.label}
              </span>
              <span className="num">{col.orders.length}</span>
            </div>
            {/* Column body — minHeight: 0 lets flex item shrink; scrollbar-gutter reserves fixed space */}
            <div style={{
              flex: 1, minHeight: 0,
              overflowY: "auto",
              scrollbarWidth: "thin" as React.CSSProperties["scrollbarWidth"],
              scrollbarGutter: "stable" as React.CSSProperties["scrollbarGutter"],
              padding: 10,
              background: "var(--bg-paper)",
              border: `1px solid ${col.fg}`,
              borderRadius: "0 0 var(--r) var(--r)",
              display: "flex", flexDirection: "column", gap: 8,
            }}>
              {col.orders.length ? col.orders.map(o => (
                <KDSCard key={o.id} order={o} onAction={handleAction} />
              )) : (
                <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--ink-4)", fontSize: 13, textAlign: "center", padding: 20 }}>
                  <div>
                    <Icon name="check" size={26} style={{ opacity: 0.4 }} />
                    <div style={{ marginTop: 6 }}>Нет заказов</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer stat bar */}
      <div style={{
        position: "fixed", bottom: 0, left: "var(--nav-w)", right: 0,
        height: 56, padding: "0 20px", background: "var(--bg-paper)",
        borderTop: "1px solid var(--line-1)",
        display: "flex", alignItems: "center", gap: 24, fontSize: 13,
      }}>
        <div><span style={{ color: "var(--ink-3)" }}>Готово сегодня</span> · <b className="num">{readyToday}</b></div>
        <div className="spacer" style={{ flex: 1 }} />
        <span style={{ color: "var(--ink-3)", fontSize: 11 }}>Подсказка: нажмите карточку чтобы изменить статус</span>
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
