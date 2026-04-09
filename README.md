# Erebus

> Privacy-preserving payment pool for AI agents on Stellar × x402

Erebus routes agent payments through a shared pool so no direct on-chain link exists between individual payers and payees. Agents fund the pool, pay for API access via HTTP 402, and queue private payouts — all on Stellar testnet with real USDC.

Built for the **Stellar Agents x402 + Stripe MPP Hackathon**.

---

## On-chain privacy

| Scenario      | Explorer shows              | Private? |
| ------------- | --------------------------- | -------- |
| Standard x402 | Agent → Payee               | ✗        |
| **Erebus**    | Agent → Pool · Pool → Payee | ✓        |

---

## Architecture

```
client/                          React + Vite frontend (Freighter wallet support)
privacy-pool-service/            Express server
  src/server.ts                  Pool logic · x402 paywall · batch processor · balance ledger
config/config.json               OZ Relayer configuration
plugins/x402-facilitator/        Plugin wrapper (self-hosted alternative)
src/                             OZ x402 facilitator plugin source (verify/settle/supported)
```

---

## Quick Start

### 1. Get a free facilitator API key

Visit [channels.openzeppelin.com/testnet/gen](https://channels.openzeppelin.com/testnet/gen) — instant, no signup.

### 2. Generate a pool keypair

```bash
cd privacy-pool-service
node -e "
const sdk = require('@stellar/stellar-sdk');
const kp = sdk.Keypair.random();
console.log('Secret:', kp.secret());
console.log('Public:', kp.publicKey());
"
```

Fund the **Public** address with testnet USDC → [faucet.circle.com](https://faucet.circle.com) (select Stellar testnet).  
Activate the account first → [friendbot.stellar.org/?addr=YOUR_PUBLIC_KEY](https://friendbot.stellar.org).

### 3. Configure

```bash
cd privacy-pool-service
cp .env.example .env
```

```env
FACILITATOR_URL=https://channels.openzeppelin.com/x402/testnet
RELAYER_API_KEY=<key from step 1>
POOL_STELLAR_SECRET=<secret from step 2>
USDC_CONTRACT=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
```

### 4. Run

```bash
# Pool service
cd privacy-pool-service && npm run dev
# → http://localhost:4021

# Frontend
cd client && npm run dev
# → http://localhost:5173
```

### 5. Test end-to-end (CLI)

```bash
cd privacy-pool-service
PAYER_SECRET=S... node test-pay.mjs
# → real on-chain x402 payment, prints tx hash
```

---

## API Reference

| Method | Route                | Description                                           |
| ------ | -------------------- | ----------------------------------------------------- |
| `GET`  | `/health`            | Health check                                          |
| `GET`  | `/fund-pool`         | Pool address + funding instructions                   |
| `POST` | `/deposit`           | Verify on-chain USDC deposit → credit agent balance   |
| `GET`  | `/balance/:address`  | Agent's current credited balance                      |
| `GET`  | `/protected-data`    | x402 paywall — $0.01 USDC to pool, auto-credits payer |
| `POST` | `/pay-privately`     | Queue signed payout intent (deducts balance)          |
| `GET`  | `/pool-status`       | Queue depth, batch timing, agent count                |
| `GET`  | `/failures/:address` | Failed payouts for an agent (all auto-refunded)       |

### POST `/deposit`

```json
{ "agentAddress": "G...", "txHash": "abc123..." }
```

Verifies the tx on Horizon — confirms USDC arrived at the pool, credits exactly that amount. Each tx hash can only be used once.

### POST `/pay-privately`

```json
{
  "agentAddress": "G...",
  "intent": {
    "payeeAddress": "G...",
    "amountStroops": "1000000",
    "nonce": "uuid-v4",
    "signerPublicKey": "<base64 ed25519 pubkey>"
  },
  "signature": "<base64 ed25519 sig of JSON.stringify(intent)>"
}
```

`amountStroops` uses 7 decimal places — `1000000` = 0.1 USDC.  
Returns `HTTP 402` if agent balance is insufficient.

---

## Balance & Failure Accounting

Agents can only queue payouts up to their credited balance. Balance is debited before queuing. If the on-chain transfer fails for any reason, the balance is **immediately refunded** and the failure is logged:

```bash
GET /failures/G...
# → list of failed intents, reason, refunded: true, current balance
```

---

## Environment Variables

| Variable                 | Required | Default         | Description                            |
| ------------------------ | -------- | --------------- | -------------------------------------- |
| `FACILITATOR_URL`        | Yes      | —               | OZ facilitator endpoint                |
| `RELAYER_API_KEY`        | Yes      | —               | OZ API key                             |
| `POOL_STELLAR_SECRET`    | Yes      | —               | Pool account secret key                |
| `USDC_CONTRACT`          | Yes      | —               | USDC Soroban contract address          |
| `STELLAR_NETWORK`        | No       | `testnet`       | `testnet` or `pubnet`                  |
| `STELLAR_RPC_URL`        | No       | Soroban testnet | Soroban RPC URL                        |
| `STELLAR_HORIZON_URL`    | No       | Horizon testnet | Horizon URL (for deposit verification) |
| `BATCH_INTERVAL_SECONDS` | No       | `30`            | Seconds between batch payout runs      |
| `PORT`                   | No       | `4021`          | Server port                            |

---

## Facilitator Options

|            | URL                                              | Key                                                                                    |
| ---------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| OZ Testnet | `https://channels.openzeppelin.com/x402/testnet` | [channels.openzeppelin.com/testnet/gen](https://channels.openzeppelin.com/testnet/gen) |
| OZ Mainnet | `https://channels.openzeppelin.com/x402`         | [channels.openzeppelin.com/gen](https://channels.openzeppelin.com/gen)                 |

---

## Self-hosted Relayer (optional)

If you want to run your own OZ Relayer instead of the hosted facilitator:

```bash
git clone https://github.com/OpenZeppelin/openzeppelin-relayer
cd openzeppelin-relayer
cp ../relayer-plugin-x402-facilitator/config/config.json config/config.json
pnpm start
# API key printed on startup
# FACILITATOR_URL=http://localhost:8080/api/v1/plugins/x402-facilitator/call
```

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
