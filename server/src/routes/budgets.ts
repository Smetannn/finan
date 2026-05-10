import { and, eq } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { budgets, categories } from "../db/schema";
import { authMiddleware } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const monthKeySchema = z.string().regex(/^\d{4}-\d{2}$/, "Expected YYYY-MM");

function monthKeyToDate(monthKey: string): string {
  const [yStr, mStr] = monthKey.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

const createBudgetSchema = z.object({
  categoryId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  month: monthKeySchema,
});

router.post("/", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const parsed = createBudgetSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const { categoryId, amount, month } = parsed.data;
    const monthDate = monthKeyToDate(month);

    const [category] = await db
      .select({
        id: categories.id,
        userId: categories.userId,
        type: categories.type,
      })
      .from(categories)
      .where(eq(categories.id, categoryId))
      .limit(1);

    if (category === undefined) {
      res.status(400).json({ error: "Category not found" });
      return;
    }

    if (category.type !== "expense") {
      res.status(400).json({ error: "Budget is only allowed for expense categories" });
      return;
    }

    const isSystem = category.userId === null;
    const isOwn = category.userId === userId;
    if (!isSystem && !isOwn) {
      res.status(403).json({ error: "Cannot use this category" });
      return;
    }

    const existing = await db
      .select({ id: budgets.id })
      .from(budgets)
      .where(
        and(eq(budgets.userId, userId), eq(budgets.month, monthDate), eq(budgets.categoryId, categoryId)),
      )
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "Budget already exists for this category and month" });
      return;
    }

    const [row] = await db
      .insert(budgets)
      .values({
        userId,
        categoryId,
        amount: amount.toFixed(2),
        month: monthDate,
        groupId: null,
      })
      .returning();

    if (row === undefined) {
      res.status(500).json({ error: "Failed to create budget" });
      return;
    }

    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
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
      .delete(budgets)
      .where(and(eq(budgets.id, id), eq(budgets.userId, userId)))
      .returning({ id: budgets.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Budget not found" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:month", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const parsed = monthKeySchema.safeParse(req.params.month);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid month", details: parsed.error.flatten() });
      return;
    }

    const monthKey = parsed.data;
    const monthDate = monthKeyToDate(monthKey);

    const rows = await db
      .select()
      .from(budgets)
      .where(and(eq(budgets.userId, userId), eq(budgets.month, monthDate)));

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
