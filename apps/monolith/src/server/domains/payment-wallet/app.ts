import {
  createHmac,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { jwtVerify } from "jose";
import { z } from "zod";
import { checkDatabaseHealth, getSql } from "@goboda/db";
import { EVENT_SUBJECTS } from "@goboda/events";
import { createLogger, REQUEST_ID_HEADER } from "@goboda/logger";
import {
  PaymentMethod,
  PLATFORM_FINANCE,
  TripStatus,
  UserRole,
} from "@goboda/shared-types";

export const SERVICE_NAME = "payment-wallet-service";
export const SERVICE_VERSION = "0.1.0";
export const PORT = Number(
  process.env.PORT ?? process.env.PAYMENT_WALLET_SERVICE_PORT ?? 4008
);
export const HOST = process.env.HOST ?? "0.0.0.0";
export const PLATFORM_OWNER_ID = "00000000-0000-4000-8000-000000000000";

export const logger = createLogger(SERVICE_NAME);

function getJwtSecretBytes(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET is required in production");
    }
    return new TextEncoder().encode("dev-only-insecure-goboda-jwt-secret");
  }
  return new TextEncoder().encode(secret);
}

function getWebhookSecret(): string {
  const secret =
    process.env.PAYMENT_WEBHOOK_SECRET ?? process.env.INTERNAL_SERVICE_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PAYMENT_WEBHOOK_SECRET is required in production");
    }
    return "dev-only-goboda-webhook-secret";
  }
  return secret;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function hasValidInternalSecret(header: unknown): boolean {
  const expected = process.env.INTERNAL_SERVICE_SECRET;
  return (
    Boolean(expected) &&
    typeof header === "string" &&
    safeEqual(header, expected!)
  );
}

export function computeWebhookSignature(rawBody: string): string {
  return createHmac("sha256", getWebhookSecret())
    .update(rawBody)
    .digest("hex");
}

async function resolveCaller(
  authHeader?: string
): Promise<{ userId: string; role: UserRole; phone?: string } | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(
      authHeader.slice(7).trim(),
      getJwtSecretBytes(),
      { issuer: "goboda-auth-service", audience: "goboda-platform" }
    );
    if (!payload.sub || typeof payload.role !== "string") return null;
    return {
      userId: payload.sub,
      role: payload.role as UserRole,
      phone: typeof payload.phone === "string" ? payload.phone : undefined,
    };
  } catch {
    return null;
  }
}

interface WalletAccountRow {
  id: string;
  owner_id: string;
  account_type: string;
  balance_tzs: string | number;
  is_float_blocked: boolean;
}

async function ensureOperatorWallets(operatorId: string): Promise<{
  earnings: WalletAccountRow;
  commissionFloat: WalletAccountRow;
}> {
  const sql = getSql();
  await sql`
    INSERT INTO finance.wallet_accounts (owner_id, account_type, currency, balance_tzs)
    VALUES
      (${operatorId}::uuid, 'EARNINGS', 'TZS', 0),
      (${operatorId}::uuid, 'COMMISSION_FLOAT', 'TZS', 0)
    ON CONFLICT (owner_id, account_type) DO NOTHING
  `;

  const rows = (await sql`
    SELECT id, owner_id, account_type, balance_tzs, is_float_blocked
    FROM finance.wallet_accounts
    WHERE owner_id = ${operatorId}::uuid
      AND account_type IN ('EARNINGS', 'COMMISSION_FLOAT')
  `) as unknown as WalletAccountRow[];

  const earnings = rows.find((r) => r.account_type === "EARNINGS")!;
  const commissionFloat = rows.find(
    (r) => r.account_type === "COMMISSION_FLOAT"
  )!;
  return { earnings, commissionFloat };
}

async function getSystemAccount(
  accountType:
    | "PLATFORM_COMMISSION"
    | "CLEARING_CASH"
    | "CLEARING_DIGITAL"
    | "PROMO_SUBSIDY"
): Promise<WalletAccountRow> {
  const sql = getSql();
  await sql`
    INSERT INTO finance.wallet_accounts (owner_id, account_type, currency, balance_tzs)
    VALUES (${PLATFORM_OWNER_ID}::uuid, ${accountType}, 'TZS', 0)
    ON CONFLICT (owner_id, account_type) DO NOTHING
  `;
  const rows = (await sql`
    SELECT id, owner_id, account_type, balance_tzs, is_float_blocked
    FROM finance.wallet_accounts
    WHERE owner_id = ${PLATFORM_OWNER_ID}::uuid AND account_type = ${accountType}
    LIMIT 1
  `) as unknown as WalletAccountRow[];
  return rows[0]!;
}

async function appendOutbox(
  subject: string,
  payload: Record<string, unknown>,
  correlationId: string
) {
  const sql = getSql();
  await sql`
    INSERT INTO finance.outbox_events (subject, payload, correlation_id)
    VALUES (${subject}, ${JSON.stringify(payload)}::jsonb, ${correlationId})
  `;
}

