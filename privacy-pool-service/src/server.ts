/**
 * Privacy Pool Service
 *
 * Agents pre-fund a shared pool account. The operator pays services FROM the
 * pool, so on-chain there is no direct link between individual payers and
 * payees. Multiple outgoing payments are batched for efficiency.
 *
 * Flow:
 *   1. Agent → POST /fund-pool      (top up the pool's USDC balance)
 *   2. Server → GET  /protected-data (x402 paywall — payment goes to pool)
 *   3. Agent → POST /pay-privately  (signed intent queued for batch payout)
 *   4. Batch processor (every BATCH_INTERVAL_SECONDS) → pool transfers USDC
 *      to each payee. All on-chain txs originate from the pool, hiding the
 *      individual agent-to-payee relationship.
 */

import "dotenv/config";

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import nacl from "tweetnacl";
import {
  Keypair,
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  nativeToScVal,
  rpc as StellarRpc,
} from "@stellar/stellar-sdk";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

// ── Environment ──────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return val;
}

const PORT = Number(process.env.PORT) || 4021;
const STELLAR_NETWORK = process.env.STELLAR_NETWORK || "testnet";
const STELLAR_NETWORK_CAIP2 = `stellar:${STELLAR_NETWORK}` as `${string}:${string}`;
const STELLAR_RPC_URL =
  process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";
const USDC_CONTRACT = requireEnv("USDC_CONTRACT");
const FACILITATOR_URL = requireEnv("FACILITATOR_URL");
const RELAYER_API_KEY = requireEnv("RELAYER_API_KEY");
const POOL_STELLAR_SECRET = requireEnv("POOL_STELLAR_SECRET");
const BATCH_INTERVAL_MS =
  Number(process.env.BATCH_INTERVAL_SECONDS || "30") * 1000;

const NETWORK_PASSPHRASE =
  STELLAR_NETWORK === "testnet"
    ? Networks.TESTNET
    : Networks.PUBLIC;

// ── Stellar setup ─────────────────────────────────────────────────────────────

const poolKeypair = Keypair.fromSecret(POOL_STELLAR_SECRET);
const rpc = new StellarRpc.Server(STELLAR_RPC_URL);
const usdcContract = new Contract(USDC_CONTRACT);

// ── x402 facilitator client ───────────────────────────────────────────────────

const facilitatorClient = new HTTPFacilitatorClient({
  url: FACILITATOR_URL,
  createAuthHeaders: async () => ({
    verify: { Authorization: `Bearer ${RELAYER_API_KEY}` },
    settle: { Authorization: `Bearer ${RELAYER_API_KEY}` },
    supported: { Authorization: `Bearer ${RELAYER_API_KEY}` },
  }),
});

const resourceServer = new x402ResourceServer(facilitatorClient).register(
  STELLAR_NETWORK_CAIP2,
  new ExactStellarScheme(),
);

// ── Payment queue ─────────────────────────────────────────────────────────────

interface PaymentIntent {
  payeeAddress: string;
  /** USDC amount in stroops (7 decimal places, e.g. "1000000" = 0.1 USDC) */
  amountStroops: string;
  nonce: string;
  /** base64-encoded ed25519 public key of the signer */
  signerPublicKey: string;
  queuedAt: number;
}

const paymentQueue: PaymentIntent[] = [];

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(bodyParser.json());

