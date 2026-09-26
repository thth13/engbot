import { randomBytes } from "node:crypto";
import { database } from "@engbot/core/db";
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
    question: "Якою мовою пояснювати помилки? Можна написати свою мову.",
    choices: [
      ["Українська", "Ukrainian"],
      ["Російська", "Russian"],
      ["Англійська", "English"],
    ],
  },
  {
    key: "englishLevel",
    question: "Який у тебе рівень англійської?",
    choices: [
      ["A1 · Починаю", "A1"],
      ["A2 · Знаю основи", "A2"],
      ["B1 · Можу спілкуватися", "B1"],
      ["B2 · Говорю впевнено", "B2"],
      ["C1 · Просунутий", "C1"],
      ["Не знаю", "unknown"],
    ],
  },
  {
    key: "goal",
    question: "Для чого тобі англійська?",
    choices: [
      ["Вільно спілкуватися", "Speak confidently"],
      ["Подорожувати", "Travel"],
      ["Для роботи", "Work"],
      ["Пройти співбесіду", "Job interviews"],
      ["Переїхати", "Move abroad"],
      ["Дивитися й читати", "Understand content"],
      ["Покращити граматику", "Improve grammar"],
      ["Розширити словник", "Expand vocabulary"],
    ],
  },
  {
    key: "dailyGoal",
    question: "Скільки хвилин на день хочеш приділяти практиці?",
    choices: [
      ["5 хвилин", 5],
      ["10 хвилин", 10],
      ["15 хвилин", 15],
      ["30 хвилин", 30],
    ],
  },
  {
    key: "interests",
    question:
      "Про що тобі цікаво говорити? Вибери тему або напиши кілька своїх через кому.",
    choices: [
      ["Кіно й серіали", "Movies and TV shows"],
      ["Технології та ігри", "Technology and games"],
      ["Подорожі та їжа", "Travel and food"],
      ["Музика й мистецтво", "Music and art"],
      ["Спорт і здоров’я", "Sports and wellbeing"],
      [
        "Здивуй мене",
        "Everyday life, imaginative dilemmas and surprising ideas",
      ],
    ],
  },
  {
    key: "timezone",
    question:
      "Вибери часовий пояс для розмов. Можна написати свій, наприклад Europe/Kyiv.",
    choices: [
      ["Київ", "Europe/Kyiv"],
      ["Варшава / Берлін", "Europe/Warsaw"],
      ["Лондон", "Europe/London"],
      ["Москва / Мінськ", "Europe/Moscow"],
      ["UTC", "UTC"],
    ],
  },
  {
    key: "hour",
    question:
      "Коли мені починати розмову? Надсилатиму нову тему раз на день за твоїм місцевим часом. Вимкнути можна командою /pause.",
    choices: [
      ["Вранці · 09:00", 9],
      ["Удень · 13:00", 13],
      ["Увечері · 19:00", 19],
      ["Лише коли напишу", null],
    ],
  },
];
export function onboardingReply(draft: BotDraft, prefix = ""): BotReply {
  const step = steps[draft.step];
  const rows = step.choices.map(([text], index) => [
    { text, callback_data: `ob:${draft.revision}:${index}` },
  ]);
  if (draft.step > 0)
    rows.push([
      { text: "← Назад", callback_data: `ob:${draft.revision}:back` },
    ]);
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
    settings: user.settings || {},
  };
  const db = await database();
  const reply = onboardingReply(
    draft,
    "Привіт! Я твій English Coach. Налаштуймо наші розмови просто тут.\n\n",
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
      text: "Ці кнопки вже неактивні. /settings — налаштувати профіль, /topic — нова тема.",
    };
  const [, revision, action] = (data || "").split(":");
  if (data && (revision !== draft.revision || !data.startsWith("ob:")))
    return onboardingReply(draft, "Це попередній крок. Продовжимо тут:\n\n");
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
    else if (
      text &&
      ["nativeLanguage", "interests", "timezone"].includes(step.key)
    )
      value = text.trim();
    if (value === undefined)
      return onboardingReply(draft, "Вибери відповідь кнопкою нижче.\n\n");
    if (step.key === "hour") next.hour = value as number | null;
    else {
      const candidate = {
        nativeLanguage: "Ukrainian",
        englishLevel: "unknown",
        goal: "Speak confidently",
        interests: "",
        dailyGoal: 10,
        timezone: "UTC",
        ...next.settings,
        [step.key]: value,
      };
      const parsed = settingsSchema.safeParse(candidate);
      if (!parsed.success)
        return onboardingReply(
          draft,
          "Не вдалося зберегти відповідь. Перевір довжину тексту або назву часового поясу.\n\n",
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
    if (changed.modifiedCount) return null;
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
    : { text: "Налаштування вже збережено. /topic — почати розмову." };
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
