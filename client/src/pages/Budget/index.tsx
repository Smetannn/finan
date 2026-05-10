import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addBudget, deleteBudget, fetchBudgetsForMonth } from "../../api/budgets";
import { fetchCategories } from "../../api/categories";
import { fetchTransactions } from "../../api/transactions";
import styles from "./Budget.module.css";

function currentMonthValue(): string {
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

export default function BudgetPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonthValue);
  const [modalOpen, setModalOpen] = useState(false);
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formAmount, setFormAmount] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const budgetsQuery = useQuery({
    queryKey: ["budgets", month],
    queryFn: () => fetchBudgetsForMonth(month),
    retry: false,
  });

  const transactionsQuery = useQuery({
    queryKey: ["transactions", month, "expense-rollup"],
    queryFn: () => fetchTransactions({ month }),
  });

  const categories = categoriesQuery.data ?? [];
  const budgets = budgetsQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const spentByCategory = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of transactions) {
      if (t.type !== "expense") {
        continue;
      }
      m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + parseAmount(t.amount));
    }
    return m;
  }, [transactions]);

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === "expense"),
    [categories],
  );

  const budgetCategoryIds = useMemo(() => new Set(budgets.map((b) => b.categoryId)), [budgets]);

  const availableCategoriesForModal = useMemo(
    () => expenseCategories.filter((c) => !budgetCategoryIds.has(c.id)),
    [expenseCategories, budgetCategoryIds],
  );

  const addMutation = useMutation({
    mutationFn: addBudget,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["budgets"] });
      setModalOpen(false);
      setFormCategoryId("");
      setFormAmount("");
      setFormError(null);
    },
    onError: () => {
      setFormError("Не удалось сохранить. Возможно, лимит для этой категории уже есть.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteBudget,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["budgets"] });
    },
  });

  function openModal() {
    addMutation.reset();
    setFormCategoryId("");
    setFormAmount("");
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (!addMutation.isPending) {
      setModalOpen(false);
      setFormError(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const catId = Number.parseInt(formCategoryId, 10);
    if (!Number.isFinite(catId) || catId <= 0) {
      setFormError("Выберите категорию.");
      return;
    }
    const amount = Number.parseFloat(formAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Укажите сумму больше нуля.");
      return;
    }
    addMutation.mutate({ categoryId: catId, amount, month });
  }

  const isLoading =
    categoriesQuery.isPending || budgetsQuery.isPending || transactionsQuery.isPending;
  const isError = categoriesQuery.isError || budgetsQuery.isError || transactionsQuery.isError;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/dashboard" className={styles.back}>
            ← На главную
          </Link>
          <h1 className={styles.title}>Бюджет</h1>
        </div>
        <div className={styles.monthWrap}>
          <span className={styles.monthLabel}>Месяц</span>
          <input
            className={styles.monthInput}
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
        </div>
        <button type="button" className={styles.addBtn} onClick={openModal}>
          Добавить лимит
        </button>
      </header>

      <main className={styles.main}>
        {isError ? <p className={styles.error}>Не удалось загрузить данные.</p> : null}
        {isLoading ? <p className={styles.loading}>Загрузка…</p> : null}

        {!isLoading && !isError ? (
          budgets.length === 0 ? (
            <p className={styles.empty}>
              Лимиты не установлены. Нажмите «Добавить лимит»
            </p>
          ) : (
            <div className={styles.list}>
              {budgets.map((b) => {
                const cat = categoryById.get(b.categoryId);
                const icon = cat?.icon ?? "•";
                const name = cat?.name ?? "Категория";
                const color = cat?.color ?? "#6366f1";
                const budgetAmt = parseAmount(b.amount);
                const spent = spentByCategory.get(b.categoryId) ?? 0;
                const ratio = budgetAmt > 0 ? spent / budgetAmt : 0;
                const over = spent > budgetAmt;
                const pctWidth = budgetAmt > 0 ? Math.min(100, ratio * 100) : 0;
                const remaining = budgetAmt - spent;
                const overAmt = spent - budgetAmt;
                const warn = !over && ratio >= 0.8;
                const deleting = deleteMutation.isPending && deleteMutation.variables === b.id;

                return (
                  <article key={b.id} className={styles.card}>
                    <div className={styles.cardTop}>
                      <div className={styles.cardTitle}>
                        <span className={styles.icon} aria-hidden>
                          {icon}
                        </span>
                        <span>{name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                        <div className={styles.amounts}>
                          <div>
                            Потрачено:{" "}
                            <span className={styles.amountStrong}>{formatMoney(spent)}</span>
                          </div>
                          <div>
                            Лимит: <span className={styles.amountStrong}>{formatMoney(budgetAmt)}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          title="Удалить лимит"
                          aria-label="Удалить лимит"
                          disabled={deleting}
                          onClick={() => deleteMutation.mutate(b.id)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className={styles.progressTrack}>
                      <div
                        className={`${styles.progressFill} ${over ? styles.progressOver : ""}`}
                        style={{
                          width: `${over ? 100 : pctWidth}%`,
                          backgroundColor: over ? undefined : color,
                        }}
                      />
                    </div>
                    <div className={styles.footer}>
                      {over ? (
                        <span className={styles.footerOver}>
                          Превышен на {formatMoney(overAmt)}
                        </span>
                      ) : warn ? (
                        <>
                          <span className={styles.footerWarn} aria-hidden>
                            ⚠️
                          </span>
                          <span className={styles.footerOk}>
                            Осталось {formatMoney(remaining)}
                          </span>
                        </>
                      ) : (
                        <span className={styles.footerOk}>Осталось {formatMoney(remaining)}</span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : null}
      </main>

      {modalOpen ? (
        <div
          className={styles.overlay}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeModal();
            }
          }}
        >
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="budget-modal-title">
            <h2 id="budget-modal-title" className={styles.modalTitle}>
              Новый лимит
            </h2>
            <form onSubmit={handleSubmit}>
              <div className={styles.formField}>
                <label htmlFor="budget-cat">Категория (расходы)</label>
                <select
                  id="budget-cat"
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  required
                  disabled={availableCategoriesForModal.length === 0}
                >
                  <option value="">
                    {availableCategoriesForModal.length === 0
                      ? "Все категории уже с лимитом"
                      : "Выберите категорию"}
                  </option>
                  {availableCategoriesForModal.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.formField}>
                <label htmlFor="budget-amt">Сумма лимита</label>
                <input
                  id="budget-amt"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step={0.01}
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  required
                />
              </div>
              {formError !== null ? <p className={styles.formError}>{formError}</p> : null}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnGhost} onClick={closeModal}>
                  Отмена
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={addMutation.isPending || availableCategoriesForModal.length === 0}
                >
                  {addMutation.isPending ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
