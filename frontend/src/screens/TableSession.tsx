import { useState } from "react";
import { useApp } from "../lib/store";
import type { MenuItem, Order } from "../types";
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
  const { state, createOrder, changeStatus, toast } = useApp();

  const table = state.tables.find(t => t.id === tableId);
  const orders = state.orders
    .filter(o => o.table_id === tableId && !["paid", "cancelled"].includes(o.status))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const [additions, setAdditions] = useState<CartItem[]>([]);
  const [activeCat, setActiveCat] = useState<number | undefined>(state.categories[0]?.id);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmServe, setConfirmServe] = useState(false);

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
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--ink-3)", minWidth: 28, textAlign: "center", flexShrink: 0 }}>
                      ×{item.quantity}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.menu_item?.name ?? `#${item.menu_item_id}`}
                      </div>
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
                    display: "flex", alignItems: "center", gap: 10,
                    background: "color-mix(in srgb, var(--brand) 4%, transparent)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--line-2)", borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
                      <button style={{ width: 26, height: 26, background: "var(--bg-sunken)", border: 0, cursor: "pointer", fontSize: 16, color: "var(--red)", lineHeight: 1 }}
                        onClick={() => setAdditionQty(idx, item.quantity - 1)}>−</button>
                      <div style={{ width: 26, textAlign: "center", fontWeight: 700, fontSize: 13 }}>{item.quantity}</div>
                      <button style={{ width: 26, height: 26, background: "var(--bg-sunken)", border: 0, cursor: "pointer", fontSize: 16, color: "var(--brand)", lineHeight: 1 }}
                        onClick={() => setAdditionQty(idx, item.quantity + 1)}>+</button>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, flexShrink: 0 }}>{fmtKZT(item.unit_price * item.quantity)}</div>
                  </div>
                ))}
              </>
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
  const { state, createPayment, toast } = useApp();

  const table = state.tables.find(t => t.id === tableId);
  const orders = state.orders
    .filter(o => o.table_id === tableId && !["paid", "cancelled"].includes(o.status))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const [method, setMethod] = useState<"cash" | "card" | "qr" | "account">("cash");
  const [received, setReceived] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [processing, setProcessing] = useState(false);

  const total = orders.reduce((s, o) => s + parseFloat(o.total_amount), 0);
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

  const pay = async () => {
    setProcessing(true);
    try {
      for (const order of orders) {
        await createPayment({
          order_id: order.id,
          method,
          amount_received: parseFloat(order.total_amount),
        });
      }
      toast("success", `Стол ${table?.number ?? tableId} оплачен`);
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
        <button className="iconbtn borderless" onClick={() => setRoute({ id: "w_table_session", tableId })}>
          <Icon name="back" />
        </button>
        <div style={{ fontWeight: 600 }}>
          Оплата · Стол {table?.number ?? tableId}
          {orders.length > 1 && <span style={{ marginLeft: 8, fontWeight: 400, color: "var(--ink-3)", fontSize: 13 }}>{orders.length} заказа</span>}
        </div>
        <div style={{ flex: 1 }} />
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", height: "calc(100vh - 56px)", overflow: "hidden" }}>
        {/* Left: order breakdown */}
        <div style={{ overflow: "auto", padding: 24 }}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 600 }}>
              Состав · Стол {table?.number ?? tableId}
            </div>
            {orders.map(order => (
              <div key={order.id}>
                {orders.length > 1 && (
                  <div style={{ padding: "6px 18px", background: "var(--bg-canvas)", borderBottom: "1px solid var(--line-1)", fontSize: 11, color: "var(--ink-4)" }}>
                    Заказ #{order.id} · {fmtTime(order.created_at)}
                  </div>
                )}
                {order.items.map(item => (
                  <div key={item.id} style={{ padding: "9px 18px", borderBottom: "1px solid var(--line-1)", display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>{item.menu_item?.name ?? `#${item.menu_item_id}`} ×{item.quantity}</span>
                    <span style={{ fontWeight: 500 }}>{fmtKZT(item.line_total)}</span>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ padding: "12px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 18, paddingTop: 4 }}>
                <span>Итого</span><span className="num">{fmtKZT(total)}</span>
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

          <button
            className="btn success block lg"
            style={{ marginTop: "auto" }}
            onClick={() => setConfirm(true)}
            disabled={processing || (method === "cash" && receivedAmt < total && receivedAmt > 0)}
          >
            <Icon name="check" /> Принять оплату {fmtKZT(total)}
          </button>
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
          </div>
        </Modal>
      )}
    </>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

export { dominantStatus };

const METHODS_MAP: Record<string, string> = { cash: "Наличные", card: "Карта", qr: "QR / Kaspi", account: "На счёт" };
