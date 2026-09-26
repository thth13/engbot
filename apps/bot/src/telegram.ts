import { z } from "zod";
import { database } from "@engbot/core/db";
import { ensureUser } from "@engbot/core/users";
import { HttpError } from "@engbot/core/errors";
import { analyze, conversationStarter } from "@engbot/core/learning";
import type { BotReply, User } from "@engbot/core/schema";
import {
  beginOnboarding,
  advanceOnboarding,
  onboardingReply,
} from "./onboarding";
import { telegramCall, TelegramDeliveryError } from "./api";
const sender = z.object({ id: z.number(), first_name: z.string() });
const chat = z.object({ id: z.number(), type: z.string() });
const updateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({ chat, from: sender, text: z.string().optional() })
    .optional(),
  callback_query: z
    .object({
      id: z.string(),
      from: sender,
      data: z.string().optional(),
      message: z.object({ chat, message_id: z.number() }).optional(),
    })
    .optional(),
});
const routes: Record<string, string> = {
  "/app": "/",
  "/practice": "/practice",
  "/mistakes": "/mistakes",
  "/words": "/vocabulary",
  "/progress": "/progress",
};

async function makeReply(
  user: User,
  id: string,
  command?: string,
  text?: string,
  callback?: string,
): Promise<BotReply> {
  const db = await database();
  if (command === "/pause") {
    await db.users.updateOne(
      { _id: user._id },
      { $set: { "bot.enabled": false } },
    );
    return {
      text: "Ежедневные разговоры отключены. Можешь писать мне в любое время. /resume — включить снова.",
    };
  }
  if (
    command === "/settings" ||
    (command === "/start" &&
      user.settings &&
      !user.bot?.draft &&
      user.bot?.hour === undefined)
  )
    return beginOnboarding(user, id);
  if (callback !== undefined) {
    const reply = await advanceOnboarding(user, id, callback);
    if (reply) return reply;
    user = (await db.users.findOne({ _id: user._id }))!;
  } else if (user.bot?.draft) {
    if (command) return onboardingReply(user.bot.draft);
    const reply = await advanceOnboarding(user, id, undefined, text);
    if (reply) return reply;
    user = (await db.users.findOne({ _id: user._id }))!;
  } else if (!user.settings) return beginOnboarding(user, id);
  else if (command === "/resume") {
    await db.users.updateOne(
      { _id: user._id },
      { $set: { "bot.enabled": true, "bot.hour": user.bot?.hour ?? 19 } },
    );
    return {
      text: `Буду начинать разговор каждый день в ${user.bot?.hour ?? 19}:00 (${user.settings.timezone}). /settings — изменить время, /pause — отключить.`,
    };
  } else if (command && routes[command]) {
    return {
      text: "Этот раздел доступен в приложении.",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Открыть раздел",
              web_app: {
                url: new URL(routes[command], process.env.APP_URL).href,
              },
            },
          ],
        ],
      },
    };
  } else if (command && !["/start", "/topic"].includes(command)) {
    return {
      text: "/topic — новая тема\n/settings — профиль и время разговоров\n/pause — отключить ежедневные темы\n/resume — включить\n/app — открыть приложение\n\nИли просто напиши мне по-английски.",
    };
  } else if (!command) {
    if (!text)
      return {
        text: "Пока я понимаю только текст. Напиши по-английски или отправь /topic — я начну разговор.",
      };
    if (text.length > 3000)
      return {
        text: "Раздели сообщение на части до 3000 символов — так я смогу ответить на каждую.",
      };
    const result = await analyze(user, text, `telegram:${id}`);
    return {
      text: (
        result.reply +
        result.mistakes
          .slice(0, 3)
          .map((m) => `\n\n${m.wrong} → ${m.correct}\n${m.explanation}`)
          .join("") +
        (result.naturalVersion && result.naturalVersion !== result.corrected
          ? `\n\nЕстественнее: ${result.naturalVersion}`
          : "")
      ).slice(0, 4000),
    };
  }
  const starter = await conversationStarter(user, `telegram:${id}`);
  const completed = await db.updates.findOne({
    _id: id,
    startConversation: true,
  });
  return {
    text: completed
      ? `Готово! ${user.bot?.enabled ? `Буду писать в ${user.bot.hour}:00 (${user.settings!.timezone}). /pause — отключить.` : "Ежедневные темы отключены. /resume — включить."}\n\n${starter}`
      : starter,
  };
}

