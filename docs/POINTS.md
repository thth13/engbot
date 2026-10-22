# Learning credits — billing contract

Approved implementation brief: replace weekly/monthly access sales with prepaid Stars packs, shared across Telegram and the Mini App. Prices were selected with an observed net payout of approximately $12–17 per 1,000 Stars; payout changes do not mutate previously purchased balances.

## Prices and migration

`packages/core/src/pricing.ts` is the sole numeric price source. Packs: 100/250/500 XTR → 1,000/2,500/5,000 credits. Welcome grant: 100 credits, once per account, including existing accounts during lazy migration. Text/topic: 5; exercise plus one check: 10; incoming voice: +10/minute; generated voice: +50/minute. Each audio duration is rounded up to a whole second; balances use 60,000 integer units per credit. Display rounding never affects accounting. No expiry or automatic renewal.

Existing `premiumUntil` is respected, with the original 100-request daily cap and 15-minute combined voice cap. New customers use the credit wallet; the 100-AI-request protective cap remains. Old /premium buttons redirect to credits. Old invoices cannot receive new pre-checkout approvals, but a delayed successful payment for a previously approved old invoice still grants its purchased access. Historical trial records are retained read-only; no trial-expiry messages are sent.

Existing voice preferences do not by themselves authorize paid automatic audio. Onboarding version 4, Profile save, or the Bot speaking voice selection records `voicePricingVersion: 1`. Until then, expired legacy accounts receive text without inline buttons. Daily reminders and initial welcome messages are always free text.

## Reply format

Each user chooses the default in Settings → Bot speaking (also /speaking or the web Profile). The choice applies to both incoming text and incoming voice and persists across restarts. Text replies have no inline buttons; voice replies have only Show text · free. Showing saved text is free; generating the original answer still costs 5 credits plus any transcription and speech. Changing this setting preserves the rest of the profile. Service messages, onboarding and reminders stay text; service menus retain their action buttons.

## Wallet correctness

- Wallet initialization and welcome receipt commit together, conditioned on the wallet version.
- Funds are reserved atomically before provider work. Concurrent purchases cannot spend the same available credits.
- Operation identity is scoped by user and kind. Only the current reservation owner can settle or cancel it. Settled results are reused without another debit or provider call.
- Learning results, XP, review updates, and settlement share a transaction. Provider errors release reserved funds. A lost server response can be retried with the same request UUID.
- Expired holds (five minutes) are released on the next authenticated wallet operation/read. A late worker cannot settle a released hold. A crashed provider call can incur provider expense without a user charge.
- An incoming voice message reserves transcription plus text analysis together. The internal text receipt is prepaid. Transcripts and analysis are cached for retries.
- Each exercise costs 10 once and includes the first answer check; older pending exercises retain a free check. Subsequent checks return the committed result. Both client request UUID and source/review cycle are deduplicated.
- Voice generation reserves at most 50 credits. Text is bounded to 600 characters and generated audio to 60 seconds. Over-limit/failed voice generation releases the hold and falls back to text. A low balance may cover text but not the voice reservation; this is explained before enabling voice and in fallback feedback.
- Speech files/durations survive process restarts. Only delivered audio is settled; remaining reserve is returned. Replaying a delivered file is free. A crash after Telegram delivery but before its acknowledgement can duplicate delivery or result in a released charge; Telegram provides no exactly-once send API. Wallet settlement itself is idempotent.
- Text analysis is charged once it is persisted and available in Mini App history; Telegram delivery retries are free. A blocked Telegram bot does not delete the result.
- Positive and negative wallet deltas have an auditable receipt. Released reservations have zero final delta. Public administration exposes neither wallet results nor AI usage data.

## Payments and refunds

Only authenticated Telegram `successful_payment` events credit packs, after owner, XTR amount and versioned payload checks. Each invoice has a nonce so a buyer can purchase the same pack again. The Telegram charge ID is unique. The payment receipt, balance increment and ledger entry commit together; a repeated update cannot credit again.

