import { useEffect, useRef, useState } from "react";
import { useApp } from "../lib/store";
import type { Order } from "../types";

function fmtKZT(v: string | number | null | undefined) {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  return new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 }).format(n);
}

const PRI_LABEL: Record<string, string> = { low: "Низкий", normal: "Обычный", high: "Высокий", urgent: "СРОЧНО" };

function useTick(interval = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), interval);
    return () => clearInterval(id);
  }, [interval]);
}

function elapsedSec(dateStr: string) {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
}

function fmtDuration(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function KDSCard({ order, onAction }: { order: Order; onAction: (orderId: number, status: string) => void }) {
  useTick();
  const elapsed = elapsedSec(order.created_at);
  const warn = elapsed > 15 * 60;
  const late = elapsed > 25 * 60;

  const borderColor = order.priority === "urgent" ? "var(--red)" :
    late ? "var(--red)" : warn ? "var(--amber)" : "var(--line-1)";

  const timerColor = late ? "var(--red)" : warn ? "var(--amber)" : "var(--ink-3)";

  return (
    <div style={{
      background: "var(--bg-paper)",
      border: `2px solid ${borderColor}`,
      borderRadius: "var(--r)",
      display: "flex",
      flexDirection: "column",
      animation: "orderArrive 300ms ease",
      boxShadow: order.priority === "urgent" ? "0 0 12px rgba(239,68,68,0.25)" : "var(--sh-1)",
    }}>
      {/* Card header */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid var(--line-1)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: order.priority === "urgent" ? "rgba(239,68,68,0.06)" : undefined,
      }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>#{order.id}</div>
        {order.table && <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Стол {order.table.number}</div>}
        {order.priority !== "normal" && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
            background: order.priority === "urgent" ? "var(--red)" : order.priority === "high" ? "var(--amber)" : "var(--ink-4)",
            color: "white",
          }}>
            {PRI_LABEL[order.priority]}
          </span>
        )}
        <div style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: timerColor, fontVariantNumeric: "tabular-nums" }}>
          ⏱ {fmtDuration(elapsed)}
        </div>
      </div>

      {/* Items */}
      <div style={{ flex: 1, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
        {order.items.map(item => (
          <div key={item.id} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{
              background: "var(--brand)",
              color: "white",
              borderRadius: 6,
              width: 28,
              height: 28,
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 13,
              flexShrink: 0,
            }}>
              {item.quantity}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{item.menu_item?.name ?? `#${item.menu_item_id}`}</div>
              {item.note && <div style={{ fontSize: 12, color: "var(--amber)", marginTop: 2 }}>📝 {item.note}</div>}
            </div>
          </div>
        ))}
        {order.customer_note && (
          <div style={{ marginTop: 4, padding: "6px 10px", background: "var(--amber)15", borderRadius: "var(--r)", fontSize: 12, color: "var(--amber)", borderLeft: "3px solid var(--amber)" }}>
            {order.customer_note}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line-1)" }}>
        {order.status === "pending" && (
          <button className="btn primary block" onClick={() => onAction(order.id, "in_progress")}>
            → Начать готовку
          </button>
        )}
        {order.status === "in_progress" && (
          <button className="btn success block" onClick={() => onAction(order.id, "ready")}>
            ✓ Готово
          </button>
        )}
        {order.status === "ready" && (
          <div style={{ fontSize: 13, textAlign: "center", color: "var(--green)", fontWeight: 600 }}>
            ✓ Готово к подаче
          </div>
        )}
      </div>
    </div>
  );
}

export function KitchenDisplay() {
  const { state, refreshKitchenBoard, changeStatus, toast } = useApp();
  const board = state.kitchenBoard;

  // Auto-refresh every 30s
  useEffect(() => {
    const id = setInterval(refreshKitchenBoard, 30000);
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

  const pending = board?.pending ?? [];
  const inProgress = board?.in_progress ?? [];
  const ready = board?.ready ?? [];

  const totalActive = pending.length + inProgress.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-canvas)" }}>
      {/* Top stat bar */}
      <div style={{
        padding: "10px 20px",
        background: "var(--bg-paper)",
        borderBottom: "1px solid var(--line-1)",
        display: "flex",
        gap: 24,
        alignItems: "center",
      }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>Кухонный дисплей</div>
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          <span style={{ color: totalActive > 0 ? "var(--amber)" : "var(--green)", fontWeight: 600 }}>{totalActive}</span> активных
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          <span style={{ fontWeight: 600 }}>{pending.length}</span> ожидает
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          <span style={{ fontWeight: 600 }}>{inProgress.length}</span> готовится
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>
          <span style={{ fontWeight: 600, color: "var(--green)" }}>{ready.length}</span> готово
        </div>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={refreshKitchenBoard}>Обновить</button>
      </div>

      {/* Kanban columns */}
      <div style={{ flex: 1, overflow: "hidden", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
        <Column title="Ожидает" count={pending.length} color="var(--amber)" orders={pending} onAction={handleAction} />
        <Column title="Готовится" count={inProgress.length} color="var(--brand)" orders={inProgress} onAction={handleAction} />
        <Column title="Готово" count={ready.length} color="var(--green)" orders={ready} onAction={handleAction} />
      </div>
    </div>
  );
}

function Column({ title, count, color, orders, onAction }: {
  title: string;
  count: number;
  color: string;
  orders: Order[];
  onAction: (orderId: number, status: string) => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid var(--line-1)", overflow: "hidden" }}>
      <div style={{
        padding: "12px 16px",
        borderBottom: "1px solid var(--line-1)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "var(--bg-paper)",
      }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
        <span style={{
          marginLeft: "auto",
          background: `${color}20`,
          color,
          borderRadius: 999,
          padding: "2px 10px",
          fontSize: 12,
          fontWeight: 700,
        }}>{count}</span>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {orders.length === 0 ? (
          <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>
            Пусто
          </div>
        ) : (
          orders.map(order => <KDSCard key={order.id} order={order} onAction={onAction} />)
        )}
      </div>
    </div>
  );
}

// ─── Kitchen History ──────────────────────────────────────────────────────────

export function KitchenHistory() {
  const { state, refreshOrders } = useApp();

  const orders = [...state.orders]
    .filter(o => ["ready", "served", "paid"].includes(o.status))
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 50);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "12px 20px", borderBottom: "1px solid var(--line-1)", display: "flex", gap: 12, alignItems: "center" }}>
        <div style={{ fontWeight: 600 }}>История заказов</div>
        <button className="btn sm" style={{ marginLeft: "auto" }} onClick={refreshOrders}>Обновить</button>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {orders.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "var(--ink-3)" }}>История пуста</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr className="list-head">
                <th>Заказ</th><th>Стол</th><th>Статус</th><th>Позиций</th><th>Сумма</th><th>Время</th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id} className="list-row">
                  <td style={{ fontWeight: 600 }}>#{o.id}</td>
                  <td>{o.table ? `Стол ${o.table.number}` : `#${o.table_id}`}</td>
                  <td><span className={`badge ${o.status}`}>{STATUS_LABEL[o.status]}</span></td>
                  <td>{o.items.reduce((s, i) => s + i.quantity, 0)}</td>
                  <td>{fmtKZT(o.total_amount)}</td>
                  <td style={{ fontSize: 12, color: "var(--ink-3)" }}>{new Date(o.updated_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = { pending: "Ожидает", in_progress: "Готовится", ready: "Готово", served: "Подан", paid: "Оплачен", cancelled: "Отменён" };
