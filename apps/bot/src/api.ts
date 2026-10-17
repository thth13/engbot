export class TelegramDeliveryError extends Error {
  constructor(
    public code: number,
    public retryAfter = 60,
  ) {
    super(`Telegram delivery failed (${code})`);
  }
}
export async function telegramCall(method: string, body: object | FormData) {
  const multipart = body instanceof FormData;
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: multipart ? undefined : { "content-type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: multipart ? body : JSON.stringify(body),
    },
  );
  const result = await response.json();
  if (!response.ok || !result.ok)
    throw new TelegramDeliveryError(
      result.error_code || response.status,
      result.parameters?.retry_after || 60,
    );
  return result.result;
}
