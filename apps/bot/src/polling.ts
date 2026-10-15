import { setTimeout as delay } from "node:timers/promises";
import { z, ZodError } from "zod";
import { telegramUpdate } from "./telegram";
import { database } from "@engbot/core/db";
import { TelegramDeliveryError } from "./api";

const updatesSchema = z.array(
  z.object({ update_id: z.number().int() }).passthrough(),
);

class TelegramError extends Error {
  constructor(
    public code: number,
    public retryAfter = 5,
  ) {
    super(`Telegram API error ${code}`);
  }
}

async function call(
  method: string,
  body: object,
  signal: AbortSignal,
): Promise<unknown> {
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]),
    },
  );
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new TelegramError(
      data.error_code || response.status,
      typeof data.parameters?.retry_after === "number"
        ? data.parameters.retry_after
        : 5,
    );
  }
  return data.result;
}

export async function pollTelegram(
  signal: AbortSignal,
  state: { ready: boolean },
) {
  const workerController = new AbortController();
  const worker = processInbox(
    AbortSignal.any([signal, workerController.signal]),
  );
  try {
    await pollUpdates(signal, state);
  } finally {
    workerController.abort();
    await worker;
  }
}

// Persist messages before acknowledgement so slow AI replies cannot delay checkout.
async function processInbox(signal: AbortSignal) {
  while (!signal.aborted) {
    try {
      const { telegramInbox } = await database();
      const pending = await telegramInbox.findOne(
        {},
        { sort: { updateId: 1 } },
      );
      if (pending) {
        try {
          await telegramUpdate(pending.body);
        } catch (error) {
          if (!(error instanceof ZodError)) throw error;
          console.error("Unsupported Telegram update skipped", {
            updateId: pending.updateId,
          });
        }
        await telegramInbox.deleteOne({ _id: pending._id });
        continue;
      }
    } catch {
      console.error("Telegram inbox processing failed; retrying");
      await delay(5000, undefined, { signal }).catch(() => {});
    }
    await delay(250, undefined, { signal }).catch(() => {});
  }
}

async function pollUpdates(signal: AbortSignal, state: { ready: boolean }) {
  let initialized = false;
  let offset: number | undefined;
  while (!signal.aborted) {
    try {
      if (!initialized) {
        await call("deleteWebhook", { drop_pending_updates: false }, signal);
        initialized = true;
        console.log("Telegram long polling started");
      }
      const updates = updatesSchema.parse(
        await call(
          "getUpdates",
          {
            offset,
            limit: 100,
            timeout: 30,
            allowed_updates: [
              "message",
              "callback_query",
              "pre_checkout_query",
            ],
          },
          signal,
        ),
      );
      state.ready = true;
      for (const update of updates) {
        if (signal.aborted) break;
        try {
          if ("pre_checkout_query" in update) {
            try {
              await telegramUpdate(update);
            } catch (error) {
              // An expired checkout is permanently rejected by Telegram.
              if (!(
                error instanceof TelegramDeliveryError && error.code === 400
              ))
                throw error;
            }
          } else {
            const { telegramInbox } = await database();
            await telegramInbox.updateOne(
              { _id: String(update.update_id) },
              { $setOnInsert: { updateId: update.update_id, body: update } },
              { upsert: true },
            );
          }
        } catch (error) {
          if (!(error instanceof ZodError)) throw error;
          console.error("Unsupported Telegram update skipped", {
            updateId: update.update_id,
          });
        }
        // Telegram confirms this update on the NEXT getUpdates call.
        offset = update.update_id + 1;
      }
    } catch (error) {
      state.ready = false;
      if (signal.aborted) break;
      if (error instanceof TelegramError && [401, 404].includes(error.code)) {
        throw new Error(
          "Telegram rejected the bot token. Check TELEGRAM_BOT_TOKEN.",
        );
      }
      if (error instanceof TelegramError && error.code === 409) {
        console.error(
          "Telegram polling conflict: stop other instances using this bot token and disable any webhook.",
        );
      } else {
        // Do not log raw fetch errors: they may contain the bot token in the URL.
        console.error("Telegram polling/processing failed; retrying", {
          code:
            error instanceof TelegramError
              ? error.code
              : "processing_or_network",
        });
      }
      await delay(
        Math.max(1, error instanceof TelegramError ? error.retryAfter : 5) *
          1000,
        undefined,
        { signal },
      ).catch(() => {});
    }
  }
  state.ready = false;
}
