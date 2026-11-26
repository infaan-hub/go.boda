FROM node:22-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages packages
COPY services/pricing-service services/pricing-service
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @goboda/pricing-service... build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app .
EXPOSE 4005
CMD ["node", "services/pricing-service/dist/index.js"]
