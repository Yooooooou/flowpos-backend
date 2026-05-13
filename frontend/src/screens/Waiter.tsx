import { useState } from "react";
import { useApp } from "../lib/store";
import type { Order, TableOverview, TableStatus } from "../types";
import { Icon } from "../components/Icon";
import { StatusBadge, fmtKZT, fmtTime, TABLE_STATUS_LABEL, Modal } from "../components/UI";

// ─── WaiterTables ─────────────────────────────────────────────────────────────

interface SetRoute {
  (r: { id: string; tableId?: number; orderId?: number }): void;
}

export function WaiterTables({ setRoute }: { setRoute: SetRoute }) {
  const { state, refreshTables } = useApp();
  const [filter, setFilter] = useState<"all" | TableStatus>("all");
  const [search, setSearch] = useState("");
  const [openTableId, setOpenTableId] = useState<number | null>(null);

  const tables = state.tables.filter(t => {
    if (filter !== "all" && t.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return t.number.toLowerCase().includes(q) || (t.location ?? "").toLowerCase().includes(q);
    }
    return true;
  });

  const counts = { all: state.tables.length, free: 0, occupied: 0, reserved: 0, cleaning: 0 } as Record<string, number>;
  state.tables.forEach(t => counts[t.status]++);

  const openTable = openTableId != null ? state.tables.find(t => t.id === openTableId) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Столы</h2>
          <div className="sub">Касание стола откроет действия</div>
        </div>
        <div className="actions">
          <div className="segmented">
            {(["all", "free", "occupied", "reserved", "cleaning"] as const).map(s => (
              <div key={s} className={`seg ${filter === s ? "active" : ""}`} onClick={() => setFilter(s)}>
                {s === "all" ? "Все" : TABLE_STATUS_LABEL[s]}
                <span style={{ color: "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>{counts[s]}</span>
              </div>
            ))}
          </div>
          <div style={{ position: "relative" }}>
            <input
              className="input"
              placeholder="Поиск стола..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, minWidth: 180 }}
            />
            <Icon name="search" size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
          </div>
          <button className="btn sm" onClick={refreshTables}><Icon name="sort" />Обновить</button>
        </div>
      </div>

      <div className="page-body">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {tables.map(t => (
            <TableTile key={t.id} table={t} onClick={() => setOpenTableId(t.id)} />
          ))}
        </div>
        {!tables.length && (
          <div className="empty">
            <div className="empty-ico"><Icon name="tables" size={26} /></div>
            <h4>Нет столов по фильтру</h4>
            <p>Сбросьте фильтр или измените поиск.</p>
          </div>
        )}
      </div>

      {openTable && (
        <TableDetailModal
          table={openTable}
          orders={state.orders.filter(o => o.table_id === openTable.id)}
          onClose={() => setOpenTableId(null)}
          setRoute={setRoute}
        />
      )}
    </>
  );
}

// ─── TableTile ────────────────────────────────────────────────────────────────

function TableTile({ table, onClick }: { table: TableOverview; onClick: () => void }) {
  const sideColor: Record<TableStatus, string> = {
    free:     "var(--tb-free)",
    occupied: "var(--tb-occupied)",
    reserved: "var(--tb-reserved)",
    cleaning: "var(--tb-cleaning)",
  };
  const badgeStyle: Record<TableStatus, React.CSSProperties> = {
    free:     { background: "var(--olive-soft)",  color: "var(--olive)" },
    occupied: { background: "var(--brand-50)",    color: "var(--brand-700)" },
    reserved: { background: "var(--amber-soft)",  color: "var(--amber)" },
    cleaning: { background: "var(--bg-sunken)",   color: "var(--ink-2)" },
  };

  const minutesOpen = 0;

  return (
    <button
      onClick={onClick}
      style={{
        position: "relative", textAlign: "left",
        background: "var(--bg-paper)",
        border: "1px solid var(--line-1)",
        borderLeft: `4px solid ${sideColor[table.status]}`,
        borderRadius: "var(--r)",
        padding: "16px 16px 14px",
        cursor: "pointer", minHeight: 132,
        display: "flex", flexDirection: "column", gap: 8,
        boxShadow: "var(--sh-1)", color: "inherit",
        transition: "transform 120ms ease, box-shadow 120ms ease",
      }}
      onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "var(--sh-2)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "var(--sh-1)"; }}
    >
      <div style={{ display: "flex", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>Стол</div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1 }}>{table.number}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{table.seats} мест · {table.location || "Зал"}</div>
          <div style={{ marginTop: 6 }}>
            <span className="badge neutral" style={{ ...badgeStyle[table.status], borderColor: "transparent" }}>
              <span className="dot" />{TABLE_STATUS_LABEL[table.status]}
            </span>
          </div>
        </div>
      </div>

      {table.active_order_id ? (
        <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px dashed var(--line-1)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Заказ #{table.active_order_id}</span>
            <StatusBadge status={table.active_order_status ?? "pending"} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="num" style={{ fontWeight: 600 }}>{fmtKZT(table.active_order_total ?? 0)}</span>
            {minutesOpen > 0 && (
              <span className="mono" style={{ fontSize: 12, color: minutesOpen > 30 ? "var(--pri-urgent)" : "var(--ink-3)" }}>{minutesOpen}м</span>
            )}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: "auto", paddingTop: 10, borderTop: "1px dashed var(--line-1)", fontSize: 12, color: "var(--ink-4)" }}>
          {table.status === "free" ? "Готов принять гостей" : table.status === "reserved" ? "Забронирован" : table.status === "cleaning" ? "Идёт уборка" : "—"}
        </div>
      )}
    </button>
  );
}