interface JournalLine {
  account: WalletAccountRow;
  deltaTzs: number;
  entryType: string;
  reference: string;
  tripId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Posts a strictly balanced double-entry journal (SUM(deltaTzs) === 0).
 * Uses unique (idempotency_key, account_id, entry_type) so replays never double-post.
 */
async function postBalancedJournal(params: {
  idempotencyKey: string;
  lines: JournalLine[];
}): Promise<{ journalId: string; alreadyPosted: boolean }> {
  const activeLines = params.lines.filter((l) => l.deltaTzs !== 0);
  const netSum = activeLines.reduce((acc, l) => acc + l.deltaTzs, 0);
  if (netSum !== 0) {
    throw new Error(
      `UNBALANCED_JOURNAL: double-entry sum must equal 0, got ${netSum}`
    );
  }

  const sql = getSql();
  const existing = await sql`
    SELECT journal_id FROM finance.ledger_entries
    WHERE idempotency_key = ${params.idempotencyKey}
    LIMIT 1
  `;
  if (existing[0]) {
    return {
      journalId: (existing[0] as { journal_id: string }).journal_id,
      alreadyPosted: true,
    };
  }

  const journalId = randomUUID();
  for (const line of activeLines) {
    const updatedAcc = (await sql`
      UPDATE finance.wallet_accounts
      SET balance_tzs = balance_tzs + ${line.deltaTzs}, updated_at = NOW()
      WHERE id = ${line.account.id}::uuid
      RETURNING balance_tzs
    `) as Array<{ balance_tzs: string | number }>;

    const balanceAfter = Number(updatedAcc[0]?.balance_tzs ?? 0);

    await sql`
      INSERT INTO finance.ledger_entries (
        journal_id, idempotency_key, account_id, owner_id, account_type,
        delta_tzs, balance_after_tzs, entry_type, trip_id, reference, metadata
      )
      VALUES (
        ${journalId}::uuid, ${params.idempotencyKey}, ${line.account.id}::uuid,
        ${line.account.owner_id}::uuid, ${line.account.account_type},
        ${line.deltaTzs}, ${balanceAfter}, ${line.entryType},
        ${line.tripId ?? null}::uuid, ${line.reference},
        ${JSON.stringify(line.metadata ?? {})}::jsonb
      )
      ON CONFLICT (idempotency_key, account_id, entry_type) DO NOTHING
    `;
  }

  return { journalId, alreadyPosted: false };
}

async function syncOperatorFloatGate(
  operatorId: string,
  correlationId: string
): Promise<{
  floatBalanceTzs: number;
  isFloatBlocked: boolean;
  emittedEvent: string | null;
}> {
  const sql = getSql();
  const rows = (await sql`
    SELECT id, balance_tzs, is_float_blocked
    FROM finance.wallet_accounts
    WHERE owner_id = ${operatorId}::uuid AND account_type = 'COMMISSION_FLOAT'
    LIMIT 1
  `) as Array<{
    id: string;
    balance_tzs: string | number;
    is_float_blocked: boolean;
  }>;
  const floatAcc = rows[0];
  if (!floatAcc) {
    return { floatBalanceTzs: 0, isFloatBlocked: false, emittedEvent: null };
  }

  const balance = Number(floatAcc.balance_tzs);
  const threshold = PLATFORM_FINANCE.FLOAT_BLOCK_THRESHOLD_TZS; // -5000 TZS
  const shouldBlock = balance < threshold;

  if (shouldBlock && !floatAcc.is_float_blocked) {
    await Promise.all([
      sql`
        UPDATE finance.wallet_accounts
        SET is_float_blocked = TRUE, updated_at = NOW()
        WHERE id = ${floatAcc.id}::uuid
      `,
      sql`
        UPDATE location.operator_positions
        SET is_online = FALSE
        WHERE operator_id = ${operatorId}::uuid
      `,
      sql`
        UPDATE operator.profiles
        SET is_online = FALSE, updated_at = NOW()
        WHERE user_id = ${operatorId}::uuid
      `,
      appendOutbox(
        EVENT_SUBJECTS.WALLET_FLOAT_BLOCKED,
        {
          operatorId,
          floatBalanceTzs: balance,
          thresholdTzs: threshold,
        },
        correlationId
      ),
    ]);
    return {
      floatBalanceTzs: balance,
      isFloatBlocked: true,
      emittedEvent: EVENT_SUBJECTS.WALLET_FLOAT_BLOCKED,
    };
  }

  if (!shouldBlock && floatAcc.is_float_blocked) {
    await Promise.all([
      sql`
        UPDATE finance.wallet_accounts
        SET is_float_blocked = FALSE, updated_at = NOW()
        WHERE id = ${floatAcc.id}::uuid
      `,
      appendOutbox(
        EVENT_SUBJECTS.WALLET_FLOAT_RESTORED,
        {
          operatorId,
          floatBalanceTzs: balance,
        },
        correlationId
      ),
    ]);
    return {
      floatBalanceTzs: balance,
      isFloatBlocked: false,
      emittedEvent: EVENT_SUBJECTS.WALLET_FLOAT_RESTORED,
    };
  }

  return {
    floatBalanceTzs: balance,
    isFloatBlocked: floatAcc.is_float_blocked,
    emittedEvent: null,
  };
}

interface TripFinanceRow {
  id: string;
  trip_code: string;
  customer_id: string;
  operator_id: string | null;
  status: TripStatus;
  payment_method: PaymentMethod;
  gross_fare_tzs: number;
  discount_tzs: number;
  final_fare_tzs: number | null;
  estimated_fare_tzs: number;
  commission_pct: number;
  commission_tzs: number;
  operator_net_tzs: number;
}

const provisionSchema = z.object({
  operatorId: z.string().uuid(),
});

const cashConfirmSchema = z.object({
  tripId: z.string().uuid(),
});

const mobileMoneyInitSchema = z.object({
  tripId: z.string().uuid(),
  customerPhone: z.string().trim().min(9).max(20),
  provider: z.enum(["AZAMPAY", "SELCOM", "CLICKPESA"]).default("AZAMPAY"),
});

const cardInitSchema = z.object({
  tripId: z.string().uuid(),
  provider: z.enum(["FLUTTERWAVE", "STRIPE"]).default("FLUTTERWAVE"),
});

const webhookSchema = z.object({
  providerRef: z.string().trim().min(4).max(120),
  status: z.enum(["SUCCESS", "FAILED"]),
  amountTzs: z.number().int().positive().optional(),
});

const fallbackCashSchema = z.object({
  tripId: z.string().uuid(),
  reason: z.string().trim().max(200).default("Digital payment timed out"),
});

const floatTopupSchema = z.object({
  amountTzs: z.number().int().min(1000).max(500000),
  channel: z
    .enum(["MPESA", "TIGO_PESA", "AIRTEL_MONEY", "HALOPESA", "EZYPESA"])
    .default("MPESA"),
  phone: z.string().trim().min(9).max(20),
  idempotencyKey: z.string().trim().min(4).max(120).optional(),
});

const withdrawSchema = z.object({
  amountTzs: z.number().int().min(1000).max(2000000),
  payoutChannel: z
    .enum(["MPESA", "TIGO_PESA", "AIRTEL_MONEY", "HALOPESA", "EZYPESA"])
    .default("MPESA"),
  destinationPhone: z.string().trim().min(9).max(20),
  idempotencyKey: z.string().trim().min(4).max(120).optional(),
});

export const app = Fastify({
  logger: false,
  genReqId: (req) => {
    const existing = req.headers[REQUEST_ID_HEADER];
    return typeof existing === "string" && existing.length > 0
      ? existing
      : randomUUID();
  },
});

// Preserve raw JSON body string for strict HMAC-SHA256 webhook verification
app.addContentTypeParser(
  "application/json",
  { parseAs: "string" },
  (req, body, done) => {
    const raw = typeof body === "string" ? body : body.toString("utf8");
    (req as unknown as { rawBody?: string }).rawBody = raw;
    if (!raw || raw.trim().length === 0) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch (err) {
      done(err as Error, undefined);
    }
  }
);

app.register(cors, { origin: true, credentials: true });
app.register(helmet, { contentSecurityPolicy: false });
app.register(rateLimit, { max: 240, timeWindow: "1 minute" });

app.addHook("onRequest", async (request, reply) => {
  reply.header(REQUEST_ID_HEADER, request.id);
});

app.get("/", async () => ({
  service: SERVICE_NAME,
  version: SERVICE_VERSION,
  currency: "TZS",
  commissionPct: PLATFORM_FINANCE.DEFAULT_COMMISSION_PCT,
  floatBlockThresholdTzs: PLATFORM_FINANCE.FLOAT_BLOCK_THRESHOLD_TZS,
  endpoints: [
    "/healthz",
    "/readyz",
    "POST /api/v1/wallets/internal/provision",
    "GET /api/v1/wallets/me",
    "POST /api/v1/wallets/float/topup",
    "POST /api/v1/wallets/payouts/withdraw",
    "POST /api/v1/payments/cash/confirm",
    "POST /api/v1/payments/mobile-money/initiate",
    "POST /api/v1/payments/card/initiate",
    "POST /api/v1/payments/webhooks/provider",
    "POST /api/v1/payments/fallback-cash",
    "GET /api/v1/payments/admin/ledger-audit",
  ],
}));

app.get("/healthz", async () => {
  const db = await checkDatabaseHealth();
  return {
    service: SERVICE_NAME,
    status: db.connected ? "ok" : "degraded",
    port: PORT,
    databaseConnected: db.connected,
    latencyMs: db.latencyMs,
    version: SERVICE_VERSION,
    timestamp: new Date().toISOString(),
  };
});

app.get("/readyz", async (_req, reply) => {
  const db = await checkDatabaseHealth();
  reply.code(db.connected ? 200 : 503);
  return { service: SERVICE_NAME, ready: db.connected };
});

// 1. Internal: Provision EARNINGS + COMMISSION_FLOAT wallets on operator.approved
app.post("/api/v1/wallets/internal/provision", async (request, reply) => {
  if (!hasValidInternalSecret(request.headers["x-internal-service-secret"])) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }
  const parsed = provisionSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "VALIDATION_ERROR" });
  }

  const wallets = await ensureOperatorWallets(parsed.data.operatorId);
  return reply.code(200).send({
    operatorId: parsed.data.operatorId,
    earningsBalanceTzs: Number(wallets.earnings.balance_tzs),
    commissionFloatTzs: Number(wallets.commissionFloat.balance_tzs),
    isFloatBlocked: wallets.commissionFloat.is_float_blocked,
  });
});

