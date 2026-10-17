import { database } from "./db";
import { HttpError } from "./errors";
import type { BotReply, User } from "./schema";

export const DAY = 86400000;
export const TRIAL_DAYS = 3;
export const TRIAL_MESSAGES = 10;
export const PREMIUM_DAYS = 30;
// Approximate retail equivalent of $4.99; Telegram's retail prices vary.
export const PREMIUM_STARS = 250;
export const PREMIUM_PLANS = [
  { days: 7, stars: 60 },
  { days: PREMIUM_DAYS, stars: PREMIUM_STARS },
] as const;
export type PremiumDays = (typeof PREMIUM_PLANS)[number]["days"];
export const PREMIUM_PRICING = PREMIUM_PLANS.map(
  (plan) => `${plan.stars} Stars for ${plan.days} days`,
).join(" or ");

export function premiumOptionsReply(
  text = `Choose your Premium access: ${PREMIUM_PRICING}. This is a one-time payment, with no automatic renewal. If Premium is already active, your purchase extends your current access.`,
): BotReply {
  return {
    text,
    reply_markup: {
      inline_keyboard: PREMIUM_PLANS.map((plan) => [
        {
          text: `Get Premium · ${plan.stars} ⭐ / ${plan.days} days`,
          callback_data: `premium:buy:${plan.days}`,
        },
      ]),
    },
  };
}

export function hasPremium(user: User, now = new Date()) {
  return !!user.premiumUntil && user.premiumUntil > now;
}

export function trialEnded(user: User, now = new Date()) {
  return user.createdAt.getTime() + TRIAL_DAYS * DAY <= now.getTime();
}

export function premiumReply(limitReached = false): BotReply {
  return premiumOptionsReply(
    (limitReached
      ? `You’ve used your ${TRIAL_MESSAGES} trial messages for today. The limit resets at midnight in your profile’s time zone. Come back tomorrow while your trial is active, or get Premium: ${PREMIUM_PRICING}.`
      : `Your free trial or Premium access has ended. To keep chatting, get Premium: ${PREMIUM_PRICING}.`) +
      " This is a one-time payment, with no automatic renewal.",
  );
}

export class AccessError extends HttpError {
  constructor(public readonly limitReached = false) {
    super(
      limitReached ? 429 : 402,
      `${premiumReply(limitReached).text} Open the Telegram bot and send /premium to pay.`,
    );
  }
}

export async function requireAccess(userId: string) {
  const { users } = await database();
  const user = await users.findOne({ _id: userId });
  if (!user) throw new HttpError(404, "User not found.");
  if (!hasPremium(user) && trialEnded(user)) throw new AccessError();
  return user;
}

// A shared, atomic quota for bot and Mini App messages. Retries use the same slot.
export async function reserveTrialMessage(userId: string, requestId: string) {
  const user = await requireAccess(userId);
  if (hasPremium(user)) return;
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: user.settings?.timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const key = `${userId}:${day}`;
  const db = await database();
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const usage = await db.trialUsage.findOne({ _id: key }, { session });
      if (usage?.requests.includes(requestId)) return;
      if ((usage?.requests.length || 0) >= TRIAL_MESSAGES)
        throw new AccessError(true);
      await db.trialUsage.updateOne(
        { _id: key },
        {
          $addToSet: { requests: requestId },
          $currentDate: { lastMessageAt: true },
        },
        { upsert: true, session },
      );
    });
  } finally {
    await session.endSession();
  }
}
