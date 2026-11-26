# Go.boda — App Flow & System Interaction Blueprint

> **Companion Document to:** [prd.md](file:///E:/Go.boda/prd.md) & [implementation.md](file:///E:/Go.boda/implementation.md)  
> **Scope:** End-to-end UX journeys, Mermaid architecture & flow diagrams, trip state machine, real-time nearby matching sequence, per-trip payment settlement flows, edge-case matrix, and Next.js App Router structure for **Go.boda** (Unguja Island).

---

## 1. Canonical Role & System Overview

* **Customer:** Requests nearby transport on Unguja Island (chooses either **Bodaboda** or **Bajaji**).
* **Rider:** Verified **Bodaboda** operator who receives Bodaboda requests, completes trips, and receives payment per trip.
* **Driver:** Verified **Bajaji** operator who receives Bajaji requests, completes trips, and receives payment per trip.
* **Admin:** Go.boda operations team managing KYC verification, zones, tariffs, live safety alerts, and payouts.

```mermaid
flowchart LR
    subgraph Clients["Clients (Unified Next.js Web + PWA)"]
        C["Customer Web & PWA"]
        O["Rider (Bodaboda) & Driver (Bajaji) PWA"]
        A["Admin Operations Dashboard"]
    end

    subgraph Core["Go.boda Backend Platform"]
        API["Next.js App Router API & Auth"]
        RT["Realtime Dispatch & Socket Service"]
        GEO["Redis Geospatial Index (Nearby Bodabodas & Bajajis)"]
        DB[("PostgreSQL + PostGIS (Unguja Polygons & Ledger)")]
    end

    subgraph External["External Services"]
        MAP["MapLibre / OSM / OSRM Routing"]
        PAY["Mobile Money (AzamPay/Selcom) & Card Gateway"]
        MSG["WhatsApp OTP / SMS / Web Push"]
    end

    C <-->|HTTPS & Live Map| API
    C <-->|Nearby Fleet & Trip GPS| RT
    O <-->|HTTPS & Wallet| API
    O <-->|GPS Telemetry & Requests| RT
    A <-->|HTTPS & Admin APIs| API
    A <-->|Live Fleet & SOS Feed| RT

    API <--> DB
    RT <--> GEO
    RT <--> DB
    API <--> MAP
    API <--> PAY
    API <--> MSG
    RT -->|Push Alert| MSG
```

---

## 2. End-to-End Trip Lifecycle (Sequence Diagram)

Illustrates the complete interaction from a Customer viewing nearby Bodabodas and Bajajis on Unguja Island through matching with a Bodaboda **Rider** or Bajaji **Driver**, trip completion, and per-trip payment settlement.

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer (Web/PWA)
    participant API as Next.js API + PostGIS
    participant Dispatch as Dispatch Engine + Redis Geo
    actor Operator as Rider (Bodaboda) / Driver (Bajaji)
    participant Pay as Mobile Money / Card Gateway

    Customer->>Dispatch: Open App at Unguja GPS Location
    Dispatch-->>Customer: Stream Nearby Online Bodabodas & Bajajis on Map

    Customer->>API: Choose Pickup, Dropoff & Transport Type (Bodaboda or Bajaji)
    API->>API: Validate Unguja Island Polygon (PostGIS)
    API->>API: Snap to Stone Town Perimeter Gate (if inside pedestrian alleys)
    API-->>Customer: Return Route, ETA & Upfront TZS Fares (Go.boda & Go.bajaji)

    Customer->>API: Confirm Transport Request (Bodaboda or Bajaji + Payment Method)
    API->>Dispatch: Create Trip (SEARCHING) & Query Nearest Matching Operators
    Dispatch->>Dispatch: Redis GEOSEARCH by Transport Type (1.5km -> 3km -> 5km)
    Dispatch->>Operator: Push Nearby Request (Socket + Web Push + Chime, 20s TTL)

    Operator->>Dispatch: Tap Accept (Atomic Lock)
    Dispatch-->>Customer: Assigned (Rider/Driver Photo, Z-Plate, Live ETA, 4-Digit PIN)
    Dispatch-->>Operator: Send Pickup Pin, Note & Customer Contact

    loop Every 3-5 Seconds
        Operator->>Dispatch: Stream GPS (lat, lng, heading)
        Dispatch-->>Customer: Update Live Marker & ETA on Map
    end

    Operator->>API: Tap "Arrived at Pickup"
    API-->>Customer: Notify "Your Rider/Driver has arrived" (Start 5m Wait Timer)

    Customer->>Operator: Meet at Pickup & Share 4-Digit Trip PIN
    Operator->>API: Verify 4-Digit PIN -> Start Trip (IN_PROGRESS)
    API-->>Customer: Trip Started (Enable Live WhatsApp Share & SOS)

    Operator->>API: Reach Dropoff -> Tap "Complete Trip"
    alt Cash Payment (TZS)
        API-->>Operator: Show Exact TZS Fare to Collect
        Customer->>Operator: Pay Cash in TZS
        Operator->>API: Tap "Cash Received"
        API->>API: Deduct 12% Platform Commission from Commission Float Wallet
    else Mobile Money (STK Push) or Card
        API->>Pay: Initiate Per-Trip Payment Charge
        Pay-->>Customer: Mobile Money STK Push / Card Authorization
        Customer->>Pay: Approve Payment
        Pay-->>API: Verified Payment Webhook
        API->>API: Credit 88% Net Trip Earnings to Operator Earnings Wallet
    end

    API-->>Customer: Show Digital Receipt + Helmet Check (if Bodaboda) + Rate Rider/Driver
    API-->>Operator: Show Net Trip Earnings + Rate Customer -> Return to Online Queue
```

---

## 3. Trip State Machine

All trip transitions are strictly validated server-side so no client can skip PIN verification, double-accept a trip, or double-settle payment.

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Customer views nearby fleet & fare quote
    DRAFT --> SEARCHING: Customer requests Bodaboda or Bajaji

    SEARCHING --> OFFERED_TO_OPERATOR: Nearest Rider (Bodaboda) or Driver (Bajaji) found
    OFFERED_TO_OPERATOR --> SEARCHING: Declined or 20s timeout
    SEARCHING --> NO_OPERATOR_FOUND: Max radius & retries exhausted
    SEARCHING --> CANCELLED_BY_CUSTOMER: Customer cancels while searching

    OFFERED_TO_OPERATOR --> ASSIGNED: Rider or Driver accepts (Atomic Lock)
    ASSIGNED --> CANCELLED_BY_CUSTOMER: Customer cancels before arrival
    ASSIGNED --> CANCELLED_BY_OPERATOR: Rider or Driver cancels (auto-requeue)
    ASSIGNED --> ARRIVED_AT_PICKUP: Rider or Driver taps Arrived near pickup

    ARRIVED_AT_PICKUP --> IN_PROGRESS: Valid 4-digit PIN entered
    ARRIVED_AT_PICKUP --> CANCELLED_BY_CUSTOMER: Customer cancels (wait/cancel fee check)
    ARRIVED_AT_PICKUP --> CANCELLED_BY_OPERATOR: Customer no-show after 5 mins

    IN_PROGRESS --> SOS_ACTIVE: Customer, Rider, or Driver triggers SOS
    SOS_ACTIVE --> IN_PROGRESS: Admin resolves false alarm
    SOS_ACTIVE --> COMPLETED_UNPAID: Trip closed under Admin supervision

    IN_PROGRESS --> COMPLETED_UNPAID: Rider or Driver taps Complete at dropoff
    COMPLETED_UNPAID --> PAID_COMPLETED: Cash confirmed OR Digital Webhook OK
    COMPLETED_UNPAID --> PAYMENT_DISPUTED: Failed digital pay / unresolved dispute

    NO_OPERATOR_FOUND --> [*]
    CANCELLED_BY_CUSTOMER --> [*]
    CANCELLED_BY_OPERATOR --> [*]
    PAID_COMPLETED --> [*]
    PAYMENT_DISPUTED --> [*]
```

---

## 4. Customer App Flow (Web & PWA)

```mermaid
flowchart TD
    Start(["Open Go.boda Web or PWA"]) --> Lang["Select / Toggle Language (Kiswahili / English)"]
    Lang --> HomeMap["Unguja Map Home (Shows Live Nearby Bodabodas & Bajajis)"]

    HomeMap --> SetLoc["Set Pickup (GPS / Pin / Unguja Landmark) & Dropoff"]
    SetLoc --> GeoCheck{"Both Points Inside Unguja Island?"}
    GeoCheck -->|No| OutsideMsg["Display Unguja-Only Notice (Pemba/Mainland Blocked)"]
    OutsideMsg --> SetLoc

    GeoCheck -->|Yes| StoneTown{"Pin in Stone Town Pedestrian Core?"}
    StoneTown -->|Yes| Snap["Snap to Nearest Perimeter Road Gate + Show Walking Path"]
    StoneTown -->|No| ChooseType["Choose Nearby Transport: Bodaboda (Rider) or Bajaji (Driver)"]
    Snap --> ChooseType

    ChooseType --> PayPick["Select Payment: Cash (with Change Note) / Mobile Money / Card"]
    PayPick --> LoginGate{"Customer Signed In?"}
    LoginGate -->|No| OTP["Quick Sign-In: WhatsApp OTP / SMS OTP / Google"]
    OTP --> Confirm["Tap Request Nearby Transport"]
    LoginGate -->|Yes| Confirm

    Confirm --> Searching["Contacting Nearest Bodaboda Rider or Bajaji Driver"]
    Searching -->|None Available| Retry["No Nearby Transport Found -> Retry or Switch Bodaboda/Bajaji"]
    Searching -->|Accepted| Assigned["Matched! View Rider/Driver Photo, Z-Plate, Live Map, 4-Digit PIN"]

    Assigned --> Arrived["Arrived Notification -> Meet & Share 4-Digit PIN"]
    Arrived --> InTrip["Trip In Progress (Live Tracking + WhatsApp Share + SOS)"]
    InTrip --> Complete["Arrived at Dropoff"]

    Complete --> PayMode{"Payment Method?"}
    PayMode -->|Cash| PayCash["Pay Exact TZS Cash to Rider or Driver"]
    PayMode -->|Mobile Money| STK["Approve Mobile Money STK Push"]
    PayMode -->|Card| CardPay["Confirm Card Charge"]

    PayCash --> Receipt["Digital Receipt + Helmet Check (Bodaboda) + Rate Rider/Driver"]
    STK --> Receipt
    CardPay --> Receipt
    Receipt --> HomeMap
```

### Customer Next.js Route Map
| Route | Screen / Purpose | Key Components |
| :--- | :--- | :--- |
| `/` | Unguja Live Map Home | MapLibre Unguja map, live nearby Bodaboda & Bajaji icons, SW/EN switcher, "Where to?" sheet |
| `/auth` | Customer Sign-In | WhatsApp/SMS OTP input, Google/Email sign-in, Profile name & language preference |
| `/book` | Request & Fare Confirmation | Landmark autocomplete, Stone Town perimeter snap alert, Bodaboda vs Bajaji selector, TZS fare & payment mode |
| `/trips/[id]` | Live Trip Tracker | Live Rider/Driver GPS stream, 4-digit PIN display, bilingual quick-chat, Call/WhatsApp button, Share Trip & SOS |
| `/trips/[id]/receipt` | Payment, Receipt & Review | Payment status, TZS trip breakdown, Bodaboda helmet check, 5-star rating & optional tip |
| `/track/[shareToken]` | Public Shared Trip View | Read-only live tracking page opened via shared WhatsApp/SMS link |
| `/history` | Customer Trip History | Past Bodaboda & Bajaji rides, downloadable receipts, quick rebook |
| `/profile` | Account & Safety Settings | Saved Unguja places, Emergency Contact, Language, Payment methods |

---

## 5. Rider (Bodaboda) & Driver (Bajaji) PWA Flow

The `/partner` portal dynamically renders **Rider** terminology/checklists for Bodaboda accounts and **Driver** terminology/guidance for Bajaji accounts.

```mermaid
flowchart TD
    PStart(["Open Go.boda Rider & Driver PWA (/partner)"]) --> PAuth["Sign In via Phone OTP"]
    PAuth --> KYCStatus{"Account Verification Status?"}

    KYCStatus -->|New / Rejected| RoleSelect["Choose Role: Bodaboda Rider OR Bajaji Driver"]
    RoleSelect --> KYCForm["Submit KYC: ID, License, Z-Plate, Vehicle Photos, Helmet Photo (Rider), Kituo"]
    KYCForm --> Pending["Pending Admin Approval Screen"]
    KYCStatus -->|Pending| Pending

    KYCStatus -->|Approved| Dashboard["Operator Home (Offline + Daily TZS Earnings + Float Balance)"]
    Dashboard --> GoOnline{"Tap Go Online"}
    GoOnline --> PreCheck{"GPS Active + Commission Float Above Minimum Limit?"}

    PreCheck -->|Low Float| TopUp["Top Up Commission Float via Mobile Money STK Push"]
    TopUp --> Dashboard
    PreCheck -->|Ready| Online["Online in Nearby Queue (Wake Lock Active + Streaming GPS)"]

    Online --> Offer["Incoming Nearby Request (Audio Chime + Vibration + 20s Timer)"]
    Offer -->|Decline or Timeout| Online
    Offer -->|Accept| NavPickup["Navigate to Customer Pickup (In-App Map + Open Google Maps)"]

    NavPickup --> MarkArrived["Tap Arrived at Pickup (5-Min Wait Timer Starts)"]
    MarkArrived --> EnterPIN["Enter Customer 4-Digit PIN to Start Trip"]
    EnterPIN -->|Invalid PIN| EnterPIN
    EnterPIN -->|Valid PIN| ActiveRide["Trip In Progress (Live GPS + Dropoff Nav + SOS)"]

    ActiveRide --> EndTrip["Tap Complete Trip at Dropoff"]
    EndTrip --> PayCheck{"Trip Payment Mode?"}

    PayCheck -->|Cash| CollectCash["Collect TZS Cash -> Tap Cash Received"]
    CollectCash --> DeductFloat["Deduct 12% Commission from Commission Float"]
    DeductFloat --> RateCust["Rate Customer & View Net Trip Earnings"]

    PayCheck -->|Mobile Money / Card| WaitPay["Await Payment Gateway Webhook"]
    WaitPay -->|Confirmed| CreditEarn["Credit 88% Net Earnings to Withdrawable Wallet"]
    WaitPay -->|Failed / Timeout| FallbackCash["Switch to Cash Collection (Customer & Operator Confirm)"]
    FallbackCash --> CollectCash
    CreditEarn --> RateCust

    RateCust --> Online
```

### Rider & Driver Next.js Route Map (`/partner`)
| Route | Screen / Purpose | Key Components |
| :--- | :--- | :--- |
| `/partner/onboarding` | Multi-Step KYC Registration | Bodaboda Rider vs Bajaji Driver selector, camera document uploads, *Kituo* & Mobile Money payout setup |
| `/partner/home` | Shift Control & Status | High-contrast sunlight Online/Offline switch, Today's TZS earnings, Float balance badge, GPS status |
| `/partner/trip/[id]` | Active Job Console | 20s request overlay, pickup/dropoff landmarks, Google Maps launcher, PIN keypad, Cash/Digital payment screen |
| `/partner/earnings` | Trip Earnings History | Daily/Weekly breakdown of completed trips, gross fares, commissions, cash vs digital totals |
| `/partner/wallet` | Wallet & Payouts | **Earnings Wallet** (1-tap Mobile Money withdrawal) + **Commission Float** (STK Push top-up) |
| `/partner/profile` | Profile & Documents | Vehicle & Z-plate details, License/Insurance expiry reminders, Language (SW/EN), Support shortcut |

---

## 6. Admin Operations Dashboard Flow (`/admin`)

```mermaid
flowchart TD
    ALogin(["Admin Login (RBAC + 2FA)"]) --> AHome["Go.boda Operations Overview"]

    AHome --> LiveMap["Live Unguja Map (Online Riders, Online Drivers, Active Trips)"]
    AHome --> SOSDesk["SOS Incident Monitor (Real-Time Alert Banner & Sound)"]
    AHome --> KYCQueue["Verification Queue (Approve/Reject Bodaboda Riders & Bajaji Drivers)"]
    AHome --> ZoneConfig["Unguja Geofence, Stone Town Snap Gates, Landmarks & Tariffs"]
    AHome --> Finance["Finance Ledger (GMV, Commissions, Float Audits, Mobile Money Payouts)"]
    AHome --> Support["Disputes, Cancellations & Bodaboda Helmet Flags"]
```

### Admin Next.js Route Map
| Route | Purpose |
| :--- | :--- |
| `/admin` | Executive dashboard (live trips, online Bodaboda Riders, online Bajaji Drivers, daily GMV, open SOS alerts) |
| `/admin/live-map` | Fullscreen Unguja map with filters by Bodaboda/Bajaji and clickable trip telemetry |
| `/admin/operators` | Rider & Driver KYC approval queue, active directory, document expiry alerts, suspend/reactivate |
| `/admin/trips` | Searchable trip list, route playback, manual cancellation/dispute resolution |
| `/admin/zones` | Unguja polygon viewer, Stone Town snap gates editor, curated landmarks manager, Bodaboda & Bajaji tariff rules |
| `/admin/finance` | Double-entry commission ledger, Rider/Driver wallet overview, Mobile Money payout logs |
| `/admin/sos` | Active & historical SOS incidents, emergency contact actions, resolution log |

---

## 7. Nearby Discovery, Matching & Pricing Backend Pipeline

1. **Live Nearby Map Feed (Pre-Booking):**
   * Customer app sends current Unguja `(lat, lng)` -> Backend runs Redis `GEOSEARCH` on both `operators:online:BODABODA` and `operators:online:BAJAJI` within a `4 km` radius -> returns anonymized vehicle markers + approximate ETA for each transport type.
2. **Geofence & Stone Town Perimeter Snap (PostGIS):**
   * Confirm `ST_Contains(unguja_polygon, pickup)` and `ST_Contains(unguja_polygon, dropoff)`.
   * If `ST_Contains(stone_town_pedestrian_polygon, pickup)` is true, snap pickup to the closest `SnapPoint` perimeter gate and compute walking distance.
3. **Fare Calculation:**
   * Fetch driving route distance & duration from OSRM / Mapbox Directions.
   * Compute upfront fare in TZS using `TariffConfig` for the chosen type (`BODABODA` or `BAJAJI`), rounded to nearest `500 TZS`.
4. **Targeted Nearby Dispatch (Redis + DB):**
   * Query Redis `GEOSEARCH` strictly for the Customer's chosen pool (`operators:online:BODABODA` -> **Riders**, or `operators:online:BAJAJI` -> **Drivers**).
   * Expanding search tiers: **Tier 1:** `1.5 km` -> **Tier 2:** `3.0 km` -> **Tier 3:** `5.0 km` (up to `6.0 km` in lower-density coastal zones).
   * Filter out operators who are busy on a trip, stale (`lastSeenAt > 45s`), already declined this trip, or below the Commission Float minimum threshold.
5. **Sequential Scored Offer & Atomic Lock:**
   * Rank nearby candidates by: **Proximity (60%)** + **Rating & Safety Score (25%)** + **Idle Fairness (15%)**.
   * Push offer to Candidate #1 via WebSocket + Web Push with a **20-second TTL**.
   * On Accept: execute an atomic Redis/DB lock transitioning `Trip` to `ASSIGNED` and generating the **4-digit Start PIN**.
   * On Decline or 20s Timeout: automatically advance to Candidate #2 (up to 6 candidates or 90 seconds total before returning `NO_OPERATOR_FOUND`).

---

## 8. Per-Trip Payment & Wallet Settlement Flow

```mermaid
flowchart TD
    TripEnd(["Trip Completed (Final Fare = F)"]) --> Split["Compute Commission C = 12% of F, Operator Net N = 88% of F"]
    Split --> PayType{"Payment Method"}

    PayType -->|Cash TZS| CashDone["Rider/Driver Confirms Cash Collected from Customer"]
    CashDone --> DebitFloat["Debit C from Operator Commission Float Wallet"]
    DebitFloat --> LimitCheck{"Float Below -5,000 TZS?"}
    LimitCheck -->|Yes| PauseOp["Pause Dispatch Until Float Top-Up via Mobile Money"]
    LimitCheck -->|No| Settled(["Trip Settled & Receipts Generated"])

    PayType -->|Mobile Money / Card| Charge["Trigger Payment Gateway (STK Push / Card)"]
    Charge --> Webhook{"Payment Webhook Result"}
    Webhook -->|Success| Offset{"Does Operator Have Negative Float?"}
    Offset -->|Yes| ClearNeg["Offset Negative Float First, Credit Remaining N to Earnings Wallet"]
    Offset -->|No| CreditFull["Credit Full N to Withdrawable Earnings Wallet"]
    ClearNeg --> Settled
    CreditFull --> Settled

    Webhook -->|Timeout / Failed| Fallback["Allow Retry OR Mutual Switch to Cash Collection"]
    Fallback --> CashDone
```

---

## 9. Edge Cases & Recovery Matrix

| Scenario | Expected System Handling |
| :--- | :--- |
| **Customer outside Unguja (Pemba / Mainland)** | PostGIS check rejects booking with a clear notice: *"Go.boda currently operates exclusively on Unguja Island, Zanzibar."* |
| **Pin inside Stone Town pedestrian alley** | Auto-snaps to closest drivable perimeter gate, displays walking time to Customer, and shows exact gate name to the Rider/Driver. |
| **No Bodabodas nearby, but Bajajis are nearby** | Suggests 1-tap switch: *"No Bodaboda Riders nearby right now — a Bajaji Driver is 3 mins away."* (And vice versa.) |
| **Cellular 3G drop mid-trip** | PWA caches active trip state and GPS points in IndexedDB; resyncs cleanly on reconnect without dropping the screen. |
| **Mobile Money STK Push fails/times out** | Customer can tap *"Retry Payment"* or both parties confirm switching the trip to **Cash (TZS)**. |
| **Customer no-show at pickup** | After 5 minutes in `ARRIVED_AT_PICKUP`, Rider/Driver unlocks *"Cancel (Customer No-Show)"* with zero penalty. |
| **Two operators tap Accept simultaneously** | Atomic lock awards trip to first commit; second operator sees *"Trip already accepted"* and stays online. |
| **Rider/Driver cancels after accepting** | Trip automatically returns to `SEARCHING` for the next closest Rider/Driver without making the Customer rebook. |
| **SOS button triggered mid-trip** | Creates `SafetyAlert`, raises live audio/visual alarm in `/admin/sos`, and sends live tracking link + Z-Plate to emergency contact. |

---

## 10. Proposed Full-Stack Next.js Monorepo Structure

```text
E:\Go.boda\
├── prd.md                             # Product Requirements Document
├── app-flow.md                        # App Flow & System Interaction Blueprint
├── implementation.md                  # Project Scope & Phased Implementation Plan
├── public/
│   ├── manifest.webmanifest           # PWA manifest (standalone, icons, theme colors)
│   ├── icons/                         # Adaptive PWA icons (192x192, 512x512, maskable)
│   └── sounds/                        # Incoming trip chime & SOS alert audio
├── prisma/
│   ├── schema.prisma                  # PostgreSQL + PostGIS models & financial ledger
│   └── seed-unguja.ts                 # Unguja boundary, Stone Town snap gates, 150 landmarks
├── src/
│   ├── app/
│   │   ├── [locale]/                  # next-intl (/sw and /en)
│   │   │   ├── (customer)/            # Customer Web & PWA (/, /book, /trips/[id], /history)
│   │   │   ├── partner/               # Bodaboda Rider & Bajaji Driver PWA (/partner/*)
│   │   │   ├── admin/                 # Admin Ops Portal (/admin/*)
│   │   │   └── track/[shareToken]/    # Public WhatsApp live trip tracking page
│   │   ├── api/
│   │   │   ├── auth/                  # WhatsApp/SMS OTP, Google OAuth, sessions
│   │   │   ├── geo/                   # Unguja polygon check, Stone Town snap, landmarks, fare quote
│   │   │   ├── nearby/                # Live nearby Bodaboda & Bajaji availability query
│   │   │   ├── trips/                 # Request, accept, arrive, PIN start, complete, cancel, SOS
│   │   │   ├── partner/               # Rider/Driver KYC, online status, GPS ping, wallet & payout
│   │   │   ├── payments/              # Mobile Money STK Push, Card checkout, HMAC webhooks
│   │   │   └── admin/                 # KYC approval, tariffs, zones, ledger, SOS management
│   │   └── sw.ts                      # Serwist Service Worker (offline cache + Web Push)
│   ├── components/
│   │   ├── map/                       # MapLibre GL Unguja map, Bodaboda/Bajaji markers, snap badge
│   │   ├── customer/                  # Nearby picker, booking sheet, PIN card, payment & SOS drawer
│   │   ├── partner/                   # Sunlight dashboard, 20s offer modal, PIN pad, wallet cards
│   │   └── admin/                     # Live map, KYC queue, tariff & landmark editors
│   ├── lib/
│   │   ├── geo/                       # PostGIS queries, Unguja polygon helpers, fare engine
│   │   ├── dispatch/                  # Redis GEOSEARCH matching engine & atomic locks
│   │   ├── payments/                  # Mobile Money (AzamPay/Selcom) & Card gateway adapters
│   │   ├── notifications/             # Web Push (VAPID), WhatsApp Cloud API, SMS fallback
│   │   └── i18n/                      # Kiswahili (sw.json) & English (en.json) dictionaries
│   └── realtime/                      # Lightweight Socket.IO server (or managed realtime bridge)
└── package.json
```