// 2. Operator Wallet Summary, Ledger & Payout History
app.get("/api/v1/wallets/me", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });
  if (
    caller.role !== UserRole.BODABODA_RIDER &&
    caller.role !== UserRole.BAJAJI_DRIVER &&
    caller.role !== UserRole.ADMIN
  ) {
    return reply.code(403).send({ error: "OPERATOR_ROLE_REQUIRED" });
  }

  const q = request.query as { operatorId?: string };
  const operatorId =
    caller.role === UserRole.ADMIN && q.operatorId
      ? q.operatorId
      : caller.userId;

  const wallets = await ensureOperatorWallets(operatorId);
  const sql = getSql();
  const [entries, payouts] = await Promise.all([
    sql`
      SELECT
        id, journal_id AS "journalId", account_type AS "accountType",
        delta_tzs::int AS "deltaTzs", balance_after_tzs::int AS "balanceAfterTzs",
        entry_type AS "entryType", trip_id AS "tripId", reference,
        created_at AS "createdAt"
      FROM finance.ledger_entries
      WHERE owner_id = ${operatorId}::uuid
      ORDER BY created_at DESC, id DESC
      LIMIT 30
    `,
    sql`
      SELECT
        id, amount_tzs AS "amountTzs", payout_channel AS "payoutChannel",
        destination_phone AS "destinationPhone", status, provider_ref AS "providerRef",
        created_at AS "createdAt", completed_at AS "completedAt"
      FROM finance.payouts
      WHERE operator_id = ${operatorId}::uuid
      ORDER BY created_at DESC
      LIMIT 20
    `,
  ]);

  return reply.code(200).send({
    operatorId,
    currency: "TZS",
    earningsBalanceTzs: Number(wallets.earnings.balance_tzs),
    commissionFloatTzs: Number(wallets.commissionFloat.balance_tzs),
    floatBlockThresholdTzs: PLATFORM_FINANCE.FLOAT_BLOCK_THRESHOLD_TZS,
    isFloatBlocked: wallets.commissionFloat.is_float_blocked,
    ledgerEntries: entries,
    payouts,
  });
});

