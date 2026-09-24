FROM node:22-bookworm-slim
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/bot/package.json ./apps/bot/package.json
COPY packages/core/package.json ./packages/core/package.json
RUN npm ci --omit=dev --workspace @engbot/bot --workspace @engbot/core --include-workspace-root=false

COPY tsconfig.base.json ./
COPY packages/core ./packages/core
COPY apps/bot ./apps/bot

ENV NODE_ENV=production
USER node
WORKDIR /app/apps/bot
CMD ["node", "--import", "tsx", "src/server.ts"]
