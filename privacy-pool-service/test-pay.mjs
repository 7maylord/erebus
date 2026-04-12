/**
 * Erebus Demo Script
 *
 * Simulates a full agent workflow:
 *   1. Check pool status
 *   2. Make 3× x402 micropayments → pool auto-credits agent balance
 *   3. Verify credited balance
 *   4. Queue 3× private payouts to different payees
 *   5. Watch pool queue depth
 *   6. Poll until batch settles and print on-chain tx hashes
 *
 * Usage:
 *   node test-pay.mjs
 *
 * Required in .env:
 *   PAYER_SECRET   — funded testnet Stellar account with USDC
 *   DEMO_PAYEES    — comma-separated G... addresses (at least 3)
 *   SERVER_URL     — pool server URL
 */

import "dotenv/config";
import nacl from "tweetnacl";
import { Keypair } from "@stellar/stellar-sdk";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { createEd25519Signer } from "@x402/stellar";

// ── Config ────────────────────────────────────────────────────────────────────

const PAYER_SECRET = process.env.PAYER_SECRET;
if (!PAYER_SECRET) {
  console.error("❌  Set PAYER_SECRET in .env");
  process.exit(1);
}

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4021";
const RPC_URL =
  process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";
const rawPayees = process.env.DEMO_PAYEES || "";
const payees = rawPayees
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
if (payees.length < 3) {
  console.error(
    "❌  Set DEMO_PAYEES in .env with at least 3 comma-separated G... addresses",
  );
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const amber = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

function separator(label) {
  const line = "─".repeat(60);
  console.log(`\n${amber(line)}`);
  if (label) console.log(bold(`  ${label}`));
  console.log(`${amber(line)}`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function apiGet(path) {
  const res = await fetch(`${SERVER_URL}${path}`);
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`);
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok)
    throw new Error(
      `POST ${path} → HTTP ${res.status}: ${JSON.stringify(data)}`,
    );
  return data;
}

function shortAddr(addr) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── Keypair + signing ─────────────────────────────────────────────────────────

const keypair = Keypair.fromSecret(PAYER_SECRET);
// Raw ed25519 secret (32 bytes seed) + public (32 bytes) for nacl signing
const naclKeypair = nacl.sign.keyPair.fromSeed(keypair.rawSecretKey());
const signerPublicKeyB64 = Buffer.from(naclKeypair.publicKey).toString(
  "base64",
);

function signIntent(intent) {
  const message = new TextEncoder().encode(JSON.stringify(intent));
  const sig = nacl.sign.detached(message, naclKeypair.secretKey);
  return Buffer.from(sig).toString("base64");
}

// ── x402 client ───────────────────────────────────────────────────────────────

const signer = createEd25519Signer(PAYER_SECRET);
const client = new x402Client();
client.register("stellar:*", new ExactStellarScheme(signer, { url: RPC_URL }));
const payFetch = wrapFetchWithPayment(fetch, client);

// ── Main ──────────────────────────────────────────────────────────────────────

console.log(
  `\n${bold("╔══════════════════════════════════════════════════════════╗")}`,
);
console.log(
  `${bold("║")}          ${amber("EREBUS")} — Privacy Pool Demo Script              ${bold("║")}`,
);
console.log(
  `${bold("╚══════════════════════════════════════════════════════════╝")}`,
);
console.log(dim(`  Server  : ${SERVER_URL}`));
console.log(dim(`  Agent   : ${signer.address}`));
console.log(dim(`  Payees  : ${payees.map(shortAddr).join("  ")}`));

// ── Step 1: Pool status ───────────────────────────────────────────────────────

separator("Step 1 / 6 — Pool Status");
const status = await apiGet("/pool-status");
console.log(`  Pool address : ${cyan(status.poolAddress)}`);
console.log(`  Network      : ${status.network}`);
console.log(`  Queue depth  : ${status.queueDepth} pending`);
console.log(`  Agents       : ${status.agentCount} credited`);

// ── Step 2: 3× x402 micropayments ────────────────────────────────────────────

separator("Step 2 / 6 — 1× x402 Micropayment ($0.01 USDC)");
console.log(
  dim("  Each payment: Freighter signs auth entry → pool settles on-chain\n"),
);

const settlements = [];
for (let i = 1; i <= 1; i++) {
  process.stdout.write(`  Payment ${i}/1 … `);
  const t0 = Date.now();
  const res = await payFetch(`${SERVER_URL}/protected-data`);
  if (!res.ok) {
    console.log(red(`FAILED (HTTP ${res.status})`));
    continue;
  }
  const elapsed = Date.now() - t0;
  const header = res.headers.get("PAYMENT-RESPONSE");
  const settlement = header
    ? JSON.parse(Buffer.from(header, "base64").toString())
    : null;
  if (settlement) settlements.push(settlement);
  console.log(green(`✅ ${elapsed}ms`));
  if (settlement) {
    console.log(dim(`     tx: ${settlement.transaction}`));
    console.log(
      dim(
        `     explorer: https://testnet.stellarchain.io/transactions/${settlement.transaction}`,
      ),
    );
  }
  await sleep(1500);
}

