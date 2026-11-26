# Go.boda Local Infrastructure

This folder contains the containerized local infrastructure supporting Go.boda's 10-service microservice architecture:

- **PostgreSQL 16 + PostGIS** (`localhost:5432`) — Automatically initializes 10 isolated service databases (`auth_db`, `operator_db`, `geo_db` with PostGIS, `location_db`, `pricing_db`, `dispatch_db`, `trip_db`, `finance_db`, `notif_db`, `safety_db`).
- **Redis 7** (`localhost:6379`) — Powers Geospatial nearby indexing, atomic dispatch locks, Pub/Sub, and BullMQ queues.
- **NATS JetStream** (`localhost:4222`, monitoring at `http://localhost:8222`) — Asynchronous domain Event Bus.

## Commands
```bash
# Start all containers in detached mode
pnpm infra:up

# View logs
pnpm infra:logs

# Stop containers
pnpm infra:down
```
