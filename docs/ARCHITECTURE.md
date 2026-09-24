# MVP architecture

## Scope and sequence

1. Foundation: Next.js App Router, strict TypeScript, MongoDB driver, validated environment boundaries.
2. Identity: Telegram Mini App HMAC verification, short-lived initData, signed seven-day cookie, onboarding.
3. Core loop: conversation → structured analysis → mistake bank → generated exercise → server grading → spaced repetition.
4. Vocabulary: save real conversation suggestions and review with the same scheduler.
5. Companion UI: dashboard, mistakes, vocabulary, practice, progress, profile; bot commands and text conversation.

P1 voice, reminders, scenarios, measured speaking time, weekly report generation are not implemented. No placement test in P0: unknown level uses A2 language provisionally and is displayed as unknown. No inferred CEFR improvement claim.

## Stack

Next.js 16 + React 19 + TypeScript, Tailwind 4 with CSS design tokens. Vercel runs `apps/web`; Railway runs the independent HTTP webhook server in `apps/bot`. Both import domain services from the npm workspace `packages/core`. MongoDB native driver; no Prisma. The bot runs TypeScript with tsx, without a separate compilation step. Transactions require Atlas or a replica set. npm is the package manager.

## Collections

- users: Telegram ID as string primary key; first name; settings including timezone; XP, streak, longest streak, last active local day.
- messages: user ID, current text, validated AI analysis, timestamp. Deterministic user/request key prevents duplicate learning writes. Last 12 exchanges inform AI; last 30 displayed.
- mistakes: deterministic user/category/wrong/correct key, most recent source sentence and explanation, occurrence count, shared review state. Raw occurrence history is retained in message analyses.
- words: deterministic user/normalized-word key, translation, definition, contextual example and shared review state.
- exercises: generated content including private answer and explanation, source reference, optional single immutable result and attempt timestamp. Answers are never sent before grading.
- activity: deterministic user/local-date key, XP and counters. Derived skills group mistakes by grammar category. No unnecessary separate skill or XP tables.
- limits: per-user UTC date bucket, max 100 AI operations per day. Counts include failed provider requests. Deployments should additionally cap request sizes and traffic at the ingress.
- telegramUpdates: update ID, processing state and cached outbound reply. See operational limitations below.

Recommended indexes are provided by `scripts/mongo-indexes.mjs`. Primary keys provide uniqueness from the outset. No client receives other users' data; all selectors include session user ID or a user-scoped deterministic key.

## Routes

UI: `/`, `/chat`, `/mistakes`, `/vocabulary`, `/practice`, `/progress`, `/profile`.
API: GET `/api/config`, `/api/me`; POST `/api/auth/telegram`, `/api/profile`, `/api/chat`, `/api/vocabulary`, `/api/practice`, `/api/practice/answer`.
Bot (Railway): POST `/telegram/webhook`; GET `/health` (MongoDB ping).

The web route dispatcher is intentionally thin. Web-only session authentication is in `apps/web/src/lib/auth.ts`. Framework-independent user creation and limits are in `packages/core/src/users.ts`; validated types in schema.ts, persistence in db.ts, scheduling and transactions in learning.ts, provider in ai.ts. Telegram adapter and HTTP transport are in `apps/bot/src`. Shared core has no Next.js or server-only imports. Only the schema subpath is intended for browser imports; AI, database and learning modules are server code. The Next.js config transpiles the core workspace and traces files from the monorepo root.

## Authentication and boundaries

Only server-verified Telegram initData can create a session. HMAC is checked in constant time, signed data age at most one hour, future skew at most 30 seconds. Cookie is httpOnly, SameSite Lax, Secure in production. Web mutations require configured application Origin. The independent bot webhook is authenticated with the Telegram secret header. AI provider credentials stay server-side. AI text is untrusted, schema validated and rendered as plain React text.

## Learning behavior

- English reply and analysis are one provider call, preserving conversational context.
- All significant corrections saved, at most three shown in chat. Natural language version kept separately.
- Review stages 0 → 1 → 2 → 3 → 4 → 5 correspond to 0, 1, 3, 7, 14, 30 days; correct answer advances a stage, incorrect answer resets to same-day review. Stage × 20 gives mastery.
- Repeated mistake resets mastery and due date. Occurrence count increments once per distinct correction per message.
- Conversation earns 10 XP; exercise earns 20 correct / 5 incorrect. Duplicate request or attempt does not re-award XP.
- Activity and streak use profile timezone. Missing more than one local calendar day displays current streak as zero; next activity establishes a new series.
- Dashboard accuracy is messages with no detected mistakes, across the last 30 active days. It is not a scientifically calibrated grammar score.
- Daily minutes are a user preference; no fabricated minutes or voice statistics.

## Provider

`AIProvider` owns analyzeMessage, generateExercise, gradeAnswer. OpenAI Responses API is the adapter, selected by an explicit server-side export. JSON schema constrains response format; Zod validates again before writes. API key and model are environment configuration. A different provider implements the same interface. No mock responses in production.

## Operational limitations

The synchronous webhook runs on Railway and only acknowledges after processing. Its HTTP socket timeout is 120 seconds; incoming request bodies are limited to 64 KiB and 20 seconds. SIGTERM stops new requests and drains active requests for up to 75 seconds, subject to the hosting platform termination grace period. The web API retains maxDuration=60 on Vercel. Durable queues/outbox and Telegram sendMessage reconciliation are future production hardening: Telegram has no sendMessage idempotency key, so a crash after delivery but before marking sent can cause a duplicate outbound reply. Learning writes remain idempotent. A processing lease allows interrupted requests to be retried; provider work may be repeated after lease expiration. MongoDB transactions prevent partially persisted learning updates. No automated retention or deletion policy is invented.

## Sources checked during implementation

- https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
- https://nextjs.org/docs/app/api-reference/functions/cookies
- https://www.mongodb.com/docs/drivers/node/v6.x/crud/transactions/
- https://developers.openai.com/api/docs/guides/structured-outputs
