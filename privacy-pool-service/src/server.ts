/**
 * Privacy Pool Service — Erebus
 *
 * Agents pre-fund a shared pool account. The operator pays services FROM the
 * pool, so on-chain there is no direct link between individual payers and
 * payees. Multiple outgoing payments are batched for efficiency.
 *
 * Balance accounting:
 *   - POST /deposit  → agent proves a USDC deposit tx → credited to their balance
 *   - x402 payments  → payer auto-credited from settlement header
 *   - POST /pay-privately → balance checked & deducted before queuing
 *   - GET  /balance/:address → current credited balance
 */

import "dotenv/config";

import express, { Request, Response } from "express";
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

// ── Environment ───────────────────────────────────────────────────────────────

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) { console.error(`Missing required env var: ${name}`); process.exit(1); }
  return val;
}

const PORT = Number(process.env.PORT) || 4021;
const STELLAR_NETWORK = process.env.STELLAR_NETWORK || "testnet";
const STELLAR_NETWORK_CAIP2 = `stellar:${STELLAR_NETWORK}` as `${string}:${string}`;
const STELLAR_RPC_URL = process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";
const HORIZON_URL = process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
const USDC_CONTRACT = requireEnv("USDC_CONTRACT");
const FACILITATOR_URL = requireEnv("FACILITATOR_URL");
const RELAYER_API_KEY = requireEnv("RELAYER_API_KEY");
const POOL_STELLAR_SECRET = requireEnv("POOL_STELLAR_SECRET");
const BATCH_INTERVAL_MS = Number(process.env.BATCH_INTERVAL_SECONDS || "30") * 1000;

const NETWORK_PASSPHRASE = STELLAR_NETWORK === "testnet" ? Networks.TESTNET : Networks.PUBLIC;

// ── Stellar setup ─────────────────────────────────────────────────────────────

const poolKeypair = Keypair.fromSecret(POOL_STELLAR_SECRET);
const rpc = new StellarRpc.Server(STELLAR_RPC_URL);
const usdcContract = new Contract(USDC_CONTRACT);

// ── Balance ledger ────────────────────────────────────────────────────────────
// Tracks how much USDC each agent has contributed to the pool (in stroops).
// An agent can only queue payouts up to their credited balance.
// Key: Stellar public key (G...)  Value: balance in stroops (bigint)

const agentBalances = new Map<string, bigint>();
// Track which deposit tx hashes we've already credited (prevent replay)
const processedDeposits = new Set<string>();

function getBalance(address: string): bigint {
  return agentBalances.get(address) ?? 0n;
}

function creditBalance(address: string, amountStroops: bigint): void {
  agentBalances.set(address, getBalance(address) + amountStroops);
  console.log(`[ledger] Credited ${amountStroops} stroops to ${address} — new balance: ${getBalance(address)}`);
}

function deductBalance(address: string, amountStroops: bigint): void {
  agentBalances.set(address, getBalance(address) - amountStroops);
  console.log(`[ledger] Deducted ${amountStroops} stroops from ${address} — new balance: ${getBalance(address)}`);
}

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
  agentAddress: string;   // who queued this — for balance tracking
  payeeAddress: string;
  amountStroops: string;
  nonce: string;
  signerPublicKey: string;
  queuedAt: number;
}

const paymentQueue: PaymentIntent[] = [];

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(bodyParser.json());

// x402 paywall — after successful settlement, intercept the PAYMENT-RESPONSE
// header to extract the payer address and auto-credit their pool balance.
app.use((req, _res, next) => {
  if (req.path === "/protected-data" && req.method === "GET") {
    const origSetHeader = _res.setHeader.bind(_res);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_res as any).setHeader = (name: string, value: unknown) => {
      if (name === "PAYMENT-RESPONSE" && typeof value === "string") {
        try {
          const settlement = JSON.parse(Buffer.from(value, "base64").toString()) as {
            payer?: string;
            transaction?: string;
            network?: string;
          };
          if (settlement.payer) {
            // x402 price is $0.01 USDC = 100000 stroops (7 decimals)
            const x402AmountStroops = 100_000n;
            creditBalance(settlement.payer, x402AmountStroops);
            console.log(`[x402] Auto-credited ${settlement.payer} from tx ${settlement.transaction}`);
          }
        } catch { /* ignore parse errors */ }
      }
      return origSetHeader(name, value as string);
    };
  }
  next();
});

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

app.get("/health", (_req, res) => {
  res.json({ status: "ok", network: STELLAR_NETWORK_CAIP2 });
});

/**
 * Pool info — returns pool address for agents to deposit into.
 */
app.get("/fund-pool", (_req, res) => {
  res.json({
    poolAddress: poolKeypair.publicKey(),
    network: STELLAR_NETWORK_CAIP2,
    usdcContract: USDC_CONTRACT,
    message: "Send USDC to poolAddress, then call POST /deposit with your address and the tx hash to credit your balance.",
  });
});

