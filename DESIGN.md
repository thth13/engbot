# English Coach — design context

## North Star

An expressive pink learning notebook with a calm, adult workspace. The learner sees their own sentence become clearer, then knows what to practice next. The correction pair is the signature, not a mascot or invented performance score.

## Audience and register

Russian-speaking adult students and professionals; Telegram on mobile and a desktop companion. Product UI is Russian, conversation and learning targets are English. Explanations follow the saved native language. No Japan market scope.

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

## Components and motion

Primary buttons use pink with dark labels; the CTA within the pink hero uses near-black with light text. Active desktop and mobile navigation use pink fills. Chart bars and meters use the primary pink. Error and success colors retain their semantic meaning.

Shared Button, Empty and Meter in `src/components/ui.tsx`; shared heading, filter and pagination in coach-app. Busy buttons preserve width. Loading uses a status spinner, no skeleton. Motion is limited to hover and pending state; reduced motion disables animation.

## Content and data honesty

No sample stats in authenticated UI. Level comes from self-report, not an inferred CEFR result. Accuracy means messages without detected mistakes. Skill mastery means review stage, not language proficiency. Goal minutes are a preference, not tracked study time.

## Verification

Static audit artifact: `docs/premium-audit.json`. Runtime, responsive screenshots, build and typecheck are deliberately deferred per user instruction; no runtime quality claim is made.
