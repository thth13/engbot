import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { ZodError } from "zod";
import { closeDatabase, database } from "@engbot/core/db";
import { equal, HttpError } from "@engbot/core/errors";
import { telegramUpdate } from "./telegram";

for (const name of [
  "APP_URL",
  "MONGODB_URI",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "OPENAI_API_KEY",
]) {
  if (!process.env[name])
    throw new Error(`Missing environment variable: ${name}`);
}
if (new URL(process.env.APP_URL!).protocol !== "https:") {
  throw new Error("APP_URL must be the public HTTPS URL of the web app");
}
const secret = process.env.TELEGRAM_WEBHOOK_SECRET!;
if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
  throw new Error(
    "TELEGRAM_WEBHOOK_SECRET must contain 1–256 letters, digits, _ or -",
  );
}
const port = Number(process.env.PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}
let stopping = false;

function reply(response: ServerResponse, status: number, body: object) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const limit = 64 * 1024;
  if (Number(request.headers["content-length"] || 0) > limit) {
    throw new HttpError(413, "Request too large");
  }
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw new HttpError(413, "Request too large");
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

const server = createServer(async (request, response) => {
  try {
    if (stopping) return reply(response, 503, { ok: false });
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    if (request.method === "GET" && pathname === "/health") {
      const { client } = await database();
      await client.db().command({ ping: 1 }, { timeoutMS: 5000 });
      return reply(response, 200, { ok: true });
    }
    if (pathname !== "/telegram/webhook") {
      return reply(response, 404, { error: "Not found" });
    }
    if (request.method !== "POST") {
      response.setHeader("allow", "POST");
      return reply(response, 405, { error: "Method not allowed" });
    }
    const supplied = request.headers["x-telegram-bot-api-secret-token"];
    if (typeof supplied !== "string" || !equal(supplied, secret)) {
      return reply(response, 401, { error: "Unauthorized" });
    }
    // Acknowledge only after processing: Telegram retries failed deliveries.
    await telegramUpdate(await readBody(request));
    reply(response, 200, { ok: true });
  } catch (error) {
    const status =
      error instanceof HttpError
        ? error.status
        : error instanceof ZodError
          ? 400
          : 503;
    if (status >= 500) console.error("Bot request failed", { status });
    reply(response, status, { ok: false });
  }
});

server.requestTimeout = 20000;
server.headersTimeout = 10000;
server.setTimeout(120000);
server.listen(port, "0.0.0.0", () => {
  console.log(`Telegram bot listening on port ${port}`);
});

function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 75000);
  deadline.unref();
  server.close(() => {
    void closeDatabase().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
