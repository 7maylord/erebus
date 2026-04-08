# Privacy-Preserving x402 Payment Pool

**Hackathon Submission Guide – Stellar Agents x402 + Stripe MPP**

**Project Name Suggestion**: Stellar Privacy Pool (or x402 Private Agent Payments)

This guide shows how to build a **privacy-preserving payment pool** using:

- **OpenZeppelin Relayer + x402 Facilitator Plugin** (production-grade settlement)
- Selected parts from **`stellar/x402-stellar`** (middleware, protected routes pattern, and frontend)

**Privacy Goal**: Agents pre-fund a shared **Pool Account**. The operator pays services **from the pool**, so on-chain there is **no direct link** between individual payers and payees. Multiple payments are batched for efficiency.

All components are **free** (testnet + open-source). No paid services required.

---

## Recommended Project Structure

```text
openzeppelin-relayer/                # OZ Relayer (facilitator engine)
├── config/
├── plugins/
│   └── x402-facilitator/
├── privacy-pool-service/            # Your main Express app (NEW folder)
│   ├── src/
│   │   └── server.ts
│   ├── .env
│   └── package.json
├── client/                          # Frontend copied from Stellar repo
└── ... (OZ files)
stellar/x402-stellar/                # Source for copying middleware & frontend
```

---

## Step 1: Configure OpenZeppelin Relayer + x402 Plugin

You already have the repo cloned.

1. Inside `openzeppelin-relayer/plugins/` run:
   ```bash
   pnpm add @openzeppelin/relayer-plugin-x402-facilitator
   ```

2. Create the plugin wrapper:
   ```bash
   mkdir -p plugins/x402-facilitator
   ```

3. Create file `plugins/x402-facilitator/index.ts`:
   ```typescript
   export { handler } from "@openzeppelin/relayer-plugin-x402-facilitator";
   ```

4. Update (or replace) `config/config.json` with this configuration:
   ```json
   {
     "plugins": [
       {
         "id": "x402-facilitator",
         "path": "x402-facilitator/index.ts",
         "timeout": 30,
         "emit_logs": false,
         "emit_traces": false,
         "forward_logs": true,
         "raw_response": true,
         "allow_get_invocation": true,
         "config": {
           "networks": [
             {
               "network": "stellar:testnet",
               "type": "stellar",
               "relayer_id": "stellar-pool-relayer",
               "assets": ["CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA"]
             }
           ]
         }
       }
     ],
     "relayers": [
       {
         "id": "stellar-pool-relayer",
         "name": "Stellar Pool Relayer",
         "network": "testnet",
         "paused": false,
         "network_type": "stellar",
         "signer_id": "local-signer",
         "policies": {
           "fee_payment_strategy": "relayer",
           "min_balance": 0
         }
       }
     ],
     "signers": [
       {
         "id": "local-signer",
         "type": "local",
         "config": {
           "path": "config/keys/local-signer.json",
           "passphrase": { "type": "env", "value": "KEYSTORE_PASSPHRASE" }
         }
       }
     ]
   }
   ```

5. Start the OZ Relayer:
   ```bash
   pnpm start
   ```
   The facilitator will be available at: `http://localhost:8080/api/v1/plugins/x402-facilitator/call`

---

## Step 2: Parts to Copy from stellar/x402-stellar Repo

From your cloned `stellar/x402-stellar` repo, copy these specific parts:

### A. Middleware & x402 Integration Pattern
- Go to `examples/simple-paywall/server/`
- Copy the usage pattern of `@x402/express` middleware (how to protect routes).
- Install the same packages in your `privacy-pool-service`.

### B. Frontend (Recommended for strong demo)
- Copy the entire folder `examples/simple-paywall/client/` into your project (e.g., as `client/` or inside `privacy-pool-service/client/`).
- This gives you a ready React + Vite paywall UI that you can adapt.

> **Note**: Do NOT copy the facilitator code from Stellar repo — we use the OZ version instead.

---

## Step 3: Create the privacy-pool-service

1. Create a new folder `privacy-pool-service` inside the `openzeppelin-relayer` root.
   ```bash
   cd privacy-pool-service
   pnpm init -y
   pnpm add express @stellar/stellar-sdk cors dotenv body-parser tweetnacl @x402/express @x402/core @x402/stellar
   pnpm add -D typescript ts-node @types/express @types/cors
   ```

2. `.env` File (All FREE)
   ```env
   PORT=4021
   NODE_ENV=development
   STELLAR_NETWORK=testnet
   USDC_ISSUER=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
   
   # OZ Facilitator Integration
   FACILITATOR_URL=http://localhost:8080/api/v1/plugins/x402-facilitator/call
   RELAYER_API_KEY=your-relayer-api-key-here # Check OZ startup logs
   
   # Privacy Pool Account
   POOL_STELLAR_SECRET=SB...your-pool-secret-key-here...
   
   # Optional (free) for advanced batching
   CHANNELS_API_KEY=your-free-channels-api-key
   ```

