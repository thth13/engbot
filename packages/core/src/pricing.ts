// Shared by server and UI. Integer units avoid rounding each audio message to a minute.
export const POINT_SCALE = 60_000;
export const WELCOME_POINTS = 100;
export const DAILY_AI_LIMIT = 100;
export const PRICES = {
  text: 5,
  topic: 5,
  exercise: 10,
  transcription: 10,
  speech: 50,
} as const;
export const POINT_PACKS = [
  { stars: 100, points: 1000 },
  { stars: 250, points: 2500 },
  { stars: 500, points: 5000 },
] as const;
export const MAX_SPEECH_SECONDS = 60;
export const MAX_SPEECH_CHARACTERS = 600;
export const MAX_SPEECH_POINTS = (PRICES.speech * MAX_SPEECH_SECONDS) / 60;
export const pointsToUnits = (points: number) =>
  Math.round(points * POINT_SCALE);
export const formatPoints = (units: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    units / POINT_SCALE,
  );
export function audioUnits(kind: "transcription" | "speech", seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0)
    throw new Error("Invalid audio duration");
  return Math.ceil(seconds) * ((PRICES[kind] * POINT_SCALE) / 60);
}
