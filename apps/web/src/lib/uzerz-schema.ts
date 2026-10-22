import { z } from "zod";

export const adminDateSchema = z.union([z.iso.date(), z.literal("")]);

export type AdminColumn = { key: string; label: string; date?: boolean };
export type AdminTable = {
  key: string;
  label: string;
  columns: AdminColumn[];
  search: string[];
  sort: string;
};
const id = { key: "_id", label: "Record ID" };
const user = { key: "userId", label: "Telegram ID" };
const created = { key: "createdAt", label: "Created", date: true };
const review: AdminColumn[] = [
  { key: "stage", label: "Review stage" },
  { key: "mastery", label: "Mastery" },
  { key: "nextReview", label: "Next review", date: true },
  { key: "lastPracticed", label: "Last practiced", date: true },
];
export const adminTables: AdminTable[] = [
  {
    key: "analytics",
    label: "Analytics",
    sort: "day",
    search: [],
    columns: [
      { key: "day", label: "Return date · Kyiv" },
      { key: "previousActive", label: "Active previous day" },
      { key: "active", label: "Active on return date" },
      { key: "returned", label: "Returned from previous day" },
      { key: "retention", label: "Daily retention" },
    ],
  },
  {
    key: "trialUsage",
    label: "Legacy trial usage",
    sort: "sortAt",
    search: ["userId", "username", "name"],
    columns: [
      { key: "username", label: "Username" },
      { key: "totalMessages", label: "Total messages" },
      { key: "lastMessageAt", label: "Last message", date: true },
    ],
  },
  {
    key: "users",
    label: "Users",
    sort: "createdAt",
    search: ["_id", "name"],
    columns: [
      { key: "_id", label: "Telegram ID" },
      { key: "name", label: "Name" },
      { ...created, label: "Registered" },
      { key: "lastActiveDay", label: "Last active day" },
      { key: "premiumUntil", label: "Legacy access until", date: true },
      { key: "xp", label: "XP" },
      { key: "streak", label: "Streak" },
      { key: "longestStreak", label: "Longest streak" },
      { key: "onboardingProgress.bot", label: "Bot onboarding progress" },
      { key: "onboardingProgress.web", label: "Web onboarding progress" },
      { key: "settings.nativeLanguage", label: "Native language" },
      { key: "settings.englishLevel", label: "English level" },
      { key: "settings.goal", label: "Goal" },
      { key: "settings.interests", label: "Interests" },
      { key: "settings.dailyGoal", label: "Daily goal (min)" },
      { key: "settings.timezone", label: "Time zone" },
      { key: "bot.enabled", label: "Daily messages enabled" },
      { key: "bot.hour", label: "Daily message hour (local)" },
      { key: "bot.lastContactAt", label: "Last bot contact", date: true },
      { key: "bot.lastPromptDay", label: "Last daily message day" },
    ],
  },
  {
    key: "messages",
    label: "Messages",
    sort: "createdAt",
    search: ["userId", "text"],
    columns: [
      user,
      created,
      { key: "text", label: "Message" },
      { key: "analysis", label: "Analysis" },
      id,
    ],
  },
  {
    key: "mistakes",
    label: "Mistakes",
    sort: "createdAt",
    search: ["userId", "wrong", "correct", "category"],
    columns: [
      user,
      created,
      { key: "type", label: "Type" },
      { key: "category", label: "Category" },
      { key: "original", label: "Original sentence" },
      { key: "corrected", label: "Corrected sentence" },
      { key: "wrong", label: "Mistake" },
      { key: "correct", label: "Correction" },
      { key: "explanation", label: "Explanation" },
      { key: "occurrences", label: "Occurrences" },
      ...review,
      id,
    ],
  },
  {
    key: "words",
    label: "Vocabulary",
    sort: "createdAt",
    search: ["userId", "word", "translation"],
    columns: [
      user,
      created,
      { key: "word", label: "Word" },
      { key: "translation", label: "Translation" },
      { key: "definition", label: "Definition" },
      { key: "example", label: "Example" },
      ...review,
      id,
    ],
  },
  {
    key: "exercises",
    label: "Exercises",
    sort: "createdAt",
    search: ["userId", "prompt", "type"],
    columns: [
      user,
      created,
      { key: "type", label: "Type" },
      { key: "prompt", label: "Prompt" },
      { key: "options", label: "Options" },
      { key: "result", label: "Result" },
      { key: "attemptedAt", label: "Attempted", date: true },
      { key: "sourceType", label: "Source type" },
      { key: "sourceId", label: "Source ID" },
      id,
    ],
  },
  {
    key: "activity",
    label: "Activity",
    sort: "day",
    search: ["userId", "day"],
    columns: [
      user,
      { key: "day", label: "Local day" },
      { key: "xp", label: "XP" },
      { key: "messages", label: "Messages" },
      { key: "accurate", label: "Accurate messages" },
      { key: "exercises", label: "Exercises" },
      { key: "correct", label: "Correct answers" },
      id,
    ],
  },
  {
    key: "payments",
    label: "Payments",
    sort: "createdAt",
    search: ["userId", "_id"],
    columns: [
      user,
      created,
      { key: "amount", label: "Amount (currency units)" },
      { key: "currency", label: "Currency" },
      { key: "points", label: "Credits purchased" },
      { key: "refundedAt", label: "Refunded", date: true },
      { key: "premiumUntil", label: "Legacy access until", date: true },
      id,
    ],
  },
  {
    key: "starters",
    label: "Bot conversations",
    sort: "createdAt",
    search: ["userId", "text"],
    columns: [
      user,
      created,
      { key: "text", label: "Message" },
      { key: "sentAt", label: "Sent", date: true },
      id,
    ],
  },
  {
    key: "events",
    label: "Event logs",
    sort: "createdAt",
    search: ["userId", "event", "details.button", "path", "visitorId"],
    columns: [
      created,
      { key: "event", label: "Event" },
      { key: "source", label: "Source" },
      user,
      { key: "path", label: "Page" },
      { key: "details", label: "Details" },
      { key: "visitorId", label: "Visitor ID" },
      { key: "visitId", label: "Visit ID" },
      id,
    ],
  },
];
export interface AdminAnalytics {
  onboarded: number;
  messaged: number;
  elevenPlus: number;
}
export interface AdminData {
  analytics?: AdminAnalytics;
  rows: Record<string, string | null>[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<string, number>;
}
