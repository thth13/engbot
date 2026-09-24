import { z } from "zod";
import { database } from "@engbot/core/db";
import { ensureUser } from "@engbot/core/users";
import { HttpError } from "@engbot/core/errors";
import { analyze } from "@engbot/core/learning";
const updateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      chat: z.object({ id: z.number(), type: z.string() }),
      from: z.object({ id: z.number(), first_name: z.string() }),
      text: z.string().max(3000).optional(),
    })
    .optional(),
});
export async function telegramUpdate(body: unknown) {
  const update = updateSchema.parse(body);
  const message = update.message;
  if (!message || message.chat.type !== "private") return;
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
  let reply = old?.reply;
  try {
    const uid = await ensureUser(
      String(message.from.id),
      message.from.first_name,
    );
    const user = await db.users.findOne({ _id: uid });
    const app = process.env.APP_URL;
    if (!app) throw new Error("APP_URL missing");
    const command = message.text?.split(" ")[0].split("@")[0];
    const routes: Record<string, string> = {
      "/start": "/",
      "/practice": "/practice",
      "/mistakes": "/mistakes",
      "/words": "/vocabulary",
      "/progress": "/progress",
      "/settings": "/profile",
    };
    if (!reply) {
      if (!message.text)
        reply =
          "В первой версии поддерживаются текстовые сообщения. Напишите мне по-английски.";
      else if (command && routes[command])
        reply =
          command === "/start"
            ? "Привет! Я ваш English Coach. Откройте приложение, выберите цель и напишите мне по-английски."
            : "Откройте этот раздел в приложении.";
      else if (!user?.settings)
        reply =
          "Сначала выберите уровень и цель в приложении — это поможет подобрать практику.";
      else {
        try {
          const result = await analyze(user, message.text, `telegram:${id}`);
          reply =
            result.reply +
            result.mistakes
              .slice(0, 3)
              .map((m) => `\n\n${m.wrong} → ${m.correct}\n${m.explanation}`)
              .join("");
          if (
            result.naturalVersion &&
            result.naturalVersion !== result.corrected
          )
            reply += `\n\nЕстественнее: ${result.naturalVersion}`;
        } catch (error) {
          if (!(error instanceof HttpError)) throw error;
          reply = error.message;
        }
      }
      await db.updates.updateOne(
        { _id: id },
        { $set: { status: "ready", reply } },
      );
    }
    const response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: reply.slice(0, 4000),
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "Открыть English Coach",
                  web_app: {
                    url: new URL(routes[command || ""] || "/", app).href,
                  },
                },
              ],
            ],
          },
        }),
      },
    );
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error("Telegram delivery failed");
    await db.updates.updateOne(
      { _id: id },
      { $set: { status: "sent" }, $unset: { leaseUntil: "" } },
    );
  } catch (error) {
    await db.updates.updateOne(
      { _id: id },
      { $set: { status: "retry" }, $unset: { leaseUntil: "" } },
    );
    throw error instanceof HttpError
      ? error
      : new HttpError(502, "Не удалось обработать сообщение Telegram.");
  }
}