// 3. Cash Trip Settlement (Rider/Driver confirms Cash collected -> debits 12% commission float)
app.post("/api/v1/payments/cash/confirm", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const parsed = cashConfirmSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "VALIDATION_ERROR" });
  }

  const sql = getSql();
  const tripRows = (await sql`
    SELECT id, trip_code, customer_id, operator_id, status, payment_method,
           gross_fare_tzs, discount_tzs, final_fare_tzs, estimated_fare_tzs,
           commission_pct, commission_tzs, operator_net_tzs
    FROM trip.trips
    WHERE id = ${parsed.data.tripId}::uuid
    LIMIT 1
  `) as unknown as TripFinanceRow[];

  const trip = tripRows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });
  if (!trip.operator_id) {
    return reply.code(409).send({ error: "TRIP_HAS_NO_OPERATOR" });
  }
  if (trip.operator_id !== caller.userId && caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "ASSIGNED_OPERATOR_REQUIRED" });
  }
  if (trip.payment_method !== PaymentMethod.CASH) {
    return reply.code(409).send({
      error: "NOT_A_CASH_TRIP",
      message: "Use /fallback-cash first to convert a timed-out digital trip to Cash.",
    });
  }

  // Idempotent check if already settled
  const existingPay = (await sql`
    SELECT * FROM finance.payments WHERE trip_id = ${trip.id}::uuid LIMIT 1
  `) as Array<{ id: string; status: string; provider_ref: string }>;

  if (existingPay[0]?.status === "CONFIRMED") {
    const wallets = await ensureOperatorWallets(trip.operator_id);
    return reply.code(200).send({
      idempotentReplay: true,
      payment: existingPay[0],
      commissionFloatTzs: Number(wallets.commissionFloat.balance_tzs),
      isFloatBlocked: wallets.commissionFloat.is_float_blocked,
    });
  }

  if (trip.status !== TripStatus.COMPLETED_UNPAID) {
    return reply.code(409).send({
      error: "TRIP_NOT_AWAITING_PAYMENT",
      tripStatus: trip.status,
    });
  }

  const customerPaidTzs = trip.final_fare_tzs ?? trip.estimated_fare_tzs;
  const grossFareTzs = customerPaidTzs + trip.discount_tzs;
  const commissionTzs =
    trip.commission_tzs ||
    Math.round((grossFareTzs * trip.commission_pct) / 100);
  const operatorNetTzs = Math.max(0, grossFareTzs - commissionTzs);
  const idempotencyKey = `cash-settle:${trip.id}`;
  const providerRef = `CASH-${trip.trip_code}`;

  const [wallets, platformComm, promoSubsidy] = await Promise.all([
    ensureOperatorWallets(trip.operator_id),
    getSystemAccount("PLATFORM_COMMISSION"),
    getSystemAccount("PROMO_SUBSIDY"),
  ]);

  const journalLines: JournalLine[] = [
    {
      account: wallets.commissionFloat,
      deltaTzs: -commissionTzs,
      entryType: "CASH_COMMISSION_DEBIT",
      tripId: trip.id,
      reference: providerRef,
    },
    {
      account: platformComm,
      deltaTzs: commissionTzs,
      entryType: "PLATFORM_COMMISSION_CREDIT",
      tripId: trip.id,
      reference: providerRef,
    },
  ];

  // If Customer used a promo code on a Cash trip, Go.boda subsidizes the discount into Operator EARNINGS
  if (trip.discount_tzs > 0) {
    journalLines.push(
      {
        account: promoSubsidy,
        deltaTzs: -trip.discount_tzs,
        entryType: "PROMO_SUBSIDY_COVER",
        tripId: trip.id,
        reference: providerRef,
      },
      {
        account: wallets.earnings,
        deltaTzs: trip.discount_tzs,
        entryType: "PROMO_SUBSIDY_CREDIT",
        tripId: trip.id,
        reference: providerRef,
      }
    );
  }

  const journal = await postBalancedJournal({
    idempotencyKey,
    lines: journalLines,
  });

  const payRows = await sql`
    INSERT INTO finance.payments (
      idempotency_key, trip_id, customer_id, operator_id, payment_method, provider,
      gross_fare_tzs, discount_tzs, customer_paid_tzs, commission_tzs, operator_net_tzs,
      float_offset_tzs, status, provider_ref, confirmed_at
    )
    VALUES (
      ${idempotencyKey}, ${trip.id}::uuid, ${trip.customer_id}::uuid,
      ${trip.operator_id}::uuid, 'CASH', 'CASH_HANDOVER',
      ${grossFareTzs}, ${trip.discount_tzs}, ${customerPaidTzs},
      ${commissionTzs}, ${operatorNetTzs}, 0, 'CONFIRMED', ${providerRef}, NOW()
    )
    ON CONFLICT (trip_id) DO UPDATE SET
      status = 'CONFIRMED',
      payment_method = 'CASH',
      provider = 'CASH_HANDOVER',
      confirmed_at = NOW(),
      updated_at = NOW()
    RETURNING *
  `;

  await Promise.all([
    sql`
      UPDATE trip.trips
      SET status = ${TripStatus.PAID_COMPLETED}, updated_at = NOW()
      WHERE id = ${trip.id}::uuid AND status = ${TripStatus.COMPLETED_UNPAID}
    `,
    sql`
      INSERT INTO trip.state_transitions (
        trip_id, from_status, to_status, actor_id, actor_role, note
      )
      VALUES (
        ${trip.id}::uuid, ${TripStatus.COMPLETED_UNPAID}, ${TripStatus.PAID_COMPLETED},
        ${caller.userId}::uuid, ${caller.role},
        ${`Cash TZS ${customerPaidTzs} confirmed; commission TZS ${commissionTzs} debited from float`}
      )
    `,
    appendOutbox(
      EVENT_SUBJECTS.PAYMENT_CONFIRMED,
      {
        tripId: trip.id,
        operatorId: trip.operator_id,
        amountTzs: customerPaidTzs,
        commissionTzs,
        operatorNetTzs,
        paymentMethod: "CASH",
        journalId: journal.journalId,
      },
      String(request.id)
    ),
  ]);

  const floatGate = await syncOperatorFloatGate(
    trip.operator_id,
    String(request.id)
  );

  return reply.code(200).send({
    idempotentReplay: journal.alreadyPosted,
    journalId: journal.journalId,
    payment: payRows[0],
    commissionFloatTzs: floatGate.floatBalanceTzs,
    isFloatBlocked: floatGate.isFloatBlocked,
    floatEvent: floatGate.emittedEvent,
    emittedEvent: EVENT_SUBJECTS.PAYMENT_CONFIRMED,
  });
});

