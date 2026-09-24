import { notFound } from "next/navigation";
import { CoachApp } from "@/components/coach-app";
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
  return <CoachApp page={path} />;
}