export async function telegramUpdate(body: unknown) {
  const update = updateSchema.parse(body);
  const callback = update.callback_query;
  const target = callback?.message?.chat || update.message?.chat;
  const from = callback?.from || update.message?.from;
  if (!target || !from || target.type !== "private" || target.id !== from.id)
    return;
  if (callback)
    await telegramCall("answerCallbackQuery", {
      callback_query_id: callback.id,
    }).catch(() => {});
  const db = await database();
  const id = String(update.update_id);
  const old = await db.updates.findOne({ _id: id });
  if (old?.status === "sent") return;
  const leaseUntil = new Date(Date.now() + 90000);
  if (!old) {
    try {
      await db.updates.insertOne({ _id: id, status: "processing", leaseUntil });
    } catch (error) {
      if ((error as { code?: number }).code === 11000)
        throw new HttpError(503, "Сообщение ещё обрабатывается.");
      throw error;
    }
  } else {
    const claim = await db.updates.updateOne(
      {
        _id: id,
        status: { $ne: "sent" },
        $or: [
          { leaseUntil: { $lte: new Date() } },
          { leaseUntil: { $exists: false } },
        ],
      },
      { $set: { status: "processing", leaseUntil } },
    );
    if (!claim.modifiedCount)
      throw new HttpError(503, "Сообщение ещё обрабатывается.");
  }
  try {
    const uid = await ensureUser(String(from.id), from.first_name);
    await db.users.updateOne(
      { _id: uid },
      { $set: { "bot.chatId": target.id, "bot.lastContactAt": new Date() } },
    );
    const user = (await db.users.findOne({ _id: uid }))!;
    const text = update.message?.text;
    const command = text?.startsWith("/")
      ? text.split(/\s/)[0].split("@")[0]
      : undefined;
    let payload = old?.payload;
    if (!payload) {
      try {
        payload = old?.startConversation
          ? { text: await conversationStarter(user, `telegram:${id}`) }
          : await makeReply(
              user,
              id,
              command,
              text,
              callback ? callback.data || "" : undefined,
            );
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        payload = {
          text: `${error.message}\n\n/topic — попробовать начать новый разговор.`,
        };
      }
      await db.updates.updateOne(
        { _id: id },
        { $set: { status: "ready", payload } },
      );
    }
    await telegramCall("sendMessage", { chat_id: target.id, ...payload });
    await db.starters.updateOne(
      { _id: `telegram:${id}` },
      { $set: { sentAt: new Date() } },
    );
    await db.updates.updateOne(
      { _id: id },
      { $set: { status: "sent" }, $unset: { leaseUntil: "" } },
    );
    if (callback?.message)
      await telegramCall("editMessageReplyMarkup", {
        chat_id: target.id,
        message_id: callback.message.message_id,
        reply_markup: { inline_keyboard: [] },
      }).catch(() => {});
  } catch (error) {
    if (error instanceof TelegramDeliveryError && error.code === 403) {
      await db.users.updateOne(
        { _id: String(from.id) },
        { $set: { "bot.enabled": false } },
      );
      await db.updates.updateOne(
        { _id: id },
        { $set: { status: "sent" }, $unset: { leaseUntil: "" } },
      );
      return;
    }
    await db.updates.updateOne(
      { _id: id },
      { $set: { status: "retry" }, $unset: { leaseUntil: "" } },
    );
    throw error instanceof HttpError
      ? error
      : new HttpError(502, "Не удалось обработать сообщение Telegram.");
  }
}
