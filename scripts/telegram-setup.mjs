const {
  APP_URL,
  TELEGRAM_WEBHOOK_URL,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_WEBHOOK_SECRET,
} = process.env;
if (
  !APP_URL?.startsWith("https://") ||
  !TELEGRAM_WEBHOOK_URL?.startsWith("https://") ||
  !TELEGRAM_BOT_TOKEN ||
  !TELEGRAM_WEBHOOK_SECRET
)
  throw new Error(
    "Set HTTPS APP_URL, HTTPS TELEGRAM_WEBHOOK_URL, TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET",
  );
const webhook = new URL(TELEGRAM_WEBHOOK_URL);
if (
  webhook.pathname !== "/telegram/webhook" ||
  webhook.search ||
  webhook.hash
) {
  throw new Error(
    "TELEGRAM_WEBHOOK_URL must end in /telegram/webhook without query or fragment",
  );
}
if (!/^[A-Za-z0-9_-]{1,256}$/.test(TELEGRAM_WEBHOOK_SECRET)) {
  throw new Error(
    "TELEGRAM_WEBHOOK_SECRET must contain 1–256 letters, digits, _ or -",
  );
}
async function call(method, body) {
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      signal: AbortSignal.timeout(15000),
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json();
  if (!data.ok)
    throw new Error(`Telegram ${method} failed: ${data.description}`);
}
await call("setWebhook", {
  url: webhook.href,
  secret_token: TELEGRAM_WEBHOOK_SECRET,
  allowed_updates: ["message"],
});
await call("setChatMenuButton", {
  menu_button: {
    type: "web_app",
    text: "English Coach",
    web_app: { url: APP_URL },
  },
});
await call("setMyCommands", {
  commands: [
    { command: "start", description: "Начать" },
    { command: "practice", description: "Практика" },
    { command: "mistakes", description: "Мои ошибки" },
    { command: "words", description: "Словарь" },
    { command: "progress", description: "Прогресс" },
    { command: "settings", description: "Настройки" },
  ],
});
console.log("Webhook, menu button and commands configured.");
