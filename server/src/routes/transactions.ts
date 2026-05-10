import { and, eq, gte, lt } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { categories, groupMembers, transactions } from "../db/schema";
import { authMiddleware } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

function firstQueryString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === "string" && first !== "" ? first : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

const listQuerySchema = z.object({
  month: z.preprocess(firstQueryString, z.string().regex(/^\d{4}-\d{2}$/).optional()),
  type: z.preprocess(firstQueryString, z.enum(["income", "expense"]).optional()),
  categoryId: z.preprocess((v) => {
    const s = firstQueryString(v);
    if (s === undefined) {
      return undefined;
    }
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().int().positive().optional()),
  groupId: z.preprocess((v) => {
    const s = firstQueryString(v);
    if (s === undefined) {
      return undefined;
    }
    const n = Number.parseInt(s, 10);
    return Number.isFinite(n) ? n : undefined;
  }, z.number().int().positive().optional()),
});

const createTransactionSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  type: z.enum(["income", "expense"]),
  description: z.string().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  groupId: z.coerce.number().int().positive().optional(),
});

const patchTransactionSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive("Сумма должна быть больше нуля"),
  description: z.union([z.string(), z.null()]).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ожидается дата в формате ГГГГ-ММ-ДД"),
});

router.get("/", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }

    const { month, type, categoryId, groupId } = parsed.data;

    const conditions = [];

    if (groupId !== undefined) {
      const [membership] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (membership === undefined) {
        res.status(403).json({ error: "Not a group member" });
        return;
      }
      conditions.push(eq(transactions.groupId, groupId));
    } else {
      conditions.push(eq(transactions.userId, userId));
    }

    if (month !== undefined && month !== "") {
      const [yStr, mStr] = month.split("-");
      const y = Number(yStr);
      const m = Number(mStr);
      if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
        res.status(400).json({ error: "Invalid month" });
        return;
      }
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const endYear = m === 12 ? y + 1 : y;
      const endMonth = m === 12 ? 1 : m + 1;
      const end = `${endYear}-${String(endMonth).padStart(2, "0")}-01`;
      conditions.push(gte(transactions.date, start));
      conditions.push(lt(transactions.date, end));
    }

    if (type !== undefined) {
      conditions.push(eq(transactions.type, type));
    }

    if (categoryId !== undefined) {
      conditions.push(eq(transactions.categoryId, categoryId));
    }

    const rows = await db
      .select({
        id: transactions.id,
        userId: transactions.userId,
        groupId: transactions.groupId,
        categoryId: transactions.categoryId,
        amount: transactions.amount,
        type: transactions.type,
        description: transactions.description,
        date: transactions.date,
        createdAt: transactions.createdAt,
        categoryName: categories.name,
      })
      .from(transactions)
      .innerJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(...conditions));

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const parsed = createTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const { categoryId, amount, type, description, date, groupId } = parsed.data;

    if (groupId !== undefined) {
      const [membership] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (membership === undefined) {
        res.status(403).json({ error: "Not a group member" });
        return;
      }
    }

    const [category] = await db
      .select({
        id: categories.id,
        userId: categories.userId,
        categoryType: categories.type,
      })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);

    if (category === undefined) {
      res.status(400).json({ error: "Category not found" });
      return;
    }

    const isSystem = category.userId === null;
    const isOwn = category.userId === userId;
    if (!isSystem && !isOwn) {
      res.status(403).json({ error: "Cannot use this category" });
      return;
    }

    if (category.categoryType !== type) {
      res.status(400).json({ error: "Transaction type must match category type" });
      return;
    }

    const amountStr = amount.toFixed(2);

    const [row] = await db
      .insert(transactions)
      .values({
        userId,
        categoryId,
        amount: amountStr,
        type,
        description: description ?? null,
        date,
        groupId: groupId ?? null,
      })
      .returning();

    if (row === undefined) {
      res.status(500).json({ error: "Failed to create transaction" });
      return;
    }

    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const id = Number.parseInt(req.params.id ?? "", 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Некорректный идентификатор" });
      return;
    }

    const [existing] = await db
      .select({
        id: transactions.id,
        type: transactions.type,
        userId: transactions.userId,
      })
      .from(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .limit(1);

    if (existing === undefined) {
      res.status(404).json({ error: "Транзакция не найдена" });
      return;
    }

    const parsed = patchTransactionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
      return;
    }

    const { categoryId, amount, date } = parsed.data;
    const descriptionRaw = parsed.data.description;
    const descriptionNorm =
      descriptionRaw === undefined
        ? null
        : descriptionRaw === null
          ? null
          : descriptionRaw.trim() === ""
            ? null
            : descriptionRaw.trim();

    const [category] = await db
      .select({
        id: categories.id,
        userId: categories.userId,
        categoryType: categories.type,
      })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);

    if (category === undefined) {
      res.status(400).json({ error: "Категория не найдена" });
      return;
    }

    const isSystem = category.userId === null;
    const isOwn = category.userId === userId;
    if (!isSystem && !isOwn) {
      res.status(403).json({ error: "Нельзя использовать эту категорию" });
      return;
    }

    if (category.categoryType !== existing.type) {
      res.status(400).json({ error: "Тип категории должен совпадать с типом транзакции" });
      return;
    }

    const amountStr = amount.toFixed(2);

    const [row] = await db
      .update(transactions)
      .set({
        categoryId,
        amount: amountStr,
        description: descriptionNorm,
        date,
      })
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .returning();

    if (row === undefined) {
      res.status(500).json({ error: "Не удалось обновить транзакцию" });
      return;
    }

    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const id = Number.parseInt(req.params.id ?? "", 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const deleted = await db
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
      .returning({ id: transactions.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Transaction not found" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
