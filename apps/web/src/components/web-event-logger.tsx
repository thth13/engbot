"use client";

import { useEffect, useRef } from "react";
import { trackWebEvent } from "@/lib/telemetry";

export function WebEventLogger() {
  const opened = useRef(false);
  useEffect(() => {
    // LOGGING: one opening per document mount; SPA transitions are button/link events.
    if (!opened.current) {
      opened.current = true;
      trackWebEvent("web_app_open");
    }
    function onClick(event: MouseEvent) {
      const origin = event.target;
      if (!(origin instanceof Element)) return;
      const button = origin.closest<HTMLElement>(
        "button, a[href], [role='button'], [role='option'], summary, input[type='submit'], input[type='button'], input[type='reset']",
      );
      if (!button || button.matches(":disabled, [aria-disabled='true']"))
        return;
      const label =
        button.dataset.logId ||
        button.id ||
        button.getAttribute("aria-label") ||
        button.getAttribute("title") ||
        button.textContent?.replace(/\s+/g, " ").trim() ||
        button.getAttribute("type") ||
        "Unnamed control";
      const href = button.getAttribute("href");
      let target: string | undefined;
      if (href) {
        try {
          target = new URL(href, window.location.href).pathname.slice(0, 200);
        } catch {}
      }
      trackWebEvent("web_button_click", {
        button: label.slice(0, 120),
        target,
      });
    }
    // Capture runs before handlers can remove a control or start navigation.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
