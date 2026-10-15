"use client";

let visitorId: string | undefined;

export function currentVisitorId() {
  if (visitorId) return visitorId;
  try {
    visitorId =
      sessionStorage.getItem("engbot_visitor_id") || crypto.randomUUID();
    sessionStorage.setItem("engbot_visitor_id", visitorId);
  } catch {
    visitorId = crypto.randomUUID();
  }
  return visitorId;
}

export function trackEvent(
  event:
    "landing_visit" | "landing_bottom" | "profile_visit" | "telegram_click",
  visitId: string,
) {
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const search = new URLSearchParams(window.location.search);
  const source =
    window.Telegram?.WebApp?.initData ||
    hash.get("tgWebAppData") ||
    search.get("tgWebAppData")
      ? "Telegram Mini App"
      : "Browser";
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event,
      visitId,
      visitorId: currentVisitorId(),
      source,
      path: window.location.pathname,
    }),
    keepalive: true,
  }).catch(() => {});
}
