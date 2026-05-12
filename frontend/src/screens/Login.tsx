import { useState } from "react";
import { useApp } from "../lib/store";

const QUICK_ROLES = [
  { label: "Официант", username: "waiter1", password: "pass", desc: "Принимать заказы, обслуживать столы" },
  { label: "Кухня", username: "kitchen1", password: "pass", desc: "Видеть заказы, менять статус готовки" },
  { label: "Менеджер", username: "manager", password: "pass", desc: "Полный доступ к системе" },
];

export function Login() {
  const { login, toast } = useApp();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (u?: string, p?: string) => {
    const user = u ?? username.trim();
    const pass = p ?? password;
    if (!user || !pass) { toast("error", "Введите логин и пароль"); return; }
    setLoading(true);
    try {
      await login(user, pass);
    } catch (e: unknown) {
      toast("error", e instanceof Error ? e.message : "Неверный логин или пароль");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      background: "var(--bg-canvas)",
    }}>
      {/* Left panel */}
      <div style={{
        background: "var(--brand)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "60px 56px",
        color: "white",
      }}>
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px", marginBottom: 12 }}>
          Flow<span style={{ opacity: 0.7 }}>POS</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.4, marginBottom: 8 }}>
          Управление рестораном<br />в одном окне
        </div>
        <div style={{ opacity: 0.8, fontSize: 14, marginBottom: 48 }}>
          Быстрый приём заказов, кухонный дисплей,<br />аналитика и смены — всё здесь.
        </div>

        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          Быстрый вход
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {QUICK_ROLES.map((r) => (
            <button
              key={r.username}
              onClick={() => submit(r.username, r.password)}
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: "var(--r)",
                padding: "12px 16px",
                textAlign: "left",
                cursor: "pointer",
                color: "white",
                transition: "background 150ms",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.25)")}
              onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
            >
              <div style={{ fontWeight: 600, fontSize: 14 }}>{r.label}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{r.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px",
      }}>
        <div style={{ width: "100%", maxWidth: 380 }}>
          <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Вход в систему</div>
          <div style={{ fontSize: 14, color: "var(--ink-3)", marginBottom: 32 }}>
            Введите данные вашего аккаунта
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label className="field-label">Логин</label>
            <input
              className="input"
              placeholder="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              autoFocus
              autoComplete="username"
            />
          </div>
          <div className="field" style={{ marginBottom: 24 }}>
            <label className="field-label">Пароль</label>
            <input
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submit()}
              autoComplete="current-password"
            />
          </div>

          <button
            className="btn primary block lg"
            onClick={() => submit()}
            disabled={loading}
          >
            {loading ? "Вход..." : "Войти"}
          </button>

          <div style={{ marginTop: 32, padding: 16, background: "var(--bg-sunken)", borderRadius: "var(--r)", fontSize: 12, color: "var(--ink-3)" }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Тестовые аккаунты</div>
            <div>manager / pass — Менеджер</div>
            <div>waiter1 / pass — Официант</div>
            <div>kitchen1 / pass — Кухня</div>
          </div>
        </div>
      </div>
    </div>
  );
}
