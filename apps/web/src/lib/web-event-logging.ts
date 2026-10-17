import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { database } from "@engbot/core/db";
import { HttpError } from "@engbot/core/errors";
import { eventLoggingEnabled, logEvent } from "@engbot/core/events";
import type { User } from "@engbot/core/schema";
import { currentUser } from "./auth";

const schema = z.object({
  eventId: z.string().uuid(),
  event: z.enum([
    "web_app_open",
    "web_app_authenticated",
    "web_button_click",
    "web_onboarding_step",
  ]),
  visitorId: z.string().uuid(),
  visitId: z.string().uuid(),
  source: z.enum(["Browser", "Telegram Mini App"]),
  path: z.enum([
    "/",
    "/home",
    "/chat",
    "/mistakes",
    "/vocabulary",
    "/practice",
    "/progress",
    "/profile",
    "/uzerz",
  ]),
  occurredAt: z.iso
    .datetime()
    .refine(
      (value) => Math.abs(Date.now() - new Date(value).getTime()) <= 3600000,
    ),
  button: z.string().max(120).optional(),
  target: z.string().max(200).optional(),
  step: z.number().int().min(1).max(4).optional(),
});
const webSteps = ["nativeLanguage", "goal", "replyMode", "schedule"];

// LOGGING: only server-verified sessions can attach a Telegram user ID.
export async function saveWebEvent(body: unknown, request: Request) {
  if (!eventLoggingEnabled()) return;
  const input = schema.parse(body);
  // Also ignore opening events from older clients viewing the log page.
  if (input.event === "web_app_open" && input.path === "/uzerz") return;
  let user: User | undefined;
  try {
    user = await currentUser();
  } catch (error) {
    if (!(error instanceof HttpError) || error.status !== 401) throw error;
  }
  if (
    (input.event === "web_onboarding_step" ||
      input.event === "web_app_authenticated") &&
    !user
  )
    throw new HttpError(401, "Sign in to record this event.");
  if (input.event === "web_button_click" && !input.button)
    throw new HttpError(400, "A button label is required.");
  if (input.event === "web_onboarding_step" && !input.step)
    throw new HttpError(400, "An onboarding step is required.");
  const db = await database();
  const networkSource =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const key = createHash("sha256")
    .update(user?._id || networkSource)
    .digest("hex");
  const limit = await db.eventLimits.findOneAndUpdate(
    { _id: `${key}:${Math.floor(Date.now() / 60000)}` },
    {
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(Date.now() + 3600000) },
    },
    { upsert: true, returnDocument: "after", maxTimeMS: 5000 },
  );
  if ((limit?.count || 0) > 240)
    throw new HttpError(429, "Too many logging events.");
  const details: Record<string, string | number | boolean> = {
    occurredAt: input.occurredAt,
  };
  if (input.button) details.button = input.button;
  if (input.target) details.target = input.target;
  if (input.event === "web_onboarding_step" && input.step && user) {
    details.step = input.step;
    details.stepName = webSteps[input.step - 1];
    details.totalSteps = webSteps.length;
    const occurredAt = new Date(input.occurredAt);
    await db.users.updateOne(
      {
        _id: user._id,
        settings: null,
        $or: [
          { "onboardingProgress.web.updatedAt": { $lte: occurredAt } },
          { "onboardingProgress.web.updatedAt": { $exists: false } },
        ],
      },
      {
        $set: {
          "onboardingProgress.web.status": "in_progress",
          "onboardingProgress.web.step": input.step,
          "onboardingProgress.web.stepName": webSteps[input.step - 1],
          "onboardingProgress.web.totalSteps": webSteps.length,
          "onboardingProgress.web.updatedAt": occurredAt,
        },
        $max: { "onboardingProgress.web.maxStep": input.step },
      },
      { maxTimeMS: 5000 },
    );
  }
  await logEvent({
    _id: `web:${input.eventId}`,
    event: input.event,
    source: input.source,
    userId: user?._id,
    visitorId: input.visitorId,
    visitId: input.visitId,
    path: input.path,
    details,
  });
}
