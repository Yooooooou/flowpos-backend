import React, { useState } from "react";
import { useApp } from "../lib/store";
import type { MenuItem, Order, Table } from "../types";
import { Icon } from "../components/Icon";
import { StatusBadge, fmtKZT, fmtTime, Modal } from "../components/UI";

interface CartItem {
  menu_item_id: number;
  name: string;
  quantity: number;
  unit_price: number;
  note: string;
}

function elapsedMin(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

const RECEIPT_VENUE   = "Ресторан";
const RECEIPT_SERVICE = 0.10; // 10% service charge shown on receipt

function buildReceiptHtml(orders: Order[], table: Table | null | undefined, now: Date, svcRate: number): string {
  const items   = orders.flatMap(o => o.items);
  const sub     = orders.reduce((s, o) => s + parseFloat(o.total_amount), 0);
  const svc     = Math.round(sub * svcRate * 100) / 100;
  const grand   = sub + svc;
  const fmt     = (n: number) => n.toLocaleString("ru-RU") + " ₸";
  const dateStr = now.toLocaleDateString("ru-RU");
  const timeStr = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });

  const rows = items.map(it => `
    <tr>
      <td>${it.menu_item?.name ?? `#${it.menu_item_id}`}${it.note ? `<br><small style="color:#666">${it.note}</small>` : ""}</td>
      <td class="r">${it.quantity}</td>
      <td class="r">${fmt(parseFloat(it.unit_price))}</td>
      <td class="r">${fmt(parseFloat(it.line_total))}</td>
    </tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${RECEIPT_VENUE} — Чек #${orders.map(o => o.id).join(", ")}</title>
<style>
  @page { size: 80mm auto; margin: 6mm; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Courier New',monospace;font-size:11px;max-width:280px;margin:0 auto}
  .c{text-align:center} .r{text-align:right}
  .sep{width:100%;border:none;border-top:1px dashed #000;margin:5px 0}
  .hd{font-size:15px;font-weight:bold;text-align:center;margin-bottom:2px}
  table{width:100%;border-collapse:collapse}
  .it th{border-top:1px dashed #000;border-bottom:1px dashed #000;padding:2px 0;font-size:10px}
  .it td{padding:2px 0;vertical-align:top}
  .it th.r,.it td.r{text-align:right}
  .tot td{padding:1px 0} .tot td.r{text-align:right}
  .grand td{font-weight:bold;font-size:13px;border-top:1px solid #000;padding-top:3px}
  .ft{font-size:9px;text-align:center;margin-top:8px;color:#555;line-height:1.5}
</style></head><body>
<div class="hd">${RECEIPT_VENUE.toUpperCase()}</div>
<hr class="sep">
<table>
  <tr><td>Чек #${orders.map(o => o.id).join(", ")}</td><td class="r">Стол ${table?.number ?? "—"}</td></tr>
  <tr><td>${dateStr}</td><td class="r">${timeStr}</td></tr>
  ${orders[0]?.waiter ? `<tr><td colspan="2">Официант: ${orders[0].waiter.full_name}</td></tr>` : ""}
</table>
<hr class="sep">
<table class="it">
  <thead><tr>
    <th style="width:50%;text-align:left">Блюдо</th>
    <th class="r" style="width:10%">Кол</th>
    <th class="r" style="width:18%">Цена</th>
    <th class="r" style="width:22%">Сумма</th>
  </tr></thead>
  <tbody>${rows}</tbody>
</table>
<hr class="sep">
<table class="tot">
  <tr><td>Всего:</td><td class="r">${fmt(sub)}</td></tr>
  ${svc > 0 ? `<tr><td>Обслуживание (${svcRate * 100}%):</td><td class="r">${fmt(svc)}</td></tr>` : ""}
</table>
<table class="tot"><tr class="grand"><td>Итого к оплате:</td><td class="r">${fmt(grand)}</td></tr></table>
<hr class="sep">
<div class="ft">Вознаграждение официанту приветствуется,<br>но всегда остаётся на Ваше усмотрение.</div>
</body></html>`;
}

function ReceiptPreviewModal({ orders, table, svcRate, checkLabel, onClose }: {
  orders: Order[];
  table: Table | null | undefined;
  svcRate: number;
  checkLabel?: string;
  onClose: () => void;
}) {
  const now   = new Date();
  const items = orders.flatMap(o => o.items);
  const sub   = orders.reduce((s, o) => s + parseFloat(o.total_amount), 0);
  const svc   = Math.round(sub * svcRate * 100) / 100;
  const grand = sub + svc;

  const handlePrint = () => {
    const win = window.open("", "_blank", "width=420,height=660,menubar=no,toolbar=no,scrollbars=yes");
    if (!win) return;
    win.document.write(buildReceiptHtml(orders, table, now, svcRate));
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  };

  const sep: React.CSSProperties = { borderTop: "1px dashed #aaa", margin: "8px 0" };
  const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", fontSize: 12 };

  return (
    <Modal
      title={checkLabel ? `Чек для гостя · ${checkLabel}` : "Чек для гостя"}
      onClose={onClose}
      width={360}
      footer={<>
        <button className="btn ghost" onClick={onClose}>Закрыть</button>
        <button className="btn primary" onClick={handlePrint}><Icon name="receipt" /> Печать</button>
      </>}
    >
      <div style={{ fontFamily: "'Courier New', monospace", lineHeight: 1.65, padding: "0 4px" }}>
        <div style={{ textAlign: "center", fontWeight: 700, fontSize: 15, marginBottom: 2 }}>
          {RECEIPT_VENUE.toUpperCase()}
        </div>
        <div style={sep} />

        <div style={row}>
          <span>Чек #{orders.map(o => o.id).join(", ")}</span>
          <span>Стол {table?.number ?? "—"}</span>
        </div>
        <div style={row}>
          <span>{now.toLocaleDateString("ru-RU")}</span>
          <span>{now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
        {orders[0]?.waiter && (
          <div style={{ fontSize: 12 }}>Официант: {orders[0].waiter.full_name}</div>
        )}
        <div style={sep} />

        {/* Column headers */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 28px 72px 72px", gap: 4, fontSize: 10, fontWeight: 700, borderBottom: "1px dashed #aaa", paddingBottom: 4, marginBottom: 4 }}>
          <span>Блюдо</span>
          <span style={{ textAlign: "center" }}>Кол</span>
          <span style={{ textAlign: "right" }}>Цена</span>
          <span style={{ textAlign: "right" }}>Сумма</span>
        </div>

        {/* Items */}
        {items.map(item => (
          <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 28px 72px 72px", gap: 4, fontSize: 11, marginBottom: 3 }}>
            <div>
              {item.menu_item?.name ?? `#${item.menu_item_id}`}
              {item.note && <div style={{ fontSize: 10, color: "#888" }}>{item.note}</div>}
            </div>
            <span style={{ textAlign: "center" }}>{item.quantity}</span>
            <span style={{ textAlign: "right" }}>{fmtKZT(item.unit_price)}</span>
            <span style={{ textAlign: "right" }}>{fmtKZT(item.line_total)}</span>
          </div>
        ))}
        <div style={sep} />

        {/* Totals */}
        <div style={row}><span>Всего:</span><span className="num">{fmtKZT(sub)}</span></div>
        {svc > 0 && (
          <div style={{ ...row, color: "#666", fontSize: 11 }}>
            <span>Обслуживание ({svcRate * 100}%):</span>
            <span className="num">{fmtKZT(svc)}</span>
          </div>
        )}
        <div style={{ ...row, fontWeight: 700, fontSize: 14, borderTop: "1.5px solid #333", marginTop: 5, paddingTop: 5 }}>
          <span>Итого к оплате:</span>
          <span className="num">{fmtKZT(grand)}</span>
        </div>
        <div style={sep} />

        <div style={{ fontSize: 10, textAlign: "center", color: "#888", lineHeight: 1.5 }}>
          Вознаграждение официанту приветствуется,<br />
          но всегда остаётся на Ваше усмотрение.
        </div>
      </div>
    </Modal>
  );
}

// Returns the most "urgent" status across a set of orders
function dominantStatus(orders: Order[]): string {
  const rank: Record<string, number> = { ready: 4, pending: 3, in_progress: 2, served: 1 };
  return orders.reduce(
    (best, o) => (rank[o.status] ?? 0) > (rank[best] ?? 0) ? o.status : best,
    orders[0]?.status ?? "pending"
  );
}

// ─── TableSession ─────────────────────────────────────────────────────────────

interface SessionProps {
  tableId: number;
  setRoute: (r: { id: string; tableId?: number; orderId?: number }) => void;
}

export function TableSession({ tableId, setRoute }: SessionProps) {
  const { state, createOrder, changeStatus, updateItemStatus, toast } = useApp();

  const table = state.tables.find(t => t.id === tableId);
  const orders = state.orders
    .filter(o => o.table_id === tableId && !["paid", "cancelled"].includes(o.status))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  // Cancelled orders with a reason = explicitly cancelled by kitchen (not split artifacts)
  const cancelledOrders = state.orders.filter(o =>
    o.table_id === tableId && o.status === "cancelled" && !!o.cancel_reason
  );

  const [additions, setAdditions] = useState<CartItem[]>([]);
  const [activeCat, setActiveCat] = useState<number | undefined>(state.categories[0]?.id);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmServe, setConfirmServe] = useState(false);
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");

  const hasOrders = orders.length > 0;
  const hasAdditions = additions.length > 0;
  const readyOrders = orders.filter(o => o.status === "ready");

  const addToOrder = (item: MenuItem) => {
    setAdditions(prev => {
      const ex = prev.find(c => c.menu_item_id === item.id && !c.note);
      if (ex) return prev.map(c => c === ex ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, {
        menu_item_id: item.id,
        name: item.name,
        quantity: 1,
        unit_price: parseFloat(item.price),
        note: "",
      }];
    });
  };

  const setAdditionQty = (idx: number, q: number) => {
    setAdditions(prev =>
      q <= 0 ? prev.filter((_, i) => i !== idx) : prev.map((c, i) => i === idx ? { ...c, quantity: q } : c)
    );
  };

  const send = async () => {
    setSaving(true);
    try {
      const newOrder = await createOrder({
        table_id: tableId,
        priority,
        items: additions.map(c => ({
          menu_item_id: c.menu_item_id,
          quantity: c.quantity,
          note: c.note || undefined,
        })),
      });
      setAdditions([]);
      setPriority("normal");
      toast("success", `Заказ #${newOrder.id} отправлен на кухню`);
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const serveItem = async (orderId: number, itemId: number, newStatus: string) => {
    try {
      await updateItemStatus(orderId, itemId, newStatus);
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Ошибка");
    }
  };

  const markServed = async () => {
    try {
      await Promise.all(readyOrders.map(o => changeStatus(o.id, "served" as Order["status"])));
      toast("success", "Блюда поданы гостю");
      setConfirmServe(false);
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Ошибка");
    }
  };

  const ordersTotal = orders.reduce((s, o) => s + parseFloat(o.total_amount), 0);
  const additionsSubtotal = additions.reduce((s, c) => s + c.unit_price * c.quantity, 0);
  const total = ordersTotal + additionsSubtotal + Math.round(additionsSubtotal * 0.1);

  const menuItems = state.items.filter(i =>
    i.is_available &&
    (search ? i.name.toLowerCase().includes(search.toLowerCase()) : i.category_id === activeCat)
  );

  return (
    <>
      <header className="topbar" style={{ height: 56 }}>
        <button className="iconbtn borderless" onClick={() => setRoute({ id: "w_tables" })}>
          <Icon name="back" />
        </button>
        <div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Стол {table?.number ?? tableId}</span>
          {table?.location && <span style={{ marginLeft: 8, color: "var(--ink-3)", fontSize: 13 }}>· {table.location}</span>}
          {orders.length > 0 && (
            <span style={{ marginLeft: 10, fontSize: 12, color: "var(--ink-3)" }}>
              {elapsedMin(orders[0].created_at)}м
            </span>
          )}
        </div>
        <div style={{ flex: 1 }} />
        {hasAdditions && (
          <button className="btn primary" onClick={send} disabled={saving}>
            {saving ? <><span className="spin" /> Отправка...</> : <><Icon name="forward" /> Отправить</>}
          </button>
        )}
        {hasOrders && (
          <button className="btn success" onClick={() => setRoute({ id: "w_table_payment", tableId })}>
            <Icon name="card" /> Оплатить
          </button>
        )}
      </header>

      <div style={{
        display: "grid",
        gridTemplateColumns: "360px 1fr",
        height: "calc(100vh - 56px)",
        overflow: "hidden",
      }}>

        {/* ── Left: combined receipt ── */}
        <div style={{
          display: "flex", flexDirection: "column",
          borderRight: "1px solid var(--line-1)",
          background: "var(--bg-paper)",
          minHeight: 0,
        }}>
          <div style={{ flex: 1, overflowY: "auto" }}>

            {/* Each order as a labeled round */}
            {orders.map(order => (
              <div key={order.id}>
                <div style={{
                  padding: "5px 14px",
                  background: "var(--bg-canvas)",
                  borderBottom: "1px solid var(--line-1)",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  fontSize: 11, color: "var(--ink-4)",
                }}>
                  <span>#{order.id} · {fmtTime(order.created_at)}</span>
                  <StatusBadge status={order.status} />
                </div>
                {order.items.map(item => (
                  <div key={item.id} style={{
                    padding: "9px 14px",
                    borderBottom: "1px solid var(--line-1)",
                    display: "flex", alignItems: "center", gap: 10,
                    background: item.status === "served"
                      ? "color-mix(in srgb, var(--olive) 4%, transparent)"
                      : item.status === "ready"
                      ? "color-mix(in srgb, var(--amber) 10%, transparent)"
                      : undefined,
                  }}>
                    <button
                      onClick={item.status !== "served" ? () => serveItem(order.id, item.id, "served") : undefined}
                      disabled={item.status === "served"}
                      title={item.status === "served" ? "Подано" : item.status === "ready" ? "Готово — отметить как подано" : "Отметить как подано"}
                      style={{
                        width: 22, height: 22, borderRadius: 4, flexShrink: 0,
                        background: item.status === "served" ? "var(--olive)" : "transparent",
                        border: `1.5px solid ${item.status === "served" ? "var(--olive)" : item.status === "ready" ? "var(--amber)" : "var(--line-2)"}`,
                        cursor: item.status === "served" ? "default" : "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 120ms",
                      }}
                    >
                      {item.status === "served" && <Icon name="check" size={12} style={{ color: "#fff" }} />}
                      {item.status === "ready" && <Icon name="tray" size={11} style={{ color: "var(--amber)" }} />}
                    </button>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-3)", minWidth: 28, textAlign: "center", flexShrink: 0 }}>
                      ×{item.quantity}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: item.status === "served" ? "var(--ink-3)" : undefined }}>
                        {item.menu_item?.name ?? `#${item.menu_item_id}`}
                      </div>
                      {item.status === "ready" && (
                        <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 2, display: "flex", gap: 3, alignItems: "center" }}>
                          <Icon name="tray" size={10} /> Готово к подаче
                        </div>
                      )}
                      {item.note && (
                        <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 2, display: "flex", gap: 3, alignItems: "center" }}>
                          <Icon name="note" size={10} /> {item.note}
                        </div>
                      )}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{fmtKZT(item.line_total)}</div>
                  </div>
                ))}
              </div>
            ))}

            {/* Cancelled orders — only shown when no active orders remain */}
            {cancelledOrders.length > 0 && orders.length === 0 && (
              <>
                <div style={{
                  padding: "5px 14px",
                  background: "color-mix(in srgb, var(--red, #e03) 8%, var(--bg-canvas))",
                  borderBottom: "1px solid var(--line-1)",
                  fontSize: 11, fontWeight: 700, color: "var(--red, #e03)",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  Отменено
                </div>
                {cancelledOrders.map(order => (
                  <div key={order.id}>
                    <div style={{
                      padding: "5px 14px",
                      background: "var(--bg-canvas)",
                      borderBottom: "1px solid var(--line-1)",
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                      fontSize: 11, color: "var(--ink-4)",
                    }}>
                      <span>#{order.id} · {fmtTime(order.created_at)}</span>
                      <StatusBadge status={order.status} />
                    </div>
                    {order.cancel_reason && (
                      <div style={{
                        padding: "6px 14px",
                        background: "color-mix(in srgb, var(--red, #e03) 5%, transparent)",
                        borderBottom: "1px solid var(--line-1)",
                        fontSize: 12, color: "var(--red, #e03)",
                        display: "flex", gap: 5, alignItems: "center",
                      }}>
                        <Icon name="warning" size={11} /> {order.cancel_reason}
                      </div>
                    )}
                    {order.items.map(item => (
                      <div key={item.id} style={{
                        padding: "7px 14px",
                        borderBottom: "1px solid var(--line-1)",
                        display: "flex", alignItems: "center", gap: 10,
                        opacity: 0.45,
                      }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-4)", minWidth: 28, textAlign: "center", flexShrink: 0 }}>
                          ×{item.quantity}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3, textDecoration: "line-through", color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {item.menu_item?.name ?? `#${item.menu_item_id}`}
                          </div>
                        </div>
                        <div style={{ fontWeight: 500, fontSize: 13, flexShrink: 0, color: "var(--ink-4)" }}>{fmtKZT(item.line_total)}</div>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}

            {/* Additions — new items not yet sent */}
            {additions.length > 0 && (
              <>
                <div style={{
                  padding: "5px 14px",
                  background: "color-mix(in srgb, var(--brand) 8%, var(--bg-canvas))",
                  borderBottom: "1px solid var(--line-1)",
                  fontSize: 11, fontWeight: 700, color: "var(--brand)",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  Добавляется
                </div>
                {additions.map((item, idx) => (
                  <div key={idx} style={{
                    padding: "9px 14px",
                    borderBottom: "1px solid var(--line-1)",
                    display: "flex", alignItems: "flex-start", gap: 10,
                    background: "color-mix(in srgb, var(--brand) 4%, transparent)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--line-2)", borderRadius: 6, overflow: "hidden", flexShrink: 0, marginTop: 2 }}>
                      <button style={{ width: 26, height: 26, background: "var(--bg-sunken)", border: 0, cursor: "pointer", fontSize: 16, color: "var(--red)", lineHeight: 1 }}
                        onClick={() => setAdditionQty(idx, item.quantity - 1)}>−</button>
                      <div style={{ width: 26, textAlign: "center", fontWeight: 700, fontSize: 13 }}>{item.quantity}</div>
                      <button style={{ width: 26, height: 26, background: "var(--bg-sunken)", border: 0, cursor: "pointer", fontSize: 16, color: "var(--brand)", lineHeight: 1 }}
                        onClick={() => setAdditionQty(idx, item.quantity + 1)}>+</button>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                      <input
                        className="input"
                        placeholder="Комментарий к позиции..."
                        value={item.note}
                        onChange={e => setAdditions(prev => prev.map((c, i) => i === idx ? { ...c, note: e.target.value } : c))}
                        style={{ marginTop: 5, fontSize: 12, padding: "3px 8px", height: 26, width: "100%" }}
                      />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, flexShrink: 0, marginTop: 2 }}>{fmtKZT(item.unit_price * item.quantity)}</div>
                  </div>
                ))}
              </>
            )}

            {/* Priority selector — only when there are unsent additions */}
            {additions.length > 0 && (
              <div style={{
                padding: "10px 14px",
                background: "color-mix(in srgb, var(--brand) 6%, var(--bg-canvas))",
                borderBottom: "1px solid var(--line-1)",
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-3)", marginBottom: 7, textTransform: "uppercase", letterSpacing: "0.05em" }}>Приоритет заказа</div>
                <div style={{ display: "flex", gap: 5 }}>
                  {(["low", "normal", "high", "urgent"] as const).map(p => {
                    const active = priority === p;
                    const color = p === "low" ? "var(--ink-3)" : p === "normal" ? "var(--brand)" : p === "high" ? "var(--amber, #f59e0b)" : "var(--red, #e03)";
                    const label = p === "low" ? "Низкий" : p === "normal" ? "Обычный" : p === "high" ? "Высокий" : "Срочно!";
                    return (
                      <button
                        key={p}
                        onClick={() => setPriority(p)}
                        style={{
                          flex: 1, height: 30, fontSize: 11, fontWeight: active ? 700 : 500,
                          border: `1.5px solid ${active ? color : "var(--line-2)"}`,
                          borderRadius: 5, cursor: "pointer",
                          background: active ? `color-mix(in srgb, ${color} 14%, transparent)` : "var(--bg-paper)",
                          color: active ? color : "var(--ink-3)",
                          transition: "all 100ms",
                        }}
                      >{label}</button>
                    );
                  })}
                </div>
              </div>
            )}

            {!hasOrders && additions.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-4)" }}>Нет активных заказов</div>
            )}
          </div>

          {/* Totals */}
          <div style={{ flexShrink: 0, borderTop: "1px solid var(--line-1)", padding: "12px 16px", background: "var(--bg-canvas)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 18 }}>
              <span>Итого</span>
              <span className="num">{fmtKZT(total)}</span>
            </div>
          </div>

          {/* Serve action */}
          {readyOrders.length > 0 && (
            <div style={{ flexShrink: 0, padding: "10px 14px", borderTop: "1px solid var(--line-1)" }}>
              <button className="btn block primary" style={{ minHeight: 44, justifyContent: "center" }} onClick={() => setConfirmServe(true)}>
                <Icon name="tray" /> Подать гостю ({readyOrders.length})
              </button>
            </div>
          )}
        </div>

        {/* ── Right: menu browser ── */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          <div style={{ flexShrink: 0, padding: "12px 16px", borderBottom: "1px solid var(--line-1)", background: "var(--bg-paper)" }}>
            <div style={{ position: "relative", marginBottom: 10 }}>
              <input className="input" placeholder="Поиск по меню..." value={search}
                onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 34 }} />
              <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
            </div>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
              {state.categories.map(c => (
                <button key={c.id} className={`btn sm ${activeCat === c.id && !search ? "primary" : ""}`}
                  onClick={() => { setActiveCat(c.id); setSearch(""); }} style={{ flex: "none" }}>
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: 14, background: "var(--bg-canvas)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
              {menuItems.map(item => {
                const inAdditions = additions.filter(c => c.menu_item_id === item.id).reduce((s, c) => s + c.quantity, 0);
                return (
                  <button key={item.id} onClick={() => addToOrder(item)} style={{
                    textAlign: "left", background: "var(--bg-paper)",
                    border: `1px solid ${inAdditions ? "var(--brand)" : "var(--line-1)"}`,
                    borderRadius: "var(--r)", padding: 12, cursor: "pointer", color: "inherit",
                    display: "flex", flexDirection: "column", gap: 5, minHeight: 100,
                    position: "relative",
                    boxShadow: inAdditions ? "0 0 0 2px var(--brand) inset" : "var(--sh-1)",
                    transition: "all 100ms",
                  }}>
                    {inAdditions > 0 && (
                      <div style={{
                        position: "absolute", top: 7, right: 7,
                        background: "var(--brand)", color: "white",
                        borderRadius: 999, width: 22, height: 22,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700,
                      }}>{inAdditions}</div>
                    )}
                    <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, paddingRight: inAdditions > 0 ? 28 : 0 }}>{item.name}</div>
                    {item.description && (
                      <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" } as React.CSSProperties}>
                        {item.description}
                      </div>
                    )}
                    <div style={{ marginTop: "auto", fontWeight: 700, fontSize: 14 }}>{fmtKZT(item.price)}</div>
                  </button>
                );
              })}
              {menuItems.length === 0 && (
                <div style={{ gridColumn: "1 / -1", padding: "40px 0", textAlign: "center", color: "var(--ink-3)" }}>Ничего не найдено</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {confirmServe && (
        <Modal title="Подать гостю?" onClose={() => setConfirmServe(false)}
          footer={<>
            <button className="btn ghost" onClick={() => setConfirmServe(false)}>Отмена</button>
            <button className="btn primary" onClick={markServed}>Подтвердить</button>
          </>} width={360}>
          <p style={{ margin: 0, color: "var(--ink-2)" }}>
            Отметить {readyOrders.length} {readyOrders.length === 1 ? "заказ" : "заказа"} как поданные?
          </p>
        </Modal>
      )}
    </>
  );
}

// ─── WaiterTablePayment ───────────────────────────────────────────────────────

interface TablePaymentProps {
  tableId: number;
  setRoute: (r: { id: string; tableId?: number; orderId?: number }) => void;
}

export function WaiterTablePayment({ tableId, setRoute }: TablePaymentProps) {
  const { state, createPayment, splitTableOrders, toast } = useApp();

  const table = state.tables.find(t => t.id === tableId);
  const orders = state.orders
    .filter(o => o.table_id === tableId && !["paid", "cancelled"].includes(o.status))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const [method, setMethod] = useState<"cash" | "card" | "qr" | "account">("cash");
  const [received, setReceived] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [receiptOrders, setReceiptOrders] = useState<Order[] | null>(null);

  // The selected check to pay (auto-falls-back to first active order)
  const selectedOrder = orders.find(o => o.id === selectedOrderId) ?? orders[0] ?? null;

  // ── Split state ──
  const [splitMode, setSplitMode] = useState(false);
  const [splitItems, setSplitItems] = useState<typeof orders[0]["items"]>([]);
  const [checkQtys, setCheckQtys] = useState<number[][]>([]);

  const enterSplit = () => {
    const items = orders.flatMap(o => o.items);
    setSplitItems(items);
    setCheckQtys([items.map(i => i.quantity), items.map(() => 0)]);
    setSplitMode(true);
  };

  const addCheck = () => setCheckQtys(prev => [...prev, splitItems.map(() => 0)]);

  const removeCheck = (ci: number) =>
    setCheckQtys(prev => {
      if (prev.length <= 2) return prev;
      const next = prev.filter((_, i) => i !== ci).map(r => [...r]);
      prev[ci].forEach((qty, ii) => { next[0][ii] += qty; });
      return next;
    });

  const incr = (ci: number, ii: number) =>
    setCheckQtys(prev => {
      let donor = ci === 0 ? 1 : 0;
      for (let c = 0; c < prev.length; c++) {
        if (c !== ci && prev[c][ii] > prev[donor][ii]) donor = c;
      }
      if (prev[donor][ii] === 0) return prev;
      return prev.map((row, c) =>
        c === ci ? row.map((q, i) => i === ii ? q + 1 : q)
        : c === donor ? row.map((q, i) => i === ii ? q - 1 : q)
        : row
      );
    });

  const decr = (ci: number, ii: number) =>
    setCheckQtys(prev => {
      if (prev[ci][ii] === 0) return prev;
      const rcvr = ci === 0 ? 1 : 0;
      return prev.map((row, c) =>
        c === ci ? row.map((q, i) => i === ii ? q - 1 : q)
        : c === rcvr ? row.map((q, i) => i === ii ? q + 1 : q)
        : row
      );
    });

  const checkTotal = (ci: number) =>
    splitItems.reduce((s, item, ii) => s + checkQtys[ci]?.[ii] * parseFloat(item.unit_price), 0);

  const handleInput = (ci: number, ii: number, rawVal: string) =>
    setCheckQtys(prev => {
      const itemTotal = splitItems[ii].quantity;
      const primary = ci === 0 ? 1 : 0;
      const fixedSum = prev.reduce((s, row, c) => (c !== ci && c !== primary) ? s + row[ii] : s, 0);
      const newVal = Math.max(0, Math.min(itemTotal - fixedSum, parseInt(rawVal, 10) || 0));
      const primaryVal = Math.max(0, itemTotal - fixedSum - newVal);
      return prev.map((row, c) =>
        c === ci ? row.map((q, i) => i === ii ? newVal : q)
        : c === primary ? row.map((q, i) => i === ii ? primaryVal : q)
        : row
      );
    });

  const confirmSplit = async () => {
    const splits = checkQtys
      .map(row => ({ items: splitItems.map((item, ii) => ({ order_item_id: item.id, quantity: row[ii] })).filter(si => si.quantity > 0) }))
      .filter(s => s.items.length > 0);
    if (splits.length < 2) { toast("error", "Нужно хотя бы 2 чека с позициями"); return; }
    try {
      setProcessing(true);
      await splitTableOrders(tableId, splits);
      setSplitMode(false);
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Ошибка разделения");
    } finally {
      setProcessing(false);
    }
  };

  const svcRate     = table?.is_takeaway ? 0 : RECEIPT_SERVICE;
  const orderSvc    = (o: Order) => Math.round(parseFloat(o.total_amount) * svcRate * 100) / 100;
  const orderTotal  = (o: Order) => parseFloat(o.total_amount) + orderSvc(o);
  const subtotalAmt = selectedOrder ? parseFloat(selectedOrder.total_amount) : 0;
  const svcAmt      = selectedOrder ? orderSvc(selectedOrder) : 0;
  const total       = subtotalAmt + svcAmt;
  const allSubtotal = orders.reduce((s, o) => s + parseFloat(o.total_amount), 0);
  const allTotal    = orders.reduce((s, o) => s + orderTotal(o), 0);
  const receivedAmt = parseFloat(received) || 0;
  const change = method === "cash" ? Math.max(0, receivedAmt - total) : 0;

  if (!orders.length) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>
        Нет активных заказов для этого стола
        <br />
        <button className="btn" style={{ marginTop: 16 }} onClick={() => setRoute({ id: "w_tables" })}>
          <Icon name="back" /> К столам
        </button>
      </div>
    );
  }

  // ── Split mode UI ──────────────────────────────────────────────
  if (splitMode && checkQtys.length > 0) {
    const cellStyle: React.CSSProperties = { padding: "8px 12px", borderBottom: "1px solid var(--line-1)", textAlign: "center" as const };
    const stepBtn: React.CSSProperties = { width: 26, height: 26, border: "1px solid var(--line-2)", borderRadius: 4, background: "var(--bg-sunken)", cursor: "pointer", fontSize: 16, lineHeight: 1, color: "inherit" };
    return (
      <>
        <header className="topbar">
          <button className="iconbtn borderless" onClick={() => setSplitMode(false)}><Icon name="back" /></button>
          <div style={{ fontWeight: 600 }}>Разделить счёт · Стол {table?.number ?? tableId}</div>
          <div style={{ flex: 1 }} />
        </header>
        <div style={{ flex: 1, overflow: "auto", height: "calc(100vh - 56px)", display: "flex", flexDirection: "column" }}>
          <div style={{ flex: 1, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--bg-canvas)" }}>
                  <th style={{ ...cellStyle, textAlign: "left", fontWeight: 600, minWidth: 160 }}>Позиция</th>
                  {checkQtys.map((_, ci) => (
                    <th key={ci} style={{ ...cellStyle, minWidth: 130 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        <span style={{ fontWeight: 600 }}>Чек {ci + 1}</span>
                        {checkQtys.length > 2 && (
                          <button onClick={() => removeCheck(ci)} style={{ ...stepBtn, width: 20, height: 20, fontSize: 12, color: "var(--red)", borderColor: "var(--red)" }}>×</button>
                        )}
                      </div>
                    </th>
                  ))}
                  <th style={{ ...cellStyle, minWidth: 110 }}>
                    <button className="btn sm" onClick={addCheck} style={{ fontSize: 12 }}>+ Чек</button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {splitItems.map((item, ii) => (
                  <tr key={item.id} style={{ background: ii % 2 === 0 ? "var(--bg-paper)" : "var(--bg-canvas)" }}>
                    <td style={{ ...cellStyle, textAlign: "left" }}>
                      <div style={{ fontWeight: 500 }}>{item.menu_item?.name ?? `#${item.menu_item_id}`} <span style={{ color: "var(--ink-3)" }}>×{item.quantity}</span></div>
                      {item.note && <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 2 }}>{item.note}</div>}
                    </td>
                    {checkQtys.map((row, ci) => (
                      <td key={ci} style={cellStyle}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                          <button style={stepBtn} onClick={() => decr(ci, ii)}>−</button>
                          <input
                            type="number"
                            min={0}
                            max={splitItems[ii].quantity}
                            value={row[ii]}
                            onChange={e => handleInput(ci, ii, e.target.value)}
                            style={{ width: 44, textAlign: "center", fontWeight: 700, border: "1px solid var(--line-2)", borderRadius: 4, padding: "2px 4px", fontSize: 13, background: "var(--bg-paper)", color: "inherit" }}
                          />
                          <button style={stepBtn} onClick={() => incr(ci, ii)}>+</button>
                        </div>
                      </td>
                    ))}
                    <td style={cellStyle} />
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--bg-canvas)", fontWeight: 700 }}>
                  <td style={{ ...cellStyle, textAlign: "left" }}>Итого</td>
                  {checkQtys.map((_, ci) => (
                    <td key={ci} style={{ ...cellStyle, fontSize: 15 }} className="num">{fmtKZT(checkTotal(ci))}</td>
                  ))}
                  <td style={cellStyle} />
                </tr>
              </tfoot>
            </table>
          </div>
          <div style={{ flexShrink: 0, padding: "14px 20px", borderTop: "1px solid var(--line-1)", background: "var(--bg-paper)" }}>
            <button className="btn block primary lg" style={{ justifyContent: "center", minHeight: 48 }} onClick={confirmSplit} disabled={processing}>
              {processing ? <><span className="spin" /> Разделение...</> : <><Icon name="check" /> Подтвердить разделение</>}
            </button>
          </div>
        </div>
      </>
    );
  }

  const pay = async () => {
    if (!selectedOrder) return;
    setProcessing(true);
    try {
      const amtReceived = method === "cash" && parseFloat(received) >= total
        ? parseFloat(received)
        : total;
      await createPayment({
        order_id: selectedOrder.id,
        method,
        amount_received: amtReceived,
        tip_amount: svcAmt,
      });
      setReceived("");
      setSelectedOrderId(null);
      if (orders.length <= 1) {
        toast("success", `Стол ${table?.number ?? tableId} оплачен`);
        setRoute({ id: "w_tables" });
      } else {
        toast("success", `Чек оплачен · осталось ${orders.length - 1}`);
      }
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Ошибка оплаты");
    } finally {
      setProcessing(false);
      setConfirm(false);
    }
  };

  const payAll = async () => {
    setProcessing(true);
    try {
      for (const order of orders) {
        await createPayment({
          order_id: order.id,
          method,
          amount_received: orderTotal(order),
          tip_amount: orderSvc(order),
        });
      }
      toast("success", `Стол ${table?.number ?? tableId} оплачен`);
      setRoute({ id: "w_tables" });
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Ошибка оплаты");
    } finally {
      setProcessing(false);
      setConfirmAll(false);
    }
  };

  const METHODS: Array<{ id: "cash" | "card" | "qr" | "account"; label: string; icon: string }> = [
    { id: "cash",    label: "Наличные",   icon: "cash"    },
    { id: "card",    label: "Карта",      icon: "card"    },
    { id: "qr",      label: "QR / Kaspi", icon: "qr"     },
    { id: "account", label: "На счёт",   icon: "receipt" },
  ];

  return (
    <>
      <header className="topbar">
        <button className="iconbtn borderless" onClick={() => setRoute({ id: "w_table_session", tableId })}>
          <Icon name="back" />
        </button>
        <div style={{ fontWeight: 600 }}>
          Оплата · Стол {table?.number ?? tableId}
          {orders.length > 1 && selectedOrder && (
            <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--ink-3)", fontSize: 13 }}>
              Чек {orders.indexOf(selectedOrder) + 1} из {orders.length}
            </span>
          )}
          {table?.is_takeaway && (
            <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99, background: "color-mix(in srgb, var(--olive) 14%, transparent)", color: "var(--olive)", border: "1px solid var(--olive)" }}>
              Без обслуживания
            </span>
          )}
        </div>
        <div style={{ flex: 1 }} />
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", height: "calc(100vh - 56px)", overflow: "hidden" }}>
        {/* Left: order breakdown */}
        <div style={{ overflow: "auto", padding: 24 }}>
          {orders.length > 1 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {orders.map((order, idx) => {
                const isSelected = order.id === selectedOrder?.id;
                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className="card"
                    style={{
                      cursor: "pointer",
                      border: `2px solid ${isSelected ? "var(--brand)" : "var(--line-1)"}`,
                      outline: isSelected ? "3px solid color-mix(in srgb, var(--brand) 20%, transparent)" : "none",
                      transition: "all 120ms",
                    }}
                  >
                    <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-1)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>Чек {idx + 1}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <StatusBadge status={order.status} />
                        <button
                          onClick={e => { e.stopPropagation(); setReceiptOrders([order]); }}
                          title="Предварительный чек"
                          style={{ background: "none", border: "1px solid var(--line-2)", borderRadius: 5, cursor: "pointer", padding: "2px 7px", color: "var(--ink-3)", fontSize: 11, display: "flex", alignItems: "center", gap: 3, lineHeight: 1.6 }}
                        >
                          <Icon name="receipt" size={11} /> Чек
                        </button>
                      </div>
                    </div>
                    {order.items.map(item => (
                      <div key={item.id} style={{ padding: "7px 16px", borderBottom: "1px solid var(--line-1)", display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                        <span style={{ color: "var(--ink-2)" }}>{item.menu_item?.name ?? `#${item.menu_item_id}`} ×{item.quantity}</span>
                        <span style={{ fontWeight: 500 }}>{fmtKZT(item.line_total)}</span>
                      </div>
                    ))}
                    <div style={{ padding: "8px 16px 10px" }}>
                      {svcRate > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-3)", paddingBottom: 3 }}>
                          <span>Обслуживание ({svcRate * 100}%)</span>
                          <span className="num">{fmtKZT(orderSvc(order))}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, borderTop: svcRate > 0 ? "1px solid var(--line-1)" : "none", paddingTop: svcRate > 0 ? 4 : 0 }}>
                        <span>Итого</span>
                        <span className="num">{fmtKZT(orderTotal(order))}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 600 }}>
                Состав · Стол {table?.number ?? tableId}
              </div>
              {orders.map(order => (
                <div key={order.id}>
                  {order.items.map(item => (
                    <div key={item.id} style={{ padding: "9px 18px", borderBottom: "1px solid var(--line-1)", display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                      <span>{item.menu_item?.name ?? `#${item.menu_item_id}`} ×{item.quantity}</span>
                      <span style={{ fontWeight: 500 }}>{fmtKZT(item.line_total)}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ padding: "10px 18px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ink-3)", paddingBottom: 4 }}>
                  <span>Подытог</span><span className="num">{fmtKZT(subtotalAmt)}</span>
                </div>
                {svcAmt > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--ink-3)", paddingBottom: 6 }}>
                    <span>Обслуживание ({svcRate * 100}%)</span><span className="num">{fmtKZT(svcAmt)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 18, borderTop: "1px solid var(--line-1)", paddingTop: 6 }}>
                  <span>Итого</span><span className="num">{fmtKZT(total)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: payment form */}
        <aside style={{ borderLeft: "1px solid var(--line-1)", background: "var(--bg-paper)", overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Способ оплаты</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {METHODS.map(m => (
                <button key={m.id} className={`btn ${method === m.id ? "primary" : ""}`}
                  style={{ flexDirection: "column", padding: "14px 8px", height: 72, gap: 6 }}
                  onClick={() => setMethod(m.id)}>
                  <Icon name={m.icon} size={20} />
                  <span style={{ fontSize: 12 }}>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {method === "cash" && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Принято наличными</div>
              <input className="input" type="number" placeholder={fmtKZT(total)} value={received} onChange={e => setReceived(e.target.value)} />
              {change > 0 && (
                <div style={{ marginTop: 10, padding: 12, background: "var(--olive-soft)", border: "1px solid var(--olive)", borderRadius: "var(--r)", textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Сдача</div>
                  <div className="num" style={{ fontSize: 22, fontWeight: 700, color: "var(--olive)" }}>{fmtKZT(change)}</div>
                </div>
              )}
            </div>
          )}

          <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="btn ghost block" onClick={enterSplit}>
              <Icon name="receipt" /> Разделить счёт
            </button>
            <button className="btn ghost block" onClick={() => setReceiptOrders(orders)}>
              <Icon name="note" /> Чек для гостя{orders.length > 1 ? " (общий)" : ""}
            </button>
            <button
              className="btn success block lg"
              onClick={() => setConfirm(true)}
              disabled={processing || (method === "cash" && receivedAmt < total && receivedAmt > 0)}
            >
              <Icon name="check" /> Принять оплату {fmtKZT(total)}
            </button>
            {orders.length > 1 && (
              <button
                className="btn block"
                style={{ background: "var(--ink-1)", color: "var(--bg-paper)", border: "none" }}
                onClick={() => setConfirmAll(true)}
                disabled={processing}
              >
                <Icon name="card" /> Оплатить все {orders.length} чека · {fmtKZT(allTotal)}
              </button>
            )}
          </div>
        </aside>
      </div>

      {confirm && (
        <Modal title="Подтвердить оплату?" onClose={() => setConfirm(false)}
          footer={<>
            <button className="btn ghost" onClick={() => setConfirm(false)}>Отмена</button>
            <button className="btn success" onClick={pay} disabled={processing}>
              {processing ? <><span className="spin" /> Обработка...</> : "Подтвердить"}
            </button>
          </>} width={360}>
          <div className="num" style={{ fontSize: 32, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>{fmtKZT(total)}</div>
          <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
            {METHODS_MAP[method]} · Стол {table?.number ?? tableId}
            {orders.length > 1 && selectedOrder && ` · Чек ${orders.indexOf(selectedOrder) + 1} из ${orders.length}`}
          </div>
        </Modal>
      )}

      {confirmAll && (
        <Modal
          title="Оплатить все чеки?"
          onClose={() => setConfirmAll(false)}
          footer={<>
            <button className="btn ghost" onClick={() => setConfirmAll(false)}>Отмена</button>
            <button className="btn success" onClick={payAll} disabled={processing}>
              {processing ? <><span className="spin" /> Обработка...</> : "Подтвердить"}
            </button>
          </>}
          width={400}
        >
          <div className="num" style={{ fontSize: 30, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>{fmtKZT(allTotal)}</div>
          <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 14, marginBottom: 14 }}>
            {METHODS_MAP[method]} · Стол {table?.number ?? tableId} · {orders.length} чека
          </div>
          <div style={{ background: "var(--bg-canvas)", borderRadius: "var(--r)", overflow: "hidden", border: "1px solid var(--line-1)" }}>
            {orders.map((o, i) => (
              <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "9px 14px", borderBottom: i < orders.length - 1 ? "1px solid var(--line-1)" : "none", fontSize: 13 }}>
                <span style={{ color: "var(--ink-2)" }}>Чек {i + 1}</span>
                <span className="num" style={{ fontWeight: 600 }}>{fmtKZT(orderTotal(o))}</span>
              </div>
            ))}
          </div>
          {svcRate > 0 && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--ink-3)", textAlign: "center" }}>
              Включает обслуживание {svcRate * 100}% · {fmtKZT(orders.reduce((s, o) => s + orderSvc(o), 0))}
            </div>
          )}
        </Modal>
      )}

      {receiptOrders && (
        <ReceiptPreviewModal
          orders={receiptOrders}
          table={table}
          svcRate={svcRate}
          checkLabel={receiptOrders.length === 1 && orders.length > 1
            ? `Чек ${orders.indexOf(receiptOrders[0]) + 1} из ${orders.length}`
            : undefined}
          onClose={() => setReceiptOrders(null)}
        />
      )}
    </>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

export { dominantStatus };

const METHODS_MAP: Record<string, string> = { cash: "Наличные", card: "Карта", qr: "QR / Kaspi", account: "На счёт" };
