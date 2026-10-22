import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";
import { database } from "./db";
import { HttpError } from "./errors";
import type { BotReply, User } from "./schema";
import {
  POINT_PACKS,
  PRICES,
  WELCOME_POINTS,
  DAILY_AI_LIMIT,
  MAX_SPEECH_POINTS,
  formatPoints,
  pointsToUnits,
} from "./pricing";
import { usageContext } from "./usage";

export const DAY = 86400000;
export function hasPremium(user: User, now = new Date()) {
  return !!user.premiumUntil && user.premiumUntil > now;
}
export function wantsVoice(user: User) {
  return (
    (user.settings?.replyMode ?? "voice") === "voice" &&
    (hasPremium(user) || user.settings?.voicePricingVersion === 1)
  );
}
export function pointsOptionsReply(
  prefix = "Top up your learning balance.",
): BotReply {
  return {
    text: `${prefix}\n\nText reply or new topic: ${PRICES.text} credits. Exercise with one answer check: ${PRICES.exercise} credits.\nYour voice: +${PRICES.transcription} credits/min. Bot voice: +${PRICES.speech} credits/min (up to ${MAX_SPEECH_POINTS} credits per reply). Audio is billed per started second.\n\n1 Star = 10 credits. Credits do not expire. Up to ${DAILY_AI_LIMIT} AI requests per day. No subscription or automatic renewal. Use /text to spend less, /voice for spoken replies, or /balance to check your balance.`,
    reply_markup: {
      inline_keyboard: POINT_PACKS.map((pack) => [
        {
          text: `${pack.points.toLocaleString("en-US")} credits · ${pack.stars} ⭐`,
          callback_data: `points:buy:${pack.stars}`,
        },
      ]),
    },
  };
}
export class AccessError extends HttpError {
  constructor(
    public readonly requiredUnits: number,
    public readonly availableUnits: number,
  ) {
    super(
      402,
      `This action needs ${formatPoints(requiredUnits)} credits; your available balance is ${formatPoints(availableUnits)}. Open the Telegram bot and send /balance to top up. Text replies cost ${PRICES.text} credits.`,
    );
  }
}

