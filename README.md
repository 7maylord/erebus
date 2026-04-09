# Erebus — Privacy-Preserving x402 Payment Pool on Stellar

Erebus is a privacy-preserving payment layer for AI agents built on Stellar and the x402 protocol. Agents pre-fund a shared pool account. All outgoing payments originate from that pool — no direct on-chain link between individual payers and payees.

Built for the **Stellar Agents x402 + Stripe MPP Hackathon**.

---

## How It Works

```
Agent A ──┐
Agent B ──┼──► Pool Account ──► Payee X  (batch, every 30s)
Agent C ──┘                 └──► Payee Y
```

1. Agents send USDC to the shared **pool address** to fund it.
2. A protected API route requires an x402 payment — the payment goes **to the pool**, not to any individual agent account.
3. An agent posts a signed `PaymentIntent` to `/pay-privately` specifying the payee and amount.
4. Every 30 seconds the batch processor sends USDC **from the pool** to each queued payee.
5. On-chain, every outgoing transaction shows the pool as sender — individual agent identity is hidden.

---

## Architecture

```
relayer-plugin-x402-facilitator/
├── src/                        # OZ Relayer x402 facilitator plugin (verify/settle/supported)
├── privacy-pool-service/       # Express server — pool logic + x402 paywall + batch processor
│   └── src/server.ts
├── client/                     # React + Vite frontend demo
│   └── src/
│       ├── pages/Home.tsx
│       └── pages/Pool.tsx
├── config/config.json          # OZ Relayer configuration
└── plugins/x402-facilitator/   # Plugin wrapper for the relayer
```

**Stack:**
- [OpenZeppelin x402 Facilitator](https://channels.openzeppelin.com) — hosted, no local relayer needed
- [@x402/express](https://www.npmjs.com/package/@x402/express) — HTTP 402 payment middleware
- [@stellar/stellar-sdk](https://www.npmjs.com/package/@stellar/stellar-sdk) v14 — Soroban USDC transfers
- React + Vite — frontend demo

---

## Prerequisites

- Node.js 22+
- A free OZ Relayer API key → [channels.openzeppelin.com/testnet/gen](https://channels.openzeppelin.com/testnet/gen)
- A Stellar testnet pool account funded with USDC → [faucet.circle.com](https://faucet.circle.com) (select Stellar testnet)

---

## Quick Start

### 1. Generate a pool keypair

```bash
cd privacy-pool-service
node -e "
const sdk = require('@stellar/stellar-sdk');
const kp = sdk.Keypair.random();
console.log('Secret:', kp.secret());
console.log('Public:', kp.publicKey());
"
```

Fund the **Public** address with testnet USDC at [faucet.circle.com](https://faucet.circle.com).

### 2. Configure the pool service

```bash
cd privacy-pool-service
cp .env.example .env
```

Edit `.env`:

```env
# Get a free key at https://channels.openzeppelin.com/testnet/gen
FACILITATOR_URL=https://channels.openzeppelin.com/x402/testnet
RELAYER_API_KEY=your-testnet-api-key-here

POOL_STELLAR_SECRET=your-pool-secret-key-here
```

### 3. Run the pool service

```bash
cd privacy-pool-service
npm run dev
# → http://localhost:4021
```

### 4. Run the frontend

```bash
cd client
npm run dev
# → http://localhost:5173
```

---

## API Reference

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/fund-pool` | Returns pool address and funding instructions |
| `GET` | `/protected-data` | x402 paywall — $0.01 USDC to pool unlocks the response |
| `POST` | `/pay-privately` | Queue a signed payment intent for the next batch |
| `GET` | `/pool-status` | Queue depth and batch timing |

### POST `/pay-privately`

```json
{
  "intent": {
    "payeeAddress": "G...",
    "amountStroops": "1000000",
    "nonce": "uuid-v4",
    "signerPublicKey": "<base64 ed25519 public key>"
  },
  "signature": "<base64 ed25519 signature of JSON.stringify(intent)>"
}
```

`amountStroops` uses 7 decimal places: `1000000` = 0.1 USDC.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `FACILITATOR_URL` | Yes | OZ facilitator endpoint |
| `RELAYER_API_KEY` | Yes | OZ API key |
| `POOL_STELLAR_SECRET` | Yes | Pool account secret key |
| `USDC_CONTRACT` | Yes | USDC Soroban contract address (testnet default set) |
| `STELLAR_NETWORK` | No | `testnet` (default) or `pubnet` |
| `STELLAR_RPC_URL` | No | Soroban RPC URL |
| `BATCH_INTERVAL_SECONDS` | No | Seconds between batch runs (default `30`) |
| `PORT` | No | Server port (default `4021`) |

---

## Facilitator Options

| Option | URL |
|--------|-----|
| OZ Testnet (hosted) | `https://channels.openzeppelin.com/x402/testnet` |
| OZ Mainnet (hosted) | `https://channels.openzeppelin.com/x402` |
| Coinbase x402 | See [x402.org](https://www.x402.org/) |

Get a testnet API key at [channels.openzeppelin.com/testnet/gen](https://channels.openzeppelin.com/testnet/gen) — free, instant.

---

## Privacy Model

| Scenario | On-chain visibility |
|----------|---------------------|
| Standard x402 | Agent → Payee (direct link) |
| Erebus pool | Agent → Pool · Pool → Payee (link broken) |

Multiple agents' funds are mixed in the pool before payouts. Batch timing further obscures which agent triggered which payout.

---

## x402 Plugin (for self-hosted relayer)

If you want to run your own relayer instead of using the hosted facilitator:

```bash
# inside your openzeppelin-relayer repo
npm add @openzeppelin/relayer-plugin-x402-facilitator
```

Copy `config/config.json` and `plugins/x402-facilitator/index.ts` from this repo into your relayer, then `pnpm start`.

Exposes:
- `POST /api/v1/plugins/x402-facilitator/call/verify`
- `POST /api/v1/plugins/x402-facilitator/call/settle`
- `GET  /api/v1/plugins/x402-facilitator/call/supported`

---

## Resources

- [x402 Protocol](https://www.x402.org/)
- [Stellar x402 Docs](https://developers.stellar.org/docs/build/apps/x402)
- [OpenZeppelin x402 Plugin Docs](https://docs.openzeppelin.com)
- [OpenZeppelin Channels](https://channels.openzeppelin.com)
- [Circle Testnet USDC Faucet](https://faucet.circle.com)

---

## License

AGPL-3.0