// ─── TableDetailModal ─────────────────────────────────────────────────────────

function TableDetailModal({ table, orders, onClose, setRoute }: {
  table: TableOverview;
  orders: Order[];
  onClose: () => void;
  setRoute: SetRoute;
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
    <Modal
      title={`Стол ${table.number}`}
      sub={`${table.seats} мест · ${table.location || "Зал"}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Закрыть</button>
          <button
            className="btn primary"
            onClick={() => { onClose(); setRoute({ id: "w_order_create", tableId: table.id }); }}
          >
            <Icon name="plus" /> Новый заказ
          </button>
        </>
      }
    >
      {activeOrders.length === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13, background: "var(--bg-canvas)", borderRadius: "var(--r-sm)" }}>
          Нет активных заказов на этом столе
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {activeOrders.map(o => (
            <div key={o.id} style={{ padding: 12, border: "1px solid var(--line-1)", borderRadius: "var(--r-sm)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontWeight: 600 }}>#{o.id}</span>
                <StatusBadge status={o.status} />
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 8 }}>
                {o.items.length} позиций · {fmtKZT(o.total_amount)} · {fmtTime(o.created_at)}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn sm" onClick={() => { onClose(); setRoute({ id: "w_order_details", orderId: o.id }); }}>
                  <Icon name="edit" /> Открыть
                </button>
                {o.status === "ready" && (
                  <button className="btn success sm" onClick={() => handleStatus(o.id, "served")}>
                    <Icon name="check" /> Подан
                  </button>
                )}
                {o.status === "served" && (
                  <button className="btn primary sm" onClick={() => { onClose(); setRoute({ id: "w_payment", orderId: o.id }); }}>
                    <Icon name="card" /> Оплата
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ─── WaiterOrders ─────────────────────────────────────────────────────────────

export function WaiterOrders({ setRoute }: { setRoute: SetRoute }) {
  const { state, refreshOrders } = useApp();
  const [statusFilter, setStatusFilter] = useState("active");

  const orders = state.orders.filter(o => {
    if (statusFilter === "active") return !["paid", "cancelled"].includes(o.status);
    if (statusFilter === "ready")  return o.status === "ready";
    if (statusFilter === "served") return o.status === "served";
    if (statusFilter === "paid")   return o.status === "paid";
    return true;
  });

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Мои заказы</h2>
          <div className="sub">Управляйте активными заказами и оплатой</div>
        </div>
        <div className="actions">
          <div className="segmented">
            {[
              ["active",  "Активные"],
              ["ready",   "Готовы"],
              ["served",  "Поданы"],
              ["paid",    "Оплачены"],
              ["all",     "Все"],
            ].map(([k, l]) => (
              <div key={k} className={`seg ${statusFilter === k ? "active" : ""}`} onClick={() => setStatusFilter(k)}>{l}</div>
            ))}
          </div>
          <button className="btn sm" onClick={refreshOrders}><Icon name="sort" /></button>
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="list-head" style={{ gridTemplateColumns: "70px 80px 1.2fr 90px 110px 120px 130px" }}>
            <div>#</div><div>Стол</div><div>Позиции</div><div>Позиций</div><div>Создан</div><div>Сумма</div><div>Статус</div>
          </div>
          {orders.map(o => (
            <div
              key={o.id}
              className="list-row"
              style={{ gridTemplateColumns: "70px 80px 1.2fr 90px 110px 120px 130px", cursor: "pointer" }}
              onClick={() => setRoute({ id: "w_order_details", orderId: o.id })}
            >
              <div className="mono" style={{ fontWeight: 600 }}>#{o.id}</div>
              <div style={{ fontWeight: 600 }}>
                {o.table ? o.table.number : `#${o.table_id}`}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {o.items.slice(0, 2).map(i => `${i.quantity}× ${i.menu_item?.name ?? `#${i.menu_item_id}`}`).join(" · ")}
                {o.items.length > 2 && <span style={{ color: "var(--ink-3)" }}> +{o.items.length - 2}</span>}
              </div>
              <div style={{ color: "var(--ink-3)" }}>{o.items.reduce((s, i) => s + i.quantity, 0)} шт.</div>
              <div className="mono" style={{ fontSize: 12.5 }}>{fmtTime(o.created_at)}</div>
              <div className="num" style={{ fontWeight: 600 }}>{fmtKZT(o.total_amount)}</div>
              <div><StatusBadge status={o.status} /></div>
            </div>
          ))}
          {!orders.length && (
            <div className="empty" style={{ padding: 40 }}>
              <div className="empty-ico"><Icon name="orders" size={26} /></div>
              <h4>Нет заказов</h4>
              <p>Все заказы на этом фильтре закрыты.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
