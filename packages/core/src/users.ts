import { database } from "./db";
import { HttpError } from "./errors";
import { ensureWallet } from "./billing";
import { DAILY_AI_LIMIT } from "./pricing";
export async function ensureUser(id: string, name: string, username?: string) {
  const { users } = await database();
  await users.updateOne(
    { _id: id },
    {
      $set: { username: username ?? null },
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
  await ensureWallet(id);
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
  if ((item?.count || 0) > DAILY_AI_LIMIT)
    throw new HttpError(
      429,
      `You’ve reached today’s ${DAILY_AI_LIMIT} AI request limit. Come back tomorrow; your credits do not expire.`,
    );
}
