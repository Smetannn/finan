import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { createGroup, fetchGroups, type GroupListItem } from "../../api/groups";
import styles from "./Groups.module.css";

function roleLabel(role: GroupListItem["role"]): string {
  return role === "owner" ? "Владелец" : "Участник";
}

function membersCountLabel(n: number): string {
  const m = n % 100;
  const m10 = n % 10;
  if (m >= 11 && m <= 14) {
    return `${n} участников`;
  }
  if (m10 === 1) {
    return `${n} участник`;
  }
  if (m10 >= 2 && m10 <= 4) {
    return `${n} участника`;
  }
  return `${n} участников`;
}

export default function GroupsPage() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: fetchGroups,
  });

  const createMutation = useMutation({
    mutationFn: createGroup,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["groups"] });
      setModalOpen(false);
      setName("");
      setFormError(null);
    },
    onError: () => {
      setFormError("Не удалось создать группу.");
    },
  });

  function openModal() {
    createMutation.reset();
    setName("");
    setFormError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (!createMutation.isPending) {
      setModalOpen(false);
      setFormError(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const trimmed = name.trim();
    if (trimmed === "") {
      setFormError("Введите название группы.");
      return;
    }
    createMutation.mutate(trimmed);
  }

  const groups = groupsQuery.data ?? [];
  const isLoading = groupsQuery.isPending;
  const isError = groupsQuery.isError;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/dashboard" className={styles.back}>
            ← На главную
          </Link>
          <h1 className={styles.title}>Совместный бюджет</h1>
        </div>
        <button type="button" className={styles.primaryBtn} onClick={openModal}>
          Создать группу
        </button>
      </header>

      <main className={styles.main}>
        {isError ? <p className={styles.error}>Не удалось загрузить группы.</p> : null}
        {isLoading ? <p className={styles.loading}>Загрузка…</p> : null}

        {!isLoading && !isError ? (
          groups.length === 0 ? (
            <p className={styles.empty}>Групп пока нет. Создайте первую группу!</p>
          ) : (
            <div className={styles.groupGrid}>
              {groups.map((g) => (
                <article key={g.id} className={styles.groupCard}>
                  <div className={styles.groupCardBody}>
                    <h2 className={styles.groupCardTitle}>{g.name}</h2>
                    <p className={styles.groupCardMeta}>{membersCountLabel(g.memberCount)}</p>
                  </div>
                  <div className={styles.groupCardBadges}>
                    <span
                      className={`${styles.roleBadge} ${
                        g.role === "owner" ? styles.roleOwner : styles.roleMember
                      }`}
                    >
                      {roleLabel(g.role)}
                    </span>
                    <Link to={`/groups/${g.id}`} className={styles.openBtn}>
                      Открыть
                    </Link>
                  </div>
                </article>
              ))}
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
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="new-group-title">
            <h2 id="new-group-title" className={styles.modalTitle}>
              Новая группа
            </h2>
            <form onSubmit={handleSubmit}>
              <div className={styles.formField}>
                <label htmlFor="group-name">Название</label>
                <input
                  id="group-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                  required
                />
              </div>
              {formError !== null ? <p className={styles.formError}>{formError}</p> : null}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnGhost} onClick={closeModal}>
                  Отмена
                </button>
                <button type="submit" className={styles.btnPrimary} disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Создание…" : "Создать"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
