import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { currentUser, telegramLogin } from "@/lib/auth";
import { database } from "@engbot/core/db";
import {
  analyze,
  identity,
  makeExercise,
  newReview,
  snapshot,
  submitAnswer,
} from "@engbot/core/learning";
import { settingsSchema } from "@engbot/core/schema";
import { HttpError } from "@engbot/core/errors";
export const runtime = "nodejs";
export const maxDuration = 60;
async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const path = (await context.params).path.join("/");
    if (request.method === "GET") {
      if (path === "config")
        return NextResponse.json({
          botUsername: process.env.TELEGRAM_BOT_USERNAME || null,
        });
      if (path === "me")
        return NextResponse.json(await snapshot(await currentUser()), {
          headers: { "Cache-Control": "no-store" },
        });
      throw new HttpError(404, "Страница не найдена.");
    }
    if (Number(request.headers.get("content-length") || 0) > 20000)
      throw new HttpError(413, "Сообщение слишком длинное.");
    const origin = request.headers.get("origin");
    const expected = process.env.APP_URL
      ? new URL(process.env.APP_URL).origin
      : request.nextUrl.origin;
    if (!origin || origin !== expected)
      throw new HttpError(403, "Недопустимый источник запроса.");
    const body = await request.json();
    if (path === "auth/telegram") {
      await telegramLogin(
        z.object({ initData: z.string().min(1).max(12000) }).parse(body)
          .initData,
      );
      return NextResponse.json({ ok: true });
    }
    const user = await currentUser();
    const db = await database();
    if (path === "profile") {
      const settings = settingsSchema.parse(body);
      await db.users.updateOne({ _id: user._id }, { $set: { settings } });
      return NextResponse.json({ ok: true });
    }
    if (path === "chat") {
      const data = z
        .object({
          text: z.string().trim().min(1).max(2000),
          requestId: z.string().uuid(),
        })
        .parse(body);
      return NextResponse.json(await analyze(user, data.text, data.requestId));
    }
    if (path === "practice") {
      const data = z
        .object({
          sourceType: z.enum(["mistake", "word"]),
          sourceId: z.string().max(100).optional(),
        })
        .parse(body);
      return NextResponse.json(
        await makeExercise(user, data.sourceType, data.sourceId),
      );
    }
    if (path === "practice/answer") {
      const data = z
        .object({
          id: z.string().uuid(),
          answer: z.string().trim().min(1).max(2000),
        })
        .parse(body);
      return NextResponse.json(await submitAnswer(user, data.id, data.answer));
    }
    if (path === "vocabulary") {
      const data = z
        .object({
          messageId: z.string().max(150),
          index: z.number().int().min(0).max(2),
        })
        .parse(body);
      const message = await db.messages.findOne({
        _id: data.messageId,
        userId: user._id,
      });
      const word = message?.analysis.words[data.index];
      if (!word) throw new HttpError(404, "Слово не найдено в разговоре.");
      await db.words.updateOne(
        { _id: identity(user._id, word.word) },
        {
          $setOnInsert: {
            ...word,
            ...newReview(),
            userId: user._id,
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(404, "Действие не найдено.");
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: "Проверьте заполненные поля.",
          issues: error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json(
        { error: "Некорректный запрос." },
        { status: 400 },
      );
    if (error instanceof HttpError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error(
      "Request failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      { error: "Не удалось выполнить запрос. Попробуйте ещё раз." },
      { status: 500 },
    );
  }
}
export { handle as GET, handle as POST };
