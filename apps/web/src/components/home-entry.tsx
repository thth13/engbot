"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { trackEvent } from "@/lib/track-event";
import { CoachApp } from "./coach-app";
import { Landing } from "./landing";

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function isTelegramLaunch() {
  // Launch data selects the interface only. Authentication still verifies it
  // on the server; a browser session alone must not bypass the landing.
  const hash = new URLSearchParams(window.location.hash.slice(1));
  const search = new URLSearchParams(window.location.search);
  return Boolean(
    window.Telegram?.WebApp?.initData ||
    hash.get("tgWebAppData") ||
    search.get("tgWebAppData"),
  );
}

const browserLanding = () => false;

export function HomeEntry({ botUrl }: { botUrl: string | null }) {
  const isWebApp = useSyncExternalStore(
    subscribe,
    isTelegramLaunch,
    browserLanding,
  );
  const visitId = useRef<string | null>(null);
  const bottomSent = useRef(false);

  useEffect(() => {
    if (isWebApp) return;
    // Let the hydration snapshot settle before classifying a Telegram launch.
    const timer = window.setTimeout(() => {
      if (isTelegramLaunch()) return;
      visitId.current ??= crypto.randomUUID();
      trackEvent("landing_visit", visitId.current);
    }, 0);
    function onScroll() {
      if (isTelegramLaunch() || bottomSent.current || !visitId.current) return;
      const root = document.documentElement;
      if (
        window.scrollY > 0 &&
        window.scrollY + window.innerHeight >= root.scrollHeight - 8
      ) {
        bottomSent.current = true;
        trackEvent("landing_bottom", visitId.current);
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };
  }, [isWebApp]);

  return isWebApp ? <CoachApp page="home" /> : <Landing botUrl={botUrl} />;
}
