import { createHash, randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";
import { database } from "./db";
import { ai } from "./ai";
import { HttpError } from "./errors";
import { rateLimit } from "./users";
import { paidOperation, walletSummary } from "./billing";
import { PRICES, pointsToUnits } from "./pricing";
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
  if (!user.settings) throw new HttpError(409, "Complete your profile first.");
  return {
    ...user.settings,
    englishLevel:
      user.learnerProfile?.englishLevel !== "unknown"
        ? user.learnerProfile?.englishLevel || user.settings.englishLevel
        : user.settings.englishLevel,
    interests: user.settings.interests || user.learnerProfile?.interests || "",
  };
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
  prepaid = false,
): Promise<Correction> {
  const settings = requireSettings(user);
  const db = await database();
  const id = `${user._id}:${requestId}`;
  const existing = await db.messages.findOne({ _id: id });
  if (existing) return existing.analysis;
  const history = await conversationHistory(user._id);
  const samples = [...history.map((entry) => entry.text), text].filter(
    (entry) => entry.trim().split(/\s+/).length >= 8,
  );
  const enoughEvidence =
    samples.length >= 3 && samples.join(" ").split(/\s+/).length >= 80;
  return paidOperation(
    user._id,
    `text:${requestId}`,
    "text",
    pointsToUnits(prepaid ? 0 : PRICES.text),
    async () => {
      await rateLimit(user._id);
      return ai.analyzeMessage(text, settings, history);
    },
    async (analysis, session) => {
      if (await db.messages.findOne({ _id: id }, { session })) return;
      await db.messages.insertOne(
        { _id: id, userId: user._id, text, analysis, createdAt: new Date() },
        { session },
      );
      if (analysis.learnerProfile) {
        const previous = await db.users.findOne({ _id: user._id }, { session });
        await db.users.updateOne(
          { _id: user._id },
          {
            $set: {
              learnerProfile: {
                englishLevel:
                  enoughEvidence &&
                  analysis.learnerProfile.englishLevel !== "unknown"
                    ? analysis.learnerProfile.englishLevel
                    : previous?.learnerProfile?.englishLevel || "unknown",
                interests: analysis.learnerProfile.interests,
                updatedAt: new Date(),
              },
            },
          },
          { session },
        );
      }
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
    },
  );
}

export async function makeExercise(
  user: User,
  sourceType: "mistake" | "word",
  sourceId: string | undefined,
  requestId: string,
) {
  return paidOperation(
    user._id,
    `exercise-request:${requestId}`,
    "exercise_request",
    0,
    () => createExercise(user, sourceType, sourceId),
  );
}
async function createExercise(
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
        ? "No mistakes yet. Start with a conversation."
        : "Add a word from a conversation.",
    );
  const pending = await db.exercises.findOne({
    userId: user._id,
    sourceId: source._id,
    attemptedAt: { $exists: false },
  });
  if (pending) return publicExercise(pending);
  // One generation per source/review cycle, even from concurrent tabs.
  const previous = await db.exercises.findOne(
    { userId: user._id, sourceId: source._id },
    { sort: { createdAt: -1 } },
  );
  if (previous && !previous.attemptedAt) return publicExercise(previous);
  const exercise = await paidOperation(
    user._id,
    `exercise:${source._id}:${previous?._id || "first"}`,
    "exercise",
    pointsToUnits(PRICES.exercise),
    async () => {
      await rateLimit(user._id);
      const content = await ai.generateExercise(source, settings);
      return {
        ...content,
        _id: randomUUID(),
        userId: user._id,
        sourceId: source._id,
        sourceType,
        createdAt: new Date(),
        billingVersion: 1,
      };
    },
    async (result, session) => {
      await db.exercises.insertOne(result, { session });
    },
  );
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
  if (!exercise) throw new HttpError(404, "Exercise not found.");
  if (exercise.result) return exercise.result;
  return paidOperation(
    user._id,
    `answer:${id}`,
    "answer",
    0,
    async () => {
      await rateLimit(user._id);
      const graded = await ai.gradeAnswer(exercise, answer, settings);
      return { ...graded, answer: exercise.answer };
    },
    async (result, session) => {
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
          { $set: review(item, result.correct) },
          { session },
        );
      await reward(
        user._id,
        result.correct ? 20 : 5,
        "exercises",
        result.correct,
        session,
      );
    },
  );
}

export async function snapshot(user: User) {
  const wallet = await walletSummary(user._id);
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
    wallet,
    user: {
      ...user,
      balanceUnits: wallet.balanceUnits,
      streak: daysSince > 1 ? 0 : user.streak,
    },
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

// Include bot-initiated questions without creating fake learner messages or XP.
export async function conversationHistory(userId: string) {
  const db = await database();
  const [messages, starters] = await Promise.all([
    db.messages.find({ userId }).sort({ createdAt: -1 }).limit(12).toArray(),
    db.starters
      .find({ userId, sentAt: { $exists: true } })
      .sort({ createdAt: -1 })
      .limit(12)
      .toArray(),
  ]);
  const history = [
    ...messages.map((m) => ({
      text: m.text,
      reply: m.analysis.reply,
      at: m.createdAt,
    })),
    ...starters.map((m) => ({ text: "", reply: m.text, at: m.sentAt! })),
  ]
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(-16)
    .map(({ text, reply }) => ({ text, reply }));
  let remaining = 24000;
  return history
    .reverse()
    .filter((entry) => {
      remaining -= entry.text.length + entry.reply.length;
      return remaining >= 0;
    })
    .reverse();
}
export async function conversationStarter(user: User, id: string) {
  const db = await database();
  const existing = await db.starters.findOne({ _id: id });
  if (existing) return existing.text;
  return paidOperation(
    user._id,
    `topic:${id}`,
    "topic",
    pointsToUnits(PRICES.topic),
    async () => {
      await rateLimit(user._id);
      const { text } = await ai.startConversation(
        requireSettings(user),
        await conversationHistory(user._id),
      );
      return text;
    },
    async (text, session) => {
      await db.starters.updateOne(
        { _id: id },
        { $setOnInsert: { userId: user._id, text, createdAt: new Date() } },
        { upsert: true, session },
      );
    },
  );
}
