import { setTimeout as delay } from "node:timers/promises";
import { z, ZodError } from "zod";
import { telegramUpdate } from "./telegram";

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
            limit: 1,
            timeout: 30,
            allowed_updates: ["message"],
          },
          signal,
        ),
      );
      state.ready = true;
      for (const update of updates) {
        if (signal.aborted) break;
        try {
          // Finish the current reply during shutdown. Never acknowledge failed work.
          await telegramUpdate(update);
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
