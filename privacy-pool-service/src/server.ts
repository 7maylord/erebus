import "dotenv/config";

import mongoose, { Schema, model } from "mongoose";
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
  Horizon,
} from "@stellar/stellar-sdk";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactStellarScheme } from "@x402/stellar/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";

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
const STELLAR_NETWORK_CAIP2 =
  `stellar:${STELLAR_NETWORK}` as `${string}:${string}`;
const STELLAR_RPC_URL =
  process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";
const HORIZON_URL =
  process.env.STELLAR_HORIZON_URL || "https://horizon-testnet.stellar.org";
const horizonServer = new Horizon.Server(HORIZON_URL);
const USDC_CONTRACT = requireEnv("USDC_CONTRACT");
const FACILITATOR_URL = requireEnv("FACILITATOR_URL");
const RELAYER_API_KEY = requireEnv("RELAYER_API_KEY");
const POOL_STELLAR_SECRET = requireEnv("POOL_STELLAR_SECRET");
const BATCH_INTERVAL_MS =
  Number(process.env.BATCH_INTERVAL_SECONDS || "30") * 1000;

const NETWORK_PASSPHRASE =
  STELLAR_NETWORK === "testnet" ? Networks.TESTNET : Networks.PUBLIC;

const poolKeypair = Keypair.fromSecret(POOL_STELLAR_SECRET);
const rpc = new StellarRpc.Server(STELLAR_RPC_URL);
const usdcContract = new Contract(USDC_CONTRACT);

const BalanceDoc = model(
  "Balance",
  new Schema({ address: { type: String, required: true, unique: true }, stroops: { type: String, default: "0" } }),
);
const DepositDoc = model(
  "Deposit",
  new Schema({ txHash: { type: String, required: true, unique: true } }),
);

const agentBalances = new Map<string, bigint>();
const processedDeposits = new Set<string>();

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Missing MONGODB_URI env var");
    process.exit(1);
  }
  await mongoose.connect(uri, { dbName: "erebus" });

  const balances = await BalanceDoc.find();
  for (const b of balances) agentBalances.set(b.address, BigInt(b.stroops));
  const deposits = await DepositDoc.find();
  for (const d of deposits) processedDeposits.add(d.txHash);
  console.log(
    `[ledger] MongoDB connected — ${agentBalances.size} balance(s), ${processedDeposits.size} deposit(s) loaded`,
  );
}

function getBalance(address: string): bigint {
  return agentBalances.get(address) ?? 0n;
}

function creditBalance(address: string, amountStroops: bigint): void {
  const newBal = getBalance(address) + amountStroops;
  agentBalances.set(address, newBal);
  BalanceDoc.findOneAndUpdate(
    { address },
    { $set: { stroops: newBal.toString() } },
    { upsert: true, returnDocument: "after" },
  ).catch((e) => console.error("[ledger] creditBalance DB error:", e));
  console.log(
    `[ledger] Credited ${amountStroops} stroops to ${address} — new balance: ${newBal}`,
  );
}

function deductBalance(address: string, amountStroops: bigint): void {
  const newBal = getBalance(address) - amountStroops;
  agentBalances.set(address, newBal);
  BalanceDoc.findOneAndUpdate(
    { address },
    { $set: { stroops: newBal.toString() } },
    { upsert: true, returnDocument: "after" },
  ).catch((e) => console.error("[ledger] deductBalance DB error:", e));
  console.log(
    `[ledger] Deducted ${amountStroops} stroops from ${address} — new balance: ${newBal}`,
  );
}

function markDepositProcessed(txHash: string): void {
  processedDeposits.add(txHash);
  DepositDoc.findOneAndUpdate(
    { txHash },
    { $set: { txHash } },
    { upsert: true, returnDocument: "after" },
  ).catch((e) => console.error("[ledger] markDeposit DB error:", e));
}

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

interface PaymentIntent {
  agentAddress: string; // who queued this — for balance tracking
  payeeAddress: string;
  amountStroops: string;
  nonce: string;
  signerPublicKey: string;
  queuedAt: number;
}

const paymentQueue: PaymentIntent[] = [];

const app = express();
app.use(
  cors({
    exposedHeaders: [
      "PAYMENT-REQUIRED",
      "PAYMENT-RESPONSE",
      "X-PAYMENT-REQUIREMENTS",
      "X-PAYMENT-RESPONSE",
      "X-PAYMENT",
    ],
  }),
);

app.use(bodyParser.json());

