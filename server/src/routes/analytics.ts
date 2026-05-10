import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { Router } from "express";
import Groq from "groq-sdk";
import { db } from "../db";
import { categories, transactions } from "../db/schema";
import { authMiddleware } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Первый день месяца, отстоящего на `monthOffset` от `base` (0 = тот же месяц). */
function startOfMonth(base: Date, monthOffset: number): Date {
  const y = base.getFullYear();
  const m = base.getMonth() + monthOffset;
  return new Date(y, m, 1);
}

function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function txDateToString(d: unknown): string {
  if (d instanceof Date) {
    return toISODate(d);
  }
  if (typeof d === "string") {
    return d.slice(0, 10);
  }
  return String(d).slice(0, 10);
}

function parseAmount(v: string): number {
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

type TxRow = {
  amount: string;
  type: "income" | "expense";
  date: string;
  categoryName: string;
};

async function fetchPersonalTransactionsLast3Months(userId: number): Promise<{
  rows: TxRow[];
  startStr: string;
  endStr: string;
  monthKeys: string[];
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endStr = toISODate(today);

  const startMonth = startOfMonth(today, -2);
  const startStr = toISODate(startMonth);

  const monthKeys: string[] = [];
  for (let i = -2; i <= 0; i++) {
    const d = startOfMonth(today, i);
    monthKeys.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
  }

  const rows = await db
    .select({
      amount: transactions.amount,
      type: transactions.type,
      date: transactions.date,
      categoryName: categories.name,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(
      and(
        eq(transactions.userId, userId),
        isNull(transactions.groupId),
        gte(transactions.date, startStr),
        lte(transactions.date, endStr),
      ),
    );

  return {
    rows: rows.map((r) => ({
      amount: String(r.amount),
      type: r.type,
      date: txDateToString(r.date),
      categoryName: r.categoryName,
    })),
    startStr,
    endStr,
    monthKeys,
  };
}

function buildExpenseByCategory(rows: TxRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    if (r.type !== "expense") {
      continue;
    }
    const prev = m.get(r.categoryName) ?? 0;
    m.set(r.categoryName, prev + parseAmount(r.amount));
  }
  return m;
}

function buildMonthlyTotals(rows: TxRow[], monthKeys: string[]): { month: string; income: number; expenses: number }[] {
  return monthKeys.map((month) => {
    let income = 0;
    let expenses = 0;
    for (const r of rows) {
      if (!r.date.startsWith(month)) {
        continue;
      }
      const a = parseAmount(r.amount);
      if (r.type === "income") {
        income += a;
      } else {
        expenses += a;
      }
    }
    return {
      month,
      income: roundMoney(income),
      expenses: roundMoney(expenses),
    };
  });
}

router.get("/tips", async (req, res) => {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (apiKey === undefined || apiKey === "") {
      res.status(503).json({ error: "Сервис советов недоступен: не задан GROQ_API_KEY" });
      return;
    }

    const userId = res.locals.userId as number;
    const { rows } = await fetchPersonalTransactionsLast3Months(userId);
    const byCat = buildExpenseByCategory(rows);

    if (byCat.size === 0) {
      res.json({
        tips:
          "За последние 3 месяца нет записей о расходах. Добавьте транзакции в разделе «Транзакции», чтобы получить персональные советы.",
      });
      return;
    }

    const lines = [...byCat.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, total]) => `${name}: ${roundMoney(total)} ₽`);
    const dataBlock = lines.join("; ");

    const prompt = `Вот мои расходы по категориям за последние 3 месяца (в рублях): ${dataBlock}.
Дай 3-5 конкретных советов как я могу сэкономить.
Отвечай на русском, кратко и по делу.`;

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
    });

    const tips = response.choices[0]?.message?.content ?? "Не удалось получить советы.";
    const tipsTrimmed = typeof tips === "string" ? tips.trim() : String(tips).trim();
    if (tipsTrimmed === "") {
      res.status(502).json({ error: "Пустой ответ от модели" });
      return;
    }

    res.json({ tips: tipsTrimmed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Не удалось получить советы" });
  }
});

router.get("/forecast", async (_req, res) => {
  try {
    const userId = res.locals.userId as number;
    const { rows, monthKeys } = await fetchPersonalTransactionsLast3Months(userId);
    const monthlyData = buildMonthlyTotals(rows, monthKeys);

    const sumIncome = monthlyData.reduce((s, m) => s + m.income, 0);
    const sumExpenses = monthlyData.reduce((s, m) => s + m.expenses, 0);
    const n = monthlyData.length || 1;
    const avgIncome = roundMoney(sumIncome / n);
    const avgExpenses = roundMoney(sumExpenses / n);
    const forecastSavings = roundMoney(avgIncome - avgExpenses);

    const today = new Date();
    const y = today.getFullYear();
    const m0 = today.getMonth();
    const currentMonthKey = `${y}-${pad2(m0 + 1)}`;
    const dim = daysInMonth(y, m0);
    const dayOfMonth = today.getDate();

    let netMtd = 0;
    for (const r of rows) {
      if (!r.date.startsWith(currentMonthKey)) {
        continue;
      }
      const a = parseAmount(r.amount);
      netMtd += r.type === "income" ? a : -a;
    }
    netMtd = roundMoney(netMtd);

    const remainingFraction = Math.max(0, (dim - dayOfMonth) / dim);
    const forecastBalance = roundMoney(netMtd + forecastSavings * remainingFraction);

    res.json({
      avgIncome,
      avgExpenses,
      forecastBalance,
      forecastSavings,
      monthlyData,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Не удалось рассчитать прогноз" });
  }
});

export default router;