// x402 paywall: payments for this route go DIRECTLY to the pool address.
// The pool's on-chain balance grows; individual payers are not linked to payees.
app.use(
  paymentMiddleware(
    {
      "GET /protected-data": {
        accepts: [
          {
            scheme: "exact",
            price: "$0.01",
            network: STELLAR_NETWORK_CAIP2,
            payTo: poolKeypair.publicKey(),
          },
        ],
        description: "Data delivered via privacy-preserving x402 pool payment",
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

// ── Routes ────────────────────────────────────────────────────────────────────

/** Health check */
app.get("/health", (_req, res) => {
  res.json({ status: "ok", network: STELLAR_NETWORK_CAIP2 });
});

/**
 * Pool info — agents send USDC here to join the privacy pool.
 * Returns the pool's public key and current queue depth.
 */
app.get("/fund-pool", (_req, res) => {
  res.json({
    status: "ready",
    poolAddress: poolKeypair.publicKey(),
    network: STELLAR_NETWORK_CAIP2,
    usdcContract: USDC_CONTRACT,
    queueDepth: paymentQueue.length,
    message:
      "Transfer USDC to poolAddress to fund the privacy pool. " +
      "Subsequent payouts come from this shared account — " +
      "no on-chain link between individual depositors and payees.",
  });
});

/**
 * Protected route — requires an x402 payment of $0.01 USDC to the pool.
 * The payment middleware handles verification & settlement before this runs.
 */
app.get("/protected-data", (_req, res) => {
  res.json({
    message: "Content delivered via privacy-preserving x402 pool payment.",
    timestamp: new Date().toISOString(),
    data: {
      insight: "Stellar network TPS: 1,000+",
      latency: "~5 seconds per ledger",
      privacy: "Your identity is pooled with other agents on-chain.",
    },
  });
});

/**
 * Queue a private payment intent.
 *
 * Body:
 *   intent: { payeeAddress, amountStroops, nonce, signerPublicKey }
 *   signature: base64 ed25519 signature of JSON.stringify(intent) with signerPublicKey
 *
 * The payment is added to the in-memory queue and will be settled in the
 * next batch run. The pool sends the funds, not the individual agent.
 */
app.post("/pay-privately", (req, res) => {
  const { intent, signature } = req.body as {
    intent: Omit<PaymentIntent, "queuedAt">;
    signature: string;
  };

  if (
    !intent?.payeeAddress ||
    !intent?.amountStroops ||
    !intent?.nonce ||
    !intent?.signerPublicKey ||
    !signature
  ) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  // Verify ed25519 signature
  let publicKeyBytes: Uint8Array;
  let signatureBytes: Uint8Array;
  try {
    publicKeyBytes = Buffer.from(intent.signerPublicKey, "base64");
    signatureBytes = Buffer.from(signature, "base64");
  } catch {
    res.status(400).json({ error: "Invalid base64 encoding" });
    return;
  }

  const message = new TextEncoder().encode(JSON.stringify(intent));
  const verified = nacl.sign.detached.verify(
    message,
    signatureBytes,
    publicKeyBytes,
  );

  if (!verified) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  // Deduplicate by nonce
  if (paymentQueue.some((p) => p.nonce === intent.nonce)) {
    res.status(409).json({ error: "Duplicate nonce" });
    return;
  }

  paymentQueue.push({ ...intent, queuedAt: Date.now() });

  res.json({
    status: "queued",
    queueDepth: paymentQueue.length,
    nextBatchIn: `${BATCH_INTERVAL_MS / 1000}s`,
    message:
      "Payment queued. When the batch runs, the pool (not your account) " +
      "will send USDC to the payee — preserving your privacy on-chain.",
  });
});

/** Pool status — queue depth and batch interval */
app.get("/pool-status", (_req, res) => {
  res.json({
    poolAddress: poolKeypair.publicKey(),
    queueDepth: paymentQueue.length,
    batchIntervalSeconds: BATCH_INTERVAL_MS / 1000,
    network: STELLAR_NETWORK_CAIP2,
  });
});

// ── Batch processor ───────────────────────────────────────────────────────────

/**
 * Send a single USDC transfer from the pool to a payee using the Soroban
 * token contract. Returns the transaction hash on success.
 *
 * Each Stellar transaction may carry only one Soroban operation, so we
 * submit one transaction per payee. Privacy is still preserved: every
 * outgoing tx originates from the pool address, not from the individual agent.
 */
async function sendPoolPayment(intent: PaymentIntent): Promise<string> {
  const account = await rpc.getAccount(poolKeypair.publicKey());

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      usdcContract.call(
        "transfer",
        nativeToScVal(poolKeypair.publicKey(), { type: "address" }),
        nativeToScVal(intent.payeeAddress, { type: "address" }),
        nativeToScVal(BigInt(intent.amountStroops), { type: "i128" }),
      ),
    )
    .setTimeout(30)
    .build();

  const sim = await rpc.simulateTransaction(tx);

  if (StellarRpc.Api.isSimulationError(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }

  const prepared = StellarRpc.assembleTransaction(tx, sim).build();
  prepared.sign(poolKeypair);

  const sendResult = await rpc.sendTransaction(prepared);

  if (sendResult.status === "ERROR") {
    throw new Error(`Transaction error: ${JSON.stringify(sendResult)}`);
  }

  // Poll for confirmation
  const hash = sendResult.hash;
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    const status = await rpc.getTransaction(hash);
    if (status.status === StellarRpc.Api.GetTransactionStatus.SUCCESS) {
      return hash;
    }
    if (status.status === StellarRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed: ${hash}`);
    }
  }

  return hash; // Return hash even if still pending after polling
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drain the current payment queue.
 *
 * Payments that fail are logged but not re-queued — in production you'd
 * want a dead-letter queue or retry mechanism.
 */
async function processBatch(): Promise<void> {
  if (paymentQueue.length === 0) return;

  // Snapshot and clear atomically to avoid processing new arrivals mid-batch
  const batch = paymentQueue.splice(0, paymentQueue.length);
  console.log(`[batch] Processing ${batch.length} payment(s)…`);

  const results = await Promise.allSettled(
    batch.map(async (intent) => {
      const hash = await sendPoolPayment(intent);
      console.log(
        `[batch] ✅ Sent ${intent.amountStroops} stroops → ${intent.payeeAddress} | tx: ${hash}`,
      );
      return hash;
    }),
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    console.error(`[batch] ❌ ${failures.length} payment(s) failed:`);
    failures.forEach((f) => {
      if (f.status === "rejected") console.error(" ", f.reason);
    });
  }
}

setInterval(() => {
  processBatch().catch((err) =>
    console.error("[batch] Unexpected batch error:", err),
  );
}, BATCH_INTERVAL_MS);

// Also flush immediately if the queue exceeds 20 items
setInterval(() => {
  if (paymentQueue.length >= 20) {
    processBatch().catch((err) =>
      console.error("[batch] Emergency flush error:", err),
    );
  }
}, 10_000);

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(
    `✅ Privacy Pool Service running at http://localhost:${PORT} (${STELLAR_NETWORK_CAIP2})`,
  );
  console.log(`   Pool address : ${poolKeypair.publicKey()}`);
  console.log(`   USDC contract: ${USDC_CONTRACT}`);
  console.log(`   Batch interval: ${BATCH_INTERVAL_MS / 1000}s`);
  console.log(`   Facilitator  : ${FACILITATOR_URL}`);
  console.log();
  console.log("Endpoints:");
  console.log("  GET  /health          – health check");
  console.log("  GET  /fund-pool       – pool address & info");
  console.log("  GET  /protected-data  – x402 paywall ($0.01 USDC → pool)");
  console.log("  POST /pay-privately   – queue a private payout from pool");
  console.log("  GET  /pool-status     – queue depth & batch timing");
});