// 4. Customer initiates Tanzanian Mobile Money STK Push (AzamPay / Selcom / ClickPesa)
app.post("/api/v1/payments/mobile-money/initiate", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const parsed = mobileMoneyInitSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const sql = getSql();
  const tripRows = (await sql`
    SELECT id, trip_code, customer_id, operator_id, status, payment_method,
           gross_fare_tzs, discount_tzs, final_fare_tzs, estimated_fare_tzs,
           commission_pct, commission_tzs, operator_net_tzs
    FROM trip.trips
    WHERE id = ${d.tripId}::uuid
    LIMIT 1
  `) as unknown as TripFinanceRow[];

  const trip = tripRows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });
  if (!trip.operator_id) {
    return reply.code(409).send({ error: "TRIP_HAS_NO_OPERATOR" });
  }
  if (trip.customer_id !== caller.userId && caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }
  if (trip.status !== TripStatus.COMPLETED_UNPAID) {
    return reply.code(409).send({
      error: "TRIP_NOT_AWAITING_PAYMENT",
      tripStatus: trip.status,
    });
  }

  const customerPaidTzs = trip.final_fare_tzs ?? trip.estimated_fare_tzs;
  const grossFareTzs = customerPaidTzs + trip.discount_tzs;
  const commissionTzs =
    trip.commission_tzs ||
    Math.round((grossFareTzs * trip.commission_pct) / 100);
  const operatorNetTzs = Math.max(0, grossFareTzs - commissionTzs);
  const providerRef = `MM-${d.provider}-${randomInt(100000, 999999)}`;
  const idempotencyKey = `digital-init:${trip.id}`;

  const rows = await sql`
    INSERT INTO finance.payments (
      idempotency_key, trip_id, customer_id, operator_id, payment_method, provider,
      gross_fare_tzs, discount_tzs, customer_paid_tzs, commission_tzs, operator_net_tzs,
      status, provider_ref, customer_phone
    )
    VALUES (
      ${idempotencyKey}, ${trip.id}::uuid, ${trip.customer_id}::uuid,
      ${trip.operator_id}::uuid, 'MOBILE_MONEY', ${d.provider},
      ${grossFareTzs}, ${trip.discount_tzs}, ${customerPaidTzs},
      ${commissionTzs}, ${operatorNetTzs}, 'INITIATED', ${providerRef}, ${d.customerPhone}
    )
    ON CONFLICT (trip_id) DO UPDATE SET
      payment_method = 'MOBILE_MONEY',
      provider = EXCLUDED.provider,
      provider_ref = EXCLUDED.provider_ref,
      customer_phone = EXCLUDED.customer_phone,
      status = CASE WHEN finance.payments.status = 'CONFIRMED' THEN 'CONFIRMED' ELSE 'INITIATED' END,
      updated_at = NOW()
    RETURNING *
  `;

  await appendOutbox(
    EVENT_SUBJECTS.PAYMENT_INITIATED,
    {
      tripId: trip.id,
      provider: d.provider,
      providerRef,
      amountTzs: customerPaidTzs,
      customerPhone: d.customerPhone,
    },
    String(request.id)
  );

  return reply.code(202).send({
    stkPushSent: true,
    provider: d.provider,
    providerRef,
    payment: rows[0],
    emittedEvent: EVENT_SUBJECTS.PAYMENT_INITIATED,
  });
});

// 5. Customer initiates Card Checkout (Flutterwave / Stripe)
app.post("/api/v1/payments/card/initiate", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const parsed = cardInitSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "VALIDATION_ERROR" });
  }

  const d = parsed.data;
  const sql = getSql();
  const tripRows = (await sql`
    SELECT id, trip_code, customer_id, operator_id, status, payment_method,
           gross_fare_tzs, discount_tzs, final_fare_tzs, estimated_fare_tzs,
           commission_pct, commission_tzs, operator_net_tzs
    FROM trip.trips
    WHERE id = ${d.tripId}::uuid
    LIMIT 1
  `) as unknown as TripFinanceRow[];

  const trip = tripRows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });
  if (!trip.operator_id) {
    return reply.code(409).send({ error: "TRIP_HAS_NO_OPERATOR" });
  }
  if (trip.customer_id !== caller.userId && caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }
  if (trip.status !== TripStatus.COMPLETED_UNPAID) {
    return reply.code(409).send({ error: "TRIP_NOT_AWAITING_PAYMENT" });
  }

  const customerPaidTzs = trip.final_fare_tzs ?? trip.estimated_fare_tzs;
  const grossFareTzs = customerPaidTzs + trip.discount_tzs;
  const commissionTzs =
    trip.commission_tzs ||
    Math.round((grossFareTzs * trip.commission_pct) / 100);
  const operatorNetTzs = Math.max(0, grossFareTzs - commissionTzs);
  const providerRef = `CARD-${d.provider}-${randomInt(100000, 999999)}`;
  const idempotencyKey = `digital-init:${trip.id}`;

  const rows = await sql`
    INSERT INTO finance.payments (
      idempotency_key, trip_id, customer_id, operator_id, payment_method, provider,
      gross_fare_tzs, discount_tzs, customer_paid_tzs, commission_tzs, operator_net_tzs,
      status, provider_ref
    )
    VALUES (
      ${idempotencyKey}, ${trip.id}::uuid, ${trip.customer_id}::uuid,
      ${trip.operator_id}::uuid, 'CARD', ${d.provider},
      ${grossFareTzs}, ${trip.discount_tzs}, ${customerPaidTzs},
      ${commissionTzs}, ${operatorNetTzs}, 'INITIATED', ${providerRef}
    )
    ON CONFLICT (trip_id) DO UPDATE SET
      payment_method = 'CARD',
      provider = EXCLUDED.provider,
      provider_ref = EXCLUDED.provider_ref,
      status = CASE WHEN finance.payments.status = 'CONFIRMED' THEN 'CONFIRMED' ELSE 'INITIATED' END,
      updated_at = NOW()
    RETURNING *
  `;

  return reply.code(202).send({
    provider: d.provider,
    providerRef,
    checkoutUrl: `https://checkout.goboda.co.tz/card/${providerRef}`,
    payment: rows[0],
  });
});

