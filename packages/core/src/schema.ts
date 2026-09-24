import { z } from "zod";
export const settingsSchema = z.object({
  nativeLanguage: z.string().trim().min(2).max(40),
  englishLevel: z.enum(["A1", "A2", "B1", "B2", "C1", "unknown"]),
  goal: z.enum([
    "Speak confidently",
    "Travel",
    "Work",
    "Job interviews",
    "Move abroad",
    "Understand content",
    "Improve grammar",
    "Expand vocabulary",
  ]),
  interests: z.string().trim().max(300),
  dailyGoal: z.number().int().min(5).max(60),
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Invalid timezone"),
});
export type Settings = z.infer<typeof settingsSchema>;
export const correctionSchema = z.object({
  reply: z.string().min(1).max(3000),
  corrected: z.string().max(3000),
  naturalVersion: z.string().max(3000),
  mistakes: z
    .array(
      z.object({
        type: z.enum([
          "Grammar",
          "Vocabulary",
          "Articles",
          "Tenses",
          "Prepositions",
          "Word order",
        ]),
        category: z.string().min(1).max(80),
        wrong: z.string().min(1).max(300),
        correct: z.string().min(1).max(300),
        explanation: z.string().min(1).max(1000),
      }),
    )
    .max(12),
  words: z
    .array(
      z.object({
        word: z.string().min(1).max(80),
        translation: z.string().max(200),
        definition: z.string().max(500),
        example: z.string().max(500),
      }),
    )
    .max(3),
});
export type Correction = z.infer<typeof correctionSchema>;
export const exerciseSchema = z.object({
  type: z.enum(["translation", "gap", "fix", "choice", "free"]),
  prompt: z.string().min(1).max(1000),
  options: z.array(z.string().max(200)).max(4),
  answer: z.string().min(1).max(1000),
  explanation: z.string().min(1).max(1000),
});
export type ExerciseContent = z.infer<typeof exerciseSchema>;
export const gradeSchema = z.object({
  correct: z.boolean(),
  feedback: z.string().min(1).max(1000),
});
export interface User {
  _id: string;
  name: string;
  settings: Settings | null;
  xp: number;
  streak: number;
  longestStreak: number;
  lastActiveDay: string | null;
  createdAt: Date;
}
export interface Review {
  stage: number;
  mastery: number;
  nextReview: Date;
  lastPracticed: Date | null;
}
export interface Mistake extends Review {
  _id: string;
  userId: string;
  original: string;
  corrected: string;
  type: string;
  category: string;
  wrong: string;
  correct: string;
  explanation: string;
  occurrences: number;
  createdAt: Date;
}
export interface Word extends Review {
  _id: string;
  userId: string;
  word: string;
  translation: string;
  definition: string;
  example: string;
  createdAt: Date;
}
export interface Message {
  _id: string;
  userId: string;
  text: string;
  analysis: Correction;
  createdAt: Date;
}
export interface Exercise extends ExerciseContent {
  _id: string;
  userId: string;
  sourceId: string;
  sourceType: "mistake" | "word";
  createdAt: Date;
  result?: { correct: boolean; feedback: string; answer: string };
  attemptedAt?: Date;
}
export interface Activity {
  _id: string;
  userId: string;
  day: string;
  xp: number;
  messages: number;
  accurate: number;
  exercises: number;
  correct: number;
}
export type Serialized<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K];
};
export interface AppData {
  user: Serialized<User>;
  mistakes: Serialized<Mistake>[];
  words: Serialized<Word>[];
  messages: Serialized<Message>[];
  activity: Activity[];
  counts: { mistakes: number; words: number; due: number };
  today: string;
}
