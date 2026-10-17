# English Coach — design context

## North Star

An expressive pink learning notebook with a calm, adult workspace. The learner sees their own sentence become clearer, then knows what to practice next. The correction pair is the signature, not a mascot or invented performance score.

## Audience and register

Ukrainian-speaking adult students and professionals; Telegram on mobile and a desktop companion. Product UI is English, conversation and learning targets are English. Explanations default to Ukrainian and follow an explicitly saved native-language preference. No Japan market scope.

## Visual direction

Blush-white study space, near-black ink and desktop sidebar, pink primary actions and dashboard hero, restrained green corrections. The approved brand pair is pink #FF79AC (primary) and near-black #121118. Pink carries emphasis; dark text on pink preserves readability. A slightly rotated annotated sentence sheet is confined to the dashboard illustration. No stock imagery, fake charts, gradients, childish rewards, or fabricated user history.

## Tokens

Runtime owner: `src/app/globals.css` `:root`; this document describes that source, not generated artifacts.

- Background `--bg` #faf7f9; surface `--surface` #ffffff.
- Text and sidebar `--ink` #121118; secondary `--muted` #706773.
- Action `--primary` #ff79ac; hover `--primary-hover` #f4619a; tint `--primary-tint` #fff0f6.
- Text on pink `--on-primary` #121118; links and focus `--primary-text` / `--focus` #9d2859. Bright pink is a fill, not small text on white.
- Inverse text `--inverse` #fff8fb; secondary `--inverse-muted` #bcb2c0; divider `--inverse-line` #35303d; hover `--inverse-hover` #26212d.
- Input border `--field-line` #b6a6b0; keyboard focus uses the darker rose token on light surfaces and pink in the sidebar.
- Correction `--green` #25735b; mistake `--red` #a74758.
- Border `--line` #ece4e9; radius `--radius` 22px.
- Scrollbar tokens: `--scroll-thumb` #b9a6b2, `--scroll-track` #f2eaf0, `--scroll-hover` #947b8a, `--scroll-active` #745768.

## Typography

Body: Avenir Next → Segoe UI → Arial. Display: Trebuchet MS → Avenir Next. Editorial sample: Georgia. Local fonts avoid external font requests and late layout shifts. English examples preserve normal sentence case.

## Layout and spacing

Fixed 242px desktop sidebar; max 1400px workspace, 42px page inset. Below 760px: document scrolling, 18px inset, five-item bottom navigation with safe-area support. Profile remains accessible in header; progress remains a desktop navigation item and is linked from the mobile dashboard. Main cards use 22px radius and 20–25px inner spacing.

Public homepage: ordinary browser visits render an English landing immediately, including when a session cookie exists. Telegram launch data selects the existing Mini App; server verification still owns authentication. The landing uses the same runtime tokens and local typefaces, a 1120px maximum width, and a Telegram conversation inside a phone frame, clearly labeled as an example. The public brand is English Mova Bot, with a pink circular avatar containing a dark speech bubble and pink “e.”, recreated as an inline SVG from the supplied reference. The example shows an English conversation, corrections and a Ukrainian explanation; phone chrome and the composer are static illustrations. Below 760px, the offer, three benefits and Telegram CTA precede the phone and supporting detail, with natural document scrolling and safe-area insets. The CTA links directly to the configured bot with `start=web`; no invented claims about pricing, learner counts or results.

## Components and motion

The landing hero explicitly introduces the product as a Telegram bot in its eyebrow, headline and lead. A blue circular Telegram plane logo appears in the eyebrow; the “Open bot in Telegram” CTAs have no Telegram logo. This platform mark is scoped to the landing and does not change the pink product palette.

Primary buttons use pink with dark labels; the CTA within the pink hero uses near-black with light text. Active desktop and mobile navigation use pink fills. Chart bars and meters use the primary pink. Error and success colors retain their semantic meaning.

Shared Button, Empty and Meter in `src/components/ui.tsx`; shared heading, filter and pagination in coach-app. Busy buttons preserve width. Loading uses a status spinner, no skeleton. Motion is limited to hover and pending state; reduced motion disables animation.

## Content and data honesty

No sample stats in authenticated UI. Level is a provisional writing estimate from learner messages, shown as estimated; no certified CEFR or all-skills claim. Accuracy means messages without detected mistakes. Skill mastery means review stage, not language proficiency. Legacy goal minutes remain in stored profiles for compatibility but are no longer collected or displayed.

## Verification

Static audit artifact: `docs/premium-audit.json`. Runtime, responsive screenshots, build and typecheck are deliberately deferred per user instruction; no runtime quality claim is made.

## Telegram conversation interface

Telegram owns the native message and inline-button appearance. Bot onboarding uses short English questions, one persisted step at a time, native callback buttons and Back. Onboarding asks explanation language, learning goal, reply format and daily conversation time in India (Asia/Kolkata). Interests are learned from conversation; optional manual interests remain in the web profile. Settings share the core schema with the web profile. Ordinary chat replies and daily conversation starters have no website button; explicit app/section commands retain navigation. Conversation prompts use English at the learner's level and explanations use the saved native language.

Premium uses shared native Telegram buttons for 7 days (60 Stars) and 30 days (250 Stars), both one-time purchases without automatic renewal. `/premium` opens the same plan selector used by access-limit messages; payment extends any active access by the purchased duration. Plan labels, invoices, and payment validation derive from the core billing plan list. Existing 30-day invoices and buttons remain valid.

## Administration

Trial usage reuses the administration table with four columns: Telegram username (fallback: saved name or ID), used quota slots with the user's local day, total saved user messages across all days and plans, and last quota reservation time in Kyiv. Each row represents one user/day, newest activity first. Legacy entries have no exact time and display a dash; their local day provides approximate ordering. Username is refreshed from authenticated Telegram data; quota timestamps are written only for new reservations, not retries. Premium messages do not consume trial quota; they are included in Total messages, which counts saved messages and excludes bot replies and failed unsaved requests.

All administration timestamps use a 24-hour clock (00:00–23:59), owned by the shared `formatDate` formatter in `apps/web/src/components/uzerz.tsx`.

`/uzerz` is a public, read-only data workspace with a standalone main-content layout; Telegram authentication is not required. It reuses the pink table-header tint, panel, filter buttons, native OS-owned selects and shared pagination. Wide semantic tables own horizontal overflow and a bounded vertical scroller; the page keeps document scrolling. Full long values expand in place. Registration and other timestamps include the year and time, use Europe/Kyiv with automatic daylight-saving adjustment, and are explicitly labeled Kyiv time. This display timezone applies only to administration; stored dates and user schedule settings retain their original meaning.

## Conversation preferences

Reuse Profile, OnboardingChoices, LanguageSelect and native labeled selects without new visual tokens. Web onboarding has four steps: explanation language, learning goal, Telegram reply format, schedule in India Standard Time (Asia/Kolkata). Telegram also has four steps; time zone is fixed and is not collected. Reply format applies to ordinary replies, first conversations and daily starters; service messages remain text. Legacy profiles retain voice replies until changed. Voice retains transcript and text fallback. Web chat remains text. Learned interests and provisional level are stored separately from manual preferences.
