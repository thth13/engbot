import { Binary } from "mongodb";
import { createHash } from "node:crypto";
import { database } from "@engbot/core/db";
import type { BotReply } from "@engbot/core/schema";
import { telegramCall } from "./api";
import {
  reserveVoiceTime,
  releaseVoiceTime,
  voiceUsageKey,
} from "./voice-quota";
import {
  AccessError,
  ensureWallet,
  hasPremium,
  reserveOperation,
  settleOperation,
  cancelOperation,
} from "@engbot/core/billing";
import {
  MAX_SPEECH_CHARACTERS,
  MAX_SPEECH_SECONDS,
  MAX_SPEECH_POINTS,
  audioUnits,
  pointsToUnits,
} from "@engbot/core/pricing";
import { recordUsage, usageContext } from "@engbot/core/usage";

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
      preSkip === undefined &&
      size >= 19 &&
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
    preSkip === undefined ||
    !ended ||
    offset !== bytes.length ||
    samples <= preSkip
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
  const duration = opusDuration(audio);
  await recordUsage({
    model: process.env.TTS_MODEL || "gpt-4o-mini-tts",
    kind: "speech",
    seconds: duration,
    estimatedCostUsd: (process.env.TTS_MODEL || "gpt-4o-mini-tts").startsWith(
      "gpt-4o-mini-tts",
    )
      ? (duration / 60) * 0.015
      : undefined,
    estimated: true,
  });
  return { audio: Buffer.from(audio), duration };
}

type SavedVoice = {
  _id: string;
  chatId: number;
  text: string;
  fileId?: string;
  duration?: number;
  audio?: Binary;
};

async function deliverVoice(saved: SavedVoice): Promise<boolean> {
  const db = await database();
  const found = await db.users.findOne({ "bot.chatId": saved.chatId });
  if (!found) return false;
  const user = await ensureWallet(found._id);
  const operation = await reserveOperation(
    user._id,
    `speech:${saved._id}`,
    "speech",
    saved.fileId ? 0 : pointsToUnits(MAX_SPEECH_POINTS),
  );
  const reservation = operation.cached ? undefined : operation.reservation;
  const quotaKey = voiceUsageKey(user);
  const requestId = `outgoing:${saved._id}`;
  let sent: Awaited<ReturnType<typeof telegramCall>>;
  let duration = saved.duration;
  try {
    // A cached Telegram file is free to replay and survives a process restart.
    if (!saved.fileId && !saved.audio) {
      if (saved.text.length > MAX_SPEECH_CHARACTERS)
        throw new Error("Reply is too long to speak");
      const speech = await usageContext.run(
        { userId: user._id, operationId: `${user._id}:speech:${saved._id}` },
        () => synthesize(saved.text),
      );
      duration = speech.duration;
      saved.audio = new Binary(speech.audio);
      await db.voiceReplies.updateOne(
        { _id: saved._id },
        { $set: { audio: saved.audio, duration } },
      );
    }
    if (!duration || duration > MAX_SPEECH_SECONDS)
      throw new Error("Speech exceeded its quoted maximum");
    if (
      !operation.cached &&
      hasPremium(user) &&
      !(await reserveVoiceTime(quotaKey, requestId, duration))
    )
      throw new Error("Daily legacy voice allowance reached");
    const form = new FormData();
    form.set("chat_id", String(saved.chatId));
    if (saved.fileId) form.set("voice", saved.fileId);
    else
      form.set(
        "voice",
        new Blob([new Uint8Array(saved.audio!.buffer)], { type: "audio/ogg" }),
        "reply.ogg",
      );
    form.set(
      "reply_markup",
      JSON.stringify({
        inline_keyboard: [
          [
            {
              text: "📄 Show text · free",
              callback_data: `voice:text:${saved._id}`,
            },
          ],
        ],
      }),
    );
    sent = await telegramCall("sendVoice", form);
  } catch (error) {
    if (reservation) await cancelOperation(reservation);
    if (hasPremium(user) && !operation.cached)
      await releaseVoiceTime(quotaKey, requestId);
    throw error;
  }
  // After delivery, a database failure is retried without refunding or charging twice.
  if (sent.voice?.file_id)
    await db.voiceReplies.updateOne(
      { _id: saved._id },
      {
        $set: { fileId: sent.voice.file_id, duration },
        $unset: { audio: "" },
      },
    );
  if (reservation)
    await settleOperation(
      reservation,
      { voiceId: saved._id },
      audioUnits("speech", duration),
    );
  return true;
}

export async function sendBotReply(
  chatId: number,
  reply: BotReply,
  sourceId: string,
) {
  const { text, feedbackText, reply_markup } = reply;
  const db = await database();
  const canSpeak = !!reply.voice && text.length <= MAX_SPEECH_CHARACTERS;
  let saved: SavedVoice | null = null;
  if (canSpeak) {
    const id = createHash("sha256")
      .update(`${chatId}:${sourceId}`)
      .digest("hex")
      .slice(0, 32);
    await db.voiceReplies.updateOne(
      { _id: id },
      { $setOnInsert: { chatId, text, createdAt: new Date() } },
      { upsert: true },
    );
    saved = await db.voiceReplies.findOne({ _id: id });
  }
  const sendText = (note = "") =>
    telegramCall("sendMessage", {
      chat_id: chatId,
      text: [text, feedbackText, note]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 4096),
      ...(reply_markup ? { reply_markup } : {}),
    });
  if (!reply.voice || !saved) return sendText();
  try {
    if (!(await deliverVoice(saved))) return sendText();
  } catch (error) {
    // A settled/held operation may already have delivered audio. Let the outer
    // inbox retry database failures rather than silently refunding delivered work.
    const user = await db.users.findOne({ "bot.chatId": chatId });
    const op =
      user &&
      (await db.walletOperations.findOne({
        _id: `${user._id}:speech:${saved._id}`,
      }));
    if (op?.status === "reserved" || op?.status === "settled") throw error;
    return sendText(
      error instanceof AccessError
        ? `Not enough credits to reserve a voice reply (up to ${MAX_SPEECH_POINTS} credits). Your text reply is ready. Send /balance to top up or /text to keep using text.`
        : "Voice is unavailable; here is your text reply. No voice credits were charged.",
    );
  }
  if (feedbackText)
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text: feedbackText.slice(0, 4096),
    });
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
