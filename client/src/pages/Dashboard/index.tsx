import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchBudgetsForMonth } from "../../api/budgets";
import { fetchCategories } from "../../api/categories";
import { fetchTransactions, type TransactionRow } from "../../api/transactions";
import { useAuthStore } from "../../store/authStore";
import styles from "./Dashboard.module.css";

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function parseAmount(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 2,
  }).format(n);
}

function formatDate(iso: string): string {
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString("ru-RU", { month: "short", day: "numeric", year: "numeric" });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const monthKey = useMemo(() => currentMonthKey(), []);

  const transactionsQuery = useQuery({
    queryKey: ["transactions", monthKey],
    queryFn: () => fetchTransactions({ month: monthKey }),
  });

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const budgetsQuery = useQuery({
    queryKey: ["budgets", monthKey],
    queryFn: () => fetchBudgetsForMonth(monthKey),
    retry: false,
  });

  const transactions = transactionsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const budgets = budgetsQuery.data ?? [];

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const { totalIncome, totalExpense } = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of transactions) {
      const a = parseAmount(t.amount);
      if (t.type === "income") {
        income += a;
      } else {
        expense += a;
      }
    }
    return { totalIncome: income, totalExpense: expense };
  }, [transactions]);

  const balance = totalIncome - totalExpense;
  const savingsRatePct = totalIncome > 0 ? Math.round(((totalIncome - totalExpense) / totalIncome) * 100) : 0;

  const expenseByCategory = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of transactions) {
      if (t.type !== "expense") {
        continue;
      }
      m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + parseAmount(t.amount));
    }
    return m;
  }, [transactions]);

  const totalExpenseSum = useMemo(() => {
    let s = 0;
    for (const v of expenseByCategory.values()) {
      s += v;
    }
    return s;
  }, [expenseByCategory]);

  const expenseCategoryRows = useMemo(() => {
    const rows: { categoryId: number; name: string; color: string; icon: string; amount: number }[] = [];
    for (const [categoryId, amount] of expenseByCategory.entries()) {
      const cat = categoryById.get(categoryId);
      rows.push({
        categoryId,
        name: cat?.name ?? "Неизвестно",
        color: cat?.color ?? "#64748b",
        icon: cat?.icon ?? "•",
        amount,
      });
    }
    rows.sort((a, b) => b.amount - a.amount);
    return rows;
  }, [expenseByCategory, categoryById]);

  const recentTransactions = useMemo(() => {
    return [...transactions]
      .sort((a, b) => {
        const byDate = b.date.localeCompare(a.date);
        if (byDate !== 0) {
          return byDate;
        }
        return b.id - a.id;
      })
      .slice(0, 5);
  }, [transactions]);

  const budgetWarnings = useMemo(() => {
    const out: { id: number; categoryName: string; spent: number; budget: number; pct: number }[] = [];
    for (const b of budgets) {
      const spent = expenseByCategory.get(b.categoryId) ?? 0;
      const cap = parseAmount(b.amount);
      if (cap <= 0) {
        continue;
      }
      const ratio = spent / cap;
      if (ratio >= 0.8) {
        const cat = categoryById.get(b.categoryId);
        out.push({
          id: b.id,
          categoryName: cat?.name ?? "Категория",
          spent,
          budget: cap,
          pct: Math.round(ratio * 100),
        });
      }
    }
    return out;
  }, [budgets, expenseByCategory, categoryById]);

  function categoryIconForTx(t: TransactionRow): string {
    return categoryById.get(t.categoryId)?.icon ?? "•";
  }

  const isLoading = transactionsQuery.isPending || categoriesQuery.isPending;
  const isError = transactionsQuery.isError || categoriesQuery.isError;

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerNav}>
          <Link to="/dashboard" className={styles.brand}>
            FinanCheck
          </Link>
          <Link to="/analytics" className={styles.navLink}>
            Аналитика
          </Link>
          <Link to="/transactions" className={styles.navLink}>
            Транзакции
          </Link>
          <Link to="/budget" className={styles.navLink}>
            Бюджет
          </Link>
          <Link to="/goals" className={styles.navLink}>
            Цели
          </Link>
          <Link to="/groups" className={styles.navLink}>
            Группы
          </Link>
        </div>
        <div className={styles.userRow}>
          <Link to="/profile" className={styles.navLink}>
            Профиль
          </Link>
          <span className={styles.userName}>{user?.name ?? "Пользователь"}</span>
          <button type="button" className={styles.logout} onClick={handleLogout}>
            Выйти
          </button>
        </div>
      </header>

      <main className={styles.main}>
        {isError ? (
          <p className={styles.error}>Не удалось загрузить данные. Попробуйте позже.</p>
        ) : null}

        {isLoading ? (
          <p className={styles.loading}>Загрузка данных…</p>
        ) : (
          <>
            {budgetWarnings.length > 0 ? (
              <div className={styles.warningCard}>
                <p className={styles.warningTitle}>Предупреждения по бюджету</p>
                <ul className={styles.warningList}>
                  {budgetWarnings.map((w) => (
                    <li key={w.id}>
                      <strong>{w.categoryName}</strong>: {formatMoney(w.spent)} из {formatMoney(w.budget)} (
                      {w.pct}% использовано)
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className={styles.gridSummary}>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Доходы за месяц</div>
                <div className={`${styles.cardValue} ${styles.cardValueIncome}`}>{formatMoney(totalIncome)}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Расходы за месяц</div>
                <div className={`${styles.cardValue} ${styles.cardValueExpense}`}>
                  {formatMoney(totalExpense)}
                </div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Баланс</div>
                <div className={`${styles.cardValue} ${styles.cardValueBalance}`}>{formatMoney(balance)}</div>
              </div>
              <div className={styles.card}>
                <div className={styles.cardLabel}>Норма сбережений</div>
                <div className={styles.cardValue}>
                  {totalIncome > 0 ? `${savingsRatePct}%` : "—"}
                </div>
              </div>
            </div>

            <div className={styles.twoCol}>
              <section className={styles.card}>
                <h2 className={styles.sectionTitle}>Расходы по категориям</h2>
                {expenseCategoryRows.length === 0 ? (
                  <p className={styles.txMeta}>В этом месяце нет расходов.</p>
                ) : (
                  expenseCategoryRows.map((row) => {
                    const barPct =
                      totalExpenseSum > 0 ? Math.min(100, Math.round((row.amount / totalExpenseSum) * 100)) : 0;
                    return (
                      <div key={row.categoryId} className={styles.catRow}>
                        <div className={styles.catMeta}>
                          <span className={styles.catName}>
                            <span aria-hidden>{row.icon}</span> {row.name}
                          </span>
                          <span className={styles.catAmount}>{formatMoney(row.amount)}</span>
                        </div>
                        <div className={styles.progressTrack}>
                          <div
                            className={styles.progressFill}
                            style={{ width: `${barPct}%`, backgroundColor: row.color }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </section>

              <section className={styles.card}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Последние транзакции</h2>
                  <Link to="/transactions" className={styles.link}>
                    Все транзакции
                  </Link>
                </div>
                {recentTransactions.length === 0 ? (
                  <p className={styles.txMeta}>Пока нет транзакций.</p>
                ) : (
                  <ul className={styles.txList}>
                    {recentTransactions.map((t) => (
                      <li key={t.id} className={styles.txItem}>
                        <span className={styles.txIcon} aria-hidden>
                          {categoryIconForTx(t)}
                        </span>
                        <div className={styles.txBody}>
                          <div className={styles.txDesc}>
                            {t.description?.trim() || t.categoryName}
                          </div>
                          <div className={styles.txMeta}>
                            {formatDate(t.date)} · {t.categoryName}
                          </div>
                        </div>
                        <span
                          className={`${styles.txAmount} ${
                            t.type === "income" ? styles.txAmountIncome : styles.txAmountExpense
                          }`}
                        >
                          {t.type === "income" ? "+" : "−"}
                          {formatMoney(parseAmount(t.amount))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
