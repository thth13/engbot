# UI contract

## Business sources

Authoritative brief: `docs/product-brief.txt`; architecture and data semantics: `docs/ARCHITECTURE.md`.
Authentication: server-verified Telegram Mini App initData; learner data reads and mutations are scoped to the session subject. The public read-only data-view exception is defined in `docs/ARCHITECTURE.md` under Web administration. No demo login or client-provided user ID. Billing, deletion, roles and legal flows are outside P0.

## Canonical UI Map

| Capability     | Canonical owner           | Source of truth            | Allowed variants            | Verification                                |
| -------------- | ------------------------- | -------------------------- | --------------------------- | ------------------------------------------- |
| Navigation     | CoachApp                  | Next Link                  | Sidebar / bottom navigation | Static inspection; runtime deferred by user |
| Buttons        | components/ui.tsx Button  | Native button              | Primary / secondary / small | Static inspection; runtime deferred by user |
| Form           | Profile, Chat, Practice   | Zod and inline form-status | Native labeled fields       | Static inspection; runtime deferred by user |
| Select/Listbox | Profile                   | Native select              | OS popup accepted           | Static inspection; runtime deferred by user |
| Date           | date and dayKey           | Intl.DateTimeFormat        | Read-only                   | Static inspection; runtime deferred by user |
| Scrollbar      | globals.css               | Root CSS tokens            | Global baseline             | Static inspection; runtime deferred by user |
| CRUD           | learning.ts and API route | ARCHITECTURE.md            | Idempotent save             | Static inspection; runtime deferred by user |
| Toast          | form-status               | Inline live status         | No transient toast          | Static inspection; runtime deferred by user |
| Loading        | Button and CoachApp       | Spinner / status text      | No skeleton                 | Static inspection; runtime deferred by user |

## Flow ledger

- Telegram entry → validate signature → signed httpOnly session → onboarding if needed → home.
- Native language in onboarding uses `LanguageSelect`: an authored searchable combobox with a bounded list, clear action, arrow/Enter/Escape controls and explicit selection. Search is transient local state; only the selected language enters the profile draft. Other profile selects retain their native popup.
- Onboarding shows one question per step: native language → level → daily goal → learning goal → optional interests. Level, minutes and learning goal use native toggle buttons with visible selection. Next validates the current answer; Back preserves answers; only the final action saves. Step headings receive keyboard focus. Existing profile editing keeps its full form and native selects.
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

- `/start` collects native language, level, goal, minutes, interests, timezone and daily conversation time inside Telegram. Existing web profiles remain intact until the last step commits. `/settings` repeats this flow; Back preserves answers.
- Canonical bot form owner: `apps/bot/src/onboarding.ts`; shared validation: `settingsSchema`. Each step uses a revision to reject stale callbacks. Draft changes and cached replies commit in one MongoDB transaction; retries reuse the cached reply.
- Finishing onboarding starts an English conversation immediately. `/topic` requests a fresh topic. Bot questions are stored separately from learner messages, included in AI history and never award XP.
- Daily starters are optional, at the selected local hour, at most one attempted delivery per local date. No catch-up messages outside that hour; no daily message within one hour of user interaction or while onboarding. `/pause` disables and `/resume` enables daily messages.
- Ordinary replies have no website CTA. Only explicit `/app`, `/practice`, `/mistakes`, `/words`, `/progress` commands show a relevant app link.
- Scheduled delivery reserves the date before sending to avoid duplicate nudges on ambiguous network failures. Such failures may skip that day's message. Blocking the bot disables scheduled messages. Runtime Telegram checks are deferred to the user.

## Web administration

- `/uzerz` is public and uses a standalone main-content layout. POST `/api/uzerz` does not require a Telegram session or an ID allowlist, per the explicit product decision. See `docs/ARCHITECTURE.md`, Web administration.
- Data tables are read-only, with explicit Search submission, immediate clear, server pagination (10/25/50), oldest/newest ordering and clamped pages. Search content is transient and sent in the request body to keep names and message text out of URLs and browser history. Table, order, page and page size persist in URL parameters. Requests are canceled when superseded and time out after 25 seconds. Request failures show an inline error and retry.
- Shared `components/ui.tsx` Pagination owns learner and administrator pagination. Table ownership is `components/uzerz.tsx`; column metadata is `lib/uzerz-schema.ts`; server query and projections are `lib/uzerz.ts`. All data views use the same owner. Count badges and service collection counts are approximate; filtered totals are exact at query time.
- Personal settings and business records are explicitly projected; private exercise solutions and raw Telegram delivery payloads are excluded. Operational collections expose only approximate record counts. Dates use en-US with explicit UTC timestamps. Native OS-owned order and page-size selects are accepted.
