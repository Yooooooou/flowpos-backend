import { useEffect, useState } from "react";
import { useApp } from "../lib/store";
import type { MenuItem, Order, OrderStatus } from "../types";
import { Icon } from "../components/Icon";
import { StatusBadge, PriorityChip, fmtKZT, fmtTime, STATUS_LABEL, Modal } from "../components/UI";

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

function initDraft(order: Order | undefined): CartItem[] {
  if (!order) return [];
  return order.items.map(i => ({
    menu_item_id: i.menu_item_id,
    name: i.menu_item?.name ?? `#${i.menu_item_id}`,
    quantity: i.quantity,
    unit_price: parseFloat(i.unit_price),
    note: i.note ?? "",
  }));
}

interface Props {
  orderId: number;
  setRoute: (r: { id: string; tableId?: number; orderId?: number }) => void;
}

export function OrderDetails({ orderId, setRoute }: Props) {
  const { state, changeStatus, createOrder, toast } = useApp();
  const order = state.orders.find(o => o.id === orderId);

  // baseline: items already sent to kitchen (read-only for waiter)
  const [baseline, setBaseline] = useState<CartItem[]>(() => initDraft(order));
  // additions: new items being added in this session only
  const [additions, setAdditions] = useState<CartItem[]>([]);

  const [activeCat, setActiveCat] = useState<number | undefined>(state.categories[0]?.id);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<OrderStatus | null>(null);

  // Reset when navigating to a different order
  useEffect(() => {
    setBaseline(initDraft(order));
    setAdditions([]);
  }, [orderId]); // eslint-disable-line

  if (!order) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>
        Заказ #{orderId} не найден
        <br />
        <button className="btn" style={{ marginTop: 16 }} onClick={() => setRoute({ id: "w_tables" })}>
          <Icon name="back" /> К столам
        </button>
      </div>
    );
  }

  const canAddItems = ["pending", "in_progress"].includes(order.status);
  const hasAdditions = additions.length > 0;
  const nextActions = getNextActions(order.status);

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
      q <= 0
        ? prev.filter((_, i) => i !== idx)
        : prev.map((c, i) => i === idx ? { ...c, quantity: q } : c)
    );
  };

  // Create a new order for the same table — shows as a separate KDS card
  const send = async () => {
    setSaving(true);
    try {
      const newOrder = await createOrder({
        table_id: order!.table_id,
        priority: "normal",
        items: additions.map(c => ({
          menu_item_id: c.menu_item_id,
          quantity: c.quantity,
          note: c.note || undefined,
        })),
      });
      setAdditions([]);
      toast("success", `Заказ #${newOrder.id} отправлен на кухню`);
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Ошибка");
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (status: OrderStatus) => {
    try {
      await changeStatus(orderId, status);
      toast("success", `Статус: ${STATUS_LABEL[status]}`);
      setConfirmStatus(null);
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Ошибка");
    }
  };

  const allItems = [...baseline, ...additions];
  const subtotal = allItems.reduce((s, c) => s + c.unit_price * c.quantity, 0);
  const serviceFee = Math.round(subtotal * 0.10);
  const total = subtotal + serviceFee;

  const menuItems = state.items.filter(i =>
    i.is_available &&
    (search ? i.name.toLowerCase().includes(search.toLowerCase()) : i.category_id === activeCat)
  );

  return (
    <>
      {/* Topbar */}
      <header className="topbar" style={{ height: 56 }}>
        <button className="iconbtn borderless" onClick={() => setRoute({ id: "w_tables" })}>
          <Icon name="back" />
        </button>
        <div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Заказ #{order.id}</span>
          {order.table && (
            <span style={{ marginLeft: 10, fontWeight: 400, color: "var(--ink-3)", fontSize: 13 }}>
              Стол {order.table.number}{order.table.location ? ` · ${order.table.location}` : ""}
            </span>
          )}
        </div>
        <StatusBadge status={order.status} />
        <div style={{ flex: 1 }} />
        {hasAdditions && (
          <button className="btn primary" onClick={send} disabled={saving}>
            {saving ? <><span className="spin" /> Отправка...</> : <><Icon name="forward" /> Отправить</>}
          </button>
        )}
        {order.status === "served" && !hasAdditions && (
          <button className="btn success" onClick={() => setRoute({ id: "w_payment", orderId })}>
            <Icon name="card" /> Оплатить
          </button>
        )}
      </header>

      {/* Body: receipt (left) + menu browser or info (right) */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "360px 1fr",
        height: "calc(100vh - 56px)",
        overflow: "hidden",
      }}>

        {/* ── Left: receipt panel ── */}
        <div style={{
          display: "flex", flexDirection: "column",
          borderRight: "1px solid var(--line-1)",
          background: "var(--bg-paper)",
          minHeight: 0,
        }}>
          {/* Meta row */}
          <div style={{
            flexShrink: 0,
            padding: "9px 16px",
            borderBottom: "1px solid var(--line-1)",
            display: "flex", gap: 14, alignItems: "center", fontSize: 12, color: "var(--ink-3)",
          }}>
            <span>{fmtTime(order.created_at)}</span>
            <span style={{ fontWeight: 600, color: "var(--ink-2)" }}>{elapsedMin(order.created_at)}м</span>
            {order.waiter && <span style={{ marginLeft: "auto" }}>{order.waiter.full_name}</span>}
          </div>

          {/* Items list */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {/* Baseline items — already sent to kitchen, read-only */}
            {baseline.map((item, idx) => (
              <div key={`b${idx}`} style={{
                padding: "9px 14px",
                borderBottom: "1px solid var(--line-1)",
                display: "flex", alignItems: "center", gap: 10,
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-3)", minWidth: 28, textAlign: "center", flexShrink: 0 }}>
                  ×{item.quantity}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.name}
                  </div>
                  {item.note && (
                    <div style={{ fontSize: 11, color: "var(--amber)", marginTop: 2, display: "flex", gap: 3, alignItems: "center" }}>
                      <Icon name="note" size={10} /> {item.note}
                    </div>
                  )}
                </div>
                <div style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                  {fmtKZT(item.unit_price * item.quantity)}
                </div>
              </div>
            ))}

            {/* Additions — new items not yet sent to kitchen */}
            {additions.length > 0 && (
              <>
                <div style={{
                  padding: "5px 14px",
                  background: "var(--brand-soft, color-mix(in srgb, var(--brand) 10%, transparent))",
                  borderBottom: "1px solid var(--line-1)",
                  fontSize: 11, fontWeight: 700, color: "var(--brand)",
                  textTransform: "uppercase", letterSpacing: "0.05em",
                }}>
                  Добавляется
                </div>
                {additions.map((item, idx) => (
                  <div key={`a${idx}`} style={{
                    padding: "9px 14px",
                    borderBottom: "1px solid var(--line-1)",
                    display: "flex", alignItems: "center", gap: 10,
                    background: "color-mix(in srgb, var(--brand) 4%, transparent)",
                  }}>
                    <div style={{
                      display: "flex", alignItems: "center",
                      border: "1px solid var(--line-2)", borderRadius: 6,
                      overflow: "hidden", flexShrink: 0,
                    }}>
                      <button
                        style={{ width: 26, height: 26, background: "var(--bg-sunken)", border: 0, cursor: "pointer", fontSize: 16, color: "var(--red)", lineHeight: 1 }}
                        onClick={() => setAdditionQty(idx, item.quantity - 1)}
                      >−</button>
                      <div style={{ width: 26, textAlign: "center", fontWeight: 700, fontSize: 13 }}>{item.quantity}</div>
                      <button
                        style={{ width: 26, height: 26, background: "var(--bg-sunken)", border: 0, cursor: "pointer", fontSize: 16, color: "var(--brand)", lineHeight: 1 }}
                        onClick={() => setAdditionQty(idx, item.quantity + 1)}
                      >+</button>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.name}
                      </div>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>
                      {fmtKZT(item.unit_price * item.quantity)}
                    </div>
                  </div>
                ))}
              </>
            )}

            {baseline.length === 0 && additions.length === 0 && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-4)" }}>
                Нет позиций
              </div>
            )}
          </div>

          {/* Customer note */}
          {order.customer_note && (
            <div style={{
              flexShrink: 0,
              padding: "8px 14px", borderTop: "1px solid var(--amber-line)",
              background: "var(--amber-soft)", fontSize: 12.5, color: "var(--amber)",
              display: "flex", gap: 6, alignItems: "flex-start",
            }}>
              <Icon name="note" size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              {order.customer_note}
            </div>
          )}

          {/* Totals */}
          <div style={{ flexShrink: 0, borderTop: "1px solid var(--line-1)", padding: "12px 16px", background: "var(--bg-canvas)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-3)", fontSize: 12.5, marginBottom: 3 }}>
              <span>Подытог</span><span>{fmtKZT(subtotal)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-3)", fontSize: 12.5, marginBottom: 8 }}>
              <span>Сервис 10%</span><span>{fmtKZT(serviceFee)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 18 }}>
              <span>Итого</span><span className="num">{fmtKZT(total)}</span>
            </div>
          </div>

          {/* Action buttons */}
          {nextActions.length > 0 && (
            <div style={{ flexShrink: 0, padding: "10px 14px", borderTop: "1px solid var(--line-1)", display: "flex", flexDirection: "column", gap: 8 }}>
              {nextActions.map(action => (
                <button
                  key={action.status}
                  className={`btn block ${action.kind ?? ""}`}
                  style={{ minHeight: 44, justifyContent: "center" }}
                  onClick={() => setConfirmStatus(action.status)}
                >
                  <Icon name={action.icon ?? "forward"} /> {action.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: menu browser (when items can be added) or info (read-only) ── */}
        {canAddItems ? (
          <div style={{ display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
            {/* Search + categories */}
            <div style={{ flexShrink: 0, padding: "12px 16px", borderBottom: "1px solid var(--line-1)", background: "var(--bg-paper)" }}>
              <div style={{ position: "relative", marginBottom: 10 }}>
                <input
                  className="input"
                  placeholder="Поиск по меню..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ paddingLeft: 34 }}
                />
                <Icon name="search" size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
              </div>
              <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
                {state.categories.map(c => (
                  <button
                    key={c.id}
                    className={`btn sm ${activeCat === c.id && !search ? "primary" : ""}`}
                    onClick={() => { setActiveCat(c.id); setSearch(""); }}
                    style={{ flex: "none" }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Items grid */}
            <div style={{ flex: 1, overflow: "auto", padding: 14, background: "var(--bg-canvas)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
                {menuItems.map(item => {
                  const inDraft = additions.filter(c => c.menu_item_id === item.id).reduce((s, c) => s + c.quantity, 0);
                  return (
                    <button
                      key={item.id}
                      onClick={() => addToOrder(item)}
                      style={{
                        textAlign: "left",
                        background: "var(--bg-paper)",
                        border: `1px solid ${inDraft ? "var(--brand)" : "var(--line-1)"}`,
                        borderRadius: "var(--r)",
                        padding: 12,
                        cursor: "pointer",
                        color: "inherit",
                        display: "flex",
                        flexDirection: "column",
                        gap: 5,
                        minHeight: 100,
                        position: "relative",
                        boxShadow: inDraft ? "0 0 0 2px var(--brand) inset" : "var(--sh-1)",
                        transition: "all 100ms",
                      }}
                    >
                      {inDraft > 0 && (
                        <div style={{
                          position: "absolute", top: 7, right: 7,
                          background: "var(--brand)", color: "white",
                          borderRadius: 999, width: 22, height: 22,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontSize: 11, fontWeight: 700,
                        }}>
                          {inDraft}
                        </div>
                      )}
                      <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, paddingRight: inDraft > 0 ? 28 : 0 }}>{item.name}</div>
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
                  <div style={{ gridColumn: "1 / -1", padding: "40px 0", textAlign: "center", color: "var(--ink-3)" }}>
                    Ничего не найдено
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* Info + history panel for orders that can't be modified */
          <div style={{ overflow: "auto", padding: 20 }}>
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ color: "var(--ink-3)", fontSize: 13 }}>Приоритет</span>
                  <PriorityChip priority={order.priority} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: "var(--ink-3)", fontSize: 13 }}>Официант</span>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{order.waiter?.full_name ?? "—"}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--ink-3)", fontSize: 13 }}>Создан</span>
                  <span style={{ fontSize: 13 }}>{fmtTime(order.created_at)}</span>
                </div>
              </div>
            </div>

            {order.events.length > 0 && (
              <div className="card">
                <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 600 }}>История</div>
                <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 10 }}>
                  {[...order.events].reverse().map(ev => (
                    <div key={ev.id} style={{ display: "flex", gap: 12, fontSize: 13 }}>
                      <div style={{ fontSize: 11, color: "var(--ink-3)", minWidth: 80, paddingTop: 1 }}>
                        {fmtTime(ev.created_at)}
                      </div>
                      <div>{ev.message || formatEvent(ev.event_type, ev.from_status, ev.to_status)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {confirmStatus && (
        <Modal
          title="Изменить статус?"
          onClose={() => setConfirmStatus(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setConfirmStatus(null)}>Отмена</button>
              <button className="btn primary" onClick={() => handleStatus(confirmStatus)}>Подтвердить</button>
            </>
          }
          width={360}
        >
          <p style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.55 }}>
            Новый статус: <b style={{ color: "var(--ink-1)" }}>{STATUS_LABEL[confirmStatus]}</b>
          </p>
        </Modal>
      )}
    </>
  );
}

function getNextActions(status: string): Array<{ status: OrderStatus; label: string; kind?: string; icon?: string }> {
  switch (status) {
    case "pending":     return []; // only manager can cancel
    case "in_progress": return []; // only manager can cancel; kitchen handles progress
    case "ready":       return [{ status: "served", label: "Подан гостю", kind: "primary", icon: "tray" }];
    case "served":      return [];
    default:            return [];
  }
}

function formatEvent(type: string, from: string | null, to: string | null) {
  if (type === "order.status_changed" && from && to) {
    return `${STATUS_LABEL[from] ?? from} → ${STATUS_LABEL[to] ?? to}`;
  }
  if (type === "order.created") return "Заказ создан";
  if (type === "order.updated") return "Заказ обновлён";
  return type;
}

// ─── WaiterPayment ────────────────────────────────────────────────────────────

interface PaymentProps {
  orderId: number;
  setRoute: (r: { id: string; orderId?: number }) => void;
}

export function WaiterPayment({ orderId, setRoute }: PaymentProps) {
  const { state, createPayment, toast } = useApp();
  const order = state.orders.find(o => o.id === orderId);

  const [method, setMethod] = useState<"cash" | "card" | "qr" | "account">("cash");
  const [discountType, setDiscountType] = useState<"none" | "amount" | "percent">("none");
  const [discountVal, setDiscountVal] = useState("");
  const [received, setReceived] = useState("");
  const [tip, setTip] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [processing, setProcessing] = useState(false);

  if (!order) return <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>Заказ не найден</div>;

  const subtotal = parseFloat(order.total_amount);
  const discountAmt = discountType === "amount" ? (parseFloat(discountVal) || 0) :
    discountType === "percent" ? subtotal * (parseFloat(discountVal) || 0) / 100 : 0;
  const tipAmt = parseFloat(tip) || 0;
  const finalAmt = Math.max(0, subtotal - discountAmt) + tipAmt;
  const receivedAmt = parseFloat(received) || 0;
  const change = method === "cash" ? Math.max(0, receivedAmt - finalAmt) : 0;

  const pay = async () => {
    setProcessing(true);
    try {
      await createPayment({
        order_id: orderId,
        method,
        amount_received: method === "cash" ? receivedAmt : finalAmt,
        discount_type: discountType !== "none" ? discountType : undefined,
        discount_value: discountType !== "none" ? parseFloat(discountVal) || 0 : undefined,
        tip_amount: tipAmt || undefined,
      });
      toast("success", `Заказ #${orderId} оплачен`);
      setRoute({ id: "w_tables" });
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Ошибка оплаты");
    } finally {
      setProcessing(false);
      setConfirm(false);
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
        <button className="iconbtn borderless" onClick={() => setRoute({ id: "w_order_details", orderId })}>
          <Icon name="back" />
        </button>
        <div style={{ fontWeight: 600 }}>Оплата заказа #{orderId}</div>
        <div style={{ flex: 1 }} />
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", height: "calc(100vh - 56px)", overflow: "hidden" }}>
        {/* Left: order summary */}
        <div style={{ overflow: "auto", padding: 24 }}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 600 }}>
              Состав заказа · Стол {order.table?.number ?? order.table_id}
            </div>
            {order.items.map(item => (
              <div key={item.id} style={{ padding: "10px 18px", borderBottom: "1px solid var(--line-1)", display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                <span>{item.menu_item?.name ?? `#${item.menu_item_id}`} ×{item.quantity}</span>
                <span style={{ fontWeight: 500 }}>{fmtKZT(item.line_total)}</span>
              </div>
            ))}
            <div style={{ padding: "12px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-3)", fontSize: 13, marginBottom: 8 }}>
                <span>Итого</span><span>{fmtKZT(order.total_amount)}</span>
              </div>
              {discountAmt > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--olive)", fontSize: 13, marginBottom: 8 }}>
                  <span>Скидка</span><span>−{fmtKZT(discountAmt)}</span>
                </div>
              )}
              {tipAmt > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-3)", fontSize: 13, marginBottom: 8 }}>
                  <span>Чаевые</span><span>+{fmtKZT(tipAmt)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 18, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--line-1)" }}>
                <span>К оплате</span><span>{fmtKZT(finalAmt)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: payment form */}
        <aside style={{ borderLeft: "1px solid var(--line-1)", background: "var(--bg-paper)", overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Способ оплаты</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {METHODS.map(m => (
                <button
                  key={m.id}
                  className={`btn ${method === m.id ? "primary" : ""}`}
                  style={{ flexDirection: "column", padding: "14px 8px", height: 72, gap: 6 }}
                  onClick={() => setMethod(m.id)}
                >
                  <Icon name={m.icon} size={20} />
                  <span style={{ fontSize: 12 }}>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Скидка</div>
            <div className="segmented" style={{ marginBottom: discountType !== "none" ? 8 : 0 }}>
              <div className={discountType === "none" ? "seg active" : "seg"} onClick={() => setDiscountType("none")}>Нет</div>
              <div className={discountType === "amount" ? "seg active" : "seg"} onClick={() => setDiscountType("amount")}>₸</div>
              <div className={discountType === "percent" ? "seg active" : "seg"} onClick={() => setDiscountType("percent")}><Icon name="percent" size={13} /></div>
            </div>
            {discountType !== "none" && (
              <input
                className="input"
                type="number"
                placeholder={discountType === "amount" ? "Сумма скидки ₸" : "Процент скидки %"}
                value={discountVal}
                onChange={e => setDiscountVal(e.target.value)}
              />
            )}
          </div>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Чаевые</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {[0, 5, 10, 15].map(pct => {
                const amt = pct === 0 ? 0 : Math.round(subtotal * pct / 100);
                return (
                  <button
                    key={pct}
                    className={`btn sm ${tipAmt === amt && pct > 0 ? "primary" : pct === 0 && !tipAmt ? "primary" : ""}`}
                    onClick={() => setTip(amt > 0 ? String(amt) : "")}
                  >
                    {pct === 0 ? "Нет" : `${pct}%`}
                  </button>
                );
              })}
            </div>
            <input className="input" type="number" placeholder="Своя сумма чаевых" value={tip} onChange={e => setTip(e.target.value)} />
          </div>

          {method === "cash" && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Принято наличными</div>
              <input
                className="input"
                type="number"
                placeholder={fmtKZT(finalAmt)}
                value={received}
                onChange={e => setReceived(e.target.value)}
              />
              {change > 0 && (
                <div style={{ marginTop: 10, padding: 12, background: "var(--olive-soft)", border: "1px solid var(--olive)", borderRadius: "var(--r)", textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Сдача</div>
                  <div className="num" style={{ fontSize: 22, fontWeight: 700, color: "var(--olive)" }}>{fmtKZT(change)}</div>
                </div>
              )}
            </div>
          )}

          <button
            className="btn success block lg"
            style={{ marginTop: "auto" }}
            onClick={() => setConfirm(true)}
            disabled={processing || (method === "cash" && receivedAmt < finalAmt)}
          >
            <Icon name="check" /> Принять оплату {fmtKZT(finalAmt)}
          </button>
        </aside>
      </div>

      {confirm && (
        <Modal
          title="Подтвердить оплату?"
          onClose={() => setConfirm(false)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setConfirm(false)}>Отмена</button>
              <button className="btn success" onClick={pay} disabled={processing}>
                {processing ? <><span className="spin" /> Обработка...</> : "Подтвердить"}
              </button>
            </>
          }
          width={360}
        >
          <div className="num" style={{ fontSize: 32, fontWeight: 700, textAlign: "center", marginBottom: 8 }}>{fmtKZT(finalAmt)}</div>
          <div style={{ textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
            {METHODS_MAP[method]} · Заказ #{orderId}
          </div>
        </Modal>
      )}
    </>
  );
}

const METHODS_MAP: Record<string, string> = { cash: "Наличные", card: "Карта", qr: "QR / Kaspi", account: "На счёт" };
