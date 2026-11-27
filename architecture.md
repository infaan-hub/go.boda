# Go.boda — Modular Monolith Architecture

Go.boda ships as one Next.js application and one Vercel container service in the
`zan-go.boda` project. Customer, Admin, and Partner remain distinct product
roles with their existing pages and visual styles.

## Public routes

| Route | App surface |
| --- | --- |
| `/` and customer pages | Customer web and PWA |
| `/admin/*` | Admin operations console |
| `/partner/*` | Rider and Driver PWA |
| `/api/ops/*` | Admin API handlers |
| `/api/partner/*` | Partner API handlers |
| `/api/v1/*` | Versioned backend API, dispatched in-process |
| `/healthz`, `/readyz` | Health and readiness checks |

## Code layout

- `apps/monolith/src/app` — The Next.js App Router and Customer surface.
- `apps/monolith/src/roles/admin/src` — Existing Admin components, pages, and API handlers mounted under `/admin` and `/api/ops`.
- `apps/monolith/src/roles/partner/src` — Existing Partner components, pages, and API handlers mounted under `/partner` and `/api/partner`.
- `apps/monolith/src/server/domains` — Auth, operator, geo-zone, location, pricing, dispatch, trip, payment-wallet, notification, and safety Fastify domain modules. These are loaded in-process; none starts a separate server.
- `apps/monolith/src/server/gateway` — Shared API security, rate limits, request IDs, and in-process routing.
- `packages/*` — Shared database, types, UI, i18n, events, and logging code.

## Local development

```sh
pnpm install
pnpm dev
```

The single app listens on port `3000`. Configure runtime secrets and external
provider credentials in `.env.local` using `.env.example` as a guide.

## Vercel deployment

`vercel.json` selects one container application. The root `Dockerfile.vercel`
builds and serves the complete site and API from that single deployment.
`Dockerfile.vercel` builds the workspace and runs the Next.js standalone server.
Use the Vercel project `zan-go.boda` and its domain `zan-goboda.vercel.app`.
