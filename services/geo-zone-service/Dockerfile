FROM node:22-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages packages
COPY services/geo-zone-service services/geo-zone-service
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @goboda/geo-zone-service... build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app .
EXPOSE 4003
CMD ["node", "services/geo-zone-service/dist/index.js"]
