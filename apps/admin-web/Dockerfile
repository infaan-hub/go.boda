FROM node:22-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* tsconfig.base.json ./
COPY packages packages
COPY apps/admin-web apps/admin-web
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @goboda/admin-web... build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app .
EXPOSE 3002
CMD ["pnpm", "--filter", "@goboda/admin-web", "start"]
