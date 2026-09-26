import { setTimeout as delay } from "node:timers/promises";
import { database } from "@engbot/core/db";
import { conversationStarter, dayKey } from "@engbot/core/learning";
import { telegramCall, TelegramDeliveryError } from "./api";

export async function runConversations(signal: AbortSignal) {
  while (!signal.aborted) {
    try {
      const db = await database();
      const now = new Date();
      const inactiveBefore = new Date(now.getTime() - 60 * 60 * 1000);
      const eligible = {
        "bot.enabled": true,
        "bot.chatId": { $exists: true },
        "bot.draft": { $exists: false },
        settings: { $ne: null },
        "bot.lastContactAt": { $lte: inactiveBefore },
        $or: [
          { "bot.leaseUntil": { $exists: false } },
          { "bot.leaseUntil": { $lte: now } },
        ],
      };
      const cursor = db.users.find(eligible);
      try {
        for await (const user of cursor) {
          if (signal.aborted) break;
          const settings = user.settings!;
          const day = dayKey(now, settings.timezone);
          const hour = Number(
            new Intl.DateTimeFormat("en-GB", {
              timeZone: settings.timezone,
              hour: "2-digit",
              hourCycle: "h23",
            }).format(now),
          );
          if (
            hour !== (user.bot?.hour ?? 19) ||
            user.bot?.lastPromptDay === day
          )
            continue;
          const leaseUntil = new Date(Date.now() + 120000);
          const claim = await db.users.updateOne(
            { ...eligible, _id: user._id, "bot.lastPromptDay": { $ne: day } },
            { $set: { "bot.leaseUntil": leaseUntil } },
          );
          if (!claim.modifiedCount) continue;
          try {
            const id = `daily:${user._id}:${day}`;
            const text = await conversationStarter(user, id);
            if (signal.aborted) break;
            // Recheck activity and preferences after generation. Reserve the day before
            // delivery: an ambiguous network timeout must not trigger duplicate nudges.
            const reserved = await db.users.updateOne(
              {
                _id: user._id,
                "bot.enabled": true,
                "bot.draft": { $exists: false },
                "bot.lastContactAt": { $lte: inactiveBefore },
                "bot.leaseUntil": leaseUntil,
                "bot.hour": user.bot?.hour ?? 19,
                "settings.timezone": settings.timezone,
              },
              { $set: { "bot.lastPromptDay": day } },
            );
            if (!reserved.modifiedCount) continue;
            await telegramCall("sendMessage", {
              chat_id: user.bot!.chatId,
              text,
            });
            await db.starters.updateOne(
              { _id: id },
              { $set: { sentAt: new Date() } },
            );
          } catch (error) {
            if (error instanceof TelegramDeliveryError && error.code === 403) {
              await db.users.updateOne(
                { _id: user._id },
                { $set: { "bot.enabled": false } },
              );
            } else if (
              error instanceof TelegramDeliveryError &&
              error.code === 429
            ) {
              await db.users.updateOne(
                { _id: user._id },
                { $unset: { "bot.lastPromptDay": "" } },
              );
              await delay(error.retryAfter * 1000, undefined, { signal }).catch(
                () => {},
              );
            }
            console.error("Scheduled conversation failed", {
              code:
                error instanceof TelegramDeliveryError
                  ? error.code
                  : "generation_or_network",
            });
          } finally {
            // Keep the lease briefly after failures to avoid rapid AI retries.
            await db.users.updateOne(
              { _id: user._id, "bot.leaseUntil": leaseUntil },
              { $set: { "bot.leaseUntil": new Date(Date.now() + 5 * 60000) } },
            );
          }
          await delay(1000, undefined, { signal }).catch(() => {});
        }
      } finally {
        await cursor.close();
      }
    } catch {
      console.error("Scheduled conversations unavailable; retrying later");
    }
    await delay(60000, undefined, { signal }).catch(() => {});
  }
}
