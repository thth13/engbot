import { randomUUID } from "node:crypto";
import { database } from "@engbot/core/db";
import { DAY, ensureWallet } from "@engbot/core/billing";
import {
  POINT_PACKS,
  PRICES,
  DAILY_AI_LIMIT,
  pointsToUnits,
  formatPoints,
} from "@engbot/core/pricing";
import { HttpError } from "@engbot/core/errors";
import { telegramCall } from "./api";

export interface Payment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
}
function paymentPack(
  userId: string,
  payment: Omit<Payment, "telegram_payment_charge_id">,
) {
  const [kind, stars, version, owner, nonce, ...extra] =
    payment.invoice_payload.split(":");
  if (
    kind !== "points" ||
    version !== "v1" ||
    owner !== userId ||
    extra.length ||
    !/^[0-9a-f-]{36}$/.test(nonce || "") ||
    payment.currency !== "XTR"
  )
    return undefined;
  return POINT_PACKS.find(
    (pack) =>
      String(pack.stars) === stars && pack.stars === payment.total_amount,
  );
}
// Only honor already-paid old invoices; no new time-based purchases are approved.
function legacyPlan(
  userId: string,
  payment: Omit<Payment, "telegram_payment_charge_id">,
) {
  return [
    { days: 7, stars: 60 },
    { days: 30, stars: 250 },
  ].find(
    (plan) =>
      payment.currency === "XTR" &&
      payment.total_amount === plan.stars &&
      payment.invoice_payload === `premium:${plan.days}:v1:${userId}`,
  );
}
export function validPayment(
  userId: string,
  payment: Omit<Payment, "telegram_payment_charge_id">,
) {
  return !!paymentPack(userId, payment);
}
export async function sendPointsInvoice(
  userId: string,
  chatId: number,
  stars: number,
) {
  const pack = POINT_PACKS.find((pack) => pack.stars === stars);
  if (!pack)
    throw new HttpError(
      400,
      "Unknown credits pack. Send /balance to choose one.",
    );
  await telegramCall("sendInvoice", {
    chat_id: chatId,
    title: `${pack.points.toLocaleString("en-US")} learning credits`,
    description: `One-time top-up. Credits do not expire. Text: ${PRICES.text} credits. Your voice: +${PRICES.transcription}/min; bot voice: +${PRICES.speech}/min, billed per second. Up to ${DAILY_AI_LIMIT} AI requests/day. No renewal.`,
    payload: `points:${pack.stars}:v1:${userId}:${randomUUID()}`,
    provider_token: "",
    currency: "XTR",
    prices: [{ label: `${pack.points} credits`, amount: pack.stars }],
    start_parameter: "balance",
  });
}
export async function acceptPayment(userId: string, payment: Payment) {
  const pack = paymentPack(userId, payment);
  const legacy = legacyPlan(userId, payment);
  if (!pack && !legacy)
    throw new HttpError(
      400,
      "The payment details do not match this purchase. Please use /paysupport.",
    );
  await ensureWallet(userId);
  const db = await database();
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const existing = await db.payments.findOne(
        { _id: payment.telegram_payment_charge_id },
        { session },
      );
      if (existing) {
        if (
          existing.userId !== userId ||
          existing.amount !== payment.total_amount ||
          existing.currency !== payment.currency ||
          (existing.invoicePayload &&
            existing.invoicePayload !== payment.invoice_payload)
        )
          throw new HttpError(400, "Payment details mismatch.");
        return;
      }
      const user = await db.users.findOne({ _id: userId }, { session });
      if (!user) throw new HttpError(404, "User not found.");
      const now = new Date();
      const premiumUntil = legacy
        ? new Date(
            Math.max(now.getTime(), user.premiumUntil?.getTime() || 0) +
              legacy.days * DAY,
          )
        : undefined;
      await db.payments.insertOne(
        {
          _id: payment.telegram_payment_charge_id,
          userId,
          amount: payment.total_amount,
          currency: payment.currency,
          createdAt: now,
          invoicePayload: payment.invoice_payload,
          ...(pack ? { points: pack.points } : { premiumUntil }),
        },
        { session },
      );
      if (pack) {
        const units = pointsToUnits(pack.points);
        await db.users.updateOne(
          { _id: userId },
          { $inc: { balanceUnits: units } },
          { session },
        );
        await db.walletOperations.insertOne(
          {
            _id: `${userId}:payment:${payment.telegram_payment_charge_id}`,
            userId,
            kind: "top_up",
            status: "settled",
            amountUnits: 0,
            deltaUnits: units,
            createdAt: now,
            updatedAt: now,
          },
          { session },
        );
      } else {
        await db.users.updateOne(
          { _id: userId },
          { $set: { premiumUntil } },
          { session },
        );
      }
    });
  } finally {
    await session.endSession();
  }
  const user = (await db.users.findOne({ _id: userId }))!;
  const recorded = await db.payments.findOne({
    _id: payment.telegram_payment_charge_id,
  });
  if (recorded?.refundedAt)
    return {
      text: "This payment has already been refunded. Send /balance to check your current credits.",
    };
  return {
    text: pack
      ? `Payment received! ${pack.points.toLocaleString("en-US")} credits added. Available balance: ${formatPoints(user.balanceUnits || 0)} credits.\n\nText reply: ${PRICES.text} credits. Send /text to use text replies, /voice for spoken replies, or /balance for prices and top-ups.`
      : `Your previously purchased access is active until ${user.premiumUntil!.toISOString().slice(0, 10)} (UTC). New purchases now add credits; send /balance for details.`,
  };
}
export async function acceptRefund(userId: string, payment: Payment) {
  const db = await database();
  const session = db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const existing = await db.payments.findOne(
        { _id: payment.telegram_payment_charge_id },
        { session },
      );
      if (
        !existing ||
        existing.userId !== userId ||
        existing.currency !== payment.currency ||
        existing.amount !== payment.total_amount
      )
        throw new HttpError(
          409,
          "Could not match this refund. Please use /paysupport.",
        );
      if (existing.refundedAt) return;
      const now = new Date();
      if (existing.points) {
        const units = pointsToUnits(existing.points);
        // A spent/refunded pack can create debt; later top-ups first cover it.
        await db.users.updateOne(
          { _id: userId },
          { $inc: { balanceUnits: -units } },
          { session },
        );
        await db.walletOperations.insertOne(
          {
            _id: `${userId}:refund:${payment.telegram_payment_charge_id}`,
            userId,
            kind: "payment_refund",
            status: "settled",
            amountUnits: 0,
            deltaUnits: -units,
            createdAt: now,
            updatedAt: now,
          },
          { session },
        );
      } else {
        const legacy = legacyPlan(userId, payment);
        const user = await db.users.findOne({ _id: userId }, { session });
        if (legacy && user?.premiumUntil)
          await db.users.updateOne(
            { _id: userId },
            {
              $set: {
                premiumUntil: new Date(
                  Math.max(
                    now.getTime(),
                    user.premiumUntil.getTime() - legacy.days * DAY,
                  ),
                ),
              },
            },
            { session },
          );
      }
      await db.payments.updateOne(
        { _id: existing._id },
        { $set: { refundedAt: now } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  return {
    text: "Your Stars payment was refunded and the purchased credits or access were removed. Send /balance to check your balance or /paysupport for help.",
  };
}