// 6. HMAC-SHA256 Verified Idempotent Payment Webhook (with Automatic Negative-Float Offsetting!)
app.post("/api/v1/payments/webhooks/provider", async (request, reply) => {
  const sigHeader = request.headers["x-goboda-signature"];
  const rawBody =
    (request as unknown as { rawBody?: string }).rawBody ??
    JSON.stringify(request.body ?? {});

  const expectedSig = computeWebhookSignature(rawBody);
  if (typeof sigHeader !== "string" || !safeEqual(sigHeader, expectedSig)) {
    return reply.code(401).send({
      error: "INVALID_WEBHOOK_SIGNATURE",
      message: "HMAC-SHA256 webhook signature verification failed.",
    });
  }

  const parsed = webhookSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "VALIDATION_ERROR" });
  }

  const d = parsed.data;
  const sql = getSql();
  const payRows = (await sql`
    SELECT * FROM finance.payments WHERE provider_ref = ${d.providerRef} LIMIT 1
  `) as Array<{
    id: string;
    trip_id: string;
    customer_id: string;
    operator_id: string;
    payment_method: PaymentMethod;
    gross_fare_tzs: number;
    discount_tzs: number;
    customer_paid_tzs: number;
    commission_tzs: number;
    operator_net_tzs: number;
    float_offset_tzs: number;
    status: string;
    provider_ref: string;
  }>;

  const payment = payRows[0];
  if (!payment) return reply.code(404).send({ error: "PAYMENT_NOT_FOUND" });

  // Strict idempotent replay guard — duplicate webhooks NEVER double-credit!
  if (payment.status === "CONFIRMED") {
    return reply.code(200).send({
      idempotentReplay: true,
      status: "CONFIRMED",
      providerRef: d.providerRef,
      floatOffsetTzs: payment.float_offset_tzs,
    });
  }

  if (d.status === "FAILED") {
    await Promise.all([
      sql`
        UPDATE finance.payments
        SET status = 'FAILED', updated_at = NOW()
        WHERE id = ${payment.id}::uuid
      `,
      appendOutbox(
        EVENT_SUBJECTS.PAYMENT_FAILED,
        {
          tripId: payment.trip_id,
          providerRef: d.providerRef,
          paymentMethod: payment.payment_method,
        },
        String(request.id)
      ),
    ]);
    return reply.code(200).send({
      status: "FAILED",
      fallbackAvailable: true,
      emittedEvent: EVENT_SUBJECTS.PAYMENT_FAILED,
    });
  }

  // SUCCESS -> Post balanced digital journal + AUTOMATIC NEGATIVE-FLOAT OFFSETTING!
  const [wallets, platformComm, clearingDigital, promoSubsidy] =
    await Promise.all([
      ensureOperatorWallets(payment.operator_id),
      getSystemAccount("PLATFORM_COMMISSION"),
      getSystemAccount("CLEARING_DIGITAL"),
      getSystemAccount("PROMO_SUBSIDY"),
    ]);

  const currentFloat = Number(wallets.commissionFloat.balance_tzs);
  const floatOffsetTzs =
    currentFloat < 0
      ? Math.min(Math.abs(currentFloat), payment.operator_net_tzs)
      : 0;
  const withdrawableCreditTzs = payment.operator_net_tzs - floatOffsetTzs;

  const journalLines: JournalLine[] = [
    {
      account: clearingDigital,
      deltaTzs: -payment.customer_paid_tzs,
      entryType: "CLEARING_DIGITAL_INFLOW",
      tripId: payment.trip_id,
      reference: d.providerRef,
    },
    {
      account: platformComm,
      deltaTzs: payment.commission_tzs,
      entryType: "PLATFORM_COMMISSION_CREDIT",
      tripId: payment.trip_id,
      reference: d.providerRef,
    },
  ];

  if (payment.discount_tzs > 0) {
    journalLines.push({
      account: promoSubsidy,
      deltaTzs: -payment.discount_tzs,
      entryType: "PROMO_SUBSIDY_COVER",
      tripId: payment.trip_id,
      reference: d.providerRef,
    });
  }

  if (floatOffsetTzs > 0) {
    journalLines.push({
      account: wallets.commissionFloat,
      deltaTzs: floatOffsetTzs,
      entryType: "FLOAT_OFFSET_TRANSFER",
      tripId: payment.trip_id,
      reference: d.providerRef,
    });
  }

  if (withdrawableCreditTzs > 0) {
    journalLines.push({
      account: wallets.earnings,
      deltaTzs: withdrawableCreditTzs,
      entryType: "DIGITAL_NET_CREDIT",
      tripId: payment.trip_id,
      reference: d.providerRef,
    });
  }

  const journal = await postBalancedJournal({
    idempotencyKey: `digital-confirm:${payment.trip_id}`,
    lines: journalLines,
  });

  await Promise.all([
    sql`
      UPDATE finance.payments
      SET
        status = 'CONFIRMED',
        float_offset_tzs = ${floatOffsetTzs},
        confirmed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${payment.id}::uuid
    `,
    sql`
      UPDATE trip.trips
      SET status = ${TripStatus.PAID_COMPLETED}, updated_at = NOW()
      WHERE id = ${payment.trip_id}::uuid AND status = ${TripStatus.COMPLETED_UNPAID}
    `,
    sql`
      INSERT INTO trip.state_transitions (
        trip_id, from_status, to_status, actor_id, actor_role, note
      )
      VALUES (
        ${payment.trip_id}::uuid, ${TripStatus.COMPLETED_UNPAID}, ${TripStatus.PAID_COMPLETED},
        NULL, 'SYSTEM',
        ${`${payment.payment_method} confirmed (${d.providerRef}); float offset TZS ${floatOffsetTzs}, net credited TZS ${withdrawableCreditTzs}`}
      )
    `,
    appendOutbox(
      EVENT_SUBJECTS.PAYMENT_CONFIRMED,
      {
        tripId: payment.trip_id,
        operatorId: payment.operator_id,
        amountTzs: payment.customer_paid_tzs,
        commissionTzs: payment.commission_tzs,
        operatorNetTzs: payment.operator_net_tzs,
        floatOffsetTzs,
        withdrawableCreditTzs,
        paymentMethod: payment.payment_method,
        journalId: journal.journalId,
      },
      String(request.id)
    ),
  ]);

  const floatGate = await syncOperatorFloatGate(
    payment.operator_id,
    String(request.id)
  );

  return reply.code(200).send({
    idempotentReplay: journal.alreadyPosted,
    status: "CONFIRMED",
    journalId: journal.journalId,
    floatOffsetTzs,
    withdrawableCreditTzs,
    commissionFloatTzs: floatGate.floatBalanceTzs,
    isFloatBlocked: floatGate.isFloatBlocked,
    floatEvent: floatGate.emittedEvent,
    emittedEvent: EVENT_SUBJECTS.PAYMENT_CONFIRMED,
  });
});

