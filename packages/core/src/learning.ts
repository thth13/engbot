import { createHash, randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";
import { database } from "./db";
import { ai } from "./ai";
import { HttpError } from "./errors";
import { rateLimit } from "./users";
import type { User, Review, Correction } from "./schema";
const DAY = 86400000;
export const dayKey = (date: Date, timezone: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
export const identity = (...parts: string[]) =>
  createHash("sha256")
    .update(parts.map((p) => p.trim().toLowerCase()).join("\0"))
    .digest("hex");
export const newReview = (): Review => ({
  stage: 0,
  mastery: 0,
  nextReview: new Date(),
  lastPracticed: null,
});
export function review(item: Review, correct: boolean): Review {
  const stage = correct ? Math.min(item.stage + 1, 5) : 0;
  return {
    stage,
    mastery: stage * 20,
    lastPracticed: new Date(),
    nextReview: new Date(Date.now() + [0, 1, 3, 7, 14, 30][stage] * DAY),
  };
}
export function requireSettings(user: User) {
  if (!user.settings) throw new HttpError(409, "Сначала заполните профиль.");
  return user.settings;
}
async function reward(
  userId: string,
  xp: number,
  kind: "messages" | "exercises",
  correct: boolean,
  session: ClientSession,
) {
  const db = await database();
  const user = await db.users.findOne({ _id: userId }, { session });
  if (!user) return;
  const zone = user.settings?.timezone || "UTC";
  const day = dayKey(new Date(), zone);
  let streak = user.streak;
  if (user.lastActiveDay !== day) {
    const previous = user.lastActiveDay;
    const todayUtc = Date.parse(`${day}T00:00:00Z`);
    streak =
      previous && todayUtc - Date.parse(`${previous}T00:00:00Z`) === DAY
        ? streak + 1
        : 1;
  }
  await db.users.updateOne(
    { _id: userId },
    {
      $inc: { xp },
      $set: {
        streak,
        longestStreak: Math.max(streak, user.longestStreak),
        lastActiveDay: day,
      },
    },
    { session },
  );
  await db.activity.updateOne(
    { _id: `${userId}:${day}` },
    {
      $setOnInsert: { userId, day },
      $inc: {
        xp,
        messages: kind === "messages" ? 1 : 0,
        accurate: kind === "messages" && correct ? 1 : 0,
        exercises: kind === "exercises" ? 1 : 0,
        correct: kind === "exercises" && correct ? 1 : 0,
      },
    },
    { upsert: true, session },
  );
}
export async function analyze(
  user: User,
  text: string,
  requestId: string,
): Promise<Correction> {
  const settings = requireSettings(user);
  const db = await database();
  const id = `${user._id}:${requestId}`;
  const existing = await db.messages.findOne({ _id: id });
  if (existing) return existing.analysis;
  await rateLimit(user._id);
  const history = await db.messages
    .find({ userId: user._id })
    .sort({ createdAt: -1 })
    .limit(12)
    .toArray();
  const analysis = await ai.analyzeMessage(
    text,
    settings,
    history.reverse().map((m) => ({ text: m.text, reply: m.analysis.reply })),
  );
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      if (await db.messages.findOne({ _id: id }, { session })) return;
      await db.messages.insertOne(
        { _id: id, userId: user._id, text, analysis, createdAt: new Date() },
        { session },
      );
      const seen = new Set<string>();
      for (const mistake of analysis.mistakes) {
        const key = identity(
          user._id,
          mistake.category,
          mistake.wrong,
          mistake.correct,
        );
        if (seen.has(key)) continue;
        seen.add(key);
        await db.mistakes.updateOne(
          { _id: key },
          {
            $setOnInsert: {
              userId: user._id,
              createdAt: new Date(),
              lastPracticed: null,
            },
            $set: {
              ...mistake,
              original: text,
              corrected: analysis.corrected,
              stage: 0,
              mastery: 0,
              nextReview: new Date(),
            },
            $inc: { occurrences: 1 },
          },
          { upsert: true, session },
        );
      }
      await reward(
        user._id,
        10,
        "messages",
        analysis.mistakes.length === 0,
        session,
      );
    });
  } finally {
    await session.endSession();
  }
  return (await db.messages.findOne({ _id: id }))!.analysis;
}
export async function makeExercise(
  user: User,
  sourceType: "mistake" | "word",
  sourceId?: string,
) {
  const settings = requireSettings(user);
  const db = await database();
  const collection = sourceType === "mistake" ? db.mistakes : db.words;
  const source = await collection.findOne(
    { userId: user._id, ...(sourceId ? { _id: sourceId } : {}) },
    { sort: { nextReview: 1, mastery: 1 } },
  );
  if (!source)
    throw new HttpError(
      404,
      sourceType === "mistake"
        ? "Пока нет ошибок. Начните с разговора."
        : "Добавьте слово из разговора.",
    );
  const pending = await db.exercises.findOne({
    userId: user._id,
    sourceId: source._id,
    attemptedAt: { $exists: false },
  });
  if (pending) return publicExercise(pending);
  await rateLimit(user._id);
  const content = await ai.generateExercise(source, settings);
  const exercise = {
    ...content,
    _id: randomUUID(),
    userId: user._id,
    sourceId: source._id,
    sourceType,
    createdAt: new Date(),
  };
  await db.exercises.insertOne(exercise);
  return publicExercise(exercise);
}
function publicExercise(exercise: import("./schema").Exercise) {
  return {
    id: exercise._id,
    type: exercise.type,
    prompt: exercise.prompt,
    options: exercise.options,
  };
}
export async function submitAnswer(user: User, id: string, answer: string) {
  const settings = requireSettings(user);
  const db = await database();
  const exercise = await db.exercises.findOne({ _id: id, userId: user._id });
  if (!exercise) throw new HttpError(404, "Упражнение не найдено.");
  if (exercise.result) return exercise.result;
  await rateLimit(user._id);
  const graded = await ai.gradeAnswer(exercise, answer, settings);
  const result = { ...graded, answer: exercise.answer };
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const updated = await db.exercises.updateOne(
        { _id: id, userId: user._id, attemptedAt: { $exists: false } },
        { $set: { result, attemptedAt: new Date() } },
        { session },
      );
      if (!updated.modifiedCount) return;
      const collection =
        exercise.sourceType === "mistake" ? db.mistakes : db.words;
      const item = await collection.findOne(
        { _id: exercise.sourceId, userId: user._id },
        { session },
      );
      if (item)
        await collection.updateOne(
          { _id: item._id, userId: user._id },
          { $set: review(item, graded.correct) },
          { session },
        );
      await reward(
        user._id,
        graded.correct ? 20 : 5,
        "exercises",
        graded.correct,
        session,
      );
    });
  } finally {
    await session.endSession();
  }
  return (await db.exercises.findOne({ _id: id, userId: user._id }))!.result;
}
export async function snapshot(user: User) {
  const db = await database();
  const filter = { userId: user._id };
  const today = dayKey(new Date(), user.settings?.timezone || "UTC");
  const [
    mistakes,
    words,
    messages,
    activity,
    mistakeCount,
    wordCount,
    dueMistakes,
    dueWords,
  ] = await Promise.all([
    db.mistakes.find(filter).sort({ occurrences: -1 }).limit(500).toArray(),
    db.words.find(filter).sort({ createdAt: -1 }).limit(500).toArray(),
    db.messages.find(filter).sort({ createdAt: -1 }).limit(30).toArray(),
    db.activity.find(filter).sort({ day: -1 }).limit(30).toArray(),
    db.mistakes.countDocuments(filter),
    db.words.countDocuments(filter),
    db.mistakes.countDocuments({ ...filter, nextReview: { $lte: new Date() } }),
    db.words.countDocuments({ ...filter, nextReview: { $lte: new Date() } }),
  ]);
  const daysSince = user.lastActiveDay
    ? (Date.parse(`${today}T00:00:00Z`) -
        Date.parse(`${user.lastActiveDay}T00:00:00Z`)) /
      DAY
    : Infinity;
  return {
    user: { ...user, streak: daysSince > 1 ? 0 : user.streak },
    mistakes,
    words,
    messages: messages.reverse(),
    activity,
    counts: {
      mistakes: mistakeCount,
      words: wordCount,
      due: dueMistakes + dueWords,
    },
    today,
  };
}
