FROM node:22-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages packages
COPY services/operator-service services/operator-service
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @goboda/operator-service... build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app .
EXPOSE 4002
CMD ["node", "services/operator-service/dist/index.js"]
