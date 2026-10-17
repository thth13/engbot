# MVP architecture

## Scope and sequence

1. Foundation: Next.js App Router, strict TypeScript, MongoDB driver, validated environment boundaries.
2. Identity: Telegram Mini App HMAC verification, short-lived initData, signed seven-day cookie, onboarding.
3. Core loop: conversation → structured analysis → mistake bank → generated exercise → server grading → spaced repetition.
4. Vocabulary: save real conversation suggestions and review with the same scheduler.
5. Companion UI: dashboard, mistakes, vocabulary, practice, progress, profile; bot commands and text conversation.

Voice replies and transcription, Telegram onboarding and optional scheduled conversation starters are implemented. Measured speaking time and weekly reports are not implemented. The coach starts with simple language and gradually estimates writing level from learner messages; it is a provisional estimate, not a placement test or a certified CEFR result.

## Stack

Next.js 16 + React 19 + TypeScript, Tailwind 4 with CSS design tokens. Vercel runs `apps/web`; Railway runs the independent long-polling bot in `apps/bot`. Both import domain services from the npm workspace `packages/core`. MongoDB native driver; no Prisma. The bot runs TypeScript with tsx, without a separate compilation step. Transactions require Atlas or a replica set. npm is the package manager.

## Collections

- users: Telegram ID as string primary key; first name; settings including timezone; XP, streak, longest streak, last active local day.
- messages: user ID, current text, validated AI analysis, timestamp. Deterministic user/request key prevents duplicate learning writes. Recent exchanges and delivered bot conversation starters inform AI (up to 16 chronological entries); last 30 learner messages displayed.
- mistakes: deterministic user/category/wrong/correct key, most recent source sentence and explanation, occurrence count, shared review state. Raw occurrence history is retained in message analyses.
- words: deterministic user/normalized-word key, translation, definition, contextual example and shared review state.
- exercises: generated content including private answer and explanation, source reference, optional single immutable result and attempt timestamp. Answers are never sent before grading.
- activity: deterministic user/local-date key, XP and counters. Derived skills group mistakes by grammar category. No unnecessary separate skill or XP tables.
- limits: per-user UTC date bucket, max 100 AI operations per day. Counts include failed provider requests. Deployments should additionally cap request sizes and traffic at the ingress.
- conversationStarters: deterministic request/day key, user ID, generated question, creation and delivery timestamps; no learner XP or message counters.
- telegramUpdates: update ID, processing state, cached text/inline-button payload and onboarding completion checkpoint. See operational limitations below.

Recommended indexes are provided by `scripts/mongo-indexes.mjs`. Primary keys provide uniqueness from the outset. Learner clients receive only their own data; learning selectors include the session user ID or a user-scoped deterministic key. The public read-only cross-user endpoint is described below.

## Routes

UI: `/`, `/chat`, `/mistakes`, `/vocabulary`, `/practice`, `/progress`, `/profile`.
API: GET `/api/config`, `/api/me`; POST `/api/auth/telegram`, `/api/profile`, `/api/chat`, `/api/vocabulary`, `/api/practice`, `/api/practice/answer`.
Bot (Railway): outgoing Telegram `getUpdates` requests; GET `/health` for internal Railway readiness (polling state and MongoDB ping). No incoming Telegram routes.

The web route dispatcher is intentionally thin. Web-only session authentication is in `apps/web/src/lib/auth.ts`. Framework-independent user creation and limits are in `packages/core/src/users.ts`; validated types in schema.ts, persistence in db.ts, scheduling and transactions in learning.ts, provider in ai.ts. Telegram adapter and HTTP transport are in `apps/bot/src`. Shared core has no Next.js or server-only imports. Only the schema subpath is intended for browser imports; AI, database and learning modules are server code. The Next.js config transpiles the core workspace and traces files from the monorepo root.

## Authentication and boundaries

Only server-verified Telegram initData can create a session. HMAC is checked in constant time, signed data age at most one hour, future skew at most 30 seconds. Cookie is httpOnly, SameSite Lax, Secure in production. Web mutations require configured application Origin. The bot authenticates outgoing Telegram requests using its server-side bot token. It exposes no inbound Telegram endpoint. AI provider credentials stay server-side. AI text is untrusted, schema validated and rendered as plain React text.

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

