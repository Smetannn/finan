import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { fetchCategories } from "../../api/categories";
import {
  addGoal,
  contributeToGoal,
  deleteGoal,
  fetchGoals,
  type GoalRow,
} from "../../api/goals";
import {
  deleteGroup,
  fetchGroup,
  inviteMember,
  leaveGroup,
  type GroupMemberRow,
} from "../../api/groups";
import {
  addTransaction,
  deleteTransaction,
  fetchTransactions,
  type ListTransactionsParams,
  type TransactionRow,
} from "../../api/transactions";
import { useAuthStore } from "../../store/authStore";
import styles from "./Groups.module.css";

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

function formatDeadlineRu(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) {
    return iso;
  }
  const [y, m, d] = parts;
  return `${d}.${m}.${y}`;
}

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

function memberRoleLabel(role: GroupMemberRow["role"]): string {
  return role === "owner" ? "Владелец" : "Участник";
}

type TypeFilter = "all" | "income" | "expense";

export default function GroupDetailPage() {
  const { id: idParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  const groupId = Number.parseInt(idParam ?? "", 10);

  useEffect(() => {
    if (!Number.isFinite(groupId) || groupId <= 0) {
      navigate("/groups", { replace: true });
    }
  }, [groupId, navigate]);

  const detailQuery = useQuery({
    queryKey: ["group-detail", groupId],
    queryFn: () => fetchGroup(groupId),
    enabled: Number.isFinite(groupId) && groupId > 0,
  });

  const isOwner = user !== null && detailQuery.data?.group.ownerId === user.id;

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  const inviteMutation = useMutation({
    mutationFn: (email: string) => inviteMember(groupId, email),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["group-detail", groupId] });
      void queryClient.invalidateQueries({ queryKey: ["groups"] });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteError(null);
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status === 404) {
          setInviteError("Пользователь с таким email не найден.");
          return;
        }
        if (status === 409) {
          setInviteError("Этот пользователь уже в группе.");
          return;
        }
        if (status === 403) {
          setInviteError("Недостаточно прав.");
          return;
        }
      }
      setInviteError("Не удалось отправить приглашение.");
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: () => deleteGroup(groupId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["groups"] });
      navigate("/groups", { replace: true });
    },
  });

  const leaveGroupMutation = useMutation({
    mutationFn: () => leaveGroup(groupId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["groups"] });
      navigate("/groups", { replace: true });
    },
  });

  const [month, setMonth] = useState(currentMonthValue);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const listParams = useMemo((): ListTransactionsParams => {
    const p: ListTransactionsParams = { month, groupId };
    if (typeFilter !== "all") {
      p.type = typeFilter;
    }
    if (categoryFilter !== "") {
      const cid = Number.parseInt(categoryFilter, 10);
      if (Number.isFinite(cid)) {
        p.categoryId = cid;
      }
    }
    return p;
  }, [month, typeFilter, categoryFilter, groupId]);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
    enabled: Number.isFinite(groupId) && groupId > 0,
  });

  const transactionsQuery = useQuery({
    queryKey: [
      "group-transactions",
      groupId,
      listParams.month,
      listParams.type ?? "all",
      listParams.categoryId ?? "all",
    ],
    queryFn: () => fetchTransactions(listParams),
    enabled: Number.isFinite(groupId) && groupId > 0 && detailQuery.isSuccess,
  });

  const goalsQuery = useQuery({
    queryKey: ["group-goals", groupId],
    queryFn: () => fetchGoals(groupId),
    enabled: Number.isFinite(groupId) && groupId > 0 && detailQuery.isSuccess,
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

  const [txModalOpen, setTxModalOpen] = useState(false);
  const [formType, setFormType] = useState<"income" | "expense">("expense");
  const [formCategoryId, setFormCategoryId] = useState<string>("");
  const [formAmount, setFormAmount] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDate, setFormDate] = useState(todayISODate);
  const [txFormError, setTxFormError] = useState<string | null>(null);

  const addTxMutation = useMutation({
    mutationFn: addTransaction,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["group-transactions", groupId] });
      setTxModalOpen(false);
      setTxFormError(null);
    },
    onError: () => {
      setTxFormError("Не удалось сохранить. Проверьте категорию и сумму.");
    },
  });

  const deleteTxMutation = useMutation({
    mutationFn: deleteTransaction,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["group-transactions", groupId] });
    },
  });

  const categoriesForForm = useMemo(
    () => categories.filter((c) => c.type === formType),
    [categories, formType],
  );

  useEffect(() => {
    if (!txModalOpen) {
      return;
    }
    const current = formCategoryId !== "" ? Number.parseInt(formCategoryId, 10) : NaN;
    const cat = Number.isFinite(current) ? categoryById.get(current) : undefined;
    if (cat !== undefined && cat.type !== formType) {
      setFormCategoryId("");
    }
  }, [formType, txModalOpen, formCategoryId, categoryById]);

  function openTxModal() {
    addTxMutation.reset();
    setFormType("expense");
    setFormCategoryId("");
    setFormAmount("");
    setFormDescription("");
    setFormDate(todayISODate());
    setTxFormError(null);
    setTxModalOpen(true);
  }

  function closeTxModal() {
    if (!addTxMutation.isPending) {
      setTxModalOpen(false);
      setTxFormError(null);
    }
  }

  function handleTxSubmit(e: FormEvent) {
    e.preventDefault();
    setTxFormError(null);
    const catId = Number.parseInt(formCategoryId, 10);
    if (!Number.isFinite(catId) || catId <= 0) {
      setTxFormError("Выберите категорию.");
      return;
    }
    const amount = Number.parseFloat(formAmount.replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      setTxFormError("Укажите сумму больше нуля.");
      return;
    }
    addTxMutation.mutate({
      categoryId: catId,
      amount,
      type: formType,
      date: formDate,
      groupId,
      ...(formDescription.trim() !== "" ? { description: formDescription.trim() } : {}),
    });
  }

  const [createGoalOpen, setCreateGoalOpen] = useState(false);
  const [formGoalName, setFormGoalName] = useState("");
  const [formGoalTarget, setFormGoalTarget] = useState("");
  const [formGoalDeadline, setFormGoalDeadline] = useState(todayISODate());
  const [goalFormError, setGoalFormError] = useState<string | null>(null);

  const [contributeGoal, setContributeGoal] = useState<GoalRow | null>(null);
  const [contributeAmount, setContributeAmount] = useState("");
  const [contributeError, setContributeError] = useState<string | null>(null);

  const addGoalMutation = useMutation({
    mutationFn: addGoal,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["group-goals", groupId] });
      setCreateGoalOpen(false);
      setFormGoalName("");
      setFormGoalTarget("");
      setFormGoalDeadline(todayISODate());
      setGoalFormError(null);
    },
    onError: () => {
      setGoalFormError("Не удалось создать цель.");
    },
  });

  const deleteGoalMutation = useMutation({
    mutationFn: deleteGoal,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["group-goals", groupId] });
    },
  });

  const contributeMutation = useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: number }) => contributeToGoal(id, amount),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["group-goals", groupId] });
      setContributeGoal(null);
      setContributeAmount("");
      setContributeError(null);
    },
    onError: () => {
      setContributeError("Не удалось пополнить.");
    },
  });

  function openCreateGoal() {
    addGoalMutation.reset();
    setFormGoalName("");
    setFormGoalTarget("");
    setFormGoalDeadline(todayISODate());
    setGoalFormError(null);
    setCreateGoalOpen(true);
  }

  function closeCreateGoal() {
    if (!addGoalMutation.isPending) {
      setCreateGoalOpen(false);
      setGoalFormError(null);
    }
  }

  function handleCreateGoalSubmit(e: FormEvent) {
    e.preventDefault();
    setGoalFormError(null);
    const target = Number.parseFloat(formGoalTarget.replace(",", "."));
    if (formGoalName.trim() === "") {
      setGoalFormError("Введите название.");
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      setGoalFormError("Укажите целевую сумму.");
      return;
    }
    addGoalMutation.mutate({
      name: formGoalName.trim(),
      targetAmount: target,
      deadline: formGoalDeadline,
      groupId,
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

  function openInvite() {
    inviteMutation.reset();
    setInviteEmail("");
    setInviteError(null);
    setInviteOpen(true);
  }

  function closeInvite() {
    if (!inviteMutation.isPending) {
      setInviteOpen(false);
      setInviteError(null);
    }
  }

  function handleInviteSubmit(e: FormEvent) {
    e.preventDefault();
    setInviteError(null);
    const email = inviteEmail.trim();
    if (email === "") {
      setInviteError("Введите email.");
      return;
    }
    inviteMutation.mutate(email);
  }

  function handleLeaveOrDelete() {
    if (isOwner) {
      if (window.confirm("Удалить группу? Это действие нельзя отменить.")) {
        deleteGroupMutation.mutate();
      }
    } else if (window.confirm("Покинуть группу?")) {
      leaveGroupMutation.mutate();
    }
  }

  const goals = useMemo(() => {
    const list = goalsQuery.data ?? [];
    return [...list].sort((a, b) => a.deadline.localeCompare(b.deadline));
  }, [goalsQuery.data]);

  const detailLoading = detailQuery.isPending;
  const detailError = detailQuery.isError;
  const groupName = detailQuery.data?.group.name ?? "";

  const txLoading = transactionsQuery.isPending || categoriesQuery.isPending;
  const txError = transactionsQuery.isError || categoriesQuery.isError;

  if (!Number.isFinite(groupId) || groupId <= 0) {
    return null;
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/groups" className={styles.back}>
            ← Назад
          </Link>
          <h1 className={styles.title}>{detailLoading ? "…" : groupName}</h1>
        </div>
        <div className={styles.headerActions}>
          {detailQuery.isSuccess ? (
            isOwner ? (
              <button
                type="button"
                className={styles.dangerBtn}
                disabled={deleteGroupMutation.isPending}
                onClick={handleLeaveOrDelete}
              >
                {deleteGroupMutation.isPending ? "Удаление…" : "Удалить группу"}
              </button>
            ) : (
              <button
                type="button"
                className={styles.dangerBtn}
                disabled={leaveGroupMutation.isPending}
                onClick={handleLeaveOrDelete}
              >
                {leaveGroupMutation.isPending ? "Выход…" : "Покинуть группу"}
              </button>
            )
          ) : null}
        </div>
      </header>

      <main className={styles.main}>
        {detailError ? (
          <p className={styles.error}>
            Не удалось загрузить группу.{" "}
            <Link to="/groups" className={styles.back}>
              К списку
            </Link>
          </p>
        ) : null}
        {detailLoading ? <p className={styles.loading}>Загрузка…</p> : null}

        {detailQuery.isSuccess ? (
          <>
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Участники</h2>
                {isOwner ? (
                  <button type="button" className={styles.inviteBtn} onClick={openInvite}>
                    Пригласить
                  </button>
                ) : null}
              </div>
              <div className={styles.membersBlock}>
                <ul className={styles.membersList}>
                  {detailQuery.data.members.map((m) => (
                    <li key={m.userId} className={styles.memberRow}>
                      <div>
                        <div className={styles.memberName}>{m.name}</div>
                        <div className={styles.memberEmail}>{m.email}</div>
                      </div>
                      <span
                        className={`${styles.roleBadge} ${
                          m.role === "owner" ? styles.roleOwner : styles.roleMember
                        }`}
                      >
                        {memberRoleLabel(m.role)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Совместные транзакции</h2>
                <button type="button" className={styles.primaryBtn} onClick={openTxModal}>
                  Добавить
                </button>
              </div>
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

              {txError ? <p className={styles.error}>Не удалось загрузить транзакции.</p> : null}
              {txLoading ? <p className={styles.loading}>Загрузка…</p> : null}

              {!txLoading && !txError ? (
                <div className={styles.listCard}>
                  {groupedByDate.length === 0 ? (
                    <p className={styles.empty}>Нет транзакций за этот период</p>
                  ) : (
                    groupedByDate.map((group) => (
                      <section key={group.date}>
                        <h3 className={styles.dateHeading}>{formatDateHeading(group.date)}</h3>
                        {group.items.map((t) => {
                          const cat = categoryById.get(t.categoryId);
                          const icon = cat?.icon ?? "•";
                          const deleting = deleteTxMutation.isPending && deleteTxMutation.variables === t.id;
                          return (
                            <div key={t.id} className={styles.txRow}>
                              <span className={styles.txIcon} aria-hidden>
                                {icon}
                              </span>
                              <div className={styles.txBody}>
                                <div className={styles.txName}>{t.categoryName}</div>
                                <div className={styles.txDesc}>{t.description?.trim() || "—"}</div>
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
                                className={styles.iconBtn}
                                title="Удалить"
                                aria-label="Удалить транзакцию"
                                disabled={deleting}
                                onClick={() => deleteTxMutation.mutate(t.id)}
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
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>Совместные цели</h2>
                <button type="button" className={styles.secondaryBtn} onClick={openCreateGoal}>
                  Добавить цель
                </button>
              </div>

              {goalsQuery.isError ? (
                <p className={styles.error}>Не удалось загрузить цели.</p>
              ) : null}
              {goalsQuery.isPending ? <p className={styles.loading}>Загрузка…</p> : null}

              {!goalsQuery.isPending && !goalsQuery.isError ? (
                goals.length === 0 ? (
                  <p className={styles.empty}>Целей пока нет. Создайте первую цель!</p>
                ) : (
                  <div className={styles.goalList}>
                    {goals.map((g) => {
                      const target = parseAmount(g.targetAmount);
                      const current = parseAmount(g.currentAmount);
                      const remaining = Math.max(0, target - current);
                      const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
                      const { expired } = monthsUntilDeadline(g.deadline);
                      const monthly = remaining > 0 ? monthlyNeeded(remaining, g.deadline) : 0;
                      const deleting = deleteGoalMutation.isPending && deleteGoalMutation.variables === g.id;

                      return (
                        <article key={g.id} className={styles.goalCard}>
                          <div className={styles.goalCardTop}>
                            <h3 className={styles.goalName}>{g.name}</h3>
                            <div className={styles.goalActions}>
                              <button
                                type="button"
                                className={styles.contributeBtn}
                                onClick={() => openContribute(g)}
                              >
                                Пополнить
                              </button>
                              <button
                                type="button"
                                className={styles.iconBtn}
                                title="Удалить цель"
                                aria-label="Удалить цель"
                                disabled={deleting}
                                onClick={() => deleteGoalMutation.mutate(g.id)}
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
                              До{" "}
                              <span className={styles.metaStrong}>{formatDeadlineRu(g.deadline)}</span>
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
            </section>
          </>
        ) : null}
      </main>

      {inviteOpen ? (
        <div
          className={styles.overlay}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeInvite();
            }
          }}
        >
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="invite-title">
            <h2 id="invite-title" className={styles.modalTitle}>
              Пригласить участника
            </h2>
            <form onSubmit={handleInviteSubmit}>
              <div className={styles.formField}>
                <label htmlFor="invite-email">Email</label>
                <input
                  id="invite-email"
                  type="email"
                  autoComplete="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                />
              </div>
              {inviteError !== null ? <p className={styles.formError}>{inviteError}</p> : null}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnGhost} onClick={closeInvite}>
                  Отмена
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={inviteMutation.isPending}>
                  {inviteMutation.isPending ? "Отправка…" : "Пригласить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {txModalOpen ? (
        <div
          className={styles.overlay}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeTxModal();
            }
          }}
        >
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="tx-modal-title">
            <h2 id="tx-modal-title" className={styles.modalTitle}>
              Новая транзакция
            </h2>
            <form onSubmit={handleTxSubmit}>
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
                <label htmlFor="g-tx-category">Категория</label>
                <select
                  id="g-tx-category"
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
                <label htmlFor="g-tx-amount">Сумма</label>
                <input
                  id="g-tx-amount"
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
                <label htmlFor="g-tx-desc">Описание (необязательно)</label>
                <input
                  id="g-tx-desc"
                  type="text"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                />
              </div>

              <div className={styles.formField}>
                <label htmlFor="g-tx-date">Дата</label>
                <input
                  id="g-tx-date"
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                />
              </div>

              {txFormError !== null ? <p className={styles.formError}>{txFormError}</p> : null}

              <div className={styles.modalActions}>
                <button type="button" className={styles.btnGhost} onClick={closeTxModal}>
                  Отмена
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={addTxMutation.isPending}>
                  {addTxMutation.isPending ? "Сохранение…" : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {createGoalOpen ? (
        <div
          className={styles.overlay}
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeCreateGoal();
            }
          }}
        >
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="g-goal-create">
            <h2 id="g-goal-create" className={styles.modalTitle}>
              Новая цель
            </h2>
            <form onSubmit={handleCreateGoalSubmit}>
              <div className={styles.formField}>
                <label htmlFor="g-goal-name">Название</label>
                <input
                  id="g-goal-name"
                  type="text"
                  value={formGoalName}
                  onChange={(e) => setFormGoalName(e.target.value)}
                  required
                />
              </div>
              <div className={styles.formField}>
                <label htmlFor="g-goal-target">Целевая сумма</label>
                <input
                  id="g-goal-target"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step={0.01}
                  value={formGoalTarget}
                  onChange={(e) => setFormGoalTarget(e.target.value)}
                  required
                />
              </div>
              <div className={styles.formField}>
                <label htmlFor="g-goal-deadline">Срок (дедлайн)</label>
                <input
                  id="g-goal-deadline"
                  type="date"
                  value={formGoalDeadline}
                  onChange={(e) => setFormGoalDeadline(e.target.value)}
                  required
                />
              </div>
              {goalFormError !== null ? <p className={styles.formError}>{goalFormError}</p> : null}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnGhost} onClick={closeCreateGoal}>
                  Отмена
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={addGoalMutation.isPending}>
                  {addGoalMutation.isPending ? "Сохранение…" : "Сохранить"}
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
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="g-contrib-title">
            <h2 id="g-contrib-title" className={styles.modalTitle}>
              Пополнить цель
            </h2>
            <p className={styles.modalSubtitle}>{contributeGoal.name}</p>
            <form onSubmit={handleContributeSubmit}>
              <div className={styles.formField}>
                <label htmlFor="g-contrib-amt">Сумма</label>
                <input
                  id="g-contrib-amt"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step={0.01}
                  value={contributeAmount}
                  onChange={(e) => setContributeAmount(e.target.value)}
                  required
                />
              </div>
              {contributeError !== null ? <p className={styles.formError}>{contributeError}</p> : null}
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
