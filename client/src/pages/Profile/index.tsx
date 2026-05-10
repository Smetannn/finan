import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchGoals } from "../../api/goals";
import { fetchTransactions } from "../../api/transactions";
import { changePassword, deleteAccount, updateProfile } from "../../api/users";
import { useAuthStore } from "../../store/authStore";
import styles from "./Profile.module.css";

function parseAmount(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

function initialsFromName(name: string): string {
  const t = name.trim();
  if (t.length === 0) {
    return "?";
  }
  const ch = t[0];
  return ch === undefined ? "?" : ch.toUpperCase();
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);

  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPassword2, setNewPassword2] = useState("");
  const [passwordMsg, setPasswordMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    if (user !== null) {
      setName(user.name);
      setEmail(user.email);
    }
  }, [user]);

  const transactionsQuery = useQuery({
    queryKey: ["profile-transactions-all"],
    queryFn: () => fetchTransactions({}),
  });

  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: () => fetchGoals(),
  });

  const stats = useMemo(() => {
    const txs = transactionsQuery.data ?? [];
    let income = 0;
    let expense = 0;
    for (const t of txs) {
      const a = parseAmount(t.amount);
      if (t.type === "income") {
        income += a;
      } else {
        expense += a;
      }
    }
    const goals = goalsQuery.data ?? [];
    return {
      txCount: txs.length,
      income,
      expense,
      goalsCount: goals.length,
    };
  }, [transactionsQuery.data, goalsQuery.data]);

  const profileMutation = useMutation({
    mutationFn: updateProfile,
    onSuccess: (data) => {
      setUser({ id: data.id, email: data.email, name: data.name });
      setProfileSuccess(true);
      void queryClient.invalidateQueries();
    },
  });

  const passwordMutation = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setPasswordMsg({ type: "ok", text: "Пароль успешно изменён" });
      setCurrentPassword("");
      setNewPassword("");
      setNewPassword2("");
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { error?: string } | undefined)?.error;
        if (err.response?.status === 401) {
          setPasswordMsg({ type: "err", text: msg ?? "Неверный текущий пароль" });
          return;
        }
        setPasswordMsg({ type: "err", text: msg ?? "Не удалось изменить пароль" });
        return;
      }
      setPasswordMsg({ type: "err", text: "Не удалось изменить пароль" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      logout();
      void queryClient.clear();
      navigate("/", { replace: true });
    },
    onError: () => {
      window.alert("Не удалось удалить аккаунт. Попробуйте позже.");
    },
  });

  function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileSuccess(false);
    profileMutation.mutate({
      name: name.trim(),
      email: email.trim(),
    });
  }

  function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword.length < 6) {
      setPasswordMsg({ type: "err", text: "Новый пароль должен быть не короче 6 символов" });
      return;
    }
    if (newPassword !== newPassword2) {
      setPasswordMsg({ type: "err", text: "Новые пароли не совпадают" });
      return;
    }
    passwordMutation.mutate({
      currentPassword,
      newPassword,
    });
  }

  function handleDeleteAccount() {
    if (
      !window.confirm(
        "Удалить аккаунт безвозвратно? Все данные будут удалены.",
      )
    ) {
      return;
    }
    deleteMutation.mutate();
  }

  const displayName = user?.name ?? name;
  const displayEmail = user?.email ?? email;
  const statsLoading = transactionsQuery.isPending || goalsQuery.isPending;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/dashboard" className={styles.back}>
            ← На главную
          </Link>
          <h1 className={styles.title}>Профиль</h1>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.heroCard} aria-label="Аватар и контакты">
          <div className={styles.avatar} aria-hidden>
            {initialsFromName(displayName)}
          </div>
          <p className={styles.displayName}>{displayName}</p>
          <p className={styles.displayEmail}>{displayEmail}</p>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Редактирование профиля</h2>
          <form onSubmit={handleProfileSubmit}>
            <div className={styles.formField}>
              <label htmlFor="profile-name">Имя</label>
              <input
                id="profile-name"
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setProfileSuccess(false);
                }}
                required
                autoComplete="name"
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="profile-email">Email</label>
              <input
                id="profile-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setProfileSuccess(false);
                }}
                required
                autoComplete="email"
              />
            </div>
            {profileMutation.isError ? (
              <p className={styles.error}>
                {axios.isAxiosError(profileMutation.error)
                  ? (profileMutation.error.response?.data as { error?: string } | undefined)?.error ??
                    "Не удалось сохранить профиль"
                  : "Не удалось сохранить профиль"}
              </p>
            ) : null}
            <button type="submit" className={styles.btnPrimary} disabled={profileMutation.isPending}>
              {profileMutation.isPending ? "Сохранение…" : "Сохранить изменения"}
            </button>
            {profileSuccess ? <p className={styles.success}>Изменения сохранены ✓</p> : null}
          </form>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Смена пароля</h2>
          <form onSubmit={handlePasswordSubmit}>
            <div className={styles.formField}>
              <label htmlFor="pw-current">Текущий пароль</label>
              <input
                id="pw-current"
                type="password"
                value={currentPassword}
                onChange={(e) => {
                  setPasswordMsg(null);
                  setCurrentPassword(e.target.value);
                }}
                required
                autoComplete="current-password"
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="pw-new">Новый пароль</label>
              <input
                id="pw-new"
                type="password"
                value={newPassword}
                onChange={(e) => {
                  setPasswordMsg(null);
                  setNewPassword(e.target.value);
                }}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <div className={styles.formField}>
              <label htmlFor="pw-new2">Повторите пароль</label>
              <input
                id="pw-new2"
                type="password"
                value={newPassword2}
                onChange={(e) => {
                  setPasswordMsg(null);
                  setNewPassword2(e.target.value);
                }}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            {passwordMsg !== null ? (
              <p className={passwordMsg.type === "ok" ? styles.success : styles.error}>{passwordMsg.text}</p>
            ) : null}
            <button type="submit" className={styles.btnPrimary} disabled={passwordMutation.isPending}>
              {passwordMutation.isPending ? "Сохранение…" : "Изменить пароль"}
            </button>
          </form>
        </section>

        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Статистика</h2>
          {statsLoading ? (
            <p className={styles.loading}>Загрузка…</p>
          ) : (
            <div className={styles.statsGrid}>
              <div className={styles.statItem}>
                <p className={styles.statLabel}>Транзакций</p>
                <p className={styles.statValue}>{stats.txCount}</p>
              </div>
              <div className={styles.statItem}>
                <p className={styles.statLabel}>Целей</p>
                <p className={styles.statValue}>{stats.goalsCount}</p>
              </div>
              <div className={styles.statItem}>
                <p className={styles.statLabel}>Доходы (всего)</p>
                <p className={styles.statValue}>{formatMoney(stats.income)}</p>
              </div>
              <div className={styles.statItem}>
                <p className={styles.statLabel}>Расходы (всего)</p>
                <p className={styles.statValue}>{formatMoney(stats.expense)}</p>
              </div>
            </div>
          )}
        </section>

        <section className={`${styles.card} ${styles.dangerCard}`}>
          <h2 className={styles.cardTitle}>Опасная зона</h2>
          <p className={styles.dangerText}>
            Удаление аккаунта — необратимое действие. Все ваши данные будут удалены.
          </p>
          <button
            type="button"
            className={styles.btnDanger}
            disabled={deleteMutation.isPending}
            onClick={handleDeleteAccount}
          >
            {deleteMutation.isPending ? "Удаление…" : "Удалить аккаунт"}
          </button>
        </section>
      </main>
    </div>
  );
}
