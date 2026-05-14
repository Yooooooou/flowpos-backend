import { useState } from "react";
import { useApp } from "../lib/store";
import type { Order, TableOverview } from "../types";
import { dominantStatus } from "./TableSession";
import { Icon } from "../components/Icon";
import { StatusBadge, fmtKZT, fmtTime, TABLE_STATUS_LABEL } from "../components/UI";

// ─── WaiterTables ─────────────────────────────────────────────────────────────

interface SetRoute {
  (r: { id: string; tableId?: number; orderId?: number }): void;
}

function elapsedMin(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

export function WaiterTables({ setRoute }: { setRoute: SetRoute }) {
  const { state, refreshTables } = useApp();

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
        <button className="btn sm" onClick={refreshTables}><Icon name="sort" /> Обновить</button>
      </header>

      <div style={{
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

// ─── WaiterOrders ─────────────────────────────────────────────────────────────

export function WaiterOrders({ setRoute }: { setRoute: SetRoute }) {
  const { state, refreshOrders } = useApp();
  const [statusFilter, setStatusFilter] = useState("active");

  const filtered = state.orders.filter(o => {
    if (statusFilter === "active") return !["paid", "cancelled"].includes(o.status);
    if (statusFilter === "ready")  return o.status === "ready";
    if (statusFilter === "served") return o.status === "served";
    if (statusFilter === "paid")   return o.status === "paid";
    return true;
  });

  // Group by table for active orders; show individually for historical
  const groupByTable = ["active", "ready", "served"].includes(statusFilter);

  const rows: Order[][] = groupByTable
    ? Object.values(
        filtered.reduce((acc, o) => {
          const key = String(o.table_id);
          if (!acc[key]) acc[key] = [];
          acc[key].push(o);
          return acc;
        }, {} as Record<string, Order[]>)
      ).sort((a, b) => new Date(b[0].created_at).getTime() - new Date(a[0].created_at).getTime())
    : filtered.map(o => [o]);

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
          <div className="list-head" style={{ gridTemplateColumns: "80px 80px 1.2fr 90px 110px 120px 130px" }}>
            <div>Стол</div><div>Заказов</div><div>Позиции</div><div>Позиций</div><div>Создан</div><div>Сумма</div><div>Статус</div>
          </div>
          {rows.map(tableOrders => {
            const first = tableOrders[0];
            const tableNum = first.table ? first.table.number : `#${first.table_id}`;
            const allItems = tableOrders.flatMap(o => o.items);
            const total = tableOrders.reduce((s, o) => s + parseFloat(o.total_amount), 0);
            const status = groupByTable ? dominantStatus(tableOrders) : first.status;
            const onClick = groupByTable
              ? () => setRoute({ id: "w_table_session", tableId: first.table_id })
              : () => setRoute({ id: "w_order_details", orderId: first.id });
            return (
              <div
                key={`${first.table_id}-${first.id}`}
                className="list-row"
                style={{ gridTemplateColumns: "80px 80px 1.2fr 90px 110px 120px 130px", cursor: "pointer" }}
                onClick={onClick}
              >
                <div style={{ fontWeight: 700 }}>{tableNum}</div>
                <div style={{ color: "var(--ink-3)" }}>
                  {tableOrders.length > 1 ? `${tableOrders.length} зак.` : `#${first.id}`}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {allItems.slice(0, 2).map(i => `${i.quantity}× ${i.menu_item?.name ?? `#${i.menu_item_id}`}`).join(" · ")}
                  {allItems.length > 2 && <span style={{ color: "var(--ink-3)" }}> +{allItems.length - 2}</span>}
                </div>
                <div style={{ color: "var(--ink-3)" }}>{allItems.reduce((s, i) => s + i.quantity, 0)} шт.</div>
                <div className="mono" style={{ fontSize: 12.5 }}>{fmtTime(first.created_at)}</div>
                <div className="num" style={{ fontWeight: 600 }}>{fmtKZT(total)}</div>
                <div><StatusBadge status={status} /></div>
              </div>
            );
          })}
          {!rows.length && (
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
