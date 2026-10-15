import type { ClientSession } from "mongodb";
import { database } from "./db";
import type { EventLog } from "./schema";

// LOGGING: central switch for persistent product analytics.
export const eventLoggingEnabled = () =>
  process.env.EVENT_LOGGING_ENABLED !== "false";

export async function logEvent(
  event: Omit<EventLog, "createdAt">,
  session?: ClientSession,
) {
  if (!eventLoggingEnabled()) return;
  try {
    const db = await database();
    await db.events.updateOne(
      { _id: event._id },
      { $setOnInsert: { ...event, createdAt: new Date() } },
      { upsert: true, session, maxTimeMS: 5000 },
    );
  } catch (error) {
    // Transactional events must commit together with the onboarding checkpoint.
    if (session) throw error;
    console.error(
      "Event logging failed",
      error instanceof Error ? error.name : "UnknownError",
    );
  }
}
