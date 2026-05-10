import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { addGoal, contributeToGoal, deleteGoal, fetchGoals, type GoalRow } from "../../api/goals";
import styles from "./Goals.module.css";

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

function formatDeadlineRu(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) {
    return iso;
  }
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
}

function todayISODate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Оценка месяцев до дедлайна (не меньше 1 для расчёта вперёд). */
function monthsUntilDeadline(deadlineStr: string): { months: number; expired: boolean } {
  const deadline = new Date(deadlineStr + "T23:59:59");
  if (Number.isNaN(deadline.getTime())) {
    return { months: 1, expired: false };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffMs = deadline.getTime() - today.getTime();
  const diffDays = diffMs / 86400000;
  if (diffDays <= 0) {
    return { months: 1, expired: true };
  }
  return { months: Math.max(1, Math.ceil(diffDays / 30)), expired: false };
}

function monthlyNeeded(remaining: number, deadlineStr: string): number {
  const { months } = monthsUntilDeadline(deadlineStr);
  return remaining / months;
}

export default function GoalsPage() {
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [formName, setFormName] = useState("");
  const [formTarget, setFormTarget] = useState("");
  const [formDeadline, setFormDeadline] = useState(todayISODate());
  const [formError, setFormError] = useState<string | null>(null);

  const [contributeGoal, setContributeGoal] = useState<GoalRow | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");
  const [contributeError, setContributeError] = useState<string | null>(null);

  const goalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: () => fetchGoals(),
  });

  const goals = useMemo(() => {
    const list = goalsQuery.data ?? [];
    return [...list].sort((a, b) => a.deadline.localeCompare(b.deadline));
  }, [goalsQuery.data]);

  const addMutation = useMutation({
    mutationFn: addGoal,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      setCreateOpen(false);
      setFormName("");
      setFormTarget("");
      setFormDeadline(todayISODate());
      setFormError(null);
    },
    onError: () => {
      setFormError("Не удалось создать цель.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGoal,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
  });

  const contributeMutation = useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: number }) => contributeToGoal(id, amount),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      setContributeGoal(null);
      setContributeAmount("");
      setContributeError(null);
    },
    onError: () => {
      setContributeError("Не удалось пополнить.");
    },
  });

  function openCreate() {
    addMutation.reset();
    setFormName("");
    setFormTarget("");
    setFormDeadline(todayISODate());
    setFormError(null);
    setCreateOpen(true);
  }

  function closeCreate() {
    if (!addMutation.isPending) {
      setCreateOpen(false);
      setFormError(null);
    }
  }

  function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const target = Number.parseFloat(formTarget.replace(",", "."));
    if (formName.trim() === "") {
      setFormError("Введите название.");
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      setFormError("Укажите целевую сумму.");
      return;
    }
    addMutation.mutate({
      name: formName.trim(),
      targetAmount: target,
      deadline: formDeadline,
    });
  }

  function openContribute(goal: GoalRow) {
    contributeMutation.reset();
    setContributeGoal(goal);
    setContributeAmount("");
    setContributeError(null);
  }

  function closeContribute() {
    if (!contributeMutation.isPending) {
      setContributeGoal(null);
      setContributeError(null);
    }
  }

  function handleContributeSubmit(e: FormEvent) {
    e.preventDefault();
    setContributeError(null);
    if (contributeGoal === null) {
      return;
    }
    const amount = Number.parseFloat(contributeAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setContributeError("Укажите сумму.");
      return;
    }
    contributeMutation.mutate({ id: contributeGoal.id, amount });
  }

  const isLoading = goalsQuery.isPending;
  const isError = goalsQuery.isError;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/dashboard" className={styles.back}>
            ← На главную
          </Link>
          <h1 className={styles.title}>Цели</h1>
        </div>
        <button type="button" className={styles.addBtn} onClick={openCreate}>
          Добавить цель
        </button>
      </header>

      <main className={styles.main}>
        {isError ? <p className={styles.error}>Не удалось загрузить цели.</p> : null}
        {isLoading ? <p className={styles.loading}>Загрузка…</p> : null}

        {!isLoading && !isError ? (
          goals.length === 0 ? (
            <p className={styles.empty}>Целей пока нет. Создайте первую цель!</p>
          ) : (
            <div className={styles.list}>
              {goals.map((g) => {
                const target = parseAmount(g.targetAmount);
                const current = parseAmount(g.currentAmount);
                const remaining = Math.max(0, target - current);
                const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
                const { expired } = monthsUntilDeadline(g.deadline);
                const monthly =
                  remaining > 0 ? monthlyNeeded(remaining, g.deadline) : 0;
                const deleting = deleteMutation.isPending && deleteMutation.variables === g.id;

                return (
                  <article key={g.id} className={styles.card}>
                    <div className={styles.cardTop}>
                      <h2 className={styles.goalName}>{g.name}</h2>
                      <div className={styles.actions}>
                        <button
                          type="button"
                          className={styles.contributeBtn}
                          onClick={() => openContribute(g)}
                        >
                          Пополнить
                        </button>
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          title="Удалить цель"
                          aria-label="Удалить цель"
                          disabled={deleting}
                          onClick={() => deleteMutation.mutate(g.id)}
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className={styles.progressTrack}>
                      <div className={styles.progressFill} style={{ width: `${pct}%` }} />
                    </div>
                    <div className={styles.progressText}>
                      {formatMoney(current)} из {formatMoney(target)}
                    </div>
                    <div className={styles.meta}>
                      <div>
                        До <span className={styles.metaStrong}>{formatDeadlineRu(g.deadline)}</span>
                      </div>
                      {remaining <= 0 ? (
                        <div>Цель достигнута</div>
                      ) : expired ? (
                        <div>
                          Срок прошёл. Осталось накопить:{" "}
                          <span className={styles.metaStrong}>{formatMoney(remaining)}</span>
                        </div>
                      ) : (
                        <div>
                          Нужно откладывать:{" "}
                          <span className={styles.metaStrong}>
                            {formatMoney(monthly)}/мес
                          </span>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : null}
      </main>

      {createOpen ? (
        <div
          className={styles.overlay}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeCreate();
            }
          }}
        >
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="goal-create-title">
            <h2 id="goal-create-title" className={styles.modalTitle}>
              Новая цель
            </h2>
            <form onSubmit={handleCreateSubmit}>
              <div className={styles.formField}>
                <label htmlFor="goal-name">Название</label>
                <input
                  id="goal-name"
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                />
              </div>
              <div className={styles.formField}>
                <label htmlFor="goal-target">Целевая сумма</label>
                <input
                  id="goal-target"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step={0.01}
                  value={formTarget}
                  onChange={(e) => setFormTarget(e.target.value)}
                  required
                />
              </div>
              <div className={styles.formField}>
                <label htmlFor="goal-deadline">Срок (дедлайн)</label>
                <input
                  id="goal-deadline"
                  type="date"
                  value={formDeadline}
                  onChange={(e) => setFormDeadline(e.target.value)}
                  required
                />
              </div>
              {formError !== null ? <p className={styles.formError}>{formError}</p> : null}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnGhost} onClick={closeCreate}>
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

      {contributeGoal !== null ? (
        <div
          className={styles.overlay}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeContribute();
            }
          }}
        >
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="goal-contribute-title"
          >
            <h2 id="goal-contribute-title" className={styles.modalTitle}>
              Пополнить цель
            </h2>
            <p className={styles.modalSubtitle}>{contributeGoal.name}</p>
            <form onSubmit={handleContributeSubmit}>
              <div className={styles.formField}>
                <label htmlFor="contrib-amt">Сумма</label>
                <input
                  id="contrib-amt"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step={0.01}
                  value={contributeAmount}
                  onChange={(e) => setContributeAmount(e.target.value)}
                  required
                />
              </div>
              {contributeError !== null ? (
                <p className={styles.formError}>{contributeError}</p>
              ) : null}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnGhost} onClick={closeContribute}>
                  Отмена
                </button>
                <button
                  type="submit"
                  className={styles.btnPrimary}
                  disabled={contributeMutation.isPending}
                >
                  {contributeMutation.isPending ? "Добавление…" : "Добавить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
