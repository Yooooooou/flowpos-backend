import { useEffect } from "react";
import { Icon } from "./Icon";

// ─── Constants ────────────────────────────────────────────────────────────────

export const STATUS_LABEL: Record<string, string> = {
  pending: "Ожидает", in_progress: "Готовится", ready: "Готов",
  served: "Подан", paid: "Оплачен", cancelled: "Отменён",
};

export const STATUS_CLASS: Record<string, string> = {
  pending: "pending", in_progress: "progress", ready: "ready",
  served: "served", paid: "paid", cancelled: "cancel",
};

export const PRI_LABEL: Record<string, string> = {
  low: "Низкий", normal: "Обычный", high: "Высокий", urgent: "Срочно",
};

export const TABLE_STATUS_LABEL: Record<string, string> = {
  free: "Свободен", occupied: "Занят", reserved: "Бронь", cleaning: "Уборка",
};

// ─── Formatters ───────────────────────────────────────────────────────────────

export function fmtKZT(v: string | number | null | undefined): string {
  if (v == null) return "—";
  const n = typeof v === "string" ? parseFloat(v) : v;
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("ru-RU").format(Math.round(n)) + " ₸";
}

export function fmtTime(ts: string | number): string {
  return new Date(ts).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function fmtMin(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

export function StatusBadge({ status, size }: { status: string; size?: "lg" }) {
  return (
    <span className={`badge ${STATUS_CLASS[status] ?? "neutral"} ${size === "lg" ? "lg" : ""}`}>
      <span className="dot" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ─── PriorityChip ─────────────────────────────────────────────────────────────

export function PriorityChip({ priority, showLabel = true }: { priority: string; showLabel?: boolean }) {
  return (
    <span className={`pri ${priority}`}>
      <span className="flag" />
      {showLabel && PRI_LABEL[priority]}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  title?: string;
  sub?: string;
  onClose?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number | string;
}

export function Modal({ title, sub, onClose, children, footer, width }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="scrim" onClick={e => { if ((e.target as Element).classList.contains("scrim")) onClose?.(); }}>
      <div className="modal" style={width ? { width } : undefined} onClick={e => e.stopPropagation()}>
        {(title || sub) && (
          <div className="modal-head">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ flex: 1 }}>
                {title && <h3>{title}</h3>}
                {sub && <div className="sub">{sub}</div>}
              </div>
              {onClose && (
                <button className="iconbtn borderless" onClick={onClose} aria-label="Закрыть">
                  <Icon name="x" />
                </button>
              )}
            </div>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ─── ConfirmModal ─────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmKind?: "danger" | "primary" | "success";
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmModal({ title, message, confirmLabel = "Подтвердить", confirmKind = "danger", onConfirm, onClose }: ConfirmModalProps) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>Отмена</button>
          <button className={`btn ${confirmKind}`} onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</button>
        </>
      }
    >
      <div style={{ color: "var(--ink-2)", lineHeight: 1.55 }}>{message}</div>
    </Modal>
  );
}

// ─── Empty ────────────────────────────────────────────────────────────────────

export function Empty({ icon = "tray", title, message, action }: { icon?: string; title: string; message?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-ico"><Icon name={icon} size={26} /></div>
      <h4>{title}</h4>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

// ─── Metric ───────────────────────────────────────────────────────────────────

interface MetricProps {
  label: string;
  value: React.ReactNode;
  delta?: number;
  deltaKind?: "up" | "down";
  hint?: string;
  icon?: string;
  spark?: number[];
}

export function Metric({ label, value, delta, deltaKind, hint, icon, spark }: MetricProps) {
  return (
    <div className="metric">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {icon && <Icon name={icon} size={14} style={{ color: "var(--ink-3)" }} />}
        <div className="m-label">{label}</div>
      </div>
      <div className="m-value">{value}</div>
      {delta != null && (
        <div className={`m-delta ${deltaKind ?? (delta >= 0 ? "up" : "down")}`}>
          {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}{hint ? ` · ${hint}` : ""}
        </div>
      )}
      {spark && (
        <div className="m-spark">
          <Spark data={spark} />
        </div>
      )}
    </div>
  );
}

// ─── Spark ────────────────────────────────────────────────────────────────────

export function Spark({ data, w = 80, h = 28, color = "var(--brand)" }: { data: number[]; w?: number; h?: number; color?: string }) {
  if (!data.length) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const r = (max - min) || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / r) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
