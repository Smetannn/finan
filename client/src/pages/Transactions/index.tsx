import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCategories } from "../../api/categories";
import {
  addTransaction,
  deleteTransaction,
  fetchTransactions,
  type ListTransactionsParams,
  type TransactionRow,
} from "../../api/transactions";
import styles from "./Transactions.module.css";

function currentMonthValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function todayISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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

function formatDateHeading(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) {
    return iso;
  }
  return d.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

type TypeFilter = "all" | "income" | "expense";

export default function TransactionsPage() {
  const queryClient = useQueryClient();

  const [month, setMonth] = useState(currentMonthValue);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const [modalOpen, setModalOpen] = useState(false);
  const [formType, setFormType] = useState<"income" | "expense">("expense");
  const [formCategoryId, setFormCategoryId] = useState<string>("");
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState(todayISODate);
  const [formError, setFormError] = useState<string | null>(null);

  const listParams = useMemo((): ListTransactionsParams => {
    const p: ListTransactionsParams = { month };
    if (typeFilter !== "all") {
      p.type = typeFilter;
    }
    if (categoryFilter !== "") {
      const id = Number.parseInt(categoryFilter, 10);
      if (Number.isFinite(id)) {
        p.categoryId = id;
      }
    }
    return p;
  }, [month, typeFilter, categoryFilter]);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const transactionsQuery = useQuery({
    queryKey: ["transactions", listParams.month, listParams.type ?? "all", listParams.categoryId ?? "all"],
    queryFn: () => fetchTransactions(listParams),
  });

  const categories = categoriesQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const groupedByDate = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => {
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) {
        return byDate;
      }
      return b.id - a.id;
    });
    const map = new Map<string, TransactionRow[]>();
    for (const t of sorted) {
      const list = map.get(t.date);
      if (list === undefined) {
        map.set(t.date, [t]);
      } else {
        list.push(t);
      }
    }
    const dates = [...map.keys()].sort((a, b) => b.localeCompare(a));
    return dates.map((date) => ({ date, items: map.get(date) ?? [] }));
  }, [transactions]);

  const addMutation = useMutation({
    mutationFn: addTransaction,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setModalOpen(false);
      setFormError(null);
    },
    onError: () => {
      setFormError("Не удалось сохранить. Проверьте категорию и сумму.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  function openModal() {
    addMutation.reset();
    setFormType("expense");
    setFormCategoryId("");
    setFormAmount("");
    setFormDescription("");
    setFormDate(todayISODate());
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (!addMutation.isPending) {
      setModalOpen(false);
      setFormError(null);
    }
  }

  const categoriesForForm = useMemo(
    () => categories.filter((c) => c.type === formType),
    [categories, formType],
  );

  useEffect(() => {
    if (!modalOpen) {
      return;
    }
    const current = formCategoryId !== "" ? Number.parseInt(formCategoryId, 10) : NaN;
    const cat = Number.isFinite(current) ? categoryById.get(current) : undefined;
    if (cat !== undefined && cat.type !== formType) {
      setFormCategoryId("");
    }
  }, [formType, modalOpen, formCategoryId, categoryById]);

  function handleSubmitModal(e: FormEvent) {
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
    addMutation.mutate({
      categoryId: catId,
      amount,
      type: formType,
      date: formDate,
      ...(formDescription.trim() !== "" ? { description: formDescription.trim() } : {}),
    });
  }

  const isLoading = transactionsQuery.isPending || categoriesQuery.isPending;
  const isError = transactionsQuery.isError || categoriesQuery.isError;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/dashboard" className={styles.back}>
            ← На главную
          </Link>
          <h1 className={styles.title}>Транзакции</h1>
        </div>
        <button type="button" className={styles.addBtn} onClick={openModal}>
          Добавить
        </button>
      </header>

      <main className={styles.main}>
        <div className={styles.filters}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Месяц</span>
            <input
              className={styles.monthInput}
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Тип</span>
            <div className={styles.typeToggle}>
              <button
                type="button"
                className={`${styles.typeBtn} ${typeFilter === "all" ? styles.typeBtnActive : ""}`}
                onClick={() => setTypeFilter("all")}
              >
                Все
              </button>
              <button
                type="button"
                className={`${styles.typeBtn} ${typeFilter === "income" ? styles.typeBtnActive : ""}`}
                onClick={() => setTypeFilter("income")}
              >
                Доходы
              </button>
              <button
                type="button"
                className={`${styles.typeBtn} ${typeFilter === "expense" ? styles.typeBtnActive : ""}`}
                onClick={() => setTypeFilter("expense")}
              >
                Расходы
              </button>
            </div>
          </div>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>Категория</span>
            <select
              className={styles.select}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="">Все категории</option>
              {categories.map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {isError ? <p className={styles.error}>Не удалось загрузить данные.</p> : null}
        {isLoading ? <p className={styles.loading}>Загрузка…</p> : null}

        {!isLoading && !isError ? (
          <div className={styles.listCard}>
            {groupedByDate.length === 0 ? (
              <p className={styles.empty}>Нет транзакций за этот период</p>
            ) : (
              groupedByDate.map((group) => (
                <section key={group.date}>
                  <h2 className={styles.dateHeading}>{formatDateHeading(group.date)}</h2>
                  {group.items.map((t) => {
                    const cat = categoryById.get(t.categoryId);
                    const icon = cat?.icon ?? "•";
                    const deleting = deleteMutation.isPending && deleteMutation.variables === t.id;
                    return (
                      <div key={t.id} className={styles.row}>
                        <span className={styles.icon} aria-hidden>
                          {icon}
                        </span>
                        <div className={styles.body}>
                          <div className={styles.name}>{t.categoryName}</div>
                          <div className={styles.desc}>
                            {t.description?.trim() || "—"}
                          </div>
                        </div>
                        <span
                          className={`${styles.amount} ${
                            t.type === "income" ? styles.amountIncome : styles.amountExpense
                          }`}
                        >
                          {t.type === "income" ? "+" : "−"}
                          {formatMoney(parseAmount(t.amount))}
                        </span>
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          title="Удалить"
                          aria-label="Удалить транзакцию"
                          disabled={deleting}
                          onClick={() => deleteMutation.mutate(t.id)}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </section>
              ))
            )}
          </div>
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
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <h2 id="modal-title" className={styles.modalTitle}>
              Новая транзакция
            </h2>
            <form onSubmit={handleSubmitModal}>
              <div className={styles.modalToggle}>
                <button
                  type="button"
                  className={`${styles.modalToggleBtn} ${
                    formType === "income" ? styles.modalToggleBtnActive : ""
                  }`}
                  onClick={() => setFormType("income")}
                >
                  Доход
                </button>
                <button
                  type="button"
                  className={`${styles.modalToggleBtn} ${
                    formType === "expense" ? styles.modalToggleBtnActive : ""
                  }`}
                  onClick={() => setFormType("expense")}
                >
                  Расход
                </button>
              </div>

              <div className={styles.formField}>
                <label htmlFor="tx-category">Категория</label>
                <select
                  id="tx-category"
                  value={formCategoryId}
                  onChange={(e) => setFormCategoryId(e.target.value)}
                  required
                >
                  <option value="">Выберите категорию</option>
                  {categoriesForForm.map((c) => (
                    <option key={c.id} value={String(c.id)}>
                      {c.icon} {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.formField}>
                <label htmlFor="tx-amount">Сумма</label>
                <input
                  id="tx-amount"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step={0.01}
                  value={formAmount}
                  onChange={(e) => setFormAmount(e.target.value)}
                  required
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="tx-desc">Описание (необязательно)</label>
                <input
                  id="tx-desc"
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="tx-date">Дата</label>
                <input
                  id="tx-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </div>

              {formError !== null ? <p className={styles.formError}>{formError}</p> : null}

              <div className={styles.modalActions}>
                <button type="button" className={styles.btnGhost} onClick={closeModal}>
                  Отмена
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={addMutation.isPending}>
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
