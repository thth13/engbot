import { notFound } from "next/navigation";
import { CoachApp } from "@/components/coach-app";
import { HomeEntry } from "@/components/home-entry";
import { TELEGRAM_BOT_URL } from "@/lib/telegram-bot";

export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ page?: string[] }>;
}) {
  const path = (await params).page?.join("/") || "home";
  if (
    ![
      "home",
      "chat",
      "mistakes",
      "vocabulary",
      "practice",
      "progress",
      "profile",
    ].includes(path)
  )
    notFound();
  if (path === "home") {
    return <HomeEntry botUrl={TELEGRAM_BOT_URL} />;
  }
  return <CoachApp page={path} />;
}
