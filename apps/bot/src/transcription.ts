import { HttpError } from "@engbot/core/errors";
import { telegramCall } from "./api";
import { recordUsage } from "@engbot/core/usage";

export interface IncomingVoice {
  file_id: string;
  duration: number;
  file_size?: number;
}

const maxBytes = 10 * 1024 * 1024;
const sizeMessage = "Please send a voice message up to 3 minutes and 10 MB.";

export function validateVoice(voice: IncomingVoice) {
  if (voice.duration > 180 || (voice.file_size || 0) > maxBytes)
    throw new HttpError(400, sizeMessage);
}

export async function transcribeVoice(voice: IncomingVoice): Promise<string> {
  validateVoice(voice);
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error("Transcription is not configured");
    const file = await telegramCall("getFile", { file_id: voice.file_id });
    if (!file.file_path) throw new Error("Missing voice file");
    if (file.file_size > maxBytes) throw new HttpError(400, sizeMessage);
    const response = await fetch(
      `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`,
      { signal: AbortSignal.timeout(20000) },
    );
    if (!response.ok || !response.body)
      throw new Error("Voice download failed");
    const reader = response.body.getReader();
    const chunks: ArrayBuffer[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
          await reader.cancel();
          throw new HttpError(400, sizeMessage);
        }
        chunks.push(new Uint8Array(value).buffer);
      }
    } finally {
      reader.releaseLock();
    }
    if (!size) throw new Error("Empty voice file");
    const form = new FormData();
    form.set("file", new Blob(chunks, { type: "audio/ogg" }), "voice.ogg");
    form.set("model", process.env.STT_MODEL || "gpt-4o-mini-transcribe");
    form.set("response_format", "json");
    const transcription = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: AbortSignal.timeout(45000),
      },
    );
    if (!transcription.ok) throw new Error("Transcription failed");
    const result = await transcription.json();
    await recordUsage({
      model: process.env.STT_MODEL || "gpt-4o-mini-transcribe",
      kind: "transcription",
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
      seconds: Math.max(1, voice.duration),
      estimatedCostUsd: (
        process.env.STT_MODEL || "gpt-4o-mini-transcribe"
      ).startsWith("gpt-4o-mini-transcribe")
        ? (Math.max(1, voice.duration) / 60) * 0.003
        : undefined,
      estimated: true,
    });
    const text = typeof result.text === "string" ? result.text.trim() : "";
    if (!text)
      throw new HttpError(
        400,
        "I couldn’t hear any speech. Please record another voice message or send text.",
      );
    return text;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    // Never expose download errors: their URLs contain the bot token.
    throw new HttpError(
      502,
      "I couldn’t transcribe this voice message. Please send it again or write your message as text.",
    );
  }
}
