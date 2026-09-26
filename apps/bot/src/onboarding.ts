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
    question: "На каком языке объяснять ошибки? Можно написать свой язык.",
    choices: [
      ["Русский", "Russian"],
      ["Українська", "Ukrainian"],
      ["English", "English"],
    ],
  },
  {
    key: "englishLevel",
    question: "Какой у тебя уровень английского?",
    choices: [
      ["A1 · Начинаю", "A1"],
      ["A2 · Знаю основы", "A2"],
      ["B1 · Могу общаться", "B1"],
      ["B2 · Говорю уверенно", "B2"],
      ["C1 · Продвинутый", "C1"],
      ["Не знаю", "unknown"],
    ],
  },
  {
    key: "goal",
    question: "Для чего тебе английский?",
    choices: [
      ["Свободно общаться", "Speak confidently"],
      ["Путешествовать", "Travel"],
      ["Для работы", "Work"],
      ["Пройти собеседование", "Job interviews"],
      ["Переехать", "Move abroad"],
      ["Смотреть и читать", "Understand content"],
      ["Подтянуть грамматику", "Improve grammar"],
      ["Расширить словарь", "Expand vocabulary"],
    ],
  },
  {
    key: "dailyGoal",
    question: "Сколько минут в день хочешь уделять практике?",
    choices: [
      ["5 минут", 5],
      ["10 минут", 10],
      ["15 минут", 15],
      ["30 минут", 30],
    ],
  },
  {
    key: "interests",
    question:
      "О чём тебе интересно говорить? Выбери тему или напиши несколько своих через запятую.",
    choices: [
      ["Кино и сериалы", "Movies and TV shows"],
      ["Технологии и игры", "Technology and games"],
      ["Путешествия и еда", "Travel and food"],
      ["Музыка и искусство", "Music and art"],
      ["Спорт и здоровье", "Sports and wellbeing"],
      [
        "Удиви меня",
        "Everyday life, imaginative dilemmas and surprising ideas",
      ],
    ],
  },
  {
    key: "timezone",
    question:
      "Выбери часовой пояс для разговоров. Можно написать свой, например Asia/Tbilisi.",
    choices: [
      ["Киев", "Europe/Kyiv"],
      ["Варшава / Берлин", "Europe/Warsaw"],
      ["Лондон", "Europe/London"],
      ["Москва / Минск", "Europe/Moscow"],
      ["UTC", "UTC"],
    ],
  },
  {
    key: "hour",
    question:
      "Когда мне начинать разговор? Буду присылать новую тему раз в день по твоему времени. Отключить можно командой /pause.",
    choices: [
      ["Утром · 09:00", 9],
      ["Днём · 13:00", 13],
      ["Вечером · 19:00", 19],
      ["Только когда напишу сам", null],
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
    "Привет! Я твой English Coach. Давай настроим наши разговоры прямо здесь.\n\n",
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
      text: "Эти кнопки уже неактивны. /settings — настроить профиль, /topic — новая тема.",
    };
  const [, revision, action] = (data || "").split(":");
  if (data && (revision !== draft.revision || !data.startsWith("ob:")))
    return onboardingReply(draft, "Это предыдущий шаг. Продолжим здесь:\n\n");
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
      return onboardingReply(draft, "Выбери ответ кнопкой ниже.\n\n");
    if (step.key === "hour") next.hour = value as number | null;
    else {
      const candidate = {
        nativeLanguage: "Russian",
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
          "Не получилось сохранить ответ. Проверь длину текста или название часового пояса.\n\n",
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
    : { text: "Настройки уже сохранены. /topic — начать разговор." };
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
