import { createHash } from "node:crypto";
import { database } from "@engbot/core/db";
import type { BotReply } from "@engbot/core/schema";
import { telegramCall } from "./api";

async function synthesize(text: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Speech is not configured");
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      model: process.env.TTS_MODEL || "gpt-4o-mini-tts",
      voice: process.env.TTS_VOICE || "coral",
      instructions:
        process.env.TTS_INSTRUCTIONS ||
        "Speak in a warm, friendly, encouraging tone, like a patient English conversation partner. Use a relaxed conversational pace, clear pronunciation, natural intonation, and gentle enthusiasm. Avoid sounding robotic, overly theatrical, or exaggeratedly cheerful.",
      input: text,
      response_format: "opus",
    }),
  });
  if (!response.ok) throw new Error("Speech generation failed");
  const audio = await response.arrayBuffer();
  if (!audio.byteLength) throw new Error("Speech audio is empty");
  return new Blob([audio], { type: "audio/ogg" });
}

export async function sendBotReply(
  chatId: number,
  reply: BotReply,
  sourceId: string,
) {
  const { voice, text, reply_markup } = reply;
  if (!voice) {
    return telegramCall("sendMessage", { chat_id: chatId, text, reply_markup });
  }

  const db = await database();
  const id = createHash("sha256")
    .update(`${chatId}:${sourceId}`)
    .digest("hex")
    .slice(0, 32);
  // Persist the transcript before delivery so the button works immediately.
  await db.voiceReplies.updateOne(
    { _id: id },
    { $setOnInsert: { chatId, text, createdAt: new Date() } },
    { upsert: true },
  );
  const saved = (await db.voiceReplies.findOne({ _id: id }))!;
  let audio: Blob | undefined;
  if (!saved.fileId) {
    try {
      audio = await synthesize(saved.text);
    } catch {
      console.error("Voice generation unavailable; delivering text instead");
      return telegramCall("sendMessage", {
        chat_id: chatId,
        text: saved.text,
        reply_markup,
      });
    }
  }
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (saved.fileId) form.set("voice", saved.fileId);
  else form.set("voice", audio!, "reply.ogg");
  form.set(
    "reply_markup",
    JSON.stringify({
      inline_keyboard: [
        [{ text: "📄 See Text", callback_data: `voice:text:${id}` }],
        ...(reply_markup?.inline_keyboard || []),
      ],
    }),
  );
  const sent = await telegramCall("sendVoice", form);
  if (sent.voice?.file_id) {
    // A cache failure must not cause an already delivered voice to be resent.
    await db.voiceReplies
      .updateOne({ _id: id }, { $set: { fileId: sent.voice.file_id } })
      .catch(() => console.error("Could not cache Telegram voice file"));
  }
  return sent;
}

export async function showVoiceText(
  chatId: number,
  messageId: number,
  data: string,
) {
  const db = await database();
  const saved = await db.voiceReplies.findOne({
    _id: data.slice("voice:text:".length),
    chatId,
  });
  await telegramCall("sendMessage", {
    chat_id: chatId,
    text: saved?.text || "This transcript is no longer available.",
    reply_parameters: {
      message_id: messageId,
      allow_sending_without_reply: true,
    },
  });
}
