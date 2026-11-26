FROM node:22-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages packages
COPY services/notification-service services/notification-service
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @goboda/notification-service... build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app .
EXPOSE 4009
CMD ["node", "services/notification-service/dist/index.js"]