/**
 * Verify a USDC deposit on-chain and credit the agent's balance.
 *
 * Body: { agentAddress: string, txHash: string }
 *
 * We look up the tx on Horizon, confirm:
 *   - destination operation is a USDC transfer to the pool
 *   - tx is confirmed (not pending)
 * Then we credit the agent exactly the amount that arrived.
 */
app.post("/deposit", async (req: Request, res: Response) => {
  const { agentAddress, txHash } = req.body as { agentAddress?: string; txHash?: string };

  if (!agentAddress || !txHash) {
    res.status(400).json({ error: "agentAddress and txHash are required" });
    return;
  }

  if (processedDeposits.has(txHash)) {
    res.status(409).json({ error: "This transaction has already been credited" });
    return;
  }

  try {
    // Fetch the transaction from Horizon
    const txUrl = `${HORIZON_URL}/transactions/${txHash}`;
    const txResp = await fetch(txUrl);
    if (!txResp.ok) {
      res.status(404).json({ error: "Transaction not found on Horizon — is it confirmed?" });
      return;
    }

    const tx = await txResp.json() as { successful: boolean };
    if (!tx.successful) {
      res.status(400).json({ error: "Transaction is not successful on-chain" });
      return;
    }

    // Fetch operations for this tx
    const opsUrl = `${HORIZON_URL}/transactions/${txHash}/operations`;
    const opsResp = await fetch(opsUrl);
    const opsData = await opsResp.json() as { _embedded: { records: Array<{
      type: string;
      asset_code?: string;
      asset_issuer?: string;
      to?: string;
      amount?: string;
      // Soroban invoke_host_function fields
      function?: string;
    }> } };

    const ops = opsData._embedded.records;

    // Look for a USDC payment or Soroban transfer to the pool
    let creditedStroops = 0n;

    for (const op of ops) {
      // Classic payment op
      if (
        op.type === "payment" &&
        op.asset_code === "USDC" &&
        op.to === poolKeypair.publicKey() &&
        op.amount
      ) {
        // Horizon returns amount in XLM-style decimals (e.g. "1.0000000")
        creditedStroops += BigInt(Math.round(parseFloat(op.amount) * 1e7));
      }
    }

    if (creditedStroops === 0n) {
      res.status(400).json({
        error: "No USDC payment to the pool found in this transaction",
        poolAddress: poolKeypair.publicKey(),
      });
      return;
    }

    // Mark deposit as processed and credit balance
    processedDeposits.add(txHash);
    creditBalance(agentAddress, creditedStroops);

    res.json({
      status: "credited",
      agentAddress,
      creditedStroops: creditedStroops.toString(),
      creditedUsdc: (Number(creditedStroops) / 1e7).toFixed(7),
      newBalanceStroops: getBalance(agentAddress).toString(),
      newBalanceUsdc: (Number(getBalance(agentAddress)) / 1e7).toFixed(7),
    });
  } catch (err) {
    console.error("[deposit] Error:", err);
    res.status(500).json({ error: "Failed to verify transaction" });
  }
});

/**
 * Get an agent's current credited pool balance.
 */
app.get("/balance/:address", (req: Request, res: Response) => {
  const address = req.params["address"] as string;
  const balanceStroops = getBalance(address);
  res.json({
    address,
    balanceStroops: balanceStroops.toString(),
    balanceUsdc: (Number(balanceStroops) / 1e7).toFixed(7),
  });
});

/**
 * Protected route — x402 paywall, $0.01 USDC to pool.
 * Payer is auto-credited in the middleware above.
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
 *   agentAddress: string          — Stellar address of the agent (for balance deduction)
 *   intent: { payeeAddress, amountStroops, nonce, signerPublicKey }
 *   signature: base64 ed25519 sig of JSON.stringify(intent)
 *
 * Balance check:
 *   agentBalance >= amountStroops → deduct immediately → queue
 *   agentBalance < amountStroops  → 402 insufficient balance
 */
