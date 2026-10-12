import { database } from "./db";

type Notification = {
  id: string;
  event: string;
  source: "Browser" | "Telegram Mini App" | "Telegram Bot";
  page?: string;
  visitorId?: string;
  ip?: string;
  user?: { _id: string; name: string };
  details?: string;
};

// Server-only configuration: recipients can never come from a client request.
export async function notifyAdmins(notification: Notification) {
  const token = process.env.ADMIN_NOTIFICATION_BOT_TOKEN?.trim();
  const admins = [
    ...new Set(
      (process.env.ADMIN_TELEGRAM_IDS || "")
        .split(/[\s,;]+/)
        .filter((id) => /^[1-9]\d*$/.test(id)),
    ),
  ];
  if (!token || !admins.length) return;

  try {
    const db = await database();
    const text = [
      notification.event,
      "🚀 Project: EngBot",
      notification.page ? `📄 Page: ${notification.page}` : undefined,
      `📍 Source: ${notification.source}`,
      notification.user
        ? `👤 User: ${notification.user.name || "Без імені"}\n🆔 Telegram ID: ${notification.user._id}`
        : `👤 Visitor: ${notification.visitorId?.slice(0, 8) || "Unknown"}`,
      notification.ip ? `🌐 IP: ${notification.ip}` : undefined,
      `🕒 Time: ${new Date().toISOString()}`,
      notification.details,
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000);

    const deliveries = await Promise.allSettled(
      admins.map(async (admin) => {
        const id = `${notification.id}:${admin}`;
        try {
          // Reserve each recipient independently, including across bot retries.
          await db.notifications.insertOne({ _id: id, createdAt: new Date() });
        } catch (error) {
          if ((error as { code?: number }).code === 11000) return;
          throw error;
        }
        try {
          const response = await fetch(
            `https://api.telegram.org/bot${token}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: AbortSignal.timeout(5000),
              body: JSON.stringify({ chat_id: admin, text }),
            },
          );
          const result = await response.json();
          if (!response.ok || !result.ok) {
            // A definite rejection can be retried on the next event attempt.
            await db.notifications.deleteOne({ _id: id });
            console.error("Admin notification rejected", response.status);
          }
        } catch {
          // Keep the reservation on ambiguous network failures to avoid duplicates.
          console.error("Admin notification delivery failed");
        }
      }),
    );
    if (deliveries.some((delivery) => delivery.status === "rejected"))
      console.error("Admin notification reservation failed");
  } catch {
    // Never expose tokens or interfere with the user's main action.
    console.error("Admin notification failed");
  }
}
