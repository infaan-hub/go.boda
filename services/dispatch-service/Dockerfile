FROM node:22-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages packages
COPY services/dispatch-service services/dispatch-service
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @goboda/dispatch-service... build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app .
EXPOSE 4006
CMD ["node", "services/dispatch-service/dist/index.js"]