// ── Step 3: Check balance ─────────────────────────────────────────────────────

separator("Step 3 / 6 — Agent Balance After x402 Payments");
const balData = await apiGet(`/balance/${signer.address}`);
const balUsdc = (Number(BigInt(balData.balanceStroops)) / 1e7).toFixed(7);
console.log(`  Address : ${cyan(signer.address)}`);
console.log(
  `  Balance : ${green(balUsdc + " USDC")} (${balData.balanceStroops} stroops)`,
);

// ── Step 4: Queue 3 private payouts ──────────────────────────────────────────

separator("Step 4 / 6 — Queue 3 Private Payouts");
console.log(dim("  Pool pays payees — agent address never appears on-chain\n"));

const AMOUNT_STROOPS = "10000000"; // 1 USDC each
const queued = [];

for (let i = 0; i < 3; i++) {
  const payee = payees[i];
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const intent = {
    payeeAddress: payee,
    amountStroops: AMOUNT_STROOPS,
    nonce,
    signerPublicKey: signerPublicKeyB64,
  };
  const signature = signIntent(intent);
  process.stdout.write(
    `  Payout ${i + 1}/3 → ${cyan(shortAddr(payee))} (1 USDC) … `,
  );
  try {
    const result = await apiPost("/pay-privately", {
      agentAddress: signer.address,
      intent,
      signature,
    });
    queued.push({ payee, result });
    console.log(green(`✅ queued`));
    console.log(
      dim(
        `     remaining balance: ${(Number(BigInt(result.remainingBalanceStroops || "0")) / 1e7).toFixed(7)} USDC`,
      ),
    );
  } catch (e) {
    console.log(amber(`⚠  ${e.message}`));
  }
  await sleep(500);
}

// ── Step 5: Pool queue depth ──────────────────────────────────────────────────

separator("Step 5 / 6 — Pool Queue Depth");
const status2 = await apiGet("/pool-status");
console.log(`  Pending payouts : ${amber(String(status2.queueDepth))}`);
console.log(`  Next batch in   : ~${status2.nextBatchInSeconds ?? "?"}s`);
console.log(dim("\n  Payments sit in queue — batched every 30s for privacy"));

// ── Step 6: Wait for batch ────────────────────────────────────────────────────

separator("Step 6 / 6 — Waiting for Batch Settlement");
console.log(dim("  Polling until queue clears…\n"));

let settled = false;
for (let attempt = 0; attempt < 20; attempt++) {
  await sleep(5000);
  const s = await apiGet("/pool-status");
  process.stdout.write(`  [${attempt + 1}/20] queue depth: ${s.queueDepth} … `);
  if (s.queueDepth === 0) {
    console.log(green("batch settled ✅"));
    settled = true;
    break;
  }
  console.log(dim("waiting"));
}

// ── Summary ───────────────────────────────────────────────────────────────────

separator("Summary");

if (settlements.length > 0) {
  console.log(bold("  x402 Payment Transactions:"));
  for (const s of settlements) {
    console.log(`    ${green("✅")} ${dim(s.transaction)}`);
    console.log(
      dim(
        `       https://testnet.stellarchain.io/transactions/${s.transaction}`,
      ),
    );
  }
}

console.log(bold(`\n  Private Payouts Queued : ${queued.length}`));
console.log(
  bold(
    `  Batch Settled          : ${settled ? green("Yes") : amber("Pending — check /pool-status")}`,
  ),
);

const finalBal = await apiGet(`/balance/${signer.address}`);
console.log(
  bold(
    `  Final Agent Balance    : ${green((Number(BigInt(finalBal.balanceStroops)) / 1e7).toFixed(7) + " USDC")}`,
  ),
);

console.log(
  `\n${amber("  Pool address → payee transactions are fully private on-chain.")}`,
);
console.log(dim("  No link between agent and payee exists in the ledger.\n"));
