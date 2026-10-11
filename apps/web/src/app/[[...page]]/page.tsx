import { notFound } from "next/navigation";
import { CoachApp } from "@/components/coach-app";
import { HomeEntry } from "@/components/home-entry";

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
    const username = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(
      /^@/,
      "",
    );
    const botUrl =
      username && /^[a-zA-Z0-9_]+$/.test(username)
        ? `https://t.me/${username}?start=web`
        : null;
    return <HomeEntry botUrl={botUrl} />;
  }
  return <CoachApp page={path} />;
}
