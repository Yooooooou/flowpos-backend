import { useState } from "react";
import { useApp } from "../lib/store";
import type { Order, OrderStatus } from "../types";
import { Icon } from "../components/Icon";
import { StatusBadge, PriorityChip, fmtKZT, fmtTime, STATUS_LABEL, Modal, ConfirmModal } from "../components/UI";

interface Props {
  orderId: number;
  setRoute: (r: { id: string; tableId?: number; orderId?: number }) => void;
}

export function OrderDetails({ orderId, setRoute }: Props) {
  const { state, changeStatus, toast } = useApp();
  const order = state.orders.find(o => o.id === orderId);

  const [confirmStatus, setConfirmStatus] = useState<OrderStatus | null>(null);

  if (!order) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--ink-3)" }}>
        Заказ #{orderId} не найден
        <br />
        <button className="btn" style={{ marginTop: 16 }} onClick={() => setRoute({ id: "w_orders" })}>
          <Icon name="back" /> Назад
        </button>
      </div>
    );
  }

  const handleStatus = async (status: OrderStatus) => {
    try {
      await changeStatus(orderId, status);
      toast("success", `Статус обновлён: ${STATUS_LABEL[status]}`);
      setConfirmStatus(null);
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Ошибка");
    }
  };

  const nextActions = getNextActions(order.status);

  return (
    <>
      <header className="topbar">
        <button className="iconbtn borderless" onClick={() => setRoute({ id: "w_orders" })}>
          <Icon name="back" />
        </button>
        <div style={{ fontWeight: 600 }}>
          Заказ #{order.id}
          {order.table && <span style={{ marginLeft: 10, fontWeight: 400, color: "var(--ink-3)", fontSize: 13 }}>Стол {order.table.number}</span>}
        </div>
        <StatusBadge status={order.status} />
        <div style={{ flex: 1 }} />
        {order.status === "served" && (
          <button className="btn primary" onClick={() => setRoute({ id: "w_payment", orderId })}>
            <Icon name="card" /> Оплатить
          </button>
        )}
        {(order.status === "pending" || order.status === "in_progress") && (
          <button className="btn" onClick={() => setRoute({ id: "w_order_create", orderId, tableId: order.table_id })}>
            <Icon name="edit" /> Редактировать
          </button>
        )}
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", height: "calc(100vh - 56px)", overflow: "hidden" }}>
        {/* Items */}
        <div style={{ overflow: "auto", padding: 24 }}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", fontWeight: 600 }}>
              Позиции заказа
            </div>
            <div>
              {order.items.map(item => (
                <div key={item.id} style={{ padding: "12px 18px", borderBottom: "1px solid var(--line-1)", display: "flex", gap: 12, alignItems: "center" }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: 14 }}>{item.menu_item?.name ?? `Позиция #${item.menu_item_id}`}</div>
                    {item.note && (
                      <div style={{ fontSize: 12, color: "var(--amber)", marginTop: 2, display: "flex", gap: 4, alignItems: "center" }}>
                        <Icon name="note" size={11} /> {item.note}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 13, color: "var(--ink-3)" }}>×{item.quantity}</div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{fmtKZT(item.line_total)}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: "12px 18px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-3)", fontSize: 13, marginBottom: 4 }}>
                <span>Подытог</span><span>{fmtKZT(parseFloat(order.total_amount) / 1.1)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-3)", fontSize: 13, marginBottom: 8 }}>
                <span>Сервис 10%</span><span>{fmtKZT(parseFloat(order.total_amount) - parseFloat(order.total_amount) / 1.1)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700 }}>
                <span>Итого</span><span>{fmtKZT(order.total_amount)}</span>
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

        {/* Meta + actions */}
        <aside style={{ borderLeft: "1px solid var(--line-1)", background: "var(--bg-paper)", overflow: "auto", padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div style={{ padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ color: "var(--ink-3)", fontSize: 13 }}>Приоритет</span>
                <PriorityChip priority={order.priority} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: "var(--ink-3)", fontSize: 13 }}>Официант</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{order.waiter?.full_name ?? "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ color: "var(--ink-3)", fontSize: 13 }}>Создан</span>
                <span style={{ fontSize: 13 }}>{fmtTime(order.created_at)}</span>
              </div>
              {order.customer_note && (
                <div style={{ marginTop: 10, padding: 10, background: "var(--bg-sunken)", borderRadius: "var(--r)", fontSize: 13 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: "var(--ink-3)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.04em" }}>Комментарий гостя</div>
                  {order.customer_note}
                </div>
              )}
            </div>
          </div>

          {nextActions.length > 0 && (
            <div className="card">
              <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--line-1)", fontWeight: 600, fontSize: 14 }}>Действия</div>
              <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                {nextActions.map(action => (
                  <button
                    key={action.status}
                    className={`btn block ${action.kind ?? ""}`}
                    onClick={() => setConfirmStatus(action.status)}
                  >
                    <Icon name={action.icon ?? "forward"} /> {action.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
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
    // Waiter can only cancel pending orders (kitchen handles pending→in_progress)
    case "pending":     return [
      { status: "cancelled", label: "Отменить заказ", kind: "danger", icon: "x" },
    ];
    // Kitchen handles in_progress→ready; waiter has no action here
    case "in_progress": return [];
    // Waiter confirms delivery
    case "ready":       return [{ status: "served", label: "Подан гостю", kind: "primary", icon: "tray" }];
    // Payment is handled via the topbar button → WaiterPayment screen
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
    { id: "cash",    label: "Наличные",  icon: "cash"    },
    { id: "card",    label: "Карта",     icon: "card"    },
    { id: "qr",      label: "QR / Kaspi", icon: "qr"    },
    { id: "account", label: "На счёт",  icon: "receipt" },
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
