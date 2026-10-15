import { randomBytes } from "node:crypto";
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
      "What language do you usually speak? You can also type your language.",
    choices: [
      ["Ukrainian", "Ukrainian"],
      ["Russian", "Russian"],
      ["English", "English"],
    ],
  },
  {
    key: "englishLevel",
    question: "What is your English level?",
    choices: [
      ["A1 · Beginner", "A1"],
      ["A2 · Elementary", "A2"],
      ["B1 · Intermediate", "B1"],
      ["B2 · Upper intermediate", "B2"],
      ["C1 · Advanced", "C1"],
      ["I’m not sure", "unknown"],
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
    key: "dailyGoal",
    question: "How many minutes a day would you like to practice?",
    choices: [
      ["5 minutes", 5],
      ["10 minutes", 10],
      ["15 minutes", 15],
      ["30 minutes", 30],
    ],
  },
  {
    key: "interests",
    question:
      "What would you like to talk about? Choose a topic or type your own, separated by commas.",
    choices: [
      ["Movies and TV shows", "Movies and TV shows"],
      ["Technology and games", "Technology and games"],
      ["Travel and food", "Travel and food"],
      ["Music and art", "Music and art"],
      ["Sports and wellbeing", "Sports and wellbeing"],
      [
        "Surprise me",
        "Everyday life, imaginative dilemmas and surprising ideas",
      ],
    ],
  },
  {
    key: "hour",
    question:
      "When should I start a conversation? I’ll send a new topic once a day at your local time. Use /pause to turn this off.",
    choices: [
      ["Morning · 09:00", 9],
      ["Afternoon · 13:00", 13],
      ["Evening · 19:00", 19],
      ["Only when I message you", null],
    ],
  },
];
export function onboardingReply(draft: BotDraft, prefix = ""): BotReply {
  const step = steps[draft.step];
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
    revision: randomBytes(6).toString("hex"),
    step: 0,
    settings: { timezone: "Europe/Kyiv", ...user.settings },
  };
  const db = await database();
  const reply = onboardingReply(
    draft,
    "Hi! I’m your English Coach. Let’s set up our conversations right here.\n\n",
  );
  await checkpoint(async (session) => {
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
    else if (text && ["nativeLanguage", "interests"].includes(step.key))
      value = text.trim();
    if (value === undefined)
      return onboardingReply(
        draft,
        "Choose an answer using a button below.\n\n",
      );
    if (step.key === "hour") next.hour = value as number | null;
    else {
      const candidate = {
        nativeLanguage: "Ukrainian",
        englishLevel: "unknown",
        goal: "Speak confidently",
        interests: "",
        dailyGoal: 10,
        timezone: "Europe/Kyiv",
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
