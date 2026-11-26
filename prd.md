# Go.boda — Product Requirements Document (PRD)

> **Document Version:** 2.0 (Microservices Edition)  
> **Product Name:** **Go.boda**  
> **Companion Documents:** [architecture.md](file:///E:/Go.boda/architecture.md) | [app-flow.md](file:///E:/Go.boda/app-flow.md) | [implementation.md](file:///E:/Go.boda/implementation.md)  
> **Platform:** Next.js Web & PWA Clients + Distributed Microservices Architecture  
> **Service Area:** Unguja Island, Zanzibar (Strictly Geofenced)  
> **Transport Categories:** **Bodaboda** (operated by **Riders**) & **Bajaji** (operated by **Drivers**)

---

## 1. Executive Summary & Vision

**Go.boda** is a modern, hyper-local ride-hailing web and PWA platform built exclusively for **Unguja Island, Zanzibar**. It enables **Customers** to discover and request nearby **Bodaboda** (motorcycle taxi) or **Bajaji** (three-wheeled auto-rickshaw) transport on demand, connecting them directly with verified **Bodaboda Riders** and **Bajaji Drivers** who complete the trip and receive fair, transparent payment according to the trip.

Today, getting a bodaboda or bajaji in Unguja relies on street hailing, informal stages (*vituo*), and unpredictable fare negotiation—leading to price disputes, long wait times, inconsistent helmet use, and idle hours for operators. **Go.boda** modernizes this workflow on a resilient **microservice architecture** built for Unguja's everyday reality: lightweight zero-install Next.js web & PWA clients, clear upfront TZS pricing, live nearby transport visibility, support for both **Cash (TZS)** and **Mobile Money / Card**, smart handling of **Stone Town's narrow pedestrian alleys**, and fast per-trip payouts for Riders and Drivers.

### Role Definitions (Canonical Platform Terminology)
| Role | Definition |
| :--- | :--- |
| **Customer** | Any person on Unguja Island requesting nearby Bodaboda or Bajaji transport. |
| **Rider** | A verified **Bodaboda** (motorcycle) operator accepting and fulfilling `Go.boda` trips. |
| **Driver** | A verified **Bajaji** (three-wheeler) operator accepting and fulfilling `Go.bajaji` trips. |
| **Admin** | A Go.boda operations team member managing onboarding verification, zones, pricing, safety, and payouts. |

### Core Value Proposition
| Stakeholder | Current Pain Point | Go.boda Solution |
| :--- | :--- | :--- |
| **Customers** | Unpredictable haggling, difficulty finding nearby transport in rain/night, walking far to a *kituo*, safety uncertainty | See nearby Bodabodas and Bajajis live on the map, book either option in seconds, upfront TZS pricing, verified Riders & Drivers, helmet & PIN safety |
| **Bodaboda Riders** | Long idle hours waiting at *vituo*, empty return trips, inconsistent daily earnings | Instant nearby trip requests, less dead mileage, transparent per-trip earnings, fast Mobile Money cash-out |
| **Bajaji Drivers** | Difficulty matching with Customers carrying bags or traveling in small groups, uneven demand | Targeted Bajaji requests from nearby Customers, fair distance-based TZS fares, reliable digital & cash settlement |

---

## 2. Unguja-Specific Modernizations

Rather than copying a generic mainland ride-hailing app, **Go.boda** is designed around Unguja's roads, neighborhoods, and mobile environment:

1. **Strict Unguja-Only Geofencing:** Active service polygons in `geo-zone-service` cover all of **Unguja Island** (Stone Town, Ng'ambo, Urban West, North, East, and South coasts) while blocking requests originating from or targeting Pemba Island or Mainland Tanzania.
2. **Live Nearby Transport Discovery (Bodaboda or Bajaji):** As soon as a Customer opens Go.boda, `location-service` streams nearby online **Bodabodas** and **Bajajis** around them with real-time ETAs, letting them choose whichever transport fits their trip.
3. **Stone Town Smart Perimeter Snapping:** Because Stone Town's historic pedestrian alleys restrict motorized access, pins placed inside pedestrian-only zones automatically snap to the nearest drivable perimeter pickup point (e.g., Creek Road, Darajani, Forodhani edge, Malindi, Mnazi Mmoja) and display a short walking path to the Customer.
4. **Landmark & *Kituo* First Search:** Because many Unguja lanes lack formal street numbers, search prioritizes recognizable Unguja landmarks, markets, beaches, ferry terminal, airport, neighborhoods, and *vituo* (stages), paired with map pin-dropping and quick pickup notes (e.g., *"Near the blue gate"*).
5. **Zero-Install Web + Lightweight PWA:** Customers can book immediately from any mobile browser (or install `customer-web` as a PWA) without downloading a heavy app-store binary. Riders and Drivers install `partner-pwa` to their home screen (< 5 MB) with 3G/offline resilience, audio chimes, vibration, and Web Push alerts.
6. **Bilingual UI (Kiswahili & English):** Instant 1-tap toggle between natural **Kiswahili** (*Agiza Usafiri*, *Kituo*, *Lipa kwa Pesa Taslimu / Simu*) and **English**.
7. **Flexible Per-Trip Payments:** Supports **Cash (TZS)** (with a "Change Needed" indicator so Riders/Drivers bring small notes), Tanzanian **Mobile Money** STK Push (Mixx by Yas, M-Pesa, Airtel Money, HaloPesa), and **Card** payments.
8. **Built-in Safety & Accountability:** Platform-verified Rider & Driver onboarding, mandatory **4-digit Trip Start PIN**, Bodaboda helmet check confirmation, 1-tap **WhatsApp Live Trip Sharing**, and an **SOS Emergency Button**.

---

## 3. Target Users & Personas

### 3.1 Customer (*Mteja*)
* **Profile:** Anyone traveling within Unguja—commuters, students, shoppers, residents, or visitors moving between homes, offices, markets, beaches, the ferry terminal, or the airport.
* **Needs:** Quickly find and request a nearby Bodaboda or Bajaji, transparent upfront TZS fare with no haggling, choice of Cash, Mobile Money, or Card payment, bilingual Kiswahili/English interface, and safe verified pickups.

### 3.2 Bodaboda Rider (*Mpanda Bodaboda / Rider*)
* **Profile:** Licensed Unguja motorcycle operator (self-owned or working under a *hesabu* / *mkataba* arrangement) based at a local *kituo* or roaming urban/coastal corridors.
* **Needs:** Simple Kiswahili/English PWA, loud audio + vibration + push notifications on incoming nearby requests, outdoor-readable high-contrast UI, minimal mobile data use, and fast daily withdrawals to Mobile Money.

### 3.3 Bajaji Driver (*Dereva wa Bajaji / Driver*)
* **Profile:** Licensed Unguja three-wheeler (Bajaji) operator serving Customers traveling in groups of up to 3 or carrying shopping/luggage.
* **Needs:** Clear distinction of Bajaji-specific jobs, upfront fare and pickup/dropoff distance before accepting, smooth navigation to pickup, and reliable per-trip earnings tracking.

### 3.4 Fleet Owner (*Mmiliki* — Post-MVP)
* **Profile:** Vehicle owner leasing 2–15 Bodabodas or Bajajis to Riders and Drivers.
* **Needs:** Transparent visibility into vehicle utilization, daily targets (*hesabu*), and trip summaries.

### 3.5 Go.boda Operations Admin
* **Profile:** Go.boda internal support, safety, and operations team in Zanzibar.
* **Needs:** Rider & Driver KYC review, live Unguja map monitoring, SOS alert response, zone/tariff configuration, and payment/payout ledger management.

---

## 4. Geographic Scope & Zoning (Unguja Only)

> **Hard Geofence Rule:** Both **Pickup** and **Dropoff** coordinates must fall inside the **Unguja Island PostGIS Polygon** managed by `geo-zone-service`. Any request outside Unguja (including Pemba Island and Mainland Tanzania) is blocked with a clear notice explaining Go.boda operates exclusively on Unguja Island.

### Operating Zones
| Zone | Key Areas Covered | Operational Notes |
| :--- | :--- | :--- |
| **Zone A: Stone Town Core** | Historic pedestrian quarter | **Perimeter-snap enabled.** Pickup/dropoff auto-snapped to nearest drivable edge road with Customer walking path. |
| **Zone B: Urban West & Suburbs** | Ng'ambo, Darajani, Malindi, Mwanakwerekwe, Kikwajuni, Bububu, Fuoni, Chukwani, Kisauni (Airport) | Highest density of Bodaboda Riders and Bajaji Drivers; primary MVP launch corridor. |
| **Zone C: North Coast** | Nungwi, Kendwa, Fukuchani, Matemwe | High demand for village hops, beach rides, and evening pickups. |
| **Zone D: East & South-East Coast** | Kiwengwa, Pwani Mchangani, Pongwe, Uroa, Bwejuu, Paje, Jambiani, Michamvi | Popular coastal strip; Bajajis preferred for groups and bags, Bodabodas for fast solo trips. |
| **Zone E: South & West Coast** | Fumba, Tunguu, Makunduchi, Kizimkazi | Lower operator density; wider search radius (up to 6 km) automatically applied. |

### Distance Guidelines
* **Bodaboda (`Go.boda`):** Optimized for **0.5 km – 20 km** trips (soft advisory above 20 km suggesting `Go.bajaji` for comfort).
* **Bajaji (`Go.bajaji`):** Optimized for **0.5 km – 35 km** trips (configurable via Admin Panel).

---

## 5. Distributed Product Suite (Next.js Apps + Microservices)

Go.boda is distributed across **3 independent Next.js Web & PWA frontends**, an **API Gateway**, an **Event Bus**, and **10 Domain Microservices** (full technical detail in [architecture.md](file:///E:/Go.boda/architecture.md)):

### Frontend Applications
1. **`customer-web` (Next.js Web & PWA):** Live nearby Bodaboda & Bajaji map, transport request booking, live tracking, payments, safety tools, and trip history.
2. **`partner-pwa` (Next.js Rider & Driver PWA):** Adaptive operator portal for **Bodaboda Riders** and **Bajaji Drivers**—onboarding KYC, online/offline toggle, incoming trip requests, navigation handoff, trip PIN verification, and per-trip earnings/wallet payouts.
3. **`admin-web` (Next.js Admin Dashboard):** Desktop-first management console for KYC approval, live Unguja map, dynamic tariffs, financial ledger, and SOS response.

### Distributed Backend Services (10 Core Microservices + API Gateway)
1. **`api-gateway`** — Unified HTTPS/WSS edge, JWT/RBAC verification, rate limiting, routing.
2. **`auth-service`** — Phone OTP, Google/Email auth, JWT sessions, user roles & language.
3. **`operator-service`** — Bodaboda Rider & Bajaji Driver KYC, Z-plates, *vituo*, approval & eligibility.
4. **`geo-zone-service`** — PostGIS Unguja polygon validation, Stone Town perimeter snapping, landmarks & routing.
5. **`location-service`** — High-throughput WebSocket GPS ingestion, nearby Bodaboda/Bajaji discovery, live trip tracking.
6. **`pricing-service`** — Upfront TZS fare quotes, Bodaboda/Bajaji tariffs, capped multipliers, wait/cancel fees.
7. **`dispatch-service`** — Targeted nearby matching (Riders vs Drivers), 20s offer TTLs, atomic Accept locks.
8. **`trip-service`** — Trip State Machine, 4-digit Start PIN, trip history, digital receipts, ratings & helmet checks.
9. **`payment-wallet-service`** — Cash (TZS), Mobile Money STK Push, Cards, ACID Earnings & Commission Float wallets, payouts.
10. **`notification-service`** — Web Push (VAPID), WhatsApp Cloud API, SMS fallback, bilingual preset quick-chat.
11. **`safety-service`** — In-trip SOS workflow, shareable `/track/[shareToken]` links, Bodaboda helmet non-compliance tracking.

---

## 6. Functional Requirements

### 6.1 Customer App (`customer-web` — Web & PWA)

#### A. Authentication & Preferences (MVP)
* **Fast Sign-In (`auth-service` + `notification-service`):** Phone number OTP via **WhatsApp OTP** (primary) with **SMS OTP** fallback, plus optional **Google Sign-In / Email Magic Link**.
* **Bilingual Switcher:** Persistent 1-tap switch between `Kiswahili` (SW) and `English` (EN).
* **Guest Discovery:** Unauthenticated Customers can view nearby Bodabodas and Bajajis on the Unguja map and preview upfront fares before signing in to confirm a request.

#### B. Nearby Transport Discovery & Request Booking (MVP)
* **Live Nearby Map (`location-service`):** Auto-detects Customer GPS (clipped to Unguja bounds) and displays real-time icons of nearby available **Bodabodas** and **Bajajis** around the Customer.
* **Pickup & Dropoff Selection (`geo-zone-service`):** Map pin drag + autocomplete combining geocoding and Go.boda's curated **Unguja Landmarks & *Vituo* Database** (markets, beaches, ferry terminal, airport, neighborhoods, hotels, hospitals).
* **Stone Town Smart Snap (`geo-zone-service`):** Clear alert when a pin inside Stone Town is snapped to the nearest accessible edge road (e.g., *"Snapped to Creek Road — 2 min walk from your location"*).
* **Pickup Note & Quick Chips:** Optional short note or preset chips (*"At main gate"*, *"By the shop"*, *"Have luggage"*).
* **Choose Nearby Transport Type (`pricing-service`):**
  * **Bodaboda (`Go.boda`):** 1 Passenger • Fastest • Helmet included • Operated by a nearby **Rider** • Upfront TZS fare + ETA.
  * **Bajaji (`Go.bajaji`):** Up to 3 Passengers • Covered & luggage friendly • Operated by a nearby **Driver** • Upfront TZS fare + ETA.
* **Upfront TZS Pricing:** Displays exact trip fare in **Tanzanian Shillings (TZS)** before confirming the request.

#### C. Matching, Live Tracking & Trip Execution (MVP)
* **Real-Time Dispatch Search (`trip-service` + `dispatch-service`):** Animated search state contacting the closest available Rider (for Bodaboda) or Driver (for Bajaji), with 1-tap cancel prior to pickup.
* **Assigned Rider / Driver Card:** Displays Operator Name, Verified Photo, Star Rating, Role (`Bodaboda Rider` or `Bajaji Driver`), Vehicle Model & Color, **Plate Number (`Z...`)**, Home *Kituo*, Live ETA, and live moving GPS marker.
* **4-Digit Trip PIN (`trip-service`):** Unique 4-digit PIN displayed to the Customer and shared verbally with the Rider/Driver to start the trip securely.
* **In-Trip Communication (`notification-service`):** Preset bilingual quick-chat (auto-translated between Swahili & English, e.g., *"Niko nje"* / *"I am outside"*) + 1-tap Call / WhatsApp button.
* **Live Trip Tracking (`location-service`):** Real-time GPS tracking from pickup to dropoff.

#### D. Safety Suite (`safety-service` — MVP)
* **Share Live Trip:** Generates a time-limited public tracking link (`/track/[shareToken]`) shareable in 1 tap via **WhatsApp** or SMS.
* **SOS Emergency Button:** Available throughout active trips; notifies Go.boda Admin Operations immediately with live GPS, plate number, and trip ID, plus quick-dial emergency access.
* **Helmet Confirmation (Bodaboda Trips):** Simple yes/no check verifying that the Bodaboda Rider provided a passenger helmet.

#### E. Payment Per Trip, Receipts & Ratings (`payment-wallet-service` + `trip-service` — MVP)
* **Payment Options (Selected Pre-Trip):**
  * **Cash (TZS):** Includes optional **"Need change for 10,000 / 20,000 TZS?"** note shown to the Rider/Driver.
  * **Mobile Money:** Mixx by Yas, M-Pesa, Airtel Money, HaloPesa (triggers STK/USSD Push upon trip completion).
  * **Card Payment:** Visa/Mastercard checkout.
* **Digital Receipt:** Complete breakdown of pickup, dropoff, distance, duration, transport type, fare paid in TZS, payment method, and plate number.
* **Ratings & Tipping:** 1–5 star rating, feedback tags (*Safe riding/driving*, *Clean helmet*, *Polite*, *Fast pickup*, *No helmet*), and optional digital tip.

---

### 6.2 Rider & Driver App (`partner-pwa`)

The `partner-pwa` app automatically adapts its labels, icon cues, and checklists based on the operator's registered transport type in `operator-service`:
* **Bodaboda Account -> Rider Mode** (displays *Bodaboda Rider*, helmet checklist, 1-passenger limit).
* **Bajaji Account -> Driver Mode** (displays *Bajaji Driver*, 3-passenger & luggage guidance).

#### A. Onboarding & Platform Verification (`operator-service` — MVP)
Prospective Riders and Drivers register via phone OTP and submit verification details via mobile camera:
1. Transport Role Selection: **Bodaboda (Rider)** or **Bajaji (Driver)**.
2. Full Name, Phone Number, Profile Selfie, and Home *Kituo* (Operating Stage).
3. Government-Issued ID (ZanID or NIDA).
4. Valid **Driving License** matching Motorcycle (Rider) or Bajaji (Driver).
5. Vehicle Information: Make/Model, Color, **Plate Number (`Z...`)**, and valid Insurance details.
6. Photos: Front & rear vehicle photos (plate clearly visible) + **2 Helmets photo** (mandatory for Bodaboda Riders).
7. Payout Details: Verified Mobile Money number for receiving trip earnings.
8. **Verification Gate:** Account remains `PENDING_VERIFICATION` until approved by a Go.boda Admin.

#### B. Going Online & Receiving Nearby Requests (`location-service` + `dispatch-service` + `notification-service` — MVP)
* **Online / Offline Switch:** Requires active GPS permission, verified status in `operator-service`, and Commission Float above the minimum threshold (`payment-wallet-service`).
* **PWA Alert Reliability:** Activates **Screen Wake Lock** while online, registers **Web Push Notifications**, and plays an audible chime + vibration when a nearby Customer request arrives.
* **Outdoor Sunlight Mode:** High-contrast theme with oversized tap targets for readability in bright Unguja daylight.
* **Incoming Request Modal (20-Second Countdown):**
  * Displays Pickup Landmark & Distance to Pickup, Dropoff Area, Estimated Trip Distance, **Estimated Earnings (TZS)**, Payment Method (`Cash` / `Mobile Money` / `Card`), and Change Needed alert.
  * Large **Accept (*Kubali*)** and **Decline (*Kataa*)** buttons.

#### C. Trip Execution Workflow (`trip-service` + `payment-wallet-service` — MVP)
1. **Navigate to Pickup:** Displays pickup pin/note with 1-tap deep-link to **Google Maps** or **Waze** for voice turn-by-turn navigation.
2. **Mark Arrived (*Nimefika*):** Alerts the Customer and starts a 5-minute free wait timer.
3. **Enter Customer 4-Digit PIN & Start Trip (*Anza Safari*):** Locks trip start and begins live route tracking.
4. **In-Trip Mode:** Streams GPS updates every 3–5 seconds to `location-service`; SOS shortcut accessible.
5. **Complete Trip (*Maliza Safari*) & Receive Payment:**
   * **Cash Trip:** Displays exact TZS fare to collect -> Rider/Driver confirms *"Cash Received"* -> `payment-wallet-service` auto-deducts platform commission from Commission Float Wallet.
   * **Mobile Money / Card Trip:** Confirms digital payment via webhook -> `payment-wallet-service` credits `88%` net trip earnings immediately to **Earnings Wallet**.
6. **Rate Customer:** Quick 1–5 star rating, then automatically returns to the Online nearby queue.

#### D. Earnings, Commission Float & Payouts (`payment-wallet-service` — MVP)
* **Trip-by-Trip Earnings Ledger:** Daily and weekly view of completed trips, gross fares, commission, net earnings, cash collected, and withdrawable balance.
* **Dual-Balance Wallet:**
  * **Earnings Wallet (Withdrawable):** Accumulates net earnings from Mobile Money and Card trips with 1-tap **Withdraw to Mobile Money** (instant / same-day payout).
  * **Commission Float Wallet:** Covers platform commission owed on Cash trips. Easily topped up via Mobile Money STK Push; warns when approaching `-5,000 TZS` limit and pauses dispatch via `wallet.float_blocked` event until topped up.

---

### 6.3 Admin Operations Dashboard (`admin-web`)

Consumes all backend services via `api-gateway` with strict `ADMIN` RBAC + 2FA:
* **Rider & Driver Verification Queue (`operator-service`):** Inspect IDs, licenses, vehicle photos, plate numbers, insurance dates, and Bodaboda helmet photos; approve, reject with feedback, or suspend accounts.
* **Live Unguja Operations Map (`location-service` + `trip-service`):** Real-time overview of online Bodaboda Riders, online Bajaji Drivers, active trips, and active SOS alerts.
* **Zones, Landmarks & Tariff Management (`geo-zone-service` + `pricing-service`):** Configure base fare, per-km rate, per-min rate, minimum fare, wait fee, and commission % independently for `Go.boda` and `Go.bajaji`; manage Unguja polygons, Stone Town snap gates, and landmarks.
* **Financial Ledger & Payouts (`payment-wallet-service`):** Track GMV, commission revenue, Rider/Driver wallet balances, Mobile Money payout logs, and promo credits.
* **Support & Safety Desk (`safety-service` + `trip-service`):** Handle disputes, track Bodaboda helmet non-compliance flags, monitor cancellations, and resolve SOS incidents.

---

## 7. Pricing, Fare Calculation & Per-Trip Payment Model

### 7.1 Upfront Fare Formula (Managed by `pricing-service` — TZS)

$$\text{Estimated Fare} = \max\Big(\text{Min Fare},\; \big(\text{Base Fare} + (\text{Distance}_{\text{km}} \times \text{Rate}_{\text{km}}) + (\text{Duration}_{\text{min}} \times \text{Rate}_{\text{min}})\big) \times \text{Multiplier}\Big)$$

*Fares are rounded to the nearest **500 TZS** for straightforward cash handling.*

| Parameter | `Go.boda` (Bodaboda — Rider) | `Go.bajaji` (Bajaji — Driver) |
| :--- | :--- | :--- |
| **Base Fare** | 1,000 TZS | 2,000 TZS |
| **Per-Kilometer Rate** | 600 TZS / km | 1,000 TZS / km |
| **Per-Minute Rate** | 50 TZS / min | 100 TZS / min |
| **Minimum Fare** | 1,500 TZS | 3,000 TZS |
| **Night / Heavy Rain Multiplier Cap** | Max 1.25× | Max 1.25× |
| **Wait Time Fee (after 5 min)** | 100 TZS / min | 150 TZS / min |
| **Platform Commission** | 12% (configurable 0%–15%) | 12% (configurable 0%–15%) |

### 7.2 Per-Trip Settlement Rules
* **Cash Trips:** Customer pays 100% of fare directly to the Rider/Driver in TZS cash. `payment-wallet-service` debits `12%` commission from the Commission Float Wallet.
* **Digital Trips (Mobile Money / Card):** Payment settles into Go.boda's merchant account. `payment-wallet-service` credits `88%` net trip payout to the Earnings Wallet (auto-clearing any negative Commission Float first, with the remainder immediately withdrawable to Mobile Money).
* **Cancellation Policy:** Free for Customers within 2 minutes of assignment or if the Rider/Driver is delayed; small cancellation fee (500–1,000 TZS) if cancelled after arrival at pickup.

---

## 8. Technical Architecture Summary

*(See [architecture.md](file:///E:/Go.boda/architecture.md) for the complete service topology, port map, event catalog, and outbox/idempotency contracts.)*

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend Apps (3 PWAs)** | **Next.js (App Router, TypeScript)** + Tailwind CSS + shadcn/ui + `next-intl` + Serwist PWA | Independent lightweight deployments for Customers, Riders/Drivers, and Admins sharing `packages/ui` & `packages/i18n`. |
| **Monorepo & Build** | **pnpm Workspaces + Turborepo** | Fast shared TypeScript contracts across all 3 apps and 10 services. |
| **API Gateway** | **Fastify / NGINX / Kong** | Centralized HTTPS/WSS edge, JWT validation, RBAC, rate limiting, request tracing. |
| **Backend Services (10)** | **Node.js + TypeScript (Fastify / NestJS)** | Unified language with Next.js frontends, high async I/O performance, shared Zod DTOs. |
| **Event Bus** | **NATS JetStream** (or RabbitMQ) | Reliable async events with Transactional Outbox delivery across services. |
| **Databases (Per Service)** | **PostgreSQL 16** (+ **PostGIS** for `geo-zone-service`) + Prisma ORM | Strict database-per-service isolation, native spatial queries, ACID financial ledger. |
| **Geospatial & Queues** | **Redis Cluster** (Redis Geo + Atomic Locks + Pub/Sub + BullMQ) | Sub-second nearby Bodaboda/Bajaji matching & reliable background notifications. |
| **Maps & Routing** | **MapLibre GL JS + OpenStreetMap** + **OSRM / Mapbox Directions** | Protects unit economics on 1,500–5,000 TZS fares. |
| **Payments & Messaging** | **AzamPay / Selcom / ClickPesa** + **Stripe / Flutterwave** + **WhatsApp Cloud API / Africa's Talking** + **VAPID Web Push** | Full local Tanzanian Mobile Money + Card + reliable OTP/Push coverage. |

> **PWA Background GPS Note (`partner-pwa`):**
> Mobile browsers throttle background JavaScript timers when minimized. For Release 1, `partner-pwa` uses **Screen Wake Lock**, **Web Push Notifications** (`notification-service`), and standalone Home Screen mode. In Post-MVP, the exact same Next.js `partner-pwa` can be wrapped in a thin **Capacitor Android shell** for uninterrupted background GPS.

---

## 9. Non-Functional Requirements (NFRs)

* **3G Network Speed:** Initial PWA shell loads in < 2.5 seconds on 3G; minimal JS bundles via Next.js Server Components.
* **Service Isolation & Fault Tolerance:** Slow external gateways (WhatsApp, Mobile Money) never block `location-service` or `dispatch-service`; circuit breakers and dead-letter queues protect every async consumer.
* **Atomic Dispatch Locking:** `dispatch-service` uses Redis `SET NX` locks so two Riders or two Drivers can never accept the same Customer request.
* **Financial & Event Integrity:** Transactional Outbox pattern + idempotency keys on all `payment-wallet-service` ledger entries and HMAC-verified payment webhooks.
* **Security & Privacy:** Centralized JWT + RBAC at `api-gateway`, signed internal service headers, private R2/S3 signed URLs for KYC documents.
* **Observability:** End-to-end correlation IDs (`x-request-id`), structured JSON logs, `/healthz` probes, and OpenTelemetry tracing across all 10 services.

---

## 10. Key Performance Indicators (KPIs)

| Category | Metric | Target (First 90 Days) |
| :--- | :--- | :--- |
| **Dispatch Speed** | Average Match Time (Stone Town & Urban West) | < 60 seconds |
| **Fulfillment** | Trip Completion Rate | > 85% |
| **Supply Health** | Rider & Driver Request Acceptance Rate | > 75% |
| **Safety** | Bodaboda Helmet Confirmation Rate | > 95% |
| **Payments** | Digital Payment Adoption (Mobile Money + Card) | > 30% (growing to 50%+) |
| **Retention** | 30-Day Repeat Customer Rate | > 40% |
| **Reliability** | Core Booking & Dispatch Uptime | >= 99.5% |

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
| :--- | :--- | :--- |
| **Microservice operational overhead** | Slower local dev or deployment complexity | Use pnpm + Turborepo shared packages, unified Docker Compose for local dev, and standard service template (Fastify + Prisma + Pino). |
| **Initial supply density on Unguja** | Long wait times outside Urban West | Focus MVP pilot on Stone Town, Urban West, Airport & Ferry corridor; onboard *vituo* cohorts with 0% introductory commission. |
| **Cash trip commission leakage** | Negative float balances unpaid | Enforce `-5,000 TZS` float limit via `wallet.float_blocked` event with 1-tap Mobile Money top-up and automatic offset from digital earnings. |
| **PWA background GPS throttling** | Missed offers when screen locks | Screen Wake Lock + Web Push wakeups + chimes in MVP; wrap `partner-pwa` in Capacitor Android shell in Post-MVP. |
| **High Map API costs on small fares** | Erodes commission on 1,500–3,000 TZS trips | MapLibre GL + OSM tiles + OSRM routing + Redis-cached Unguja landmarks in `geo-zone-service`. |
