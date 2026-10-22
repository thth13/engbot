# UI contract

## Business sources

Authoritative brief: `docs/product-brief.txt`; architecture and data semantics: `docs/ARCHITECTURE.md`.
Authentication: server-verified Telegram Mini App initData; learner data reads and mutations are scoped to the session subject. The public read-only data-view exception is defined in `docs/ARCHITECTURE.md` under Web administration. No demo login or client-provided user ID. Billing follows the current approved pay-as-you-go brief recorded in `docs/POINTS.md`; deletion, roles and legal flows remain outside this change.

## Canonical UI Map

| Capability     | Canonical owner                          | Source of truth            | Allowed variants                   | Verification                                |
| -------------- | ---------------------------------------- | -------------------------- | ---------------------------------- | ------------------------------------------- |
| Navigation     | CoachApp                                 | Next Link                  | Sidebar / bottom navigation        | Static inspection; runtime deferred by user |
| Buttons        | components/ui.tsx Button                 | Native button              | Primary / secondary / small        | Static inspection; runtime deferred by user |
| Form           | Profile, Chat, Practice                  | Zod and inline form-status | Native labeled fields              | Static inspection; runtime deferred by user |
| Select/Listbox | Profile                                  | Native select              | OS popup accepted                  | Static inspection; runtime deferred by user |
| Date           | date, dayKey and Uzerz date filters      | Intl / adminDateSchema     | Read-only / native OS date popup   | Static inspection; runtime deferred by user |
| Scrollbar      | globals.css                              | Root CSS tokens            | Global baseline                    | Static inspection; runtime deferred by user |
| CRUD           | learning.ts and API route                | ARCHITECTURE.md            | Idempotent save                    | Static inspection; runtime deferred by user |
| Toast          | form-status                              | Inline live status         | No transient toast                 | Static inspection; runtime deferred by user |
| Billing        | Wallet, core/pricing.ts, core/billing.ts | docs/POINTS.md             | Telegram invoice / Profile balance | Static inspection; runtime deferred by user |
| Loading        | Button and CoachApp                      | Spinner / status text      | No skeleton                        | Static inspection; runtime deferred by user |

## Flow ledger

- Telegram entry → validate signature → signed httpOnly session → onboarding if needed → home.
- Native language in onboarding uses `LanguageSelect`: an authored searchable combobox with a bounded list, clear action, arrow/Enter/Escape controls and explicit selection. Search is transient local state; only the selected language enters the profile draft. Other profile selects retain their native popup.
- Onboarding shows one question per step: explanation language → learning goal → Telegram reply format → daily Telegram schedule in India Standard Time. Learning goal and reply format use native toggle buttons with visible selection. Next validates the current answer; Back preserves answers; only the final action saves. Step headings receive keyboard focus. Existing profile editing keeps its full form and native selects.
- Telegram SDK loads after the interface starts, with a 10-second deadline. Entry has a shared 25-second deadline for SDK/session/login/data; failures show an inline error and retry. Superseded entry attempts cannot update the screen.
- Profile → validate → save → acknowledgement and explicit conversation link. Profile drafts are retained in tab-scoped sessionStorage across same-app navigation and removed on save; page unload also warns.
- Chat → submit with request UUID → analyze → atomic message/mistake/XP persistence → reload history. Failure preserves input and request UUID for retry.
- Word chip → server looks up actual conversation suggestion → idempotent upsert → saved chip disabled.
- Practice → choose oldest review item → generate private answer → user answer → server grade → transaction saves single attempt, repetition and XP → feedback → explicit next exercise.
- Filters persist in URL; pagination resets on filter change. Lists display their 500-record read limit; practice queries the full bank.

## States and constraints

Administrative event tracking is owned by `lib/track-event.ts` and the server-only core notification service. Landing visits are classified after the Telegram launch snapshot settles; bottom-scroll is sent once per landing mount. Both “Start in Telegram” links send a click event through a keepalive request without delaying navigation. Home/profile events require successful authentication. Tracking never changes visible loading/error states or prevents navigation, and notification recipients are resolved only from server environment variables.

Empty views explain the next action. No fake success on API failure. Inline errors survive until retry; pending operations disable duplicate local submit. All API errors preserve the form content. UI is English, dates and numbers use en-US. Exercise instructions are English; learning explanations and vocabulary translations follow the saved native language. Legacy Ukrainian and Russian profile language names and URL filters resolve to English labels. No sensitive data in URLs except opaque source document IDs. AI text is rendered as text, never HTML. Keyboard/touch behavior and narrow layouts need runtime verification by the user.

## Telegram flows

- `/start` collects explanation language, learning goal, reply format and daily conversation time in India Standard Time inside Telegram. Existing web profiles remain intact until the last step commits. `/settings` opens a menu with Bot speaking and Profile and reminders. The latter repeats onboarding; Back preserves answers. Bot speaking changes only the default reply format and preserves other preferences.
- Canonical bot form owner: `apps/bot/src/onboarding.ts`; shared validation: `settingsSchema`. Each step uses a revision to reject stale callbacks. Draft changes and cached replies commit in one MongoDB transaction; retries reuse the cached reply.
- Finishing onboarding starts an English conversation immediately. `/topic` requests a fresh topic. Bot questions are stored separately from learner messages, included in AI history and never award XP.
- Daily reminders are free static text, never AI generation or paid voice. They are optional, at the selected local hour, at most one attempted delivery per local date. No catch-up messages outside that hour; no daily message within one hour of user interaction or while onboarding. `/pause` disables and `/resume` enables daily messages.
- Ordinary replies have no website CTA. Only explicit `/app`, `/practice`, `/mistakes`, `/words`, `/progress` commands show a relevant app link.
- Scheduled delivery reserves the date before sending to avoid duplicate nudges on ambiguous network failures. Such failures may skip that day's message. Blocking the bot disables scheduled messages. Runtime Telegram checks are deferred to the user.

