FROM node:22-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages packages
COPY services/auth-service services/auth-service
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @goboda/auth-service... build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app .
EXPOSE 4001
CMD ["node", "services/auth-service/dist/index.js"]
