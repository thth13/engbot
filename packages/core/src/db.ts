import { MongoClient } from "mongodb";
import type {
  User,
  Mistake,
  Word,
  Message,
  Exercise,
  Activity,
  EventLog,
} from "./schema";
const globalDb = globalThis as typeof globalThis & {
  mongo?: Promise<MongoClient>;
};
export async function closeDatabase() {
  const connection = globalDb.mongo;
  globalDb.mongo = undefined;
  if (connection) await (await connection).close();
}
export async function database() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("Database is not configured");
  if (!globalDb.mongo)
    globalDb.mongo = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })
      .connect()
      .catch((error) => {
        globalDb.mongo = undefined;
        throw error;
      });
  const client = await globalDb.mongo;
  const db = client.db(process.env.MONGODB_DB || "engbot");
  return {
    client,
    users: db.collection<User>("users"),
    events: db.collection<EventLog>("eventLogs"),
    eventLimits: db.collection<{ _id: string; count: number; expiresAt: Date }>(
      "eventLogLimits",
    ),
    mistakes: db.collection<Mistake>("mistakes"),
    words: db.collection<Word>("words"),
    messages: db.collection<Message>("messages"),
    exercises: db.collection<Exercise>("exercises"),
    activity: db.collection<Activity>("activity"),
    limits: db.collection<{ _id: string; count: number }>("limits"),
    trialUsage: db.collection<{ _id: string; requests: string[] }>(
      "trialUsage",
    ),
    payments: db.collection<{
      _id: string;
      userId: string;
      amount: number;
      currency: string;
      createdAt: Date;
      premiumUntil: Date;
    }>("payments"),
    telegramInbox: db.collection<{
      _id: string;
      updateId: number;
      body: unknown;
    }>("telegramInbox"),
    notifications: db.collection<{ _id: string; createdAt: Date }>(
      "adminNotifications",
    ),
    notificationLimits: db.collection<{
      _id: string;
      count: number;
      expiresAt: Date;
    }>("adminNotificationLimits"),
    starters: db.collection<{
      _id: string;
      userId: string;
      text: string;
      createdAt: Date;
      sentAt?: Date;
    }>("conversationStarters"),
    updates: db.collection<{
      _id: string;
      status: string;
      reply?: string;
      startConversation?: boolean;
      payload?: import("./schema").BotReply;
      leaseUntil?: Date;
    }>("telegramUpdates"),
  };
}
