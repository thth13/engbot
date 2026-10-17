import { database } from "@engbot/core/db";
import type { User } from "@engbot/core/schema";

const dailySeconds = 15 * 60;

export function voiceUsageKey(user: User) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: user.settings?.timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return `${user._id}:${day}`;
}

export async function hasVoiceTime(key: string, requestId: string) {
  const db = await database();
  const usage = await db.voiceUsage.findOne({ _id: key });
  return (
    (usage?.seconds || 0) < dailySeconds ||
    !!usage?.requests.some((request) => request.id === requestId)
  );
}

// Both directions share a quota, regardless of subscription. Transactions keep
// concurrent replies within the budget; stable request IDs make retries safe.
export async function reserveVoiceTime(
  key: string,
  requestId: string,
  duration: number,
) {
  if (!Number.isFinite(duration) || duration <= 0) return false;
  const seconds = Math.ceil(duration);
  const db = await database();
  const session = db.client.startSession();
  try {
    return await session.withTransaction(async () => {
      const usage = await db.voiceUsage.findOne({ _id: key }, { session });
      const previous = usage?.requests.find((item) => item.id === requestId);
      const total = (usage?.seconds || 0) - (previous?.seconds || 0) + seconds;
      if (total > dailySeconds) return false;
      await db.voiceUsage.updateOne(
        { _id: key },
        {
          $set: {
            seconds: total,
            requests: [
              ...(usage?.requests || []).filter((item) => item.id !== requestId),
              { id: requestId, seconds },
            ],
          },
        },
        { upsert: true, session },
      );
      return true;
    });
  } finally {
    await session.endSession();
  }
}

export async function releaseVoiceTime(key: string, requestId: string) {
  const db = await database();
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const usage = await db.voiceUsage.findOne({ _id: key }, { session });
      const request = usage?.requests.find((item) => item.id === requestId);
      if (!request) return;
      await db.voiceUsage.updateOne(
        { _id: key },
        {
          $inc: { seconds: -request.seconds },
          $pull: { requests: { id: requestId } },
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}
