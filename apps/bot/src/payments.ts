import { database } from "@engbot/core/db";
import { DAY, PREMIUM_DAYS, PREMIUM_STARS } from "@engbot/core/billing";
import { HttpError } from "@engbot/core/errors";
import { telegramCall } from "./api";

export interface Payment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
}

const payload = (userId: string) => `premium:30:v1:${userId}`;

export function validPayment(
  userId: string,
  payment: Omit<Payment, "telegram_payment_charge_id">,
) {
  return (
    payment.currency === "XTR" &&
    payment.total_amount === PREMIUM_STARS &&
    payment.invoice_payload === payload(userId)
  );
}

export async function sendPremiumInvoice(userId: string, chatId: number) {
  await telegramCall("sendInvoice", {
    chat_id: chatId,
    title: "EngBot Premium · 30 days",
    description:
      "30 days of English conversations and practice. One-time payment; no automatic renewal. Up to 100 AI requests per day.",
    payload: payload(userId),
    provider_token: "",
    currency: "XTR",
    prices: [{ label: "Premium · 30 days", amount: PREMIUM_STARS }],
    start_parameter: "premium",
  });
}

export async function acceptPayment(userId: string, payment: Payment) {
  if (!validPayment(userId, payment))
    throw new HttpError(
      400,
      "The payment details do not match this purchase. Please use /paysupport.",
    );
  const db = await database();
  const session = db.client.startSession();
  let until: Date | undefined;
  try {
    await session.withTransaction(async () => {
      const existing = await db.payments.findOne(
        { _id: payment.telegram_payment_charge_id },
        { session },
      );
      if (existing) {
        if (existing.userId !== userId)
          throw new HttpError(400, "Payment owner mismatch.");
        until = existing.premiumUntil;
        return;
      }
      const user = await db.users.findOne({ _id: userId }, { session });
      if (!user) throw new HttpError(404, "User not found.");
      const now = new Date();
      until = new Date(
        Math.max(now.getTime(), user.premiumUntil?.getTime() || 0) +
          PREMIUM_DAYS * DAY,
      );
      await db.payments.insertOne(
        {
          _id: payment.telegram_payment_charge_id,
          userId,
          amount: payment.total_amount,
          currency: payment.currency,
          createdAt: now,
          premiumUntil: until,
        },
        { session },
      );
      await db.users.updateOne(
        { _id: userId },
        { $set: { premiumUntil: until } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
  return {
    text: `Payment received! Premium is active until ${until!.toISOString().slice(0, 10)} (UTC). Send a message or /topic to continue.`,
  };
}
