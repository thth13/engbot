"use client";

import { useSyncExternalStore } from "react";
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

  return isWebApp ? <CoachApp page="home" /> : <Landing botUrl={botUrl} />;
}
