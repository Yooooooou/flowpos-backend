import { useState } from "react";
import { useApp } from "../lib/store";
import { Icon } from "../components/Icon";

const QUICK_ROLES = [
  { role: "waiter",  label: "Официант",  hint: "waiter / waiter123",   icon: "tray",    username: "waiter",  password: "waiter123" },
  { role: "kitchen", label: "Кухня",     hint: "kitchen / kitchen123", icon: "kitchen", username: "kitchen", password: "kitchen123" },
  { role: "manager", label: "Менеджер",  hint: "manager / manager123", icon: "user",    username: "manager", password: "manager123" },
];

export function Login() {
  const { login, toast } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (u?: string, p?: string) => {
    const user = u ?? username.trim();
    const pass = p ?? password;
    if (!user || !pass) { setError("Введите логин и пароль"); return; }
    setError(null);
    setLoading(true);
    try {
      await login(user, pass);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Неверный логин или пароль");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "radial-gradient(1100px 600px at 70% 10%, #f1e8d3 0%, var(--bg-app) 60%)",
      display: "grid", placeItems: "center",
      color: "var(--ink-1)",
    }}>
      {/* Logo */}
      <div style={{ position: "absolute", top: 20, left: 28, display: "flex", alignItems: "center", gap: 10 }}>
        <div className="brand-mark">F</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em" }}>
            Flow<span style={{ color: "var(--brand)" }}>POS</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>POS-система для кафе</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center", maxWidth: 980, padding: 24 }}>
        {/* Left: tagline + role cards */}
        <div>
          <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 12 }}>
            Тихий <span style={{ color: "var(--brand)" }}>зал</span>, быстрый <span style={{ color: "var(--amber)" }}>заказ</span>.
          </div>
          <div style={{ fontSize: 15, color: "var(--ink-3)", maxWidth: 380, marginBottom: 28, lineHeight: 1.55 }}>
            Войдите как официант, кухня или менеджер. Системные роли определяют доступ к интерфейсам.
          </div>
          <div style={{ display: "grid", gap: 10, maxWidth: 360 }}>
            {QUICK_ROLES.map(r => (
              <button
                key={r.role}
                onClick={() => submit(r.username, r.password)}
                disabled={loading}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  background: "var(--bg-paper)", border: "1px solid var(--line-1)",
                  borderRadius: "var(--r)", padding: "12px 14px",
                  textAlign: "left", cursor: "pointer", color: "var(--ink-1)",
                  transition: "all 140ms ease",
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--brand)"; e.currentTarget.style.boxShadow = "var(--sh-2)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--line-1)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ width: 38, height: 38, borderRadius: 8, background: "var(--bg-sunken)", display: "grid", placeItems: "center" }}>
                  <Icon name={r.icon} size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{r.hint}</div>
                </div>
                <Icon name="forward" size={16} style={{ color: "var(--ink-3)" }} />
              </button>
            ))}
          </div>
        </div>

        {/* Right: login form */}
        <form
          className="card pad"
          style={{ padding: 28, maxWidth: 380 }}
          onSubmit={e => { e.preventDefault(); submit(); }}
        >
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Вход в систему</div>
          <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 22 }}>Используйте корпоративный логин</div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label className="field-label">Логин</label>
            <input
              className="input"
              placeholder="manager / waiter / kitchen"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label className="field-label">Пароль</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div style={{
              padding: "8px 10px", borderRadius: 6, marginBottom: 14,
              background: "var(--st-cancel-bg)", color: "var(--st-cancel-fg)",
              border: "1px solid var(--st-cancel-line)",
              fontSize: 12.5, fontWeight: 500,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <Icon name="warning" size={14} /> {error}
            </div>
          )}

          <button type="submit" className="btn primary block lg" disabled={loading}>
            {loading ? <><span className="spin" /> Подождите...</> : <>Войти <Icon name="forward" /></>}
          </button>

          <div style={{ marginTop: 18, fontSize: 11.5, color: "var(--ink-3)", display: "flex", justifyContent: "space-between" }}>
            <span>Flow<span style={{ color: "var(--brand)" }}>POS</span> · v4.2.1</span>
            <span style={{ color: "var(--brand)", cursor: "pointer" }}>Помощь</span>
          </div>
        </form>
      </div>

      <div style={{ position: "absolute", bottom: 16, left: 28, fontSize: 11, color: "var(--ink-4)" }}>
        © 2026 FlowPOS · Защищённое соединение
      </div>
    </div>
  );
}