// 7. Mutual Timeout Recovery: Convert failed/timed-out digital payment to Cash TZS
app.post("/api/v1/payments/fallback-cash", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });

  const parsed = fallbackCashSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({ error: "VALIDATION_ERROR" });
  }

  const sql = getSql();
  const tripRows = (await sql`
    SELECT id, customer_id, operator_id, status, payment_method
    FROM trip.trips
    WHERE id = ${parsed.data.tripId}::uuid
    LIMIT 1
  `) as Array<{
    id: string;
    customer_id: string;
    operator_id: string | null;
    status: TripStatus;
    payment_method: PaymentMethod;
  }>;

  const trip = tripRows[0];
  if (!trip) return reply.code(404).send({ error: "TRIP_NOT_FOUND" });
  if (
    trip.customer_id !== caller.userId &&
    trip.operator_id !== caller.userId &&
    caller.role !== UserRole.ADMIN
  ) {
    return reply.code(403).send({ error: "FORBIDDEN" });
  }
  if (trip.status !== TripStatus.COMPLETED_UNPAID) {
    return reply.code(409).send({ error: "TRIP_NOT_AWAITING_PAYMENT" });
  }

  await Promise.all([
    sql`
      UPDATE trip.trips
      SET payment_method = 'CASH', updated_at = NOW()
      WHERE id = ${trip.id}::uuid
    `,
    sql`
      UPDATE finance.payments
      SET status = 'FAILED', updated_at = NOW()
      WHERE trip_id = ${trip.id}::uuid AND status IN ('PENDING', 'INITIATED')
    `,
  ]);

  return reply.code(200).send({
    switchedToCash: true,
    tripId: trip.id,
    reason: parsed.data.reason,
    nextAction: "Operator can now call POST /api/v1/payments/cash/confirm",
  });
});

// 8. Operator 1-Tap Commission Float Top-Up via Mobile Money
app.post("/api/v1/wallets/float/topup", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });
  if (
    caller.role !== UserRole.BODABODA_RIDER &&
    caller.role !== UserRole.BAJAJI_DRIVER &&
    caller.role !== UserRole.ADMIN
  ) {
    return reply.code(403).send({ error: "OPERATOR_ROLE_REQUIRED" });
  }

  const parsed = floatTopupSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const idempotencyKey =
    d.idempotencyKey ?? `float-topup:${caller.userId}:${randomUUID()}`;
  const ref = `TOPUP-${d.channel}-${randomInt(100000, 999999)}`;

  const [wallets, clearingDigital] = await Promise.all([
    ensureOperatorWallets(caller.userId),
    getSystemAccount("CLEARING_DIGITAL"),
  ]);

  const journal = await postBalancedJournal({
    idempotencyKey,
    lines: [
      {
        account: clearingDigital,
        deltaTzs: -d.amountTzs,
        entryType: "FLOAT_TOPUP_CLEARING",
        reference: ref,
      },
      {
        account: wallets.commissionFloat,
        deltaTzs: d.amountTzs,
        entryType: "FLOAT_TOPUP",
        reference: ref,
        metadata: { channel: d.channel, phone: d.phone },
      },
    ],
  });

  const floatGate = await syncOperatorFloatGate(
    caller.userId,
    String(request.id)
  );

  return reply.code(200).send({
    toppedUp: true,
    idempotentReplay: journal.alreadyPosted,
    reference: ref,
    amountTzs: d.amountTzs,
    commissionFloatTzs: floatGate.floatBalanceTzs,
    isFloatBlocked: floatGate.isFloatBlocked,
    emittedEvent: floatGate.emittedEvent,
  });
});

