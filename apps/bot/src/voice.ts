import { createHash } from "node:crypto";
import { database } from "@engbot/core/db";
import type { BotReply } from "@engbot/core/schema";
import { telegramCall } from "./api";
import { hasVoiceTime, reserveVoiceTime, voiceUsageKey } from "./voice-quota";

// Opus granule positions use a 48 kHz clock, including encoder pre-skip.
function opusDuration(audio: ArrayBuffer) {
  const bytes = Buffer.from(audio);
  let offset = 0;
  let preSkip: number | undefined;
  let samples = 0;
  let ended = false;
  while (offset + 27 <= bytes.length) {
    if (bytes.toString("ascii", offset, offset + 4) !== "OggS") break;
    const segments = bytes[offset + 26];
    const body = offset + 27 + segments;
    if (body > bytes.length) break;
    let size = 0;
    for (let i = offset + 27; i < body; i++) size += bytes[i];
    if (body + size > bytes.length) break;
    if (
      preSkip === undefined && size >= 19 &&
      bytes.toString("ascii", body, body + 8) === "OpusHead"
    ) {
      preSkip = bytes.readUInt16LE(body + 10);
    }
    const granule = bytes.readBigInt64LE(offset + 6);
    if (granule >= 0n) samples = Number(granule);
    ended = (bytes[offset + 5] & 4) !== 0;
    offset = body + size;
  }
  if (
    preSkip === undefined || !ended ||
    offset !== bytes.length || samples <= preSkip
  )
    throw new Error("Could not determine speech duration");
  return (samples - preSkip) / 48000;
}

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
  return {
    audio: new Blob([audio], { type: "audio/ogg" }),
    duration: opusDuration(audio),
  };
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
  const user = await db.users.findOne({ "bot.chatId": chatId });
  const sendText = (content = text) =>
    telegramCall("sendMessage", { chat_id: chatId, text: content, reply_markup });
  if (!user) return sendText();
  const quotaKey = voiceUsageKey(user);
  const requestId = `outgoing:${sourceId}`;
  if (!(await hasVoiceTime(quotaKey, requestId))) return sendText();
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
  let duration = saved.duration;
  // Legacy cached files have no duration; regenerate them before reserving time.
  const cachedFileId = duration ? saved.fileId : undefined;
  if (!cachedFileId) {
    try {
      const speech = await synthesize(saved.text);
      audio = speech.audio;
      duration = speech.duration;
    } catch {
      console.error("Voice generation unavailable; delivering text instead");
      return telegramCall("sendMessage", {
        chat_id: chatId,
        text: saved.text,
        reply_markup,
      });
    }
  }
  if (!duration || !(await reserveVoiceTime(quotaKey, requestId, duration)))
    return sendText(saved.text);
  const form = new FormData();
  form.set("chat_id", String(chatId));
  if (cachedFileId) form.set("voice", cachedFileId);
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
      .updateOne({ _id: id }, { $set: { fileId: sent.voice.file_id, duration } })
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
