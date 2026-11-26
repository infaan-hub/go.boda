# Go.boda — Unguja Island Bodaboda & Bajaji Platform

**Go.boda** is a microservice-based Next.js Web & PWA ride-hailing platform built exclusively for **Unguja Island, Zanzibar**, connecting **Customers** with nearby verified **Bodaboda Riders** (`Go.boda`) and **Bajaji Drivers** (`Go.bajaji`).

## Documentation
* [prd.md](./prd.md) — Product Requirements Document
* [architecture.md](./architecture.md) — 10-Service Microservices Architecture Blueprint
* [app-flow.md](./app-flow.md) — End-to-End App Flows, State Machine & Settlement Flows
* [implementation.md](./implementation.md) — Project Scope & Phased Implementation Plan

## Workspace Layout
* `apps/customer-web` — Customer Web & PWA (Port `3000`)
* `apps/partner-pwa` — Bodaboda Rider & Bajaji Driver PWA (Port `3001`)
* `apps/admin-web` — Operations Command Center (Port `3002`)
* `services/api-gateway` — Fastify Edge Gateway & Microservices Router (Port `4000`)
* `packages/*` — `@goboda/shared-types`, `@goboda/events`, `@goboda/i18n`, `@goboda/ui`, `@goboda/logger`
* `infra/` — Docker Compose (PostgreSQL 16 + PostGIS, Redis 7, NATS JetStream)

## Quick Start
```bash
# 1. Install workspace dependencies
pnpm install

# 2. Copy environment template
cp .env.example .env

# 3. Start local PostgreSQL/PostGIS, Redis & NATS (requires Docker)
pnpm infra:up

# 4. Run API Gateway + all 3 Next.js apps
pnpm dev
```
