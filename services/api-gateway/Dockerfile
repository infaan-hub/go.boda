FROM node:22-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/logger/package.json packages/logger/
COPY services/api-gateway/package.json services/api-gateway/
RUN pnpm install --frozen-lockfile || pnpm install
COPY packages/shared-types packages/shared-types
COPY packages/logger packages/logger
COPY services/api-gateway services/api-gateway
RUN pnpm --filter @goboda/shared-types build \
  && pnpm --filter @goboda/logger build \
  && pnpm --filter @goboda/api-gateway build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app .
EXPOSE 4000
CMD ["node", "services/api-gateway/dist/index.js"]
