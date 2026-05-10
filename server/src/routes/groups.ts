import { and, eq, ilike, sql } from "drizzle-orm";
import { Router } from "express";
import { z } from "zod";
import { db } from "../db";
import { groupMembers, groups, users } from "../db/schema";
import { authMiddleware } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

const createGroupSchema = z.object({
  name: z.string().min(1),
});

const inviteSchema = z.object({
  email: z.string().email(),
});

async function getMembership(
  groupId: number,
  userId: number,
): Promise<{ role: "owner" | "member" } | null> {
  const [row] = await db
    .select({ role: groupMembers.role })
    .from(groupMembers)
    .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
    .limit(1);
  return row ?? null;
}

router.post("/", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const parsed = createGroupSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const { name } = parsed.data;

    const created = await db.transaction(async (tx) => {
      const [g] = await tx
        .insert(groups)
        .values({ name, ownerId: userId })
        .returning();
      if (g === undefined) {
        return null;
      }
      await tx.insert(groupMembers).values({
        groupId: g.id,
        userId,
        role: "owner",
      });
      return g;
    });

    if (created === null) {
      res.status(500).json({ error: "Failed to create group" });
      return;
    }

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (_req, res) => {
  try {
    const userId = res.locals.userId as number;

    const mine = await db
      .select({
        id: groups.id,
        name: groups.name,
        ownerId: groups.ownerId,
        createdAt: groups.createdAt,
        role: groupMembers.role,
      })
      .from(groupMembers)
      .innerJoin(groups, eq(groupMembers.groupId, groups.id))
      .where(eq(groupMembers.userId, userId));

    const counts = await db
      .select({
        groupId: groupMembers.groupId,
        memberCount: sql<number>`cast(count(*) as int)`,
      })
      .from(groupMembers)
      .groupBy(groupMembers.groupId);

    const countMap = new Map(counts.map((c) => [c.groupId, c.memberCount]));

    const result = mine.map((g) => ({
      id: g.id,
      name: g.name,
      ownerId: g.ownerId,
      createdAt: g.createdAt,
      role: g.role,
      memberCount: countMap.get(g.id) ?? 0,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const id = Number.parseInt(req.params.id ?? "", 10);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const mem = await getMembership(id, userId);
    if (mem === null) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    const [group] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
    if (group === undefined) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    const members = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        role: groupMembers.role,
      })
      .from(groupMembers)
      .innerJoin(users, eq(groupMembers.userId, users.id))
      .where(eq(groupMembers.groupId, id));

    res.json({ group, members });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/invite", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const groupId = Number.parseInt(req.params.id ?? "", 10);
    if (!Number.isFinite(groupId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (group === undefined) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    if (group.ownerId !== userId) {
      res.status(403).json({ error: "Only owner can invite" });
      return;
    }

    const parsed = inviteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid body", details: parsed.error.flatten() });
      return;
    }

    const emailTrim = parsed.data.email.trim();

    const [invitee] = await db
      .select({ id: users.id })
      .from(users)
      .where(ilike(users.email, emailTrim))
      .limit(1);

    if (invitee === undefined) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    if (invitee.id === userId) {
      res.status(400).json({ error: "Cannot invite yourself" });
      return;
    }

    const existing = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, invitee.id)))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: "User is already a member" });
      return;
    }

    await db.insert(groupMembers).values({
      groupId,
      userId: invitee.id,
      role: "member",
    });

    res.status(201).json({ userId: invitee.id, email: parsed.data.email.trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id/leave", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const groupId = Number.parseInt(req.params.id ?? "", 10);
    if (!Number.isFinite(groupId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [group] = await db.select().from(groups).where(eq(groups.id, groupId)).limit(1);
    if (group === undefined) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    if (group.ownerId === userId) {
      res.status(403).json({ error: "Owner cannot leave; delete the group instead" });
      return;
    }

    const removed = await db
      .delete(groupMembers)
      .where(and(eq(groupMembers.groupId, groupId), eq(groupMembers.userId, userId)))
      .returning({ id: groupMembers.id });

    if (removed.length === 0) {
      res.status(404).json({ error: "Not a member" });
      return;
    }

    res.status(204).send();
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

    const [group] = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
    if (group === undefined) {
      res.status(404).json({ error: "Group not found" });
      return;
    }

    if (group.ownerId !== userId) {
      res.status(403).json({ error: "Only owner can delete the group" });
      return;
    }

    await db.delete(groups).where(eq(groups.id, id));

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
