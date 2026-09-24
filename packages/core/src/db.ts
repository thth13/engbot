import { MongoClient } from "mongodb";
import type {
  User,
  Mistake,
  Word,
  Message,
  Exercise,
  Activity,
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
    mistakes: db.collection<Mistake>("mistakes"),
    words: db.collection<Word>("words"),
    messages: db.collection<Message>("messages"),
    exercises: db.collection<Exercise>("exercises"),
    activity: db.collection<Activity>("activity"),
    limits: db.collection<{ _id: string; count: number }>("limits"),
    updates: db.collection<{
      _id: string;
      status: string;
      reply?: string;
      leaseUntil?: Date;
    }>("telegramUpdates"),
  };
}