3. `src/server.ts` (Complete Integration)
   ```typescript
   import express from 'express';
   import cors from 'cors';
   import dotenv from 'dotenv';
   import { Keypair, TransactionBuilder, Operation, Asset, Networks, Server, xdr } from '@stellar/stellar-sdk';
   import nacl from 'tweetnacl';
   import { paymentMiddleware, x402ResourceServer } from '@x402/express';
   import { HTTPFacilitatorClient } from '@x402/core/server';
   import { ExactStellarScheme } from '@x402/stellar/exact/server';

   dotenv.config();

   const app = express();
   app.use(cors());
   app.use(express.json());

   const horizon = new Server('https://horizon-testnet.stellar.org');
   const poolKeypair = Keypair.fromSecret(process.env.POOL_STELLAR_SECRET!);

   // In-memory queue for batching
   interface PaymentIntent {
     payeeAddress: string;
     amount: string;
     nonce: string;
     signerPublicKey: string;
   }

   const paymentQueue: PaymentIntent[] = [];
   const BATCH_INTERVAL = 30000; // 30 seconds

   // === OZ Facilitator Client ===
   const facilitatorClient = new HTTPFacilitatorClient({
     url: process.env.FACILITATOR_URL!,
     createAuthHeaders: async () => ({
       verify: { Authorization: `Bearer ${process.env.RELAYER_API_KEY}` },
       settle: { Authorization: `Bearer ${process.env.RELAYER_API_KEY}` },
       supported: { Authorization: `Bearer ${process.env.RELAYER_API_KEY}` },
     }),
   });

   const resourceServer = new x402ResourceServer(facilitatorClient)
     .register("stellar:testnet", new ExactStellarScheme());

   // x402 Middleware (from Stellar repo pattern)
   app.use(
     paymentMiddleware(
       {
         "GET /protected-data": {
           accepts: [{
             scheme: "exact",
             price: "0.01",
             network: "stellar:testnet",
             payTo: poolKeypair.publicKey(),
           }],
           description: "Data protected by privacy pool",
         },
       },
       resourceServer
     )
   );

   app.get('/protected-data', (req, res) => {
     res.json({ message: "This content was delivered via privacy-preserving x402 payment!" });
   });

   // === Privacy Pool Routes ===

   // Fund pool
   app.post('/fund-pool', (req, res) => {
     res.json({ 
       status: 'funded', 
       poolAddress: poolKeypair.publicKey(),
       message: 'Send USDC to this address to join the privacy pool'
     });
   });

   // Pay privately - adds to batch queue
   app.post('/pay-privately', async (req, res) => {
     const { intent, signature } = req.body;

     // Verify signature
     const message = new TextEncoder().encode(JSON.stringify(intent));
     const verified = nacl.sign.detached.verify(
       message,
       Buffer.from(signature, 'base64'),
       Buffer.from(intent.signerPublicKey, 'base64')
     );

     if (!verified) return res.status(401).json({ error: 'Invalid signature' });

     // Add to batch queue
     paymentQueue.push({
       payeeAddress: intent.payeeAddress,
       amount: intent.amount,
       nonce: intent.nonce,
       signerPublicKey: intent.signerPublicKey,
     });

     res.json({
       status: 'queued_for_batching',
       queueSize: paymentQueue.length,
       message: `Payment added to batch queue. Will be settled in next batch (every ${BATCH_INTERVAL/1000}s)`
     });
   });

   // === Batching Logic ===
   async function processBatch() {
     if (paymentQueue.length === 0) return;

     console.log(`Processing batch of ${paymentQueue.length} payments...`);

     const txBuilder = new TransactionBuilder(poolKeypair.publicKey(), {
       fee: '200',
       networkPassphrase: Networks.TESTNET,
     });

     // Add all payments as operations in one transaction
     paymentQueue.forEach((intent) => {
       txBuilder.addOperation(Operation.payment({
         destination: intent.payeeAddress,
         asset: Asset.createNonNativeAsset('USDC', process.env.USDC_ISSUER!),
         amount: intent.amount,
       }));
     });

     const tx = txBuilder.setTimeout(0).build();
     tx.sign(poolKeypair);

     try {
       const result = await horizon.submitTransaction(tx);
       console.log(`✅ Batch settled! Tx Hash: ${result.hash}`);

       // Clear queue after successful submission
       paymentQueue.length = 0;
     } catch (error) {
       console.error('Batch submission failed:', error);
     }
   }

   // Run batch every 30 seconds
   setInterval(processBatch, BATCH_INTERVAL);

   // Optional: Process batch immediately if queue gets too large (e.g., > 20)
   setInterval(() => {
     if (paymentQueue.length > 20) processBatch();
   }, 10000);

   const PORT = process.env.PORT || 4021;
   app.listen(PORT, () => {
     console.log(`✅ Privacy Pool Service with Batching running on http://localhost:${PORT}`);
     console.log(`Batch interval: ${BATCH_INTERVAL / 1000} seconds`);
   });
   ```

---

## Step 4: Frontend Setup

1. Copy the React frontend from `stellar/x402-stellar/examples/simple-paywall/client/` into your project.
2. Update API base URL to point to your `privacy-pool-service`.
3. Add buttons for:
   - Fund Privacy Pool
   - Pay Privately
   - Access Protected Data
4. Display transaction explorer links after each action.

This frontend makes your 2–3 minute demo video clear and professional.

---

## Step 5: Running the Project

1. Start OZ Relayer → `pnpm start` (in `openzeppelin-relayer` root)
2. Start Privacy Pool Service → `ts-node src/server.ts` (in `privacy-pool-service`)
3. Open the frontend and test the full flow.

**For video demo:**
- Show 3 agents funding the pool
- Trigger private payments
- Access a protected x402 route
- Show on-chain transactions (pool → payees, no direct links)

---

## Submission Checklist (DoraHacks)

- [ ] Public GitHub repo with full code + this guide
- [ ] Clear `README.md` (include Mermaid diagram comparing normal x402 vs privacy pool)
- [ ] 2–3 minute video demo with real testnet transactions
- [ ] At least 3–5 real Stellar testnet transaction hashes
- [ ] **Bonus**: Add simple batching (in-memory queue + `setInterval`) to combine multiple private payments into one Stellar transaction.
