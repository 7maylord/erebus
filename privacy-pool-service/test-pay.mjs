/**
 * test-pay.mjs
 *
 * Proves the x402 flow works end-to-end:
 *   1. Hits /protected-data → gets 402
 *   2. Builds + signs a Stellar USDC transfer auth entry
 *   3. Retries with X-PAYMENT header → gets 200 + content
 *
 * Usage:
 *   PAYER_SECRET=S... node test-pay.mjs
 */

import "dotenv/config";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { createEd25519Signer } from "@x402/stellar";

const payerSecret = process.env.PAYER_SECRET || process.env.POOL_STELLAR_SECRET;
if (!payerSecret) {
  console.error("Set PAYER_SECRET=S... (a funded testnet account with USDC)");
  process.exit(1);
}

const SERVER_URL = process.env.SERVER_URL || "http://localhost:4021";
const RPC_URL = process.env.STELLAR_RPC_URL || "https://soroban-testnet.stellar.org";

const signer = createEd25519Signer(payerSecret);
const client = new x402Client();
client.register("stellar:*", new ExactStellarScheme(signer, { url: RPC_URL }));

const payFetch = wrapFetchWithPayment(fetch, client);

console.log(`\nTesting x402 payment flow against ${SERVER_URL}/protected-data\n`);

try {
  const start = Date.now();
  const res = await payFetch(`${SERVER_URL}/protected-data`);
  const elapsed = Date.now() - start;

  if (!res.ok) {
    console.error(`❌ Failed: HTTP ${res.status}`);
    console.error(await res.text());
    process.exit(1);
  }

  const data = await res.json();
  const paymentHeader = res.headers.get("PAYMENT-RESPONSE");

  console.log(`✅ HTTP ${res.status} (${elapsed}ms)`);

  if (paymentHeader) {
    const settlement = JSON.parse(atob(paymentHeader));
    console.log(`   tx hash : ${settlement.transaction}`);
    console.log(`   network : ${settlement.network}`);
    console.log(`   explorer: https://stellar.expert/explorer/testnet/tx/${settlement.transaction}`);
  }

  console.log("\nProtected content:");
  console.log(JSON.stringify(data, null, 2));
} catch (err) {
  console.error("❌ Error:", err.message);
  process.exit(1);
}
