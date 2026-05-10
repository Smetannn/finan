import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { register as registerRequest } from "../../api/auth";
import { useAuthStore } from "../../store/authStore";
import styles from "./Register.module.css";

export default function Register() {
  const navigate = useNavigate();
  const loginStore = useAuthStore((s) => s.login);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const passwordsMatch = password === passwordConfirm;
  const showPasswordMismatch =
    passwordConfirm.length > 0 && !passwordsMatch;
  const submitDisabled = loading || !passwordsMatch;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!passwordsMatch) {
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const { token, user } = await registerRequest(email, password, name);
      loginStore(token, { id: user.id, email: user.email, name: user.name });
      navigate("/dashboard", { replace: true });
    } catch {
      setError("Не удалось зарегистрироваться. Возможно, этот адрес уже занят.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <h1 className={styles.title}>Регистрация</h1>
        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label}>
            Имя
            <input
              className={styles.input}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </label>
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
              autoComplete="new-password"
            />
          </label>
          <label className={styles.label}>
            Повторите пароль
            <input
              className={`${styles.input} ${showPasswordMismatch ? styles.inputMismatch : ""}`}
              type="password"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
              autoComplete="new-password"
            />
            {showPasswordMismatch ? (
              <p className={styles.fieldError} role="alert">
                Пароли не совпадают
              </p>
            ) : null}
          </label>
          {error !== null ? <p className={styles.apiError}>{error}</p> : null}
          <button type="submit" className={styles.submit} disabled={submitDisabled}>
            {loading ? "Регистрация…" : "Зарегистрироваться"}
          </button>
        </form>
        <p className={styles.footer}>
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>
    </main>
  );
}
