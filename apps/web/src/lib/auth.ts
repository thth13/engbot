import "server-only";
import { createHmac } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { z } from "zod";
import { database } from "@engbot/core/db";
import { equal, HttpError } from "@engbot/core/errors";
import { ensureUser } from "@engbot/core/users";
function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32)
    throw new HttpError(503, "Вход пока не настроен.");
  return new TextEncoder().encode(value);
}
export async function telegramLogin(initData: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new HttpError(503, "Telegram-вход пока не настроен.");
  const data = new URLSearchParams(initData);
  const hash = data.get("hash") || "";
  data.delete("hash");
  if (new Set([...data.keys()]).size !== [...data.keys()].length)
    throw new HttpError(401, "Некорректные данные входа.");
  const check = [...data.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const key = createHmac("sha256", "WebAppData").update(token).digest();
  const expected = createHmac("sha256", key).update(check).digest("hex");
  const age = Date.now() / 1000 - Number(data.get("auth_date"));
  if (
    !equal(expected, hash) ||
    !Number.isFinite(age) ||
    age < -30 ||
    age > 3600
  )
    throw new HttpError(401, "Откройте приложение заново через Telegram.");
  const user = z
    .object({
      id: z.number().int().positive(),
      first_name: z.string().max(200),
    })
    .parse(JSON.parse(data.get("user") || "{}"));
  const id = await ensureUser(String(user.id), user.first_name);
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(id)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
  (await cookies()).set("engbot_session", jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 604800,
  });
}
export async function currentUser() {
  const token = (await cookies()).get("engbot_session")?.value;
  if (!token) throw new HttpError(401, "Откройте приложение через Telegram.");
  let id: string | undefined;
  try {
    id = (await jwtVerify(token, secret(), { algorithms: ["HS256"] })).payload
      .sub;
  } catch {
    throw new HttpError(401, "Войдите снова через Telegram.");
  }
  if (!id) throw new HttpError(401, "Войдите снова через Telegram.");
  const user = await (await database()).users.findOne({ _id: id });
  if (!user) throw new HttpError(401, "Пользователь не найден.");
  return user;
}