`refunded_payment` reverses the purchased credits exactly once. If the pack was spent, the resulting debt blocks new paid work until covered. Existing purchased days are removed when a matching legacy refund arrives. This handler reconciles refunds received from Telegram; it does not automatically approve user refund requests. /paysupport uses the existing support notification workflow.

## Usage accounting

`aiUsage` stores model, operation/user IDs, returned token usage (including cached/reasoning details when supplied), audio duration, and estimated USD cost. Cost logging is best-effort and does not change customer charges. TTS minute estimates are not provider billing truth. Reconcile against OpenAI invoices and update model estimates when changing models or processing tiers. Failed network calls without returned usage cannot be accurately costed here.

## Manual verification (not executed by the agent)

1. New and existing accounts: first access grants exactly 100 credits, including two simultaneous initializations. Reopen bot/app: no second grant. XP is unchanged by top-ups.
2. Complete onboarding in each surface. Choose text: one message costs 5. Choose voice only after seeing the rate. Old drafts restart at version 4; old voice preferences without acceptance default to paid text after legacy expiry.
3. Buy each pack with Telegram's test environment. Reject wrong owner, amount, currency and retired invoice payload. Re-deliver the same successful payment under another update ID: only one credit. Buy the same pack twice with distinct invoices: two credits.
4. With exactly 5 credits, one text response succeeds and leaves zero. Two concurrent 5-credit requests with 5 available: only one succeeds. Retrying the same request ID reuses its result and does not award extra XP.
5. Send a 30-second voice note with text replies: total 10 credits. Send a 31-second note: 10 + 1/6 credits total. Test the three-minute/file-size cap. Force transcription or analysis failure: the combined hold returns.
6. Generate a 30-second spoken reply: 25 extra credits, with the unused 25-credit hold returned. A 30-second incoming note plus that reply totals 35. A 60.1-second generated clip is not charged or delivered; text remains available.
7. Enable auto-voice with insufficient credits for its maximum reservation: receive the text result and an explanatory fallback. Verify text fallback has no buttons. After successful audio, tap Show text repeatedly at zero balance and after restart: saved text appears without new charges or OpenAI calls. Old Listen buttons open Bot speaking without charging.
8. Fail OpenAI, MongoDB settlement, Telegram voice delivery, and the HTTP response after commit. Repeat with stable IDs; verify at most one final charge. After worker death, read the wallet after five minutes and confirm release of the abandoned hold. Verify recorded expenses independently of customer refunds.
9. Generate practice from two tabs for the same source: one charged exercise. Lose the response and retry the same client UUID after another exercise is completed: original result is returned. Check the answer with zero remaining balance: allowed and free. Retry an answer: same result, no second XP.
10. Deliver a Stars refund twice: one reversal. Refund a spent pack: negative balance is explained; top-up covers debt first. Old access still runs until its timestamp and does not consume credits. An old paid invoice received late is honored once.
11. Scheduled reminders and /balance, /settings, /text, /pause, history, saved vocabulary, and transcript reads do not spend credits. /topic and repeat /start topic generation do. Daily reminders never generate AI or voice.
12. Change Settings → Bot speaking in both directions and reopen settings; check persistence, unchanged language/reminder preferences, text replies without markup, and audio replies with only Show text. Send both incoming text and voice in each mode. Change the same preference in Mini App and check the next bot response.
13. In Mini App, check balance refresh after returning from Telegram, failed refresh, signed recent activity, legacy expiry, zero/debt states, keyboard focus, a narrow screen, and long amounts. Verify one user cannot view another user's voice file or wallet history.

## Deployment

Deploy bot and web from the same revision because settings, pricing and `/api/practice` request contracts are shared. Run `npm run db:indexes` for the new wallet/usage indexes and `npm run telegram:setup` to refresh the command menu. These commands were not executed during implementation; no live payments or messages were sent. MongoDB must support transactions, as it did before this change.
