import { after, NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { currentUser, telegramLogin } from "@/lib/auth";
import { TELEGRAM_BOT_USERNAME } from "@/lib/telegram-bot";
import { database } from "@engbot/core/db";
import {
  analyze,
  identity,
  makeExercise,
  newReview,
  snapshot,
  submitAnswer,
} from "@engbot/core/learning";
import { settingsSchema, botScheduleSchema } from "@engbot/core/schema";
import { HttpError } from "@engbot/core/errors";
import { readAdminData } from "@/lib/uzerz";
import { eventLoggingEnabled, logEvent } from "@engbot/core/events";
import { saveWebEvent } from "@/lib/web-event-logging";
import { notifyAdmins } from "@engbot/core/notifications";
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
          botUsername: TELEGRAM_BOT_USERNAME,
        });
      if (path === "me")
        return NextResponse.json(await snapshot(await currentUser()), {
          headers: { "Cache-Control": "no-store" },
        });
      throw new HttpError(404, "Page not found.");
    }
    if (Number(request.headers.get("content-length") || 0) > 20000)
      throw new HttpError(413, "Message is too long.");
    const origin = request.headers.get("origin");
    const expected = process.env.APP_URL
      ? new URL(process.env.APP_URL).origin
      : request.nextUrl.origin;
    if (!origin || origin !== expected)
      throw new HttpError(403, "Request origin is not allowed.");
    const body = await request.json();
    if (path === "telemetry") {
      await saveWebEvent(body, request);
      return NextResponse.json(
        { ok: true },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (path === "events") {
      const event = z
        .object({
          event: z.enum([
            "landing_visit",
            "landing_bottom",
            "profile_visit",
            "telegram_click",
          ]),
          visitId: z.string().uuid(),
          visitorId: z.string().uuid().optional(),
          source: z.enum(["Browser", "Telegram Mini App"]).default("Browser"),
          path: z.enum(["/", "/home", "/profile"]),
        })
        .parse(body);
      if (event.event !== "profile_visit" && event.path === "/profile")
        throw new HttpError(400, "Invalid event page.");
      if (
        !process.env.ADMIN_NOTIFICATION_BOT_TOKEN ||
        !process.env.ADMIN_TELEGRAM_IDS
      )
        return NextResponse.json({ ok: true });
      const user =
        event.event === "profile_visit" ? await currentUser() : undefined;
      const db = await database();
      // Bound anonymous notifications without storing visitor IP addresses.
      const forwardedIp = request.headers
        .get("x-forwarded-for")
        ?.split(",")[0]
        ?.trim();
      const realIp = request.headers.get("x-real-ip")?.trim();
      const ip =
        forwardedIp && isIP(forwardedIp)
          ? forwardedIp
          : realIp && isIP(realIp)
            ? realIp
            : undefined;
      const source = user?._id || ip || "unknown";
      const bucket = Math.floor(Date.now() / 60000);
      const key = createHash("sha256").update(source).digest("hex");
      const limit = await db.notificationLimits.findOneAndUpdate(
        { _id: `${key}:${bucket}` },
        {
          $inc: { count: 1 },
          $setOnInsert: { expiresAt: new Date(Date.now() + 3600000) },
        },
        { upsert: true, returnDocument: "after" },
      );
      if ((limit?.count || 0) > 30)
        throw new HttpError(429, "Too many events. Please try again later.");
      const events = {
        landing_visit: "🏠 Opened the landing page",
        landing_bottom: "📜 Scrolled to the bottom of the page",
        telegram_click: "👆 Clicked “Start in Telegram”",
        profile_visit:
          event.path === "/profile"
            ? "👤 Opened the user profile"
            : "🎓 Opened the dashboard",
      };
      after(() =>
        notifyAdmins({
          id: `web:${event.visitId}:${event.event}`,
          event: events[event.event],
          source: event.source,
          page: event.path,
          visitorId: event.visitorId || event.visitId,
          ip: ip || "Unknown",
          user,
        }),
      );
      return NextResponse.json({ ok: true });
    }
    if (path === "auth/telegram") {
      await telegramLogin(
        z.object({ initData: z.string().min(1).max(12000) }).parse(body)
          .initData,
      );
      return NextResponse.json({ ok: true });
    }
    if (path === "uzerz")
      return NextResponse.json(await readAdminData(body), {
        headers: { "Cache-Control": "private, no-store" },
      });
    const user = await currentUser();
    const db = await database();
    if (path === "profile") {
      const settings = {
        ...settingsSchema.parse(body),
        timezone: "Asia/Kolkata",
      };
      const schedule = z
        .object({ botSchedule: botScheduleSchema.optional() })
        .parse(body).botSchedule;
      const firstOnboarding = !user.settings;
      // LOGGING: completion is recorded only after the server validates and saves settings.
      const result = await db.users.updateOne(
        firstOnboarding ? { _id: user._id, settings: null } : { _id: user._id },
        {
          $set: {
            settings,
            ...(schedule
              ? {
                  "bot.enabled": schedule.hour !== null,
                  "bot.hour": schedule.hour ?? 19,
                }
              : {}),
            ...(firstOnboarding && eventLoggingEnabled()
              ? {
                  "onboardingProgress.web": {
                    status: "completed" as const,
                    step: 4,
                    stepName: "completed",
                    maxStep: 4,
                    totalSteps: 4,
                    updatedAt: new Date(),
                    completedAt: new Date(),
                  },
                }
              : {}),
          },
        },
      );
      if (firstOnboarding && result.modifiedCount)
        await logEvent({
          _id: `web:onboarding:${user._id}:completed`,
          event: "web_onboarding_completed",
          source: "Web App",
          userId: user._id,
          details: { initial: true, totalSteps: 4 },
        });
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
      if (!word)
        throw new HttpError(404, "Word not found in the conversation.");
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
    throw new HttpError(404, "Action not found.");
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: "Check the form fields.",
          issues: error.issues.map((i) => ({
            field: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "Invalid request." }, { status: 400 });
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
      { error: "Could not complete the request. Please try again." },
      { status: 500 },
    );
  }
}
export { handle as GET, handle as POST };
