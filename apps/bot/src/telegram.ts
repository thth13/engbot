import { z } from "zod";
import { database } from "@engbot/core/db";
import { ensureUser } from "@engbot/core/users";
import { HttpError } from "@engbot/core/errors";
import { analyze, conversationStarter } from "@engbot/core/learning";
import { notifyAdmins } from "@engbot/core/notifications";
import type { BotReply, User } from "@engbot/core/schema";
import {
  beginOnboarding,
  advanceOnboarding,
  onboardingReply,
} from "./onboarding";
import { telegramCall, TelegramDeliveryError } from "./api";
import {
  AccessError,
  hasPremium,
  trialEnded,
  premiumReply,
  reserveTrialMessage,
} from "@engbot/core/billing";
import { acceptPayment, sendPremiumInvoice, validPayment } from "./payments";
const sender = z.object({ id: z.number(), first_name: z.string() });
const chat = z.object({ id: z.number(), type: z.string() });
const updateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      chat,
      from: sender,
      text: z.string().optional(),
      successful_payment: z
        .object({
          currency: z.string(),
          total_amount: z.number().int(),
          invoice_payload: z.string(),
          telegram_payment_charge_id: z.string(),
        })
        .optional(),
    })
    .optional(),
  pre_checkout_query: z
    .object({
      id: z.string(),
      from: sender,
      currency: z.string(),
      total_amount: z.number().int(),
      invoice_payload: z.string(),
    })
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

function startTyping(chatId: number) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const refresh = async () => {
    await telegramCall("sendChatAction", {
      chat_id: chatId,
      action: "typing",
    }).catch(() => {});
    if (!stopped) {
      timer = setTimeout(() => void refresh(), 4000);
      timer.unref();
    }
  };
  void refresh();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

async function makeReply(
  user: User,
  id: string,
  command?: string,
  text?: string,
  callback?: string,
): Promise<BotReply> {
  const db = await database();
  if (command === "/paysupport") {
    return {
      text: "For payment help, send /paysupport followed by a description of the issue and your Telegram payment receipt ID. Never send card details or passwords.",
    };
  }
  if (
    command === "/premium" ||
    callback === "premium:buy" ||
    (command === "/start" && text?.split(/\s+/)[1] === "premium")
  ) {
    await sendPremiumInvoice(user._id, user.bot!.chatId);
    return {
      text: "Use the invoice above to activate Premium for 30 days. If Premium is already active, the purchase adds 30 days to your current access.",
    };
  }
  if (command === "/pause") {
    await db.users.updateOne(
      { _id: user._id },
      { $set: { "bot.enabled": false } },
    );
    return {
      text: "Daily conversations are off. You can message me anytime. Use /resume to turn them back on.",
    };
  }
  if (!hasPremium(user) && trialEnded(user)) return premiumReply();
  if (
    command === "/topic" ||
    (command === "/start" && user.settings && !user.bot?.draft)
  )
    await reserveTrialMessage(user._id, `telegram:${id}`);
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
      text: `I’ll start a conversation every day at ${user.bot?.hour ?? 19}:00 (${user.settings.timezone}). Use /settings to change the time or /pause to turn it off.`,
    };
  } else if (command && routes[command]) {
    return {
      text: "This section is available in the app.",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Open section",
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
      text: "/topic — new topic\n/premium — buy 30 days of Premium\n/paysupport — payment help\n/settings — profile and conversation time\n/pause — turn off daily topics\n/resume — turn on daily topics\n/app — open the app\n\nOr just message me in English.",
    };
  } else if (!command) {
    if (!text)
      return {
        text: "I can only read text for now. Write in English or send /topic and I’ll start a conversation.",
      };
    if (text.length > 3000)
      return {
        text: "Split your message into parts of up to 3,000 characters so I can reply to each one.",
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
          ? `\n\nMore natural: ${result.naturalVersion}`
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
      ? `All set! ${!hasPremium(user) ? "Your trial lasts 3 days from registration and includes 10 messages per day. After that, Premium costs 250 Stars for 30 days.\n\n" : ""}${user.bot?.enabled ? `I’ll message you at ${user.bot.hour}:00 (${user.settings!.timezone}). Use /pause to turn it off.` : "Daily topics are off. Use /resume to turn them on."}\n\n${starter}`
      : starter,
  };
}

export async function telegramUpdate(body: unknown) {
  const update = updateSchema.parse(body);
  if (update.pre_checkout_query) {
    const query = update.pre_checkout_query;
    const ok = validPayment(String(query.from.id), query);
    await telegramCall("answerPreCheckoutQuery", {
      pre_checkout_query_id: query.id,
      ok,
      ...(!ok
        ? {
            error_message:
              "This invoice is invalid. Send /premium to get a new invoice.",
          }
        : {}),
    });
    return;
  }
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
        throw new HttpError(503, "Your message is still being processed.");
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
      throw new HttpError(503, "Your message is still being processed.");
  }
  const stopTyping = startTyping(target.id);
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
    if (update.message)
      await notifyAdmins({
        id: `telegram:${id}:message`,
        event:
          command === "/start"
            ? "🤖 Started the bot (/start)"
            : "💬 Message sent to the bot",
        source: "Telegram Bot",
        user,
        details: `✉️ Message: ${text || "[Non-text message]"}`,
      });
    let payload = old?.payload;
    if (!payload) {
      try {
        payload = update.message?.successful_payment
          ? await acceptPayment(uid, update.message.successful_payment)
          : !hasPremium(user) && trialEnded(user) && old?.startConversation
            ? premiumReply()
            : old?.startConversation
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
        payload =
          error instanceof AccessError
            ? premiumReply(error.limitReached)
            : {
                text: `${error.message}\n\nUse /topic to try starting a new conversation.`,
              };
      }
      await db.updates.updateOne(
        { _id: id },
        { $set: { status: "ready", payload } },
      );
    }
    stopTyping();
    await telegramCall("sendMessage", { chat_id: target.id, ...payload });
    await db.starters.updateOne(
      { _id: `telegram:${id}` },
      { $set: { sentAt: new Date() } },
    );
    await db.updates.updateOne(
      { _id: id },
      { $set: { status: "sent" }, $unset: { leaseUntil: "" } },
    );
    if (callback?.message && callback.data !== "premium:buy")
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
      : new HttpError(502, "Could not process the Telegram message.");
  } finally {
    stopTyping();
  }
}
