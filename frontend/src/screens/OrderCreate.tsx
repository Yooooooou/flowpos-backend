import { useState } from "react";
import { useApp } from "../lib/store";
import type { MenuItem, OrderItemInput, OrderPriority } from "../types";
import { Icon } from "../components/Icon";
import { fmtKZT, PRI_LABEL, Modal, ConfirmModal } from "../components/UI";

interface CartItem {
  menu_item_id: number;
  name: string;
  quantity: number;
  unit_price: number;
  prep: number;
  note: string;
}

interface Props {
  tableId?: number;
  orderId?: number;
  setRoute: (r: { id: string; tableId?: number; orderId?: number }) => void;
}

export function OrderCreate({ tableId, orderId, setRoute }: Props) {
  const { state, createOrder, updateOrder, toast } = useApp();

  const isEdit = orderId != null;
  const existing = isEdit ? state.orders.find(o => o.id === orderId) : null;
  const table = state.tables.find(t => t.id === (tableId ?? existing?.table_id));

  const [cart, setCart] = useState<CartItem[]>(() =>
    existing ? existing.items.map(i => ({
      menu_item_id: i.menu_item_id,
      name: i.menu_item?.name ?? `#${i.menu_item_id}`,
      quantity: i.quantity,
      unit_price: parseFloat(i.unit_price),
      prep: i.menu_item?.preparation_time_minutes ?? 0,
      note: i.note ?? "",
    })) : []
  );
  const [note, setNote] = useState(existing?.customer_note ?? "");
  const [priority, setPriority] = useState<OrderPriority>(existing?.priority ?? "normal");
  const [activeCat, setActiveCat] = useState<number | undefined>(state.categories[0]?.id);
  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(true);
  const [editingItem, setEditingItem] = useState<number | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [sending, setSending] = useState(false);

  const items = state.items.filter(i =>
    i.is_available &&
    (!search ? i.category_id === activeCat : true) &&
    (search ? i.name.toLowerCase().includes(search.toLowerCase()) : true)
  );

  const addItem = (item: MenuItem) => {
    setCart(prev => {
      const ex = prev.find(c => c.menu_item_id === item.id && !c.note);
      if (ex) return prev.map(c => c === ex ? { ...c, quantity: c.quantity + 1 } : c);
      return [...prev, {
        menu_item_id: item.id,
        name: item.name,
        quantity: 1,
        unit_price: parseFloat(item.price),
        prep: item.preparation_time_minutes,
        note: "",
      }];
    });
  };

  const updateQty = (idx: number, q: number) =>
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, quantity: Math.max(1, q) } : c));

  const removeItem = (idx: number) =>
    setCart(prev => prev.filter((_, i) => i !== idx));

  const setItemNote = (idx: number, n: string) =>
    setCart(prev => prev.map((c, i) => i === idx ? { ...c, note: n } : c));

  const subtotal = cart.reduce((s, c) => s + c.unit_price * c.quantity, 0);
  const serviceFee = Math.round(subtotal * 0.10);
  const total = subtotal + serviceFee;
  const totalItems = cart.reduce((s, c) => s + c.quantity, 0);
  const maxPrep = cart.length ? Math.max(...cart.map(c => c.prep)) : 0;

  const send = async () => {
    if (!cart.length) return;
    setSending(true);
    try {
      const items: OrderItemInput[] = cart.map(c => ({ menu_item_id: c.menu_item_id, quantity: c.quantity, note: c.note || undefined }));
      if (isEdit && orderId) {
        await updateOrder(orderId, { items, customer_note: note, priority });
        toast("success", `Заказ #${orderId} обновлён`);
        setRoute({ id: "w_order_details", orderId });
      } else {
        const order = await createOrder({ table_id: table!.id, items, customer_note: note, priority });
        toast("success", `Заказ #${order.id} отправлен на кухню`);
        setRoute({ id: "w_orders" });
      }
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Ошибка создания заказа");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <header className="topbar">
        <button className="iconbtn borderless" onClick={() => cart.length ? setConfirmCancel(true) : setRoute({ id: isEdit ? "w_order_details" : "w_tables", orderId })}>
          <Icon name="back" />
        </button>
        <div style={{ fontWeight: 600, fontSize: 15 }}>
          {isEdit ? `Редактирование заказа #${orderId}` : "Новый заказ"}
          {table && <span style={{ marginLeft: 12, fontWeight: 400, color: "var(--ink-3)", fontSize: 13 }}>Стол {table.number} · {table.seats} мест</span>}
        </div>
        <div style={{ flex: 1 }} />
        {!cartOpen && (
          <button className="btn primary" onClick={() => setCartOpen(true)}>
            <Icon name="orders" /> Корзина {totalItems > 0 && `· ${totalItems}`}
          </button>
        )}
      </header>

      <div className="order-create-grid" style={{
        display: "grid",
        gridTemplateColumns: cartOpen ? "1fr 380px" : "1fr",
        height: "calc(100vh - 56px)",
        overflow: "hidden",
      }}>
        {/* Menu */}
        <div style={{ display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--line-1)", background: "var(--bg-paper)" }}>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input
                className="input"
                placeholder="Поиск по меню..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ paddingLeft: 36 }}
              />
              <Icon name="search" size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-4)" }} />
            </div>
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
              {state.categories.map(c => (
                <button
                  key={c.id}
                  className={`btn sm ${activeCat === c.id && !search ? "primary" : ""}`}
                  onClick={() => { setActiveCat(c.id); setSearch(""); }}
                  style={{ flex: "none", minHeight: 36 }}
                >
                  {c.name}
                  <span style={{ opacity: 0.6, fontSize: 11, marginLeft: 4 }}>
                    {state.items.filter(i => i.category_id === c.id).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflow: "auto", padding: 16, background: "var(--bg-canvas)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))", gap: 10 }}>
              {items.map(item => {
                const inCart = cart.filter(c => c.menu_item_id === item.id).reduce((s, c) => s + c.quantity, 0);
                return (
                  <button
                    key={item.id}
                    onClick={() => addItem(item)}
                    style={{
                      position: "relative",
                      textAlign: "left",
                      background: "var(--bg-paper)",
                      border: `1px solid ${inCart ? "var(--brand)" : "var(--line-1)"}`,
                      borderRadius: "var(--r)",
                      padding: 14,
                      cursor: "pointer",
                      color: "inherit",
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      minHeight: 120,
                      boxShadow: inCart ? "0 0 0 2px var(--brand) inset" : "var(--sh-1)",
                      transition: "all 120ms",
                    }}
                  >
                    {inCart > 0 && (
                      <div style={{
                        position: "absolute", top: 8, right: 8,
                        background: "var(--brand)", color: "white",
                        borderRadius: 999, padding: "2px 8px",
                        fontSize: 11, fontWeight: 700,
                      }}>×{inCart}</div>
                    )}
                    <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.3, paddingRight: inCart > 0 ? 36 : 0 }}>{item.name}</div>
                    {item.description && <div style={{ fontSize: 11.5, color: "var(--ink-3)", lineHeight: 1.4 }}>{item.description}</div>}
                    <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontWeight: 600, fontSize: 14 }}>{fmtKZT(item.price)}</span>
                      <span style={{ fontSize: 11, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 3 }}>
                        <Icon name="clock" size={11} /> {item.preparation_time_minutes}м
                      </span>
                    </div>
                  </button>
                );
              })}
              {items.length === 0 && (
                <div style={{ gridColumn: "1 / -1", padding: "40px 20px", textAlign: "center", color: "var(--ink-3)" }}>
                  Ничего не найдено
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Cart */}
        {cartOpen && (
          <aside className="order-create-cart" style={{
            background: "var(--bg-paper)",
            borderLeft: "1px solid var(--line-1)",
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
          }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--line-1)", display: "flex", alignItems: "center" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>Корзина {table && `· Стол ${table.number}`}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{totalItems} поз. · ≈{maxPrep}м</div>
              </div>
              <button className="iconbtn borderless" onClick={() => setCartOpen(false)}><Icon name="x" /></button>
            </div>

            <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
              {cart.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-3)" }}>
                  <Icon name="orders" size={32} style={{ opacity: 0.3, display: "block", margin: "0 auto 12px" }} />
                  <div style={{ fontWeight: 600, color: "var(--ink-1)" }}>Корзина пустая</div>
                  <div style={{ fontSize: 12, marginTop: 4 }}>Нажмите на блюдо, чтобы добавить</div>
                </div>
              ) : (
                cart.map((c, idx) => (
                  <div key={idx} style={{ padding: "10px 16px", borderBottom: "1px solid var(--line-1)" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                          {fmtKZT(c.unit_price)} × {c.quantity} = <b style={{ color: "var(--ink-1)" }}>{fmtKZT(c.unit_price * c.quantity)}</b>
                        </div>
                      </div>
                      <button
                        className="iconbtn borderless"
                        style={{ color: "var(--red)" }}
                        onClick={() => removeItem(idx)}
                      >
                        <Icon name="trash" size={15} />
                      </button>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", border: "1px solid var(--line-2)", borderRadius: 6, overflow: "hidden" }}>
                        <button style={{ width: 30, height: 30, background: "var(--bg-sunken)", border: 0, cursor: "pointer" }} onClick={() => updateQty(idx, c.quantity - 1)}>−</button>
                        <div style={{ width: 32, textAlign: "center", fontWeight: 600 }}>{c.quantity}</div>
                        <button style={{ width: 30, height: 30, background: "var(--bg-sunken)", border: 0, cursor: "pointer" }} onClick={() => updateQty(idx, c.quantity + 1)}>+</button>
                      </div>
                      <button
                        className="btn sm"
                        style={{ flex: 1, justifyContent: "flex-start", color: c.note ? "var(--ink-1)" : "var(--ink-3)" }}
                        onClick={() => setEditingItem(idx)}
                      >
                        <Icon name="note" size={13} /> {c.note ? (c.note.length > 22 ? c.note.slice(0, 22) + "…" : c.note) : "Комментарий"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ borderTop: "1px solid var(--line-1)", padding: 16, background: "var(--bg-canvas)" }}>
              <div className="field" style={{ marginBottom: 10 }}>
                <label className="field-label">Приоритет</label>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["low", "normal", "high", "urgent"] as const).map(p => (
                    <button
                      key={p}
                      className={`btn sm ${priority === p ? "primary" : ""}`}
                      style={{ flex: 1, fontSize: 11, justifyContent: "center" }}
                      onClick={() => setPriority(p)}
                    >
                      {PRI_LABEL[p]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="field" style={{ marginBottom: 12 }}>
                <label className="field-label">Комментарий гостя</label>
                <input className="input" placeholder="Аллергии, пожелания..." value={note} onChange={e => setNote(e.target.value)} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-3)" }}>
                  <span>Подытог</span><span>{fmtKZT(subtotal)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ink-3)" }}>
                  <span>Сервис 10%</span><span>{fmtKZT(serviceFee)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, paddingTop: 6, borderTop: "1px dashed var(--line-1)" }}>
                  <span style={{ fontWeight: 600 }}>Итого</span>
                  <span style={{ fontWeight: 700, fontSize: 17 }}>{fmtKZT(total)}</span>
                </div>
              </div>

              <button className="btn primary block lg" disabled={!cart.length || sending} onClick={send}>
                {sending
                  ? <><span className="spin" /> Отправка...</>
                  : isEdit
                    ? <><Icon name="check" /> Сохранить</>
                    : <><Icon name="forward" /> Отправить на кухню</>
                }
              </button>
            </div>
          </aside>
        )}
      </div>

      {editingItem != null && (
        <Modal
          title="Комментарий к позиции"
          sub={cart[editingItem]?.name}
          onClose={() => setEditingItem(null)}
          footer={<button className="btn primary" onClick={() => setEditingItem(null)}>Готово</button>}
          width={420}
        >
          <textarea
            className="textarea"
            autoFocus
            placeholder="Например: без лука, прожарка medium..."
            value={cart[editingItem]?.note ?? ""}
            onChange={e => setItemNote(editingItem, e.target.value)}
            rows={3}
          />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
            {["Без лука", "Без сахара", "Острее", "Принести позже", "С собой"].map(q => (
              <button key={q} className="btn sm" onClick={() => setItemNote(editingItem, q)}>{q}</button>
            ))}
          </div>
        </Modal>
      )}

      {confirmCancel && (
        <ConfirmModal
          title="Отменить создание заказа?"
          message="Все добавленные позиции будут потеряны."
          confirmLabel="Да, отменить"
          onConfirm={() => setRoute({ id: "w_tables" })}
          onClose={() => setConfirmCancel(false)}
        />
      )}
    </>
  );
}
