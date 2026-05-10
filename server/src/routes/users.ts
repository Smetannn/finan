import { and, eq, ne } from "drizzle-orm";
import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { db } from "../db";
import { users, type User } from "../db/schema";
import { authMiddleware } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

function toPublicUser(user: User): Omit<User, "passwordHash"> {
  const { passwordHash: _h, ...rest } = user;
  return rest;
}

const updateMeSchema = z
  .object({
    name: z.string().min(1).max(255).optional(),
    email: z.string().email().optional(),
  })
  .refine((data) => data.name !== undefined || data.email !== undefined, {
    message: "Укажите имя или email",
  });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
});

router.patch("/me", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const parsed = updateMeSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Некорректные данные", details: parsed.error.flatten() });
      return;
    }

    const updates: { name?: string; email?: string } = {};
    if (parsed.data.name !== undefined) {
      updates.name = parsed.data.name.trim();
    }
    if (parsed.data.email !== undefined) {
      updates.email = parsed.data.email.trim().toLowerCase();
    }

    if (updates.email !== undefined) {
      const [taken] = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.email, updates.email), ne(users.id, userId)))
        .limit(1);
      if (taken !== undefined) {
        res.status(409).json({ error: "Этот email уже занят" });
        return;
      }
    }

    const [updated] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();

    if (updated === undefined) {
      res.status(404).json({ error: "Пользователь не найден" });
      return;
    }

    res.json(toPublicUser(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Не удалось сохранить профиль" });
  }
});

router.patch("/me/password", async (req, res) => {
  try {
    const userId = res.locals.userId as number;

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: "Новый пароль должен быть не короче 6 символов",
        details: parsed.error.flatten(),
      });
      return;
    }

    const { currentPassword, newPassword } = parsed.data;

    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user === undefined) {
      res.status(404).json({ error: "Пользователь не найден" });
      return;
    }

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      res.status(401).json({ error: "Неверный текущий пароль" });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Не удалось изменить пароль" });
  }
});

router.delete("/me", async (_req, res) => {
  try {
    const userId = res.locals.userId as number;

    const deleted = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });

    if (deleted.length === 0) {
      res.status(404).json({ error: "Пользователь не найден" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Не удалось удалить аккаунт" });
  }
});

export default router;
