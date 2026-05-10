import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { login as loginRequest } from "../../api/auth";
import { useAuthStore } from "../../store/authStore";
import styles from "./Login.module.css";

export default function Login() {
  const navigate = useNavigate();
  const loginStore = useAuthStore((s) => s.login);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await loginRequest(email, password);
      loginStore(token, { id: user.id, email: user.email, name: user.name });
      navigate("/dashboard", { replace: true });
    } catch {
      setError("Неверная электронная почта или пароль");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Вход</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Электронная почта
            <input
              className={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label className={styles.label}>
            Пароль
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {error !== null ? <p className={styles.apiError}>{error}</p> : null}
          <button type="submit" className={styles.submit} disabled={loading}>
            {loading ? "Вход…" : "Войти"}
          </button>
        </form>
        <p className={styles.footer}>
          Нет аккаунта? <Link to="/register">Зарегистрироваться</Link>
        </p>
      </div>
    </main>
  );
}
