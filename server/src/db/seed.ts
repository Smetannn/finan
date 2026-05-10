import "dotenv/config";
import { and, eq, isNull } from "drizzle-orm";
import { db, pool } from "./index";
import { categories } from "./schema";

const systemCategories = [
  { name: "Зарплата", type: "income" as const, icon: "💰", color: "#4CAF50" },
  { name: "Фриланс", type: "income" as const, icon: "💻", color: "#2196F3" },
  { name: "Подарок", type: "income" as const, icon: "🎁", color: "#9C27B0" },
  { name: "Прочие доходы", type: "income" as const, icon: "➕", color: "#607D8B" },
  { name: "Еда", type: "expense" as const, icon: "🍔", color: "#F44336" },
  { name: "Транспорт", type: "expense" as const, icon: "🚗", color: "#FF9800" },
  { name: "Жильё", type: "expense" as const, icon: "🏠", color: "#795548" },
  { name: "Развлечения", type: "expense" as const, icon: "🎮", color: "#E91E63" },
  { name: "Здоровье", type: "expense" as const, icon: "💊", color: "#00BCD4" },
  { name: "Одежда", type: "expense" as const, icon: "👕", color: "#3F51B5" },
  { name: "Образование", type: "expense" as const, icon: "📚", color: "#FF5722" },
  { name: "Прочее", type: "expense" as const, icon: "➖", color: "#9E9E9E" },
];

async function upsertSystemCategoriesInPlace(): Promise<void> {
  for (const c of systemCategories) {
    const updated = await db
      .update(categories)
      .set({ name: c.name, color: c.color })
      .where(and(isNull(categories.userId), eq(categories.type, c.type), eq(categories.icon, c.icon)))
      .returning({ id: categories.id });
    if (updated.length === 0) {
      await db.insert(categories).values({
        name: c.name,
        type: c.type,
        icon: c.icon,
        color: c.color,
        userId: null,
      });
    }
  }
  console.log("Системные категории обновлены или добавлены (без удаления строк).");
}

async function seed(): Promise<void> {
  try {
    await db.delete(categories).where(isNull(categories.userId));
    console.log("Удалены системные категории (user_id IS NULL).");
  } catch (err) {
    console.warn(
      "Не удалось удалить системные категории (есть связанные транзакции/бюджеты). Обновляю на месте…",
    );
    console.warn(err);
    await upsertSystemCategoriesInPlace();
    return;
  }

  await db.insert(categories).values(
    systemCategories.map((c) => ({
      name: c.name,
      type: c.type,
      icon: c.icon,
      color: c.color,
      userId: null,
    })),
  );

  console.log(`Вставлено системных категорий: ${systemCategories.length}.`);
}

seed()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
