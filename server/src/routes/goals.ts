import { and, eq, isNull } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { goalContributions, goals, groupMembers } from "../db/schema";
import { authMiddleware } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const createGoalSchema = z.object({
  name: z.string().min(1),
  targetAmount: z.coerce.number().positive(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD"),
  groupId: z.coerce.number().int().positive().optional(),
});

const contributeSchema = z.object({
  amount: z.coerce.number().positive(),
});

function parseNumeric(s: string): number {
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

router.get("/", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const raw = req.query.groupId;
    let groupId: number | undefined;
    if (typeof raw === "string" && raw !== "") {
      const n = Number.parseInt(raw, 10);
      if (Number.isFinite(n)) {
        groupId = n;
      }
    } else if (Array.isArray(raw) && typeof raw[0] === "string") {
      const n = Number.parseInt(raw[0], 10);
      if (Number.isFinite(n)) {
        groupId = n;
      }
    }

    if (groupId !== undefined) {
      const [mem] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (mem === undefined) {
        res.status(403).json({ error: "Not a group member" });
        return;
      }
      const rows = await db.select().from(goals).where(eq(goals.groupId, groupId));
      res.json(rows);
      return;
    }

    const rows = await db
      .select()
      .from(goals)
      .where(and(eq(goals.userId, userId), isNull(goals.groupId)));

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const parsed = createGoalSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const { name, targetAmount, deadline, groupId: bodyGroupId } = parsed.data;

    if (bodyGroupId !== undefined) {
      const [mem] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, bodyGroupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (mem === undefined) {
        res.status(403).json({ error: "Not a group member" });
        return;
      }
    }

    const [row] = await db
      .insert(goals)
      .values({
        userId,
        name,
        targetAmount: targetAmount.toFixed(2),
        currentAmount: "0.00",
        deadline,
        groupId: bodyGroupId ?? null,
      })
      .returning();

    if (row === undefined) {
      res.status(500).json({ error: "Failed to create goal" });
      return;
    }

    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/contribute", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const goalId = Number.parseInt(req.params.id ?? "", 10);
    if (!Number.isFinite(goalId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const parsed = contributeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const { amount } = parsed.data;
    const amountStr = amount.toFixed(2);

    const updated = await db.transaction(async (tx) => {
      const [goal] = await tx.select().from(goals).where(eq(goals.id, goalId)).limit(1);

      if (goal === undefined) {
        return null;
      }

      if (goal.groupId !== null) {
        const [mem] = await tx
          .select({ id: groupMembers.id })
          .from(groupMembers)
          .where(and(eq(groupMembers.groupId, goal.groupId), eq(groupMembers.userId, userId)))
          .limit(1);
        if (mem === undefined) {
          return null;
        }
      } else if (goal.userId !== userId) {
        return null;
      }

      const nextCurrent = (parseNumeric(goal.currentAmount) + amount).toFixed(2);

      await tx.insert(goalContributions).values({
        goalId,
        userId,
        amount: amountStr,
      });

      const [row] = await tx
        .update(goals)
        .set({ currentAmount: nextCurrent })
        .where(eq(goals.id, goalId))
        .returning();

      return row ?? null;
    });

    if (updated === null) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    res.json(updated);
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

    const [goal] = await db.select().from(goals).where(eq(goals.id, id)).limit(1);

    if (goal === undefined) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    if (goal.groupId !== null) {
      const [mem] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(and(eq(groupMembers.groupId, goal.groupId), eq(groupMembers.userId, userId)))
        .limit(1);
      if (mem === undefined) {
        res.status(404).json({ error: "Goal not found" });
        return;
      }
    } else if (goal.userId !== userId) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    const deleted = await db.delete(goals).where(eq(goals.id, id)).returning({ id: goals.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Goal not found" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