app.post("/pay-privately", (req: Request, res: Response) => {
  const { agentAddress, intent, signature } = req.body as {
    agentAddress: string;
    intent: Omit<PaymentIntent, "queuedAt" | "agentAddress">;
    signature: string;
  };

  if (!agentAddress || !intent?.payeeAddress || !intent?.amountStroops || !intent?.nonce || !intent?.signerPublicKey || !signature) {
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
  const verified = nacl.sign.detached.verify(message, signatureBytes, publicKeyBytes);
  if (!verified) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  // Deduplicate
  if (paymentQueue.some((p) => p.nonce === intent.nonce)) {
    res.status(409).json({ error: "Duplicate nonce" });
    return;
  }

  // Balance check — agent must have enough credited balance
  const amountStroops = BigInt(intent.amountStroops);
  const balance = getBalance(agentAddress);

  if (balance < amountStroops) {
    res.status(402).json({
      error: "Insufficient pool balance",
      balanceStroops: balance.toString(),
      balanceUsdc: (Number(balance) / 1e7).toFixed(7),
      requiredStroops: amountStroops.toString(),
      requiredUsdc: (Number(amountStroops) / 1e7).toFixed(7),
      hint: "Fund the pool via POST /deposit or pay for a route via x402 first.",
    });
    return;
  }

  // Deduct balance atomically before queuing
  deductBalance(agentAddress, amountStroops);

  paymentQueue.push({ agentAddress, ...intent, queuedAt: Date.now() });

  res.json({
    status: "queued",
    queueDepth: paymentQueue.length,
    nextBatchIn: `${BATCH_INTERVAL_MS / 1000}s`,
    remainingBalanceStroops: getBalance(agentAddress).toString(),
    remainingBalanceUsdc: (Number(getBalance(agentAddress)) / 1e7).toFixed(7),
    message: "Payment queued. The pool (not your account) will send USDC to the payee.",
  });
});

/**
 * Pool status.
 */
app.get("/pool-status", (_req, res) => {
  res.json({
    poolAddress: poolKeypair.publicKey(),
    queueDepth: paymentQueue.length,
    batchIntervalSeconds: BATCH_INTERVAL_MS / 1000,
    network: STELLAR_NETWORK_CAIP2,
    totalAgentsWithBalance: agentBalances.size,
    totalFailedPayments: failedPayments.length,
  });
});

// ── Failed payment log ────────────────────────────────────────────────────────
// Agents can query GET /failures/:address to see what went wrong and verify
// their balance was refunded.

interface FailedPayment {
  intent: PaymentIntent;
  reason: string;
  failedAt: number;
  refunded: boolean;
}

const failedPayments: FailedPayment[] = [];

app.get("/failures/:address", (req: Request, res: Response) => {
  const address = req.params["address"] as string;
  const agentFailures = failedPayments.filter((f) => f.intent.agentAddress === address);
  res.json({
    address,
    failures: agentFailures.map((f) => ({
      payeeAddress: f.intent.payeeAddress,
      amountUsdc: (Number(f.intent.amountStroops) / 1e7).toFixed(7),
      reason: f.reason,
      failedAt: new Date(f.failedAt).toISOString(),
      refunded: f.refunded,
      currentBalanceUsdc: (Number(getBalance(address)) / 1e7).toFixed(7),
    })),
  });
});

// ── Batch processor ───────────────────────────────────────────────────────────

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

  const hash = sendResult.hash;
  for (let i = 0; i < 15; i++) {
    await sleep(2000);
    const status = await rpc.getTransaction(hash);
    if (status.status === StellarRpc.Api.GetTransactionStatus.SUCCESS) return hash;
    if (status.status === StellarRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed on-chain: ${hash}`);
    }
  }
  // Timed out polling — tx may still confirm, treat as unknown
  throw new Error(`Polling timed out for tx: ${hash} — status unknown`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processBatch(): Promise<void> {
  if (paymentQueue.length === 0) return;

  const batch = paymentQueue.splice(0, paymentQueue.length);
  console.log(`[batch] Processing ${batch.length} payment(s)…`);

  await Promise.allSettled(
    batch.map(async (intent) => {
      try {
        const hash = await sendPoolPayment(intent);
        console.log(
          `[batch] ✅ Sent ${intent.amountStroops} stroops → ${intent.payeeAddress} | tx: ${hash}`,
        );
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[batch] ❌ Failed: ${intent.payeeAddress} — ${reason}`);

        // Refund the agent's balance so they are not out of pocket
        creditBalance(intent.agentAddress, BigInt(intent.amountStroops));
        console.log(`[batch] ↩ Refunded ${intent.amountStroops} stroops to ${intent.agentAddress}`);

        // Log for agent to inspect via GET /failures/:address
        failedPayments.push({
          intent,
          reason,
          failedAt: Date.now(),
          refunded: true,
        });
      }
    }),
  );
}

setInterval(() => {
  processBatch().catch((err) => console.error("[batch] Unexpected error:", err));
}, BATCH_INTERVAL_MS);

setInterval(() => {
  if (paymentQueue.length >= 20) {
    processBatch().catch((err) => console.error("[batch] Emergency flush error:", err));
  }
}, 10_000);

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`✅ Erebus Privacy Pool running at http://localhost:${PORT} (${STELLAR_NETWORK_CAIP2})`);
  console.log(`   Pool address   : ${poolKeypair.publicKey()}`);
  console.log(`   USDC contract  : ${USDC_CONTRACT}`);
  console.log(`   Batch interval : ${BATCH_INTERVAL_MS / 1000}s`);
  console.log(`   Facilitator    : ${FACILITATOR_URL}`);
  console.log();
  console.log("Endpoints:");
  console.log("  GET  /health              – health check");
  console.log("  GET  /fund-pool           – pool address");
  console.log("  POST /deposit             – verify on-chain deposit → credit balance");
  console.log("  GET  /balance/:address    – agent's credited balance");
  console.log("  GET  /protected-data      – x402 paywall ($0.01 → pool, auto-credits payer)");
  console.log("  POST /pay-privately       – queue payout (deducts from balance)");
  console.log("  GET  /pool-status         – queue depth & stats");
  console.log("  GET  /failures/:address   – failed payouts (all refunded)");
});
