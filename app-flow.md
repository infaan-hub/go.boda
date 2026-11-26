# Go.boda — App Flow & Microservice Interaction Blueprint

> **Document Version:** 2.0 (Microservices Edition)  
> **Companion Documents:** [prd.md](file:///E:/Go.boda/prd.md) | [architecture.md](file:///E:/Go.boda/architecture.md) | [implementation.md](file:///E:/Go.boda/implementation.md)  
> **Scope:** Cross-service sequence choreography, Trip State Machine, UX flowcharts for `customer-web`, `partner-pwa`, and `admin-web`, per-trip payment settlement flows, and edge-case recovery for **Go.boda** (Unguja Island).

---

## 1. Canonical Roles & Microservice Ecosystem Overview

* **Customer** (`customer-web`): Views nearby Bodabodas and Bajajis on Unguja Island and requests either transport type.
* **Rider** (`partner-pwa` — Bodaboda mode): Verified Bodaboda operator fulfilling `Go.boda` trips and earning per trip.
* **Driver** (`partner-pwa` — Bajaji mode): Verified Bajaji operator fulfilling `Go.bajaji` trips and earning per trip.
* **Admin** (`admin-web`): Operations team managing KYC, Unguja zones/tariffs, live safety alerts, and financial ledgers.

```mermaid
flowchart LR
    subgraph Apps["Next.js Web & PWA Apps"]
        CW["customer-web"]
        PP["partner-pwa (Riders & Drivers)"]
        AW["admin-web"]
    end

    GW["api-gateway (HTTPS / WSS + JWT + RBAC)"]
    BUS(("Event Bus"))

    CW <--> GW
    PP <--> GW
    AW <--> GW

    GW --> Auth["auth-service"]
    GW --> Op["operator-service"]
    GW --> Geo["geo-zone-service (PostGIS)"]
    GW <--> Loc["location-service (Redis Geo + WS)"]
    GW --> Price["pricing-service"]
    GW --> Disp["dispatch-service"]
    GW --> Trip["trip-service"]
    GW --> Pay["payment-wallet-service"]
    GW <--> Notif["notification-service"]
    GW --> Safe["safety-service"]

    Op <--> BUS
    Loc <--> BUS
    Disp <--> BUS
    Trip <--> BUS
    Pay <--> BUS
    Notif <--> BUS
    Safe <--> BUS
```

---

## 2. End-to-End Cross-Service Trip Lifecycle (Sequence Diagram)

Traces every synchronous API call (via `api-gateway`) and asynchronous Event Bus message across the 10 microservices from live nearby discovery to final Rider/Driver payout.

```mermaid
sequenceDiagram
    autonumber
    actor Customer as Customer (customer-web)
    participant GW as api-gateway
    participant Loc as location-service
    participant Geo as geo-zone-service
    participant Price as pricing-service
    participant Trip as trip-service
    participant Disp as dispatch-service
    participant Notif as notification-service
    actor Operator as Rider (Bodaboda) / Driver (Bajaji)
    participant Pay as payment-wallet-service

    Customer->>GW: Open App (Unguja GPS)
    GW->>Loc: Subscribe Nearby Fleet (WS)
    Loc-->>Customer: Stream Live Nearby Bodabodas & Bajajis

    Customer->>GW: Request Fare Quote (Pickup, Dropoff)
    GW->>Geo: Validate Unguja Polygon + Stone Town Snap + Route
    Geo-->>GW: Validated Snapped Points, Distance & ETA
    GW->>Price: Compute Upfront TZS Fares (Go.boda & Go.bajaji)
    Price-->>Customer: Return Upfront TZS Fares & Walking Path (if snapped)

    Customer->>GW: Confirm Request (Bodaboda OR Bajaji + Payment Method)
    GW->>Trip: Create Trip (SEARCHING)
    Trip-->>Disp: Event: trip.requested
    Disp->>Loc: Query Nearest Eligible Riders OR Drivers (1.5km -> 3km -> 5km)
    Loc-->>Disp: Ranked Nearby Candidates
    Disp-->>Notif: Event: dispatch.offer_sent (20s TTL)
    Notif->>Operator: WebSocket + Web Push + Audio Chime Offer

    Operator->>GW: Tap Accept
    GW->>Disp: Acquire Atomic Redis Lock & Accept Offer
    Disp-->>Trip: Event: dispatch.operator_assigned
    Trip->>Trip: Generate 4-Digit PIN & Set ASSIGNED
    Trip-->>Notif: Event: trip.assigned
    Notif-->>Customer: Driver/Rider Card, Z-Plate, 4-Digit PIN & Live ETA

    loop Every 3-5 Seconds
        Operator->>Loc: Stream GPS Telemetry (WS)
        Loc-->>Customer: Update Live Marker & ETA (trip room)
    end

    Operator->>GW: Tap "Arrived at Pickup"
    GW->>Trip: Set ARRIVED_AT_PICKUP (Start 5m Wait Timer)
    Trip-->>Notif: Event: trip.arrived -> Push to Customer

    Customer->>Operator: Share 4-Digit PIN at Pickup
    Operator->>GW: Submit 4-Digit PIN
    GW->>Trip: Verify PIN -> Set IN_PROGRESS
    Trip-->>Notif: Event: trip.started (Enable WhatsApp Share & SOS)

    Operator->>GW: Tap "Complete Trip" at Dropoff
    GW->>Trip: Set COMPLETED_UNPAID
    Trip-->>Pay: Event: trip.completed

    alt Cash Payment (TZS)
        Pay-->>Operator: Display Exact TZS Cash to Collect
        Customer->>Operator: Pay Cash in TZS
        Operator->>GW: Tap "Cash Received"
        GW->>Pay: Debit 12% Commission from Commission Float Wallet
        Pay-->>Trip: Event: payment.confirmed
    else Mobile Money (STK Push) or Card
        Pay->>Customer: Trigger Mobile Money STK Push / Card Charge
        Customer->>Pay: Approve Payment (Gateway Webhook)
        Pay->>Pay: Credit 88% Net Earnings to Operator Earnings Wallet
        Pay-->>Trip: Event: payment.confirmed
    end

    Trip->>Trip: Set PAID_COMPLETED
    Trip-->>Notif: Send Digital Receipt + Helmet Check + Rating Prompt
```

---

## 3. Trip State Machine (`trip-service`)

`trip-service` is the sole authority for mutating trip states; all other services react to emitted events.

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Customer views nearby fleet & fare quote
    DRAFT --> SEARCHING: Customer confirms Bodaboda or Bajaji request

    SEARCHING --> OFFERED_TO_OPERATOR: dispatch-service selects nearest Rider/Driver
    OFFERED_TO_OPERATOR --> SEARCHING: Declined or 20s timeout
    SEARCHING --> NO_OPERATOR_FOUND: Max radius & retries exhausted
    SEARCHING --> CANCELLED_BY_CUSTOMER: Customer cancels during search

    OFFERED_TO_OPERATOR --> ASSIGNED: Atomic Accept Lock succeeds
    ASSIGNED --> CANCELLED_BY_CUSTOMER: Customer cancels before pickup
    ASSIGNED --> CANCELLED_BY_OPERATOR: Rider/Driver cancels (auto-requeue)
    ASSIGNED --> ARRIVED_AT_PICKUP: Rider/Driver marks arrived

    ARRIVED_AT_PICKUP --> IN_PROGRESS: Valid 4-digit PIN submitted
    ARRIVED_AT_PICKUP --> CANCELLED_BY_CUSTOMER: Customer cancels (wait/cancel fee check)
    ARRIVED_AT_PICKUP --> CANCELLED_BY_OPERATOR: Customer no-show after 5 mins

    IN_PROGRESS --> SOS_ACTIVE: safety-service emits safety.sos_triggered
    SOS_ACTIVE --> IN_PROGRESS: Admin resolves false alarm
    SOS_ACTIVE --> COMPLETED_UNPAID: Trip closed under Admin oversight

    IN_PROGRESS --> COMPLETED_UNPAID: Rider/Driver marks complete at dropoff
    COMPLETED_UNPAID --> PAID_COMPLETED: payment-wallet-service emits payment.confirmed
    COMPLETED_UNPAID --> PAYMENT_DISPUTED: Failed payment / unresolved dispute

    NO_OPERATOR_FOUND --> [*]
    CANCELLED_BY_CUSTOMER --> [*]
    CANCELLED_BY_OPERATOR --> [*]
    PAID_COMPLETED --> [*]
    PAYMENT_DISPUTED --> [*]
```

---

## 4. Customer App Flow (`apps/customer-web`)

```mermaid
flowchart TD
    Start(["Open Go.boda (customer-web / PWA)"]) --> Lang["Select / Toggle Language (Kiswahili / English)"]
    Lang --> HomeMap["Unguja Map Home (location-service streams live nearby Bodabodas & Bajajis)"]

    HomeMap --> SetLoc["Pick Pickup (GPS / Pin / Landmark) & Dropoff"]
    SetLoc --> GeoCheck{"geo-zone-service: Inside Unguja Island?"}
    GeoCheck -->|No| OutsideMsg["Display Unguja-Only Notice (Pemba & Mainland Blocked)"]
    OutsideMsg --> SetLoc

    GeoCheck -->|Yes| StoneTown{"Pin Inside Stone Town Pedestrian Core?"}
    StoneTown -->|Yes| Snap["Snap to Nearest Perimeter Gate + Show Walking Path"]
    StoneTown -->|No| ChooseType["Choose Nearby Transport: Bodaboda (Rider) or Bajaji (Driver)"]
    Snap --> ChooseType

    ChooseType --> PayPick["Select Payment: Cash (with Change Note) / Mobile Money / Card"]
    PayPick --> LoginGate{"Signed In via auth-service?"}
    LoginGate -->|No| OTP["Quick Sign-In: WhatsApp OTP / SMS OTP / Google"]
    OTP --> Confirm["Tap Request Nearby Transport"]
    LoginGate -->|Yes| Confirm

    Confirm --> Searching["dispatch-service Contacting Nearest Rider (Bodaboda) or Driver (Bajaji)"]
    Searching -->|None Available| Retry["No Nearby Transport Found -> Retry or Switch Bodaboda/Bajaji"]
    Searching -->|Matched| Assigned["View Rider/Driver Photo, Z-Plate, Live Map, 4-Digit PIN, Chat/Call"]

    Assigned --> Arrived["Arrived Push Alert -> Meet & Share 4-Digit PIN"]
    Arrived --> InTrip["Trip In Progress (Live Tracking + safety-service WhatsApp Share & SOS)"]
    InTrip --> Complete["Arrived at Dropoff"]

    Complete --> PayMode{"Payment Method?"}
    PayMode -->|Cash| PayCash["Pay Exact TZS Cash to Rider or Driver"]
    PayMode -->|Mobile Money| STK["Approve Mobile Money STK Push"]
    PayMode -->|Card| CardPay["Confirm Card Charge"]

    PayCash --> Receipt["Digital Receipt + Bodaboda Helmet Check + Rate Rider/Driver"]
    STK --> Receipt
    CardPay --> Receipt
    Receipt --> HomeMap
```

### `apps/customer-web` Route Map
| Route | Screen | Backing Microservices (via `api-gateway`) |
| :--- | :--- | :--- |
| `/[locale]` | Unguja Live Nearby Map | `location-service`, `geo-zone-service` |
| `/[locale]/auth` | Sign-In & OTP | `auth-service`, `notification-service` |
| `/[locale]/book` | Route, Stone Town Snap & Fare Quote | `geo-zone-service`, `pricing-service`, `trip-service` |
| `/[locale]/trips/[id]` | Live Trip Tracker & Safety Drawer | `trip-service`, `location-service`, `notification-service`, `safety-service` |
| `/[locale]/trips/[id]/receipt` | Payment, Receipt, Helmet Check & Rating | `payment-wallet-service`, `trip-service`, `safety-service` |
| `/[locale]/track/[shareToken]` | Public WhatsApp Shared Live Tracker | `safety-service`, `location-service` |
| `/[locale]/history` | Customer Trip History | `trip-service` |
| `/[locale]/profile` | Saved Places, Emergency Contact & Language | `auth-service`, `safety-service` |

---

## 5. Rider (Bodaboda) & Driver (Bajaji) PWA Flow (`apps/partner-pwa`)

```mermaid
flowchart TD
    PStart(["Open Go.boda Partner PWA (partner-pwa)"]) --> PAuth["Sign In via Phone OTP (auth-service)"]
    PAuth --> KYCStatus{"operator-service Verification Status?"}

    KYCStatus -->|New / Rejected| RoleSelect["Choose Role: Bodaboda Rider OR Bajaji Driver"]
    RoleSelect --> KYCForm["Submit KYC & Photos (ID, License, Z-Plate, Helmet Photo for Rider, Kituo)"]
    KYCForm --> Pending["Pending Admin Approval Screen"]
    KYCStatus -->|Pending| Pending

    KYCStatus -->|Approved| Dashboard["Adaptive Home (Offline + Daily TZS Earnings + Float Balance)"]
    Dashboard --> GoOnline{"Tap Go Online"}
    GoOnline --> PreCheck{"GPS Active + Float Not Blocked by payment-wallet-service?"}

    PreCheck -->|Float Blocked| TopUp["Top Up Commission Float via Mobile Money STK Push"]
    TopUp --> Dashboard
    PreCheck -->|Ready| Online["Online in location-service Pool (Wake Lock + GPS Stream)"]

    Online --> Offer["Incoming Request Modal from dispatch-service (Chime + Vibration + 20s Timer)"]
    Offer -->|Decline or Timeout| Online
    Offer -->|Accept| NavPickup["Navigate to Pickup (In-App Map + Open Google Maps)"]

    NavPickup --> MarkArrived["Tap Arrived at Pickup (trip-service 5m Wait Timer)"]
    MarkArrived --> EnterPIN["Enter Customer 4-Digit PIN to Start Trip"]
    EnterPIN -->|Wrong PIN| EnterPIN
    EnterPIN -->|Valid PIN| ActiveRide["Trip In Progress (Live GPS + Dropoff Nav + SOS)"]

    ActiveRide --> EndTrip["Tap Complete Trip at Dropoff"]
    EndTrip --> PayCheck{"Trip Payment Mode?"}

    PayCheck -->|Cash| CollectCash["Collect TZS Cash -> Confirm Cash Received"]
    CollectCash --> DeductFloat["payment-wallet-service Debits 12% Commission from Float"]
    DeductFloat --> RateCust["Rate Customer & View Net Trip Earnings"]

    PayCheck -->|Mobile Money / Card| WaitPay["Wait for payment-wallet-service Webhook Confirmation"]
    WaitPay -->|Confirmed| CreditEarn["Credit 88% Net Earnings to Withdrawable Wallet"]
    WaitPay -->|Failed / Timeout| FallbackCash["Mutual Switch to Cash Collection"]
    FallbackCash --> CollectCash
    CreditEarn --> RateCust

    RateCust --> Online
```

### `apps/partner-pwa` Route Map
| Route | Screen | Backing Microservices (via `api-gateway`) |
| :--- | :--- | :--- |
| `/[locale]/onboarding` | Multi-Step Rider/Driver KYC | `operator-service`, `auth-service` |
| `/[locale]/home` | Sunlight Shift Dashboard | `operator-service`, `location-service`, `payment-wallet-service` |
| `/[locale]/trip/[id]` | Active Job Console & PIN Pad | `dispatch-service`, `trip-service`, `location-service`, `payment-wallet-service`, `safety-service` |
| `/[locale]/earnings` | Trip-by-Trip Earnings Log | `trip-service`, `payment-wallet-service` |
| `/[locale]/wallet` | Earnings Payouts & Float Top-Up | `payment-wallet-service` |
| `/[locale]/profile` | Vehicle, Z-Plate & Expiry Reminders | `operator-service`, `auth-service` |

---

## 6. Admin Operations Portal Flow (`apps/admin-web`)

```mermaid
flowchart TD
    ALogin(["Admin Login (auth-service RBAC + 2FA)"]) --> AHome["Go.boda Operations Command Center"]

    AHome --> LiveMap["Live Unguja Map (location-service + trip-service)"]
    AHome --> SOSDesk["SOS Incident Console (safety-service Real-Time Alarm)"]
    AHome --> KYCQueue["Rider & Driver KYC Queue (operator-service)"]
    AHome --> ZoneConfig["Unguja Polygons, Stone Town Snap Gates, Landmarks & Tariffs (geo-zone + pricing)"]
    AHome --> Finance["Finance Ledger & Mobile Money Payouts (payment-wallet-service)"]
    AHome --> Support["Disputes, Cancellations & Helmet Non-Compliance (trip-service + safety-service)"]
```

---

## 7. Per-Trip Payment & Wallet Settlement Flow (`payment-wallet-service`)

```mermaid
flowchart TD
    TripEnd(["Event Received: trip.completed (Final Fare = F)"]) --> Split["Calculate Commission C = 12% of F, Net Payout N = 88% of F"]
    Split --> PayType{"Payment Method"}

    PayType -->|Cash TZS| CashDone["Rider/Driver Confirms Cash Collected from Customer"]
    CashDone --> DebitFloat["Idempotent Debit C from COMMISSION_FLOAT"]
    DebitFloat --> LimitCheck{"Float Balance Below -5,000 TZS?"}
    LimitCheck -->|Yes| EmitBlock["Emit wallet.float_blocked -> operator-service Pauses Dispatch"]
    LimitCheck -->|No| EmitPaid(["Emit payment.confirmed -> trip-service Closes Trip"])
    EmitBlock --> EmitPaid

    PayType -->|Mobile Money / Card| Charge["Trigger Gateway Charge (AzamPay/Selcom STK Push or Card)"]
    Charge --> Webhook{"HMAC-Verified Webhook Result"}
    Webhook -->|Success| Offset{"Negative Float Balance Present?"}
    Offset -->|Yes| ClearNeg["Auto-Clear Negative Float First, Credit Remaining N to EARNINGS"]
    Offset -->|No| CreditFull["Credit Full N to Withdrawable EARNINGS Wallet"]
    ClearNeg --> RestoreCheck{"Float Back Above Limit?"}
    RestoreCheck -->|Yes| EmitRestore["Emit wallet.float_restored"]
    RestoreCheck -->|No| EmitPaid
    EmitRestore --> EmitPaid
    CreditFull --> EmitPaid

    Webhook -->|Timeout / Failed| Fallback["Emit payment.failed -> Retry OR Mutual Switch to Cash"]
    Fallback --> CashDone
```

---

## 8. Edge Cases & Distributed Recovery Matrix

| Scenario | Owning Service(s) | System Recovery Behavior |
| :--- | :--- | :--- |
| **Request outside Unguja (Pemba / Mainland)** | `geo-zone-service` | PostGIS `ST_Contains` fails immediately; returns clear Unguja-only message before creating a trip. |
| **Pin inside Stone Town pedestrian alley** | `geo-zone-service` | Snaps to closest perimeter `SnapPoint`, returns walking time to Customer and exact gate name to Rider/Driver. |
| **No Bodabodas nearby, but Bajajis are nearby** | `dispatch-service`, `location-service` | Suggests 1-tap switch to Bajaji (or vice versa) with live ETA. |
| **Cellular 3G drop mid-trip** | `customer-web`, `partner-pwa`, `location-service` | PWAs persist active trip state in IndexedDB and reconnect WebSockets automatically with GPS sync. |
| **Mobile Money STK Push fails/times out** | `payment-wallet-service`, `trip-service` | Emits `payment.failed`; offers 1-tap Retry or mutual confirmation to settle in Cash (TZS). |
| **Two Riders/Drivers tap Accept at once** | `dispatch-service` | Redis atomic lock (`SET NX`) awards trip to first caller; second immediately receives *"Trip already taken"*. |
| **Rider/Driver cancels after accepting** | `trip-service`, `dispatch-service` | Emits `trip.cancelled_by_operator`; `dispatch-service` auto-requeues next closest Rider/Driver seamlessly. |
| **Notification or WhatsApp provider down** | `notification-service` | BullMQ retries with exponential backoff; WhatsApp OTP falls back automatically to SMS OTP. |
| **SOS button triggered mid-trip** | `safety-service`, `notification-service` | Creates priority incident, triggers audible alarm on `admin-web`, and sends live tracking link + Z-Plate to emergency contact. |
