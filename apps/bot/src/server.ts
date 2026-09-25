import { createServer } from "node:http";
import { closeDatabase, database } from "@engbot/core/db";
import { pollTelegram } from "./polling";

for (const name of [
  "APP_URL",
  "MONGODB_URI",
  "TELEGRAM_BOT_TOKEN",
  "OPENAI_API_KEY",
]) {
  if (!process.env[name])
    throw new Error(`Missing environment variable: ${name}`);
}
if (new URL(process.env.APP_URL!).protocol !== "https:") {
  throw new Error("APP_URL must be the public HTTPS URL of the web app");
}
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}
const controller = new AbortController();
const state = { ready: false };
let stopping = false;
let polling: Promise<void> = Promise.resolve();

// HTTP is used only for Railway healthchecks, never for Telegram messages.
const server = createServer(async (request, response) => {
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  if (request.method !== "GET" || request.url !== "/health") {
    response.writeHead(404).end(JSON.stringify({ error: "Not found" }));
    return;
  }
  try {
    if (stopping || !state.ready) throw new Error("Bot not ready");
    const { client } = await database();
    await client.db().command({ ping: 1 }, { timeoutMS: 5000 });
    response.writeHead(200).end(JSON.stringify({ ok: true }));
  } catch {
    response.writeHead(503).end(JSON.stringify({ ok: false }));
  }
});

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  controller.abort();
  const deadline = setTimeout(() => process.exit(1), 75000);
  deadline.unref();
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  try {
    await Promise.all([polling, closed]);
    await closeDatabase();
    process.exit(code);
  } catch {
    process.exit(1);
  }
}

server.listen(port, "0.0.0.0", () => {
  console.log(
    `Bot healthcheck listening on port ${port}; starting Telegram long polling`,
  );
  polling = pollTelegram(controller.signal, state);
  void polling.catch((error: Error) => {
    console.error(error.message);
    void shutdown(1);
  });
});
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
