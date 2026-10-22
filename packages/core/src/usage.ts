import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { database } from "./db";
export const usageContext = new AsyncLocalStorage<{
  userId: string;
  operationId: string;
}>();
export async function recordUsage(data: {
  model: string;
  kind: "text" | "transcription" | "speech";
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  seconds?: number;
  estimatedCostUsd?: number;
  estimated: boolean;
}) {
  try {
    const db = await database();
    await db.aiUsage.insertOne({
      _id: randomUUID(),
      ...usageContext.getStore(),
      ...data,
      createdAt: new Date(),
    });
  } catch {
    console.error("Could not record AI usage");
  }
}