// Lazy migration is safe for existing users and repeated/concurrent authentication.
export async function ensureWallet(userId: string): Promise<User> {
  const db = await database();
  let user = await db.users.findOne({ _id: userId });
  if (!user) throw new HttpError(404, "User not found.");
  if (user.walletVersion !== 1) {
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        const updated = await db.users.updateOne(
          { _id: userId, walletVersion: { $ne: 1 } },
          {
            $set: { walletVersion: 1 },
            $inc: { balanceUnits: pointsToUnits(WELCOME_POINTS) },
          },
          { session },
        );
        if (!updated.modifiedCount) return;
        const now = new Date();
        await db.walletOperations.insertOne(
          {
            _id: `${userId}:welcome:v1`,
            userId,
            kind: "welcome",
            status: "settled",
            amountUnits: 0,
            deltaUnits: pointsToUnits(WELCOME_POINTS),
            createdAt: now,
            updatedAt: now,
          },
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
  }
  // Recover holds left by a crashed worker. Completion verifies the same owner,
  // so a late worker cannot settle a released reservation.
  const expired = await db.walletOperations
    .find({ userId, status: "reserved", leaseUntil: { $lte: new Date() } })
    .limit(20)
    .toArray();
  for (const operation of expired) {
    await cancelOperation({
      id: operation._id,
      owner: operation.owner!,
      amountUnits: operation.amountUnits,
      userId,
    });
  }
  user = await db.users.findOne({ _id: userId });
  return user!;
}

export type Reservation = {
  id: string;
  userId: string;
  owner: string;
  amountUnits: number;
};
export async function reserveOperation(
  userId: string,
  requestId: string,
  kind: string,
  units: number,
): Promise<
  | { cached: true; result: unknown }
  | { cached: false; reservation: Reservation }
> {
  if (!Number.isSafeInteger(units) || units < 0)
    throw new Error("Invalid credits amount");
  await ensureWallet(userId);
  const db = await database();
  const session = db.client.startSession();
  const id = `${userId}:${requestId}`;
  const owner = randomUUID();
  try {
    return (await session.withTransaction(async () => {
      const existing = await db.walletOperations.findOne(
        { _id: id },
        { session },
      );
      if (existing?.kind && existing.kind !== kind)
        throw new HttpError(409, "Request ID already used.");
      if (existing?.status === "settled")
        return { cached: true as const, result: existing.result };
      if (existing?.status === "reserved")
        throw new HttpError(
          409,
          "This request is still processing. Please retry shortly.",
        );
      const user = await db.users.findOne({ _id: userId }, { session });
      if (!user) throw new HttpError(404, "User not found.");
      const amountUnits = hasPremium(user) ? 0 : units;
      if (amountUnits > 0) {
        const debit = await db.users.updateOne(
          { _id: userId, balanceUnits: { $gte: amountUnits } },
          { $inc: { balanceUnits: -amountUnits } },
          { session },
        );
        if (!debit.modifiedCount)
          throw new AccessError(amountUnits, user.balanceUnits || 0);
      } else if ((user.balanceUnits || 0) < 0 && !hasPremium(user)) {
        throw new AccessError(0, user.balanceUnits || 0);
      }
      const now = new Date();
      await db.walletOperations.updateOne(
        { _id: id },
        {
          $set: {
            userId,
            kind,
            status: "reserved",
            amountUnits,
            deltaUnits: -amountUnits,
            owner,
            leaseUntil: new Date(Date.now() + 5 * 60000),
            updatedAt: now,
          },
          $setOnInsert: { createdAt: now },
          $unset: { result: "" },
        },
        { upsert: true, session },
      );
      return {
        cached: false as const,
        reservation: { id, userId, owner, amountUnits },
      };
    }))!;
  } finally {
    await session.endSession();
  }
}

export async function settleOperation<T>(
  reservation: Reservation,
  result: T,
  actualUnits = reservation.amountUnits,
  persist?: (session: ClientSession) => Promise<void>,
) {
  const db = await database();
  // Grandfathered access always costs zero, including audio settlement.
  const charged = reservation.amountUnits === 0 ? 0 : actualUnits;
  if (
    !Number.isSafeInteger(charged) ||
    charged < 0 ||
    charged > reservation.amountUnits
  )
    throw new Error("Charge exceeds reservation");
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const operation = await db.walletOperations.findOne(
        { _id: reservation.id },
        { session },
      );
      if (
        operation?.status === "settled" &&
        operation.owner === reservation.owner
      )
        return;
      if (
        operation?.status !== "reserved" ||
        operation.owner !== reservation.owner
      )
        throw new HttpError(
          409,
          "The request expired. Please try again; its credits were released.",
        );
      if (persist) await persist(session);
      const refund = reservation.amountUnits - charged;
      if (refund)
        await db.users.updateOne(
          { _id: reservation.userId },
          { $inc: { balanceUnits: refund } },
          { session },
        );
      await db.walletOperations.updateOne(
        { _id: reservation.id },
        {
          $set: {
            status: "settled",
            amountUnits: charged,
            deltaUnits: -charged,
            result,
            updatedAt: new Date(),
          },
          $unset: { leaseUntil: "" },
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}

export async function cancelOperation(reservation: Reservation) {
  const db = await database();
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const operation = await db.walletOperations.findOne(
        { _id: reservation.id, owner: reservation.owner, status: "reserved" },
        { session },
      );
      if (!operation) return;
      await db.users.updateOne(
        { _id: reservation.userId },
        { $inc: { balanceUnits: operation.amountUnits } },
        { session },
      );
      await db.walletOperations.updateOne(
        { _id: reservation.id },
        {
          $set: { status: "released", deltaUnits: 0, updatedAt: new Date() },
          $unset: { leaseUntil: "" },
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}

export async function paidOperation<T>(
  userId: string,
  requestId: string,
  kind: string,
  units: number,
  work: () => Promise<T>,
  persist?: (result: T, session: ClientSession) => Promise<void>,
): Promise<T> {
  const operation = await reserveOperation(userId, requestId, kind, units);
  if (operation.cached) return operation.result as T;
  const { reservation } = operation;
  try {
    const result = await usageContext.run(
      { userId, operationId: reservation.id },
      work,
    );
    await settleOperation(
      reservation,
      result,
      reservation.amountUnits,
      persist ? (session) => persist(result, session) : undefined,
    );
    return result;
  } catch (error) {
    await cancelOperation(reservation);
    throw error;
  }
}

export async function walletSummary(userId: string) {
  const user = await ensureWallet(userId);
  const db = await database();
  const operations = await db.walletOperations
    .find({ userId, status: "settled", kind: { $ne: "exercise_request" } })
    .sort({ createdAt: -1 })
    .limit(20)
    .toArray();
  return {
    balanceUnits: user.balanceUnits || 0,
    legacyPremiumUntil: hasPremium(user)
      ? user.premiumUntil!.toISOString()
      : null,
    transactions: operations.map((op) => ({
      id: op._id,
      kind: op.kind,
      deltaUnits: op.deltaUnits,
      createdAt: op.createdAt.toISOString(),
    })),
  };
}
