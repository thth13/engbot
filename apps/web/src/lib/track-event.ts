"use client";

export function trackEvent(
  event: "landing_visit" | "landing_bottom" | "profile_visit",
  visitId: string,
) {
  void fetch("/api/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, visitId, path: window.location.pathname }),
    keepalive: true,
  }).catch(() => {});
}