// 9. Operator 1-Tap Instant Earnings Withdrawal to Mobile Money
app.post("/api/v1/wallets/payouts/withdraw", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });
  if (
    caller.role !== UserRole.BODABODA_RIDER &&
    caller.role !== UserRole.BAJAJI_DRIVER &&
    caller.role !== UserRole.ADMIN
  ) {
    return reply.code(403).send({ error: "OPERATOR_ROLE_REQUIRED" });
  }

  const parsed = withdrawSchema.safeParse(request.body);
  if (!parsed.success) {
    return reply.code(400).send({
      error: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
  }

  const d = parsed.data;
  const idempotencyKey =
    d.idempotencyKey ?? `payout:${caller.userId}:${randomUUID()}`;
  const sql = getSql();

  const existingPayout = (await sql`
    SELECT * FROM finance.payouts WHERE idempotency_key = ${idempotencyKey} LIMIT 1
  `) as Array<Record<string, unknown>>;

  if (existingPayout[0]) {
    return reply.code(200).send({
      idempotentReplay: true,
      payout: existingPayout[0],
    });
  }

  const [wallets, clearingDigital] = await Promise.all([
    ensureOperatorWallets(caller.userId),
    getSystemAccount("CLEARING_DIGITAL"),
  ]);

  const currentEarnings = Number(wallets.earnings.balance_tzs);
  if (currentEarnings < d.amountTzs) {
    return reply.code(409).send({
      error: "INSUFFICIENT_EARNINGS_BALANCE",
      availableTzs: currentEarnings,
      requestedTzs: d.amountTzs,
    });
  }

  const providerRef = `PAYOUT-${d.payoutChannel}-${randomInt(100000, 999999)}`;
  const journal = await postBalancedJournal({
    idempotencyKey,
    lines: [
      {
        account: wallets.earnings,
        deltaTzs: -d.amountTzs,
        entryType: "EARNINGS_PAYOUT",
        reference: providerRef,
        metadata: {
          payoutChannel: d.payoutChannel,
          destinationPhone: d.destinationPhone,
        },
      },
      {
        account: clearingDigital,
        deltaTzs: d.amountTzs,
        entryType: "PAYOUT_CLEARING_OUTFLOW",
        reference: providerRef,
      },
    ],
  });

  const payoutRows = await sql`
    INSERT INTO finance.payouts (
      idempotency_key, operator_id, amount_tzs, payout_channel,
      destination_phone, status, provider_ref, completed_at
    )
    VALUES (
      ${idempotencyKey}, ${caller.userId}::uuid, ${d.amountTzs},
      ${d.payoutChannel}, ${d.destinationPhone}, 'COMPLETED',
      ${providerRef}, NOW()
    )
    RETURNING *
  `;

  await appendOutbox(
    EVENT_SUBJECTS.PAYOUT_COMPLETED,
    {
      payoutId: (payoutRows[0] as { id: string }).id,
      operatorId: caller.userId,
      amountTzs: d.amountTzs,
      payoutChannel: d.payoutChannel,
      destinationPhone: d.destinationPhone,
      providerRef,
      journalId: journal.journalId,
    },
    String(request.id)
  );

  return reply.code(201).send({
    payout: payoutRows[0],
    remainingEarningsTzs: currentEarnings - d.amountTzs,
    emittedEvent: EVENT_SUBJECTS.PAYOUT_COMPLETED,
  });
});

// 10. Admin: Real-Time Zero-Drift Double-Entry Ledger Audit & Financial Summary
app.get("/api/v1/payments/admin/ledger-audit", async (request, reply) => {
  const caller = await resolveCaller(request.headers.authorization);
  if (!caller) return reply.code(401).send({ error: "UNAUTHORIZED" });
  if (caller.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: "ADMIN_REQUIRED" });
  }

  const sql = getSql();
  const [driftRows, unbalancedJournals, paySummary, blockedRows, recentPayouts] =
    await Promise.all([
      sql`SELECT COALESCE(SUM(delta_tzs), 0)::bigint AS "totalLedgerDriftTzs" FROM finance.ledger_entries`,
      sql`
        SELECT journal_id AS "journalId", SUM(delta_tzs)::bigint AS "imbalanceTzs"
        FROM finance.ledger_entries
        GROUP BY journal_id
        HAVING SUM(delta_tzs) <> 0
        LIMIT 20
      `,
      sql`
        SELECT
          COUNT(*)::int AS "totalConfirmedPayments",
          COALESCE(SUM(gross_fare_tzs), 0)::bigint AS "gmvTzs",
          COALESCE(SUM(commission_tzs), 0)::bigint AS "platformCommissionTzs",
          COALESCE(SUM(operator_net_tzs), 0)::bigint AS "operatorNetTzs",
          COALESCE(SUM(float_offset_tzs), 0)::bigint AS "floatRecoveredTzs"
        FROM finance.payments
        WHERE status = 'CONFIRMED'
      `,
      sql`
        SELECT owner_id AS "operatorId", balance_tzs::int AS "floatBalanceTzs"
        FROM finance.wallet_accounts
        WHERE account_type = 'COMMISSION_FLOAT' AND is_float_blocked = TRUE
        LIMIT 50
      `,
      sql`
        SELECT id, operator_id AS "operatorId", amount_tzs AS "amountTzs",
               payout_channel AS "payoutChannel", status, provider_ref AS "providerRef",
               created_at AS "createdAt"
        FROM finance.payouts
        ORDER BY created_at DESC
        LIMIT 20
      `,
    ]);

  const totalLedgerDriftTzs = Number(
    (driftRows[0] as { totalLedgerDriftTzs?: string | number })
      ?.totalLedgerDriftTzs ?? 0
  );

  return reply.code(200).send({
    ledgerBalanced: totalLedgerDriftTzs === 0 && unbalancedJournals.length === 0,
    totalLedgerDriftTzs,
    unbalancedJournals,
    summary: paySummary[0],
    floatBlockedOperators: blockedRows,
    recentPayouts,
    timestamp: new Date().toISOString(),
  });
});

export default app;
