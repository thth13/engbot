# UI contract

## Business sources

Authoritative brief: `docs/product-brief.txt`; architecture and data semantics: `docs/ARCHITECTURE.md`.
Authentication: server-verified Telegram Mini App initData; every data read and mutation is scoped to the session subject. No demo login or client-provided user ID. Billing, deletion, roles and legal flows are outside P0.

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

Empty views explain the next action. No fake success on API failure. Inline errors survive until retry; pending operations disable duplicate local submit. All API errors preserve the form content. UI is Ukrainian, dates and numbers uk-UA; English learning content is intentional. No sensitive data in URLs except opaque source document IDs. AI text is rendered as text, never HTML. Keyboard/touch behavior and narrow layouts need runtime verification by the user.

## Telegram flows

- `/start` collects native language, level, goal, minutes, interests, timezone and daily conversation time inside Telegram. Existing web profiles remain intact until the last step commits. `/settings` repeats this flow; Back preserves answers.
- Canonical bot form owner: `apps/bot/src/onboarding.ts`; shared validation: `settingsSchema`. Each step uses a revision to reject stale callbacks. Draft changes and cached replies commit in one MongoDB transaction; retries reuse the cached reply.
- Finishing onboarding starts an English conversation immediately. `/topic` requests a fresh topic. Bot questions are stored separately from learner messages, included in AI history and never award XP.
- Daily starters are optional, at the selected local hour, at most one attempted delivery per local date. No catch-up messages outside that hour; no daily message within one hour of user interaction or while onboarding. `/pause` disables and `/resume` enables daily messages.
- Ordinary replies have no website CTA. Only explicit `/app`, `/practice`, `/mistakes`, `/words`, `/progress` commands show a relevant app link.
- Scheduled delivery reserves the date before sending to avoid duplicate nudges on ambiguous network failures. Such failures may skip that day's message. Blocking the bot disables scheduled messages. Runtime Telegram checks are deferred to the user.
