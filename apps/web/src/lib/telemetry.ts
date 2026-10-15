"use client";

import { currentVisitorId } from "./track-event";

export type WebLogEvent =
  | "web_app_open"
  | "web_app_authenticated"
  | "web_button_click"
  | "web_onboarding_step";
let visitId: string | undefined;

// LOGGING: shared non-blocking browser sender; never sends form values or URL queries.
export function trackWebEvent(
  event: WebLogEvent,
  details?: { button?: string; target?: string; step?: number },
) {
  try {
    visitId ??= crypto.randomUUID();
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const search = new URLSearchParams(window.location.search);
    const source =
      window.Telegram?.WebApp?.initData ||
      hash.get("tgWebAppData") ||
      search.get("tgWebAppData")
        ? "Telegram Mini App"
        : "Browser";
    void fetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId: crypto.randomUUID(),
        event,
        visitorId: currentVisitorId(),
        visitId,
        source,
        path: window.location.pathname,
        occurredAt: new Date().toISOString(),
        ...details,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Logging must not interrupt a navigation, form or click handler.
  }
}
