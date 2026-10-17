import { randomBytes } from "node:crypto";
import { eventLoggingEnabled, logEvent } from "@engbot/core/events";
import { database } from "@engbot/core/db";
import { notifyAdmins } from "@engbot/core/notifications";
import {
  settingsSchema,
  type BotDraft,
  type BotReply,
  type User,
} from "@engbot/core/schema";

type Choice = readonly [string, string | number | null];
const steps: { key: string; question: string; choices: readonly Choice[] }[] = [
  {
    key: "nativeLanguage",
    question:
      "What language should I use to explain mistakes? You can also type your language.",
    choices: [
      ["English", "English"],
      ["Hindi · हिन्दी", "Hindi"],
      ["Hinglish · Hindi + English", "Hinglish"],
    ],
  },
  {
    key: "goal",
    question: "Why are you learning English?",
    choices: [
      ["Speak confidently", "Speak confidently"],
      ["Travel", "Travel"],
      ["Work", "Work"],
      ["Job interviews", "Job interviews"],
      ["Move abroad", "Move abroad"],
      ["Understand content", "Understand content"],
      ["Improve grammar", "Improve grammar"],
      ["Expand vocabulary", "Expand vocabulary"],
    ],
  },
  {
    key: "replyMode",
    question:
      "How should I reply to you? You can send me text or voice either way.",
    choices: [
      ["Text messages", "text"],
      ["Voice messages", "voice"],
    ],
  },
  {
    key: "hour",
    question:
      "When should I start a conversation? I’ll send a new topic once a day at the selected time in India (IST). Use /pause to turn this off.",
    choices: [
      ["Morning · 09:00", 9],
      ["Afternoon · 13:00", 13],
      ["Evening · 19:00", 19],
      ["Only when I message you", null],
    ],
  },
];
export function onboardingReply(draft: BotDraft, prefix = ""): BotReply {
  const step = steps[draft.step] || steps[0];
  const rows = step.choices.map(([text], index) => [
    { text, callback_data: `ob:${draft.revision}:${index}` },
  ]);
  if (draft.step > 0)
    rows.push([{ text: "← Back", callback_data: `ob:${draft.revision}:back` }]);
  return {
    text: `${prefix}${draft.step + 1}/${steps.length} · ${step.question}`,
    reply_markup: { inline_keyboard: rows },
  };
}
export async function beginOnboarding(
  user: User,
  updateId: string,
): Promise<BotReply> {
  const draft: BotDraft = {
    version: 3,
    revision: randomBytes(6).toString("hex"),
    step: 0,
    settings: { ...user.settings, timezone: "Asia/Kolkata" },
  };
  const db = await database();
  const reply = onboardingReply(
    draft,
    "Hi! I’m your English Coach. Let’s set up our conversations right here.\n\n",
  );
  await checkpoint(async (session) => {
    // LOGGING: retain the latest unanswered question even after the user leaves.
    if (eventLoggingEnabled()) {
      await db.users.updateOne(
        { _id: user._id },
        {
          $set: {
            "onboardingProgress.bot": {
              status: "in_progress",
              step: 1,
              stepName: steps[0].key,
              maxStep: 1,
              totalSteps: steps.length,
              updatedAt: new Date(),
            },
          },
        },
        { session },
      );
      await logEvent(
        {
          _id: `bot:onboarding:${updateId}:start`,
          event: "bot_onboarding_step",
          source: "Telegram Bot",
          userId: user._id,
          details: {
            step: 1,
            stepName: steps[0].key,
            totalSteps: steps.length,
            initial: user.bot?.hour === undefined,
          },
        },
        session,
      );
    }
    await db.users.updateOne(
      { _id: user._id },
      { $set: { "bot.draft": draft } },
      { session },
    );
    await db.updates.updateOne(
      { _id: updateId },
      { $set: { payload: reply } },
      { session },
    );
  });
  return reply;
}
export async function advanceOnboarding(
  user: User,
  updateId: string,
  data?: string,
  text?: string,
): Promise<BotReply | null> {
  const draft = user.bot?.draft;
  if (!draft)
    return {
      text: "These buttons are no longer active. Use /settings to set up your profile or /topic for a new topic.",
    };
  if (draft.version !== 3) return beginOnboarding(user, updateId);
  const [, revision, action] = (data || "").split(":");
  if (data && (revision !== draft.revision || !data.startsWith("ob:")))
    return onboardingReply(
      draft,
      "That was an earlier step. Let’s continue here:\n\n",
    );
  const step = steps[draft.step];
  const next: BotDraft = {
    ...draft,
    settings: { ...draft.settings },
    revision: randomBytes(6).toString("hex"),
  };
  if (action === "back" && draft.step > 0) next.step--;
  else {
    let value: string | number | null | undefined;
    if (data && /^\d+$/.test(action || ""))
      value = step.choices[Number(action)]?.[1];
    else if (text && step.key === "nativeLanguage") value = text.trim();
    if (value === undefined)
      return onboardingReply(
        draft,
        "Choose an answer using a button below.\n\n",
      );
    if (step.key === "hour") next.hour = value as number | null;
    else {
      const candidate = {
        nativeLanguage: "English",
        englishLevel: "unknown",
        goal: "Speak confidently",
        interests: "",
        dailyGoal: 10,
        timezone: "Asia/Kolkata",
        ...next.settings,
        [step.key]: value,
      };
      const parsed = settingsSchema.safeParse(candidate);
      if (!parsed.success)
        return onboardingReply(
          draft,
          "Could not save your answer. Check the text length.\n\n",
        );
      next.settings = parsed.data;
    }
    next.step++;
  }
  const db = await database();
  const filter = { _id: user._id, "bot.draft.revision": draft.revision };
  if (next.step === steps.length) {
    const changed = await checkpoint(async (session) => {
      const result = await db.users.updateOne(
        filter,
        {
          $set: {
            settings: settingsSchema.parse(next.settings),
            "bot.enabled": next.hour !== null,
            "bot.hour": next.hour ?? 19,
          },
          $unset: { "bot.draft": "" },
        },
        { session },
      );
      if (result.modifiedCount && eventLoggingEnabled()) {
        await db.users.updateOne(
          { _id: user._id },
          {
            $set: {
              "onboardingProgress.bot.status": "completed",
              "onboardingProgress.bot.step": steps.length,
              "onboardingProgress.bot.stepName": "completed",
              "onboardingProgress.bot.totalSteps": steps.length,
              "onboardingProgress.bot.updatedAt": new Date(),
              "onboardingProgress.bot.completedAt": new Date(),
            },
            $max: { "onboardingProgress.bot.maxStep": steps.length },
          },
          { session },
        );
        await logEvent(
          {
            _id: `bot:onboarding:${updateId}:completed`,
            event: "bot_onboarding_completed",
            source: "Telegram Bot",
            userId: user._id,
            details: {
              initial: user.bot?.hour === undefined,
              totalSteps: steps.length,
            },
          },
          session,
        );
      }
      if (result.modifiedCount)
        await db.updates.updateOne(
          { _id: updateId },
          { $set: { startConversation: true } },
          { session },
        );
      return result;
    });
    if (changed.modifiedCount) {
      if (user.bot?.hour === undefined)
        await notifyAdmins({
          id: `telegram:${updateId}:onboarding`,
          event: "✅ Completed bot onboarding",
          source: "Telegram Bot",
          user,
          details: `📊 Level: ${next.settings.englishLevel}\n🎯 Goal: ${next.settings.goal}`,
        });
      return null;
    }
  } else {
    const changed = await checkpoint(async (session) => {
      const result = await db.users.updateOne(
        filter,
        { $set: { "bot.draft": next } },
        { session },
      );
      if (result.modifiedCount && eventLoggingEnabled()) {
        await db.users.updateOne(
          { _id: user._id },
          {
            $set: {
              "onboardingProgress.bot.status": "in_progress",
              "onboardingProgress.bot.step": next.step + 1,
              "onboardingProgress.bot.stepName": steps[next.step].key,
              "onboardingProgress.bot.totalSteps": steps.length,
              "onboardingProgress.bot.updatedAt": new Date(),
            },
            $max: { "onboardingProgress.bot.maxStep": next.step + 1 },
          },
          { session },
        );
        await logEvent(
          {
            _id: `bot:onboarding:${updateId}:step`,
            event: "bot_onboarding_step",
            source: "Telegram Bot",
            userId: user._id,
            details: {
              step: next.step + 1,
              stepName: steps[next.step].key,
              totalSteps: steps.length,
              direction: action === "back" ? "back" : "next",
            },
          },
          session,
        );
      }
      if (result.modifiedCount)
        await db.updates.updateOne(
          { _id: updateId },
          { $set: { payload: onboardingReply(next) } },
          { session },
        );
      return result;
    });
    if (changed.modifiedCount) return onboardingReply(next);
  }
  const current = await db.users.findOne({ _id: user._id });
  return current?.bot?.draft
    ? onboardingReply(current.bot.draft)
    : { text: "Settings already saved. Use /topic to start a conversation." };
}

async function checkpoint<T>(
  work: (session: import("mongodb").ClientSession) => Promise<T>,
): Promise<T> {
  const db = await database();
  const session = db.client.startSession();
  try {
    return (await session.withTransaction(() => work(session)))!;
  } finally {
    await session.endSession();
  }
}
