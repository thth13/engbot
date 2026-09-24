import { MongoClient } from "mongodb";
if (!process.env.MONGODB_URI) throw new Error("Set MONGODB_URI");
const client = new MongoClient(process.env.MONGODB_URI);
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "engbot");
  for (const name of ["messages", "words"])
    await db.collection(name).createIndex({ userId: 1, createdAt: -1 });
  await db.collection("mistakes").createIndex({ userId: 1, occurrences: -1 });
  for (const name of ["mistakes", "words"])
    await db
      .collection(name)
      .createIndex({ userId: 1, nextReview: 1, mastery: 1 });
  await db.collection("activity").createIndex({ userId: 1, day: -1 });
  await db
    .collection("exercises")
    .createIndex({ userId: 1, sourceId: 1, attemptedAt: 1 });
  console.log("Indexes created.");
} finally {
  await client.close();
}
