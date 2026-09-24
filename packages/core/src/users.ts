import { database } from "./db";
import { HttpError } from "./errors";
export async function ensureUser(id: string, name: string) {
  const { users } = await database();
  await users.updateOne(
    { _id: id },
    {
      $setOnInsert: {
        name,
        settings: null,
        xp: 0,
        streak: 0,
        longestStreak: 0,
        lastActiveDay: null,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
  return id;
}
export async function rateLimit(userId: string) {
  const { limits } = await database();
  const key = `${userId}:${Math.floor(Date.now() / 86400000)}`;
  const item = await limits.findOneAndUpdate(
    { _id: key },
    { $inc: { count: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  if ((item?.count || 0) > 100)
    throw new HttpError(
      429,
      "Сегодня достигнут лимит AI-запросов. Вернитесь завтра.",
    );
}