app.use((req, _res, next) => {
  if (req.path === "/protected-data" && req.method === "GET") {
    const origSetHeader = _res.setHeader.bind(_res);

    (_res as unknown as Record<string, unknown>).setHeader = (name: string, value: unknown) => {
      if (name === "PAYMENT-RESPONSE" && typeof value === "string") {
        try {
          const settlement = JSON.parse(
            Buffer.from(value, "base64").toString(),
          ) as {
            payer?: string;
            transaction?: string;
            network?: string;
          };
          if (settlement.payer) {

            const x402AmountStroops = 100_000n;
            creditBalance(settlement.payer, x402AmountStroops);
            console.log(
              `[x402] Auto-credited ${settlement.payer} from tx ${settlement.transaction}`,
            );
          }
        } catch {
          // Ignore malformed PAYMENT-RESPONSE headers
        }
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

app.get("/", (_req, res) => {
  res.json({
    status: "ok",
    network: STELLAR_NETWORK_CAIP2,
    poolAddress: poolKeypair.publicKey(),
  });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", network: STELLAR_NETWORK_CAIP2 });
});

app.get("/fund-pool", (_req, res) => {
  res.json({
    poolAddress: poolKeypair.publicKey(),
    network: STELLAR_NETWORK_CAIP2,
    usdcContract: USDC_CONTRACT,
    message:
      "Send USDC to poolAddress, then call POST /deposit with your address and the tx hash to credit your balance.",
  });
});

app.post("/deposit", async (req: Request, res: Response) => {
  const { agentAddress, txHash } = req.body as {
    agentAddress?: string;
    txHash?: string;
  };

  if (!agentAddress || !txHash) {
    res.status(400).json({ error: "agentAddress and txHash are required" });
    return;
  }

  if (processedDeposits.has(txHash)) {
    res
      .status(409)
      .json({ error: "This transaction has already been credited" });
    return;
  }

  try {

    const txUrl = `${HORIZON_URL}/transactions/${txHash}`;
    const txResp = await fetch(txUrl);
    if (!txResp.ok) {
      res
        .status(404)
        .json({ error: "Transaction not found on Horizon — is it confirmed?" });
      return;
    }

    const tx = (await txResp.json()) as { successful: boolean };
    if (!tx.successful) {
      res.status(400).json({ error: "Transaction is not successful on-chain" });
      return;
    }

    const opsUrl = `${HORIZON_URL}/transactions/${txHash}/operations`;
    const opsResp = await fetch(opsUrl);
    const opsData = (await opsResp.json()) as {
      _embedded: {
        records: Array<{
          type: string;
          asset_code?: string;
          asset_issuer?: string;
          to?: string;
          amount?: string;

          function?: string;
        }>;
      };
    };

    const ops = opsData._embedded.records;

    let creditedStroops = 0n;

    for (const op of ops) {

      if (
        op.type === "payment" &&
        op.asset_code === "USDC" &&
        op.to === poolKeypair.publicKey() &&
        op.amount
      ) {

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

    const FEE_BPS = 50n; // 50 basis points = 0.5%
    const feeStroops = (creditedStroops * FEE_BPS) / 10_000n;
    const netStroops = creditedStroops - feeStroops;

    markDepositProcessed(txHash);
    creditBalance(agentAddress, netStroops);

    console.log(
      `[deposit] ${agentAddress} deposited ${creditedStroops} stroops — fee ${feeStroops} stroops (0.5%) — credited ${netStroops} stroops`,
    );

    res.json({
      status: "credited",
      agentAddress,
      depositedStroops: creditedStroops.toString(),
      depositedUsdc: (Number(creditedStroops) / 1e7).toFixed(7),
      feeStroops: feeStroops.toString(),
      feeUsdc: (Number(feeStroops) / 1e7).toFixed(7),
      creditedStroops: netStroops.toString(),
      creditedUsdc: (Number(netStroops) / 1e7).toFixed(7),
      newBalanceStroops: getBalance(agentAddress).toString(),
      newBalanceUsdc: (Number(getBalance(agentAddress)) / 1e7).toFixed(7),
    });
  } catch (err) {
    console.error("[deposit] Error:", err);
    res.status(500).json({ error: "Failed to verify transaction" });
  }
});

app.get("/balance/:address", (req: Request, res: Response) => {
  const address = req.params["address"] as string;
  const balanceStroops = getBalance(address);
  res.json({
    address,
    balanceStroops: balanceStroops.toString(),
    balanceUsdc: (Number(balanceStroops) / 1e7).toFixed(7),
  });
});

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

app.post("/pay-privately", (req: Request, res: Response) => {
  const { agentAddress, intent, signature } = req.body as {
    agentAddress: string;
    intent: Omit<PaymentIntent, "queuedAt" | "agentAddress">;
    signature: string;
  };

  if (
    !agentAddress ||
    !intent?.payeeAddress ||
    !intent?.amountStroops ||
    !intent?.nonce ||
    !intent?.signerPublicKey ||
    !signature
  ) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

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

  if (paymentQueue.some((p) => p.nonce === intent.nonce)) {
    res.status(409).json({ error: "Duplicate nonce" });
    return;
  }

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

  deductBalance(agentAddress, amountStroops);

  paymentQueue.push({ agentAddress, ...intent, queuedAt: Date.now() });

  res.json({
    status: "queued",
    queueDepth: paymentQueue.length,
    nextBatchIn: `${BATCH_INTERVAL_MS / 1000}s`,
    remainingBalanceStroops: getBalance(agentAddress).toString(),
    remainingBalanceUsdc: (Number(getBalance(agentAddress)) / 1e7).toFixed(7),
    message:
      "Payment queued. The pool (not your account) will send USDC to the payee.",
  });
});

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

interface FailedPayment {
  intent: PaymentIntent;
  reason: string;
  failedAt: number;
  refunded: boolean;
}

const failedPayments: FailedPayment[] = [];

app.get("/failures/:address", (req: Request, res: Response) => {
  const address = req.params["address"] as string;
  const agentFailures = failedPayments.filter(
    (f) => f.intent.agentAddress === address,
  );
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
    if (status.status === StellarRpc.Api.GetTransactionStatus.SUCCESS)
      return hash;
    if (status.status === StellarRpc.Api.GetTransactionStatus.FAILED) {
      throw new Error(`Transaction failed on-chain: ${hash}`);
    }
  }

  throw new Error(`Polling timed out for tx: ${hash} — status unknown`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processBatch(): Promise<void> {
  if (paymentQueue.length === 0) return;

  const batch = paymentQueue.splice(0, paymentQueue.length);
  console.log(`[batch] Processing ${batch.length} payment(s)…`);

  for (const intent of batch) {
    try {
      const hash = await sendPoolPayment(intent);
      console.log(
        `[batch] ✅ Sent ${intent.amountStroops} stroops → ${intent.payeeAddress} | tx: ${hash}`,
      );
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[batch] ❌ Failed: ${intent.payeeAddress} — ${reason}`);

      creditBalance(intent.agentAddress, BigInt(intent.amountStroops));
      console.log(
        `[batch] ↩ Refunded ${intent.amountStroops} stroops to ${intent.agentAddress}`,
      );

      failedPayments.push({
        intent,
        reason,
        failedAt: Date.now(),
        refunded: true,
      });
    }
  }
}

setInterval(() => {
  processBatch().catch((err) =>
    console.error("[batch] Unexpected error:", err),
  );
}, BATCH_INTERVAL_MS);

setInterval(() => {
  if (paymentQueue.length >= 20) {
    processBatch().catch((err) =>
      console.error("[batch] Emergency flush error:", err),
    );
  }
}, 10_000);

function startDepositWatcher() {
  function watch() {
    const closeStream = horizonServer
      .payments()
      .forAccount(poolKeypair.publicKey())
      .cursor("now")
      .stream({
        onmessage: (payment) => {
          const op = payment as unknown as {
            type: string;
            asset_code?: string;
            asset_issuer?: string;
            from?: string;
            to?: string;
            amount?: string;
            transaction_hash?: string;
          };

          if (
            op.type !== "payment" ||
            op.asset_code !== "USDC" ||
            op.to !== poolKeypair.publicKey() ||
            !op.from ||
            !op.amount ||
            !op.transaction_hash ||
            processedDeposits.has(op.transaction_hash)
          ) {
            return;
          }

          const depositedStroops = BigInt(
            Math.round(parseFloat(op.amount) * 1e7),
          );
          const feeStroops = (depositedStroops * 50n) / 10_000n;
          const netStroops = depositedStroops - feeStroops;

          markDepositProcessed(op.transaction_hash);
          creditBalance(op.from, netStroops);

          console.log(
            `[watcher] ✅ Auto-credited ${op.from} — deposited ${op.amount} USDC — fee ${(Number(feeStroops) / 1e7).toFixed(7)} USDC — net ${(Number(netStroops) / 1e7).toFixed(7)} USDC | tx: ${op.transaction_hash}`,
          );
        },
        onerror: (err) => {
          console.error("[watcher] Stream error, reconnecting in 5s…", err);
          closeStream();
          setTimeout(watch, 5000);
        },
      });

    console.log(
      `[watcher] Watching pool ${poolKeypair.publicKey()} for incoming USDC…`,
    );
  }

  watch();
}

connectDB().then(() => {
  startDepositWatcher();
  app.listen(PORT, () => {
  console.log(`✅ Erebus Privacy Pool running`);
  console.log(`   Pool address   : ${poolKeypair.publicKey()}`);
  console.log(`   USDC contract  : ${USDC_CONTRACT}`);
  console.log(`   Batch interval : ${BATCH_INTERVAL_MS / 1000}s`);
  console.log(`   Facilitator    : ${FACILITATOR_URL}`);
  console.log();
  console.log("Endpoints:");
  console.log("  GET  /health              – health check");
  console.log("  GET  /fund-pool           – pool address");
  console.log(
    "  POST /deposit             – verify on-chain deposit → credit balance",
  );
  console.log("  GET  /balance/:address    – agent's credited balance");
  console.log(
    "  GET  /protected-data      – x402 paywall ($0.01 → pool, auto-credits payer)",
  );
  console.log(
    "  POST /pay-privately       – queue payout (deducts from balance)",
  );
  console.log("  GET  /pool-status         – queue depth & stats");
  console.log("  GET  /failures/:address   – failed payouts (all refunded)");
  });
}).catch((err) => {
  console.error("Failed to connect to MongoDB:", err);
  process.exit(1);
});
