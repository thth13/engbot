# Verification evidence

## Railway without Dockerfile (2026-09-24)

- Removed `apps/bot/Dockerfile` and `.dockerignore`.
- Switched `railway.json` to Railpack with `buildCommand: "true"` to skip the root web build, and `startCommand: "npm run start:bot"`.
- Updated deployment instructions; reviewed configuration and script paths statically.
- No build, application startup, tsc or live deployment performed for this change.
- The Docker-specific dependency-plan check below describes the previous configuration, not the current Railpack install.

## Workspace split (2026-09-24)

- Split into `@engbot/web`, `@engbot/bot`, and `@engbot/core`; updated root npm lockfile with installation lifecycle scripts disabled.
- `npm ls --workspaces --depth=0`: passed; all three workspaces resolve their dependencies.
- `npm run lint`: passed, no errors or warnings after the split.
- Prettier applied to changed source, configuration and documentation.
- Simulated the Docker manifest layout in a temporary directory and ran `npm ci --dry-run --offline --ignore-scripts --omit=dev --workspace @engbot/bot --workspace @engbot/core --include-workspace-root=false`: passed. The install plan excludes Next.js and React. This was a dependency-plan check, not a Docker build.
- Static import review: bot and shared core do not import Next.js or `server-only`; the browser imports only the shared schema module.
- Existing `.env.local` values preserved; appended an empty `TELEGRAM_WEBHOOK_URL` placeholder if missing.
- Build, Docker build, application startup, tsc, live database operations, Telegram registration and platform deployment: not run. Runtime verification remains with the user per their instruction. Deployment steps: [DEPLOYMENT.md](DEPLOYMENT.md).

## Earlier implementation evidence

- `npm install --ignore-scripts --no-audit --no-fund`: completed; package-lock.json created. Install scripts intentionally not executed.
- Prettier: applied to source, configuration and maintained documentation.
- `npm run lint`: passed, no errors or warnings.
- Premium static UI audit, strict mode: passed, zero findings. Artifact: `premium-audit.json`.
- Build, application startup and tsc: not run, explicitly requested by user.
- Browser, Telegram webhook, MongoDB transaction and live AI integration checks: not run. They require environment configuration and user runtime verification. See README checklist.

A clean static audit and lint do not establish typecheck, runtime correctness or accessibility conformance.
