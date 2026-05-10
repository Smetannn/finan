import { and, eq, isNull, or } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { categories } from "../db/schema";
import { authMiddleware } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const createCategorySchema = z.object({
  name: z.string().min(1),
  type: z.enum(["income", "expense"]),
  icon: z.string().min(1),
  color: z.string().min(1),
});

router.get("/", async (_req, res) => {
  try {
    const userId = res.locals.userId as number;

    const rows = await db
      .select()
      .from(categories)
      .where(or(isNull(categories.userId), eq(categories.userId, userId)));

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const parsed = createCategorySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const [row] = await db
      .insert(categories)
      .values({
        ...parsed.data,
        userId,
      })
      .returning();

    if (row === undefined) {
      res.status(500).json({ error: "Failed to create category" });
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
      .delete(categories)
      .where(and(eq(categories.id, id), eq(categories.userId, userId)))
      .returning({ id: categories.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Category not found or not allowed" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
