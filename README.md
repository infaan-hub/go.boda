# Go.boda — Unguja Island Bodaboda & Bajaji Platform

**Go.boda** is a modular monolith built for **Unguja Island, Zanzibar**, connecting customers with verified Bodaboda Riders and Bajaji Drivers. Customer, Admin, and Partner keep separate role pages and styles in one Next.js app.

## Documentation
* [prd.md](./prd.md) — Product Requirements Document
* [architecture.md](./architecture.md) — Current monolith routes, code layout, and Vercel deployment
* [app-flow.md](./app-flow.md) — End-to-End App Flows, State Machine & Settlement Flows
* [implementation.md](./implementation.md) — Project Scope & Phased Implementation Plan

## Workspace Layout
* `apps/monolith` — Customer, Admin, and Partner web/PWA surfaces plus in-process API domains
* `packages/*` — Shared database, types, events, i18n, UI, and logging
* `infra/` — Local PostgreSQL/PostGIS and supporting development infrastructure

## Quick Start
```bash
# 1. Install workspace dependencies
pnpm install

# 2. Copy environment template
cp .env.example .env

# 3. Run all app roles and API domains together
pnpm dev
```
