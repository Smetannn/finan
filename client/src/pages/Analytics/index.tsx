import { useMutation, useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchForecast, fetchTips } from "../../api/analytics";
import styles from "./Analytics.module.css";

function formatMoney(n: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatMonthRu(monthKey: string): string {
  const [ys, ms] = monthKey.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m)) {
    return monthKey;
  }
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("ru-RU", { month: "short", year: "numeric" });
}

const chartIncomeColor = "#22c55e";
const chartExpenseColor = "#f97316";

export default function AnalyticsPage() {
  const [tipsText, setTipsText] = useState<string | null>(null);
  const [tipsError, setTipsError] = useState<string | null>(null);

  const forecastQuery = useQuery({
    queryKey: ["analytics-forecast"],
    queryFn: fetchForecast,
  });

  const tipsMutation = useMutation({
    mutationFn: fetchTips,
    onMutate: () => {
      setTipsError(null);
    },
    onSuccess: (data) => {
      setTipsText(data.tips);
      setTipsError(null);
    },
    onError: (err: unknown) => {
      setTipsText(null);
      if (axios.isAxiosError(err)) {
        const msg = (err.response?.data as { error?: string } | undefined)?.error;
        setTipsError(msg ?? "Не удалось получить советы.");
        return;
      }
      setTipsError("Не удалось получить советы.");
    },
  });

  const chartData = useMemo(() => {
    const raw = forecastQuery.data?.monthlyData ?? [];
    return raw.map((row) => ({
      name: formatMonthRu(row.month),
      income: row.income,
      expenses: row.expenses,
    }));
  }, [forecastQuery.data?.monthlyData]);

  const f = forecastQuery.data;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/dashboard" className={styles.back}>
            ← На главную
          </Link>
          <h1 className={styles.title}>Аналитика</h1>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Прогноз</h2>

          {forecastQuery.isError ? (
            <p className={styles.error}>Не удалось загрузить прогноз. Попробуйте позже.</p>
          ) : null}
          {forecastQuery.isPending ? <p className={styles.loading}>Загрузка прогноза…</p> : null}

          {forecastQuery.isSuccess && f !== undefined ? (
            <>
              <div className={styles.cards}>
                <article className={styles.statCard}>
                  <p className={styles.statLabel}>Средний доход (3 мес.)</p>
                  <p className={`${styles.statValue} ${styles.statValuePos}`}>{formatMoney(f.avgIncome)}</p>
                </article>
                <article className={styles.statCard}>
                  <p className={styles.statLabel}>Средние расходы (3 мес.)</p>
                  <p className={`${styles.statValue} ${styles.statValueNeg}`}>{formatMoney(f.avgExpenses)}</p>
                </article>
                <article className={styles.statCard}>
                  <p className={styles.statLabel}>Прогноз баланса на конец месяца</p>
                  <p
                    className={`${styles.statValue} ${
                      f.forecastBalance >= 0 ? styles.statValuePos : styles.statValueNeg
                    }`}
                  >
                    {formatMoney(f.forecastBalance)}
                  </p>
                </article>
              </div>

              <div className={styles.chartCard}>
                <p className={styles.chartTitle}>Доходы и расходы по месяцам</p>
                <div className={styles.chartWrap}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.35)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis
                      tick={{ fontSize: 12 }}
                      tickFormatter={(v) =>
                        new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(
                          Number(v),
                        )
                      }
                    />
                    <Tooltip
                      formatter={(value) => formatMoney(Number(value ?? 0))}
                      labelFormatter={(label) => String(label)}
                      contentStyle={{ borderRadius: "0.5rem" }}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: "0.5rem" }}
                      formatter={(value) => (value === "income" ? "Доходы" : "Расходы")}
                    />
                    <Bar dataKey="income" name="income" fill={chartIncomeColor} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="expenses" fill={chartExpenseColor} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            </>
          ) : null}
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Советы от ИИ</h2>

          <div className={styles.tipsActions}>
            <button
              type="button"
              className={styles.aiBtn}
              disabled={tipsMutation.isPending}
              onClick={() => {
                tipsMutation.mutate();
              }}
            >
              {tipsMutation.isPending ? "ИИ анализирует ваши расходы…" : "Получить советы от ИИ"}
            </button>
          </div>

          {tipsError !== null ? <p className={styles.error}>{tipsError}</p> : null}

          {tipsText !== null && !tipsMutation.isPending ? (
            <div className={styles.tipsCard}>
              <p className={styles.tipsBody}>{tipsText}</p>
              <p className={styles.tipsNote}>Советы генерируются на основе ваших реальных данных</p>
            </div>
          ) : null}

          {tipsText === null && !tipsMutation.isPending && tipsError === null ? (
            <p className={styles.placeholder}>Нажмите кнопку, чтобы получить персональные советы по экономии.</p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
