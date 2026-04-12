# Erebus

> Privacy-preserving payment pool for AI agents on Stellar × x402

Erebus routes agent payments through a shared pool so no direct on-chain link exists between individual payers and payees. Agents fund the pool, pay for API access via HTTP 402, and queue private payouts — all on Stellar with real USDC.

Built for the **Stellar Agents x402 + Stripe MPP Hackathon**.

| | |
|---|---|
| **Frontend** | [erebus-x.vercel.app](https://erebus-x.vercel.app/) |
| **API** | [erebus.up.railway.app](https://erebus.up.railway.app/) |
| **Network** | Stellar Testnet |
| **Token** | USDC (Soroban) |

---

## On-chain privacy

| Scenario | Explorer shows | Private? |
| --- | --- | --- |
| Standard x402 | Agent → Payee directly | ✗ |
| **Erebus** | Agent → Pool · Pool → Payee | ✓ |

Your identity as a payer is never linked to the payee on-chain. All outgoing payments originate from the shared pool address.

---

## How it works

```
Agent                    Erebus Pool              Payee
  │                          │                      │
  │── send USDC ────────────▶│                      │
  │   (auto-credited 99.5%)  │                      │
  │                          │                      │
  │── queue payout intent ──▶│                      │
  │   (balance deducted)     │                      │
  │                          │── batch transfer ───▶│
  │                          │   every 30s          │
  │                          │                      │
```

1. Agent sends USDC to the pool — automatically credited (0.5% fee retained)
2. Agent queues signed payout intents — balance checked and deducted atomically
3. Pool batches outgoing transfers every 30 seconds — all from the pool address
4. On-chain: only `Pool → Payee` is visible. Agent address never appears

---

## Agent Integration Guide

This section is for AI agents or developers who want to use Erebus programmatically to mask their payment trail.

### Step 1 — Get your agent keypair

Generate a Stellar keypair for your agent:

```js
import { Keypair } from "@stellar/stellar-sdk";
const kp = Keypair.random();
console.log("Secret:", kp.secret()); // keep private
console.log("Address:", kp.publicKey()); // your agent address
```

Activate on testnet: `https://friendbot.stellar.org/?addr=YOUR_ADDRESS`

### Step 2 — Fund the pool (auto-credits your balance)

Send USDC to the pool address on Stellar testnet. Your balance is credited automatically within seconds — no API call needed.

```
Pool address: GBP642BQXHOQH3CZLTYTNT26D3BDUU3TOCIRW4PSNBLRL5KBOY6ODBTE
```

A 0.5% fee is retained by the pool. Sending 10 USDC credits you 9.95 USDC.

Get testnet USDC at [faucet.circle.com](https://faucet.circle.com) (select Stellar testnet).

### Step 3 — Check your balance

```bash
GET https://erebus.up.railway.app/balance/{YOUR_ADDRESS}
```

```json
{
  "address": "G...",
  "balanceStroops": "99500000",
  "balanceUsdc": "9.9500000"
}
```

### Step 4 — Queue a private payout

Build a signed payment intent and POST it. The pool will send USDC to the payee on your behalf.

```js
import nacl from "tweetnacl";
import { Keypair } from "@stellar/stellar-sdk";

const keypair = Keypair.fromSecret(AGENT_SECRET);
const naclKeypair = nacl.sign.keyPair.fromSeed(keypair.rawSecretKey());

const intent = {
  payeeAddress: "G...payee...",
  amountStroops: "10000000",   // 1 USDC (7 decimal places)
  nonce: crypto.randomUUID(),
  signerPublicKey: Buffer.from(naclKeypair.publicKey).toString("base64"),
};

const message = new TextEncoder().encode(JSON.stringify(intent));
const signature = Buffer.from(
  nacl.sign.detached(message, naclKeypair.secretKey)
).toString("base64");

const res = await fetch("https://erebus.up.railway.app/pay-privately", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    agentAddress: keypair.publicKey(),
    intent,
    signature,
  }),
});
```

**Response:**

```json
{
  "status": "queued",
  "agentAddress": "G...",
  "payeeAddress": "G...",
  "amountStroops": "10000000",
  "remainingBalanceStroops": "89500000"
}
```

Returns `HTTP 402` if your balance is insufficient.

### Step 5 — Verify settlement

Payouts are batched every 30 seconds. Check queue depth:

```bash
GET https://erebus.up.railway.app/pool-status
```

If a transfer fails for any reason your balance is automatically refunded. Check failures:

```bash
GET https://erebus.up.railway.app/failures/{YOUR_ADDRESS}
```

### Amount reference

| `amountStroops` | USDC |
|---|---|
| `100000` | 0.01 USDC |
| `1000000` | 0.1 USDC |
| `10000000` | 1 USDC |
| `100000000` | 10 USDC |

---

## x402 Payments (pay-per-request)

Agents can also pay for API access using the x402 protocol. Your balance is auto-credited after each successful payment.

```js
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { createEd25519Signer } from "@x402/stellar";

const signer = createEd25519Signer(AGENT_SECRET);
const client = new x402Client();
client.register("stellar:*", new ExactStellarScheme(signer, {
  url: "https://soroban-testnet.stellar.org",
}));

const payFetch = wrapFetchWithPayment(fetch, client);

// Automatically pays $0.01 USDC, credits your pool balance
const res = await payFetch("https://erebus.up.railway.app/protected-data");
const data = await res.json();
```

---

## API Reference

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/health` | Health check |
| `GET` | `/fund-pool` | Pool address + deposit instructions |
| `POST` | `/deposit` | Manually claim a USDC deposit by tx hash |
| `GET` | `/balance/:address` | Agent's credited balance |
| `GET` | `/protected-data` | x402 paywall — $0.01 USDC, auto-credits payer |
| `POST` | `/pay-privately` | Queue a signed private payout |
| `GET` | `/pool-status` | Queue depth, agent count, batch timing |
| `GET` | `/failures/:address` | Failed payouts (all auto-refunded) |

---

## Architecture

```
client/                   React + Vite — Freighter wallet, pool UI
privacy-pool-service/     Express API — pool logic, x402, batch processor
  src/server.ts           Core: balance ledger, Horizon watcher, Soroban transfers
src/                      OZ x402 facilitator plugin (verify / settle / supported)
```

---

## Running locally

### 1. Get a facilitator API key

[channels.openzeppelin.com/testnet/gen](https://channels.openzeppelin.com/testnet/gen) — free, instant.

### 2. Configure

```bash
cd privacy-pool-service
cp .env.example .env
# fill in POOL_STELLAR_SECRET, RELAYER_API_KEY, MONGODB_URI
```

### 3. Run

```bash
# API
cd privacy-pool-service && npm run dev

# Frontend
cd client && npm run dev
```

### 4. Demo simulation

```bash
cd privacy-pool-service
# set PAYER_SECRET and DEMO_PAYEES in .env first
node test-pay.mjs
```

---

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `FACILITATOR_URL` | Yes | — | OZ facilitator endpoint |
| `RELAYER_API_KEY` | Yes | — | OZ API key |
| `POOL_STELLAR_SECRET` | Yes | — | Pool account secret key |
| `USDC_CONTRACT` | Yes | — | USDC Soroban contract address |
| `MONGODB_URI` | Yes | — | MongoDB connection string |
| `STELLAR_NETWORK` | No | `testnet` | `testnet` or `pubnet` |
| `STELLAR_RPC_URL` | No | Soroban testnet | Soroban RPC URL |
| `STELLAR_HORIZON_URL` | No | Horizon testnet | Horizon URL |
| `BATCH_INTERVAL_SECONDS` | No | `30` | Seconds between batch runs |
| `PORT` | No | `4021` | Server port |

---

## Resources

- [x402 Protocol](https://www.x402.org/)
- [Stellar x402 Docs](https://developers.stellar.org/docs/build/apps/x402)
- [OpenZeppelin Channels](https://channels.openzeppelin.com)
- [Circle USDC Testnet Faucet](https://faucet.circle.com)
- [StellarChain Explorer](https://testnet.stellarchain.io/)

---

## License

AGPL-3.0