`AIProvider` owns analyzeMessage, startConversation, generateExercise, gradeAnswer. OpenAI Responses API is the adapter, selected by an explicit server-side export. JSON schema constrains response format; Zod validates again before writes. API key and model are environment configuration. A different provider implements the same interface. No mock responses in production.

## Operational limitations

The bot deletes the old webhook without dropping pending updates and uses long polling (30-second Telegram wait, 45-second fetch deadline). Updates are processed sequentially; offset advances only after successful processing or explicitly skipping an unsupported payload. A failed update is retried before later messages. Offset is in memory: after restart Telegram can redeliver unconfirmed messages; MongoDB delivery state handles already-sent updates. Transient failures retry with a delay; 429 respects retry_after, 409 reports conflicting pollers, invalid tokens stop the process. Run one process per token, without platform sleeping. SIGTERM aborts the pending poll and waits for current message processing before closing MongoDB, with a 75-second deadline subject to host termination grace. HTTP remains only for healthchecks. The web API retains maxDuration=60 on Vercel. Durable queues/outbox and Telegram sendMessage reconciliation are future production hardening: Telegram has no sendMessage idempotency key, so a crash after delivery but before marking sent can cause a duplicate outbound reply. Learning writes remain idempotent. A processing lease allows interrupted requests to be retried; provider work may be repeated after lease expiration. MongoDB transactions prevent partially persisted learning updates. No automated retention or deletion policy is invented.

## Sources checked during implementation

- https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
- https://nextjs.org/docs/app/api-reference/functions/cookies
- https://www.mongodb.com/docs/drivers/node/v6.x/crud/transactions/
- https://developers.openai.com/api/docs/guides/structured-outputs

## Telegram onboarding and initiative

`onboarding.ts` owns a versioned four-step profile draft in `users.bot.draft`; each callback carries a random revision. Draft transitions and outbound step payloads commit atomically. The final transition validates the shared settings schema, commits preferences, and checkpoints the first conversation request. Telegram polling subscribes to messages and callback queries. Only explicit section commands attach web-app links.

`conversations.ts` runs alongside polling and checks eligible users once per minute using a database cursor. Eligibility requires opt-in, a private chat ID, a completed profile, no active draft and at least one hour without interaction. It sends during the selected local hour, with a database lease and at most one reserved attempt per local date. Activity and preferences are rechecked after AI generation. Explicit rate limits permit a later retry; blocked bots are disabled. Ambiguous delivery failures keep the date reserved to avoid duplicate unsolicited messages. No catch-up burst occurs after downtime. Shutdown aborts the schedule loop and waits for in-flight work.

## Web administration

`/uzerz` and POST `/api/uzerz` provide a public read-only cross-user view, per the explicit product decision. Neither requires a Telegram session or an ID allowlist. The page renders outside CoachApp so anonymous browser visitors can open it directly. The endpoint uses the existing Origin check and returns private/no-store responses. Learner endpoints retain their existing session checks. All projected user data, messages and payment records on this page are publicly accessible.

Tables cover users, messages, mistakes, vocabulary, exercises, daily activity, payments and bot conversation starters. Explicit per-table projections prevent raw delivery payloads and private exercise solutions from being returned. Other collections expose estimated counts only. Search text is escaped before regex matching, limited to 150 characters and sent in a POST body; collection names, searchable fields, projections and sort fields come from server-maintained metadata. Pagination is bounded to 10/25/50 rows, empty pages clamp to the current last page, and database operations have ten-second deadlines.

## Adaptive onboarding (October 2026)

Collect explanation language, learning goal, Telegram reply format and daily schedule. Both surfaces use Asia/Kolkata without a time-zone question. Level, minutes and interests are not onboarding questions. `settings.replyMode` selects text or voice; missing values preserve legacy voice behavior. `learnerProfile` stores provisional writing level and explicitly expressed conversational interests separately from manual settings. Manual interests take priority. AI analysis includes these suggestions in the existing structured response; message persistence commits accepted estimates atomically, and repeated requests do not update them twice. Level persistence needs at least three substantive recent learner messages and eighty words plus sufficient model evidence. Daily goals remain as legacy schema fields only.
