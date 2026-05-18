import { useCallback, useEffect, useState } from "react";
import { useApp } from "../lib/store";
import { api } from "../lib/api";
import type { Order } from "../types";
import { Icon } from "../components/Icon";
import { StatusBadge, fmtTime, Modal } from "../components/UI";
import { OrderDetailModal } from "./Waiter";

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
// Fills 100% of its snap-page. Items grow to fill space; action button pinned bottom.

function KDSCard({ order, onAction, onItemAction, onCancelRequest }: {
  order: Order;
  onAction: (id: number, status: string) => void;
  onItemAction: (orderId: number, itemId: number, status: string) => void;
  onCancelRequest: (id: number) => void;
}) {
  useTick();

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
      flexShrink: 0,          // prevent flex parent from squishing the card
      background: "var(--bg-paper)",
      border: `1px solid ${cardBorder}`,
      borderLeft: `4px solid ${accentColor}`,
      borderRadius: "var(--r)",
      boxShadow: urgent || isLate ? "0 2px 10px rgba(220,50,50,0.12)" : "var(--sh-1)",
      overflow: "hidden",
    }}>

      {/* Header — pinned top */}
      <div style={{
        flexShrink: 0,
        padding: "14px 16px 12px",
        borderBottom: "1px solid var(--line-1)",
        display: "flex", alignItems: "flex-start", gap: 10,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>#{order.id}</span>
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
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            {order.table
              ? <><b style={{ color: "var(--ink-2)" }}>Стол {order.table.number}</b>{order.table.location ? ` · ${order.table.location}` : ""}</>
              : `Стол #${order.table_id}`}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="mono" style={{ fontSize: 26, fontWeight: 700, color: timerColor, lineHeight: 1 }}>
            {fmtDuration(elapsed)}
          </div>
          <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 3 }}>{fmtTime(order.created_at)}</div>
        </div>
      </div>

      {/* Items */}
      <div style={{ padding: "10px 16px" }}>
        {order.items.map((it, i) => (
          <div key={it.id} style={{
            padding: "7px 0",
            borderBottom: i < order.items.length - 1 ? "1px dashed var(--line-1)" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {order.status === "in_progress" && (
                <button
                  onClick={() => onItemAction(order.id, it.id, it.status === "ready" ? "pending" : "ready")}
                  style={{
                    width: 24, height: 24, borderRadius: 4, flexShrink: 0,
                    background: it.status === "ready" ? "var(--olive)" : "transparent",
                    border: `2px solid ${it.status === "ready" ? "var(--olive)" : "var(--line-2)"}`,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 120ms",
                  }}
                >
                  {it.status === "ready" && <Icon name="check" size={13} style={{ color: "#fff" }} />}
                </button>
              )}
              <span className="mono" style={{ minWidth: 28, fontSize: 14, fontWeight: 700, color: it.status === "ready" ? "var(--olive)" : "var(--brand)", flexShrink: 0 }}>
                ×{it.quantity}
              </span>
              <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3, textDecoration: it.status === "ready" ? "line-through" : "none", color: it.status === "ready" ? "var(--ink-3)" : "inherit" }}>
                {it.menu_item?.name ?? `#${it.menu_item_id}`}
              </span>
            </div>
            {it.note && (
              <div style={{ marginLeft: order.status === "in_progress" ? 72 : 38, marginTop: 4, fontSize: 12, color: "var(--amber)", fontWeight: 500, display: "flex", gap: 5, alignItems: "center" }}>
                <Icon name="note" size={11} /> {it.note}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Customer note — pinned above button */}
      {order.customer_note && (
        <div style={{
          flexShrink: 0,
          padding: "8px 16px",
          background: "var(--amber-soft)",
          borderTop: "1px solid var(--amber-line)",
          fontSize: 12.5, color: "var(--amber)", display: "flex", gap: 6, alignItems: "flex-start",
        }}>
          <Icon name="warning" size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontWeight: 500 }}>{order.customer_note}</span>
        </div>
      )}

      {/* Action — pinned bottom, large touch target */}
      <div style={{ flexShrink: 0, padding: "12px 16px", borderTop: "1px solid var(--line-1)", display: "flex", flexDirection: "column", gap: 8 }}>
        {order.status === "pending" && (
          <button
            className="btn primary"
            style={{ width: "100%", minHeight: 54, fontSize: 15, fontWeight: 700, justifyContent: "center", gap: 8, borderRadius: "var(--r)" }}
            onClick={() => onAction(order.id, "in_progress")}
          >
            <Icon name="play" size={18} /> Начать готовку
          </button>
        )}
        {order.status === "in_progress" && (
          <button
            className="btn success"
            style={{ width: "100%", minHeight: 54, fontSize: 15, fontWeight: 700, justifyContent: "center", gap: 8, borderRadius: "var(--r)" }}
            onClick={() => onAction(order.id, "ready")}
          >
            <Icon name="check" size={18} /> Готово — к выдаче
          </button>
        )}
        {order.status === "ready" && (
          <div style={{
            minHeight: 54, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            background: "var(--st-ready-bg)", borderRadius: "var(--r)",
            fontSize: 14, fontWeight: 600, color: "var(--st-ready-fg)",
          }}>
            <Icon name="check" size={16} /> Ожидает официанта
          </div>
        )}
        {(order.status === "pending" || order.status === "in_progress") && (
          <button
            className="btn ghost"
            style={{ width: "100%", justifyContent: "center", gap: 6, fontSize: 13, color: "var(--red, #e03)" }}
            onClick={() => onCancelRequest(order.id)}
          >
            <Icon name="close" size={14} /> Отменить заказ
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Column config ────────────────────────────────────────────────────────────

const KDS_COLUMNS = [
  { status: "pending",     label: "Ожидает",   fg: "var(--st-pending-fg)",  bg: "var(--st-pending-bg)" },
  { status: "in_progress", label: "Готовится", fg: "var(--st-progress-fg)", bg: "var(--st-progress-bg)" },
  { status: "ready",       label: "К выдаче",  fg: "var(--st-ready-fg)",    bg: "var(--st-ready-bg)" },
];

// ─── KitchenDisplay ───────────────────────────────────────────────────────────

export function KitchenDisplay() {
  const { state, changeStatus, upsertKitchenOrder, updateItemStatus, toast } = useApp();
  const board = state.kitchenBoard;
  const [cancelPending, setCancelPending] = useState<{ orderId: number; reason: string } | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Kitchen board is kept live by WebSocket events; no polling needed

  const handleAction = async (orderId: number, status: string) => {
    try {
      const updated = await changeStatus(orderId, status as Order["status"]);
      upsertKitchenOrder(updated);
    } catch {
      toast("error", "Ошибка обновления статуса");
    }
  };

  const handleItemAction = async (orderId: number, itemId: number, status: string) => {
    try {
      await updateItemStatus(orderId, itemId, status);
    } catch {
      toast("error", "Ошибка обновления позиции");
    }
  };

  const handleCancelRequest = (orderId: number) => {
    setCancelPending({ orderId, reason: "" });
  };

  const confirmCancel = async () => {
    if (!cancelPending || !cancelPending.reason.trim()) return;
    setCancelling(true);
    try {
      const updated = await changeStatus(cancelPending.orderId, "cancelled" as Order["status"], cancelPending.reason.trim());
      upsertKitchenOrder(updated);
      toast("info", `Заказ #${cancelPending.orderId} отменён`);
      setCancelPending(null);
    } catch {
      toast("error", "Ошибка отмены заказа");
    } finally {
      setCancelling(false);
    }
  };

  const cols = KDS_COLUMNS.map(c => ({
    ...c,
    orders: (board?.[c.status as keyof typeof board] as Order[] | undefined) ?? [],
  }));

  const urgentCount = cols.flatMap(c => c.orders).filter(o => o.priority === "urgent").length;
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
        <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
          Готово сегодня: <b className="num" style={{ color: "var(--ink-1)" }}>{readyToday}</b>
        </span>
        <div className="conn"><span className="dot" /> Live</div>
      </header>

      {cancelPending && (
        <Modal
          title={`Отмена заказа #${cancelPending.orderId}`}
          onClose={() => !cancelling && setCancelPending(null)}
          footer={<>
            <button className="btn ghost" onClick={() => setCancelPending(null)} disabled={cancelling}>Назад</button>
            <button
              className="btn"
              style={{ background: "var(--red, #e03)", color: "#fff", opacity: cancelPending.reason.trim() ? 1 : 0.5 }}
              onClick={confirmCancel}
              disabled={!cancelPending.reason.trim() || cancelling}
            >
              {cancelling ? <><span className="spin" /> Отмена...</> : <><Icon name="close" size={14} /> Подтвердить отмену</>}
            </button>
          </>}
          width={420}
        >
          <p style={{ margin: "0 0 12px", color: "var(--ink-2)", fontSize: 14 }}>
            Укажите причину — официант и менеджер увидят её в заказе.
          </p>
          <textarea
            className="input"
            rows={3}
            placeholder='Напр. "Гость ушёл", "Нет ингредиентов", "Ошибка заказа"...'
            value={cancelPending.reason}
            onChange={e => setCancelPending(prev => prev ? { ...prev, reason: e.target.value } : null)}
            autoFocus
            style={{ width: "100%", resize: "vertical", fontFamily: "inherit" }}
          />
          {!cancelPending.reason.trim() && (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--red, #e03)" }}>
              Причина обязательна
            </div>
          )}
        </Modal>
      )}

      {/* 3-column kanban */}
      <div className="kds-canvas" style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 12,
        padding: 12,
        height: "calc(100vh - 60px)",
        overflow: "hidden",
        background: "var(--bg-canvas)",
      }}>
        {cols.map(col => (
          <div key={col.status} style={{
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            overflow: "hidden",
          }}>

            {/* Column header */}
            <div style={{
              flexShrink: 0,
              padding: "10px 14px",
              background: col.bg,
              color: col.fg,
              borderRadius: "var(--r) var(--r) 0 0",
              border: `1px solid ${col.fg}`,
              borderBottom: "none",
              display: "flex", alignItems: "center", justifyContent: "space-between",
              fontWeight: 600, fontSize: 14,
            }}>
              <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: col.fg, flexShrink: 0 }} />
                {col.label}
              </span>
              <span className="num" style={{ fontSize: 15, fontWeight: 700 }}>{col.orders.length}</span>
            </div>

            {/* Column body — scrollable list of full cards */}
            <div style={{
              flex: 1,
              minHeight: 0,
              overflowY: "auto",
              scrollbarWidth: "thin" as React.CSSProperties["scrollbarWidth"],
              display: "flex",
              flexDirection: "column",
              gap: 8,
              padding: 8,
              background: "var(--bg-canvas)",
              border: `1px solid ${col.fg}`,
              borderRadius: "0 0 var(--r) var(--r)",
            }}>
              {col.orders.length ? col.orders.map(o => (
                <KDSCard key={o.id} order={o} onAction={handleAction} onItemAction={handleItemAction} onCancelRequest={handleCancelRequest} />
              )) : (
                <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--ink-4)", textAlign: "center" }}>
                  <div>
                    <Icon name="check" size={30} style={{ opacity: 0.3 }} />
                    <div style={{ marginTop: 10, fontSize: 13 }}>Нет заказов</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ─── KitchenHistory ───────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "time_desc",  label: "Новые сначала" },
  { value: "time_asc",   label: "Старые сначала" },
  { value: "table_asc",  label: "По столу (А→Я)" },
  { value: "table_desc", label: "По столу (Я→А)" },
  { value: "status",     label: "По статусу" },
] as const;

const STATUS_OPTIONS = [
  { value: "all",         label: "Все статусы" },
  { value: "pending",     label: "Ожидает" },
  { value: "in_progress", label: "Готовится" },
  { value: "ready",       label: "К выдаче" },
  { value: "served",      label: "Подано" },
  { value: "paid",        label: "Оплачен" },
  { value: "cancelled",   label: "Отменён" },
];

export function KitchenHistory() {
  const { state } = useApp();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<typeof SORT_OPTIONS[number]["value"]>("time_desc");
  const [page, setPage] = useState(1);
  const [detailOrder, setDetailOrder] = useState<Order | null>(null);

  const load = useCallback(async () => {
    if (!state.token) return;
    setLoading(true);
    try {
      const data = await api.orders(state.token, { include_completed: true, limit: 200 });
      setOrders(data);
    } finally {
      setLoading(false);
    }
  }, [state.token]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, statusFilter, sortBy]);

  const filtered = orders.filter(o => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
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
      default:         return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const paginated = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = search !== "" || statusFilter !== "all";

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
      <div className="page-head">
        <div>
          <h2>История</h2>
          <div className="sub">Все заказы прошедшие через кухню</div>
        </div>
        <div className="actions">
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
        <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 150 }}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className="input" value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={{ width: 170 }}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: "var(--ink-4)", whiteSpace: "nowrap" }}>
          {filtered.length} {filtered.length === 1 ? "заказ" : "заказов"}
        </span>
      </div>

      <div className="page-body">
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="list-head" style={{ gridTemplateColumns: "70px 80px 1fr 120px 110px" }}>
            <div>#</div><div>Стол</div><div>Позиции</div><div>Статус</div><div>Готово в</div>
          </div>
          {paginated.map(o => (
            <div
              key={o.id}
              className="list-row"
              style={{ gridTemplateColumns: "70px 80px 1fr 120px 110px", cursor: "pointer" }}
              onClick={() => setDetailOrder(o)}
            >
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
          {!loading && !paginated.length && (
            <div className="empty" style={{ padding: 40 }}>
              <div className="empty-ico"><Icon name="clock" size={26} /></div>
              <h4>{hasFilters ? "Ничего не найдено" : "История пуста"}</h4>
              <p>{hasFilters ? "Попробуйте изменить фильтры." : "Заказы появятся здесь после приготовления."}</p>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 16, fontSize: 13 }}>
            <button className="btn sm" onClick={() => setPage(1)} disabled={page === 1}>«</button>
            <button className="btn sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹ Назад</button>
            <span style={{ color: "var(--ink-3)", padding: "0 8px" }}>
              Стр. <b>{page}</b> из <b>{totalPages}</b>
            </span>
            <button className="btn sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>Вперёд ›</button>
            <button className="btn sm" onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
          </div>
        )}
      </div>

      {detailOrder && (
        <OrderDetailModal
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
        />
      )}
    </div>
  );
}
