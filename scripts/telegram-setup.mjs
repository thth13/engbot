import "../apps/bot/src/env.mjs";

const { APP_URL, TELEGRAM_BOT_TOKEN } = process.env;
if (!APP_URL?.startsWith("https://") || !TELEGRAM_BOT_TOKEN)
  throw new Error("Set HTTPS APP_URL and TELEGRAM_BOT_TOKEN");

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
console.log("Menu button and commands configured.");