## Web administration

- Trial usage exposes one row per legacy trial user, with username (name/ID fallback), total saved messages and last saved message timestamp. Grouping precedes filtering and server pagination. All dates and plans are included by default; bot replies and failed unsaved requests are excluded. Native OS-owned From/To date inputs filter saved messages by inclusive Kyiv calendar dates, including daylight-saving transitions. Either boundary may be empty; equal dates select one day. Apply dates validates the range and resets pagination; All dates clears it. Date filters persist as `from`/`to` URL parameters and reset when changing tables. No matching messages means the user is omitted from a filtered result; without date filters, users with no saved messages show zero and a dash. Sorting uses the last saved message in the selected period. The trial tab badge counts distinct users across all dates. Raw quota request IDs stay server-only.
- `/uzerz` is public and uses a standalone main-content layout. POST `/api/uzerz` does not require a Telegram session or an ID allowlist, per the explicit product decision. See `docs/ARCHITECTURE.md`, Web administration.
- Data tables are read-only, with explicit Search submission, immediate clear, server pagination (10/25/50), oldest/newest ordering and clamped pages. Search content is transient and sent in the request body to keep names and message text out of URLs and browser history. Table, order, page, page size and trial date filters persist in URL parameters. Requests are canceled when superseded and time out after 25 seconds. Request failures show an inline error and retry.
- Shared `components/ui.tsx` Pagination owns learner and administrator pagination. Table ownership is `components/uzerz.tsx`; column metadata is `lib/uzerz-schema.ts`; server query and projections are `lib/uzerz.ts`. All data views use the same owner. Count badges (except distinct trial users) and service collection counts are approximate; filtered totals are exact at query time.
- Personal settings and business records are explicitly projected; private exercise solutions and raw Telegram delivery payloads are excluded. Operational collections expose only approximate record counts. Dates use en-US with timestamps displayed in Europe/Kyiv and labeled Kyiv time, only in administration. Date-only values and user schedule settings retain their original meaning. Native OS-owned order and page-size selects are accepted.

## Product event logging

Product analytics uses `@engbot/core/events` and POST `/api/telemetry`, independently of existing administrator notifications. The shared `WebEventLogger` in the root layout captures document openings and enabled button/link clicks without blocking navigation. CoachApp records authenticated entry and onboarding question transitions. The API records validated first-profile completion. Bot onboarding checkpoints atomically persist events and last-question progress. See `docs/LOGGING.md` for the exact event inventory, public `/uzerz` visibility, delivery limitations and disable/removal points. The server flag `EVENT_LOGGING_ENABLED=false` disables new event/progress writes; existing notification delivery remains independent.

- Onboarding v3 invalidates older bot drafts and web drafts to prevent old step numbers from selecting a different answer. Legacy profiles remain compatible. Schedule is saved atomically with the web profile and used by the same Telegram scheduler.
- AI learner profiles are persisted in the message transaction without extra requests. A level estimate requires at least three messages of eight words each and eighty words total in recent history, plus the model judging the evidence sufficient. Interests are non-sensitive explicitly stated preferences, separate from manual interests.

## Learning credits

- Profile wallet and header balance use the authenticated `/api/me` snapshot. Returning to the app refreshes it; a manual Refresh balance button preserves geometry and reports failures inline.
- Pack links use the configured bot username and server-owned pack identifiers; the bot creates a native XTR invoice. Only `successful_payment` changes the balance. A client navigation or pre-checkout acknowledgement cannot add credits to the balance.
- Text replies and new topics cost 5 credits. An exercise with its first answer check costs 10; retries and revisits of the same operation are free. Chat and practice display the price before submission and retain request IDs on request failure. Pending exercises and already graded results are free to reopen.
- `/text` switches to text immediately. `/speaking`, `/voice`, and Settings → Bot speaking display the current default, rates, and Text/Voice choices. Onboarding/profile display the same rates before saving. Old preferences do not silently opt users into paid automatic audio after grandfathered access expires.
- A new spoken reply quotes a maximum of 50 extra credits, reserves before generation, bills per started second after delivery, and returns the unused hold. Inability to fund auto-voice falls back to the paid text answer without buttons. Ordinary text replies have no inline buttons. A voice reply has only Show text · free; it reads the saved text, bypassing onboarding, AI and billing even at zero balance. Old Listen callbacks open Bot speaking without generation or charges. Native audio playback is free.
- Wallet history is a bounded disclosure with signed deltas, semantic action labels and profile-timezone dates. It excludes unfinished operations; the available balance already excludes their holds. Negative balances following refunds explain how to recover.
- Payment safety, retries, migration, and known delivery limitations are specified in `docs/POINTS.md`.

## Administration analytics

- Analytics is a read-only tab within Uzerz, using the same request cancellation, timeout, refresh, error recovery, order and pagination controls. It has no search or date filter; retention covers the last 30 completed Kyiv calendar days, including days with no messages.
- Onboarding completion counts users with saved non-null settings, matching both onboarding completion paths and including legacy profiles without telemetry. Message thresholds count distinct users with at least 1 or at least 11 saved messages across all dates and plans, independently of onboarding status.
- A return date's retention is the intersection of that day's and the previous day's messaging users divided by the previous day's messaging users. A zero denominator is undefined (dash), not 0%. Activity is saved learner messages, including voice transcriptions; bot replies, visits and unsaved requests do not count. The server aggregates user IDs without returning them to the analytics client.
