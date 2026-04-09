import { useEffect, useState } from "react";
import { Link } from "react-router";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { SERVER_URL, EXPLORER_BASE } from "../constants";
import { connectFreighter, type FreighterSigner } from "../utils/freighterSigner";

const STELLAR_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const RPC_URL = "https://soroban-testnet.stellar.org";

// ── Shared UI ─────────────────────────────────────────────────────────────────

type Status = "idle" | "loading" | "ok" | "error";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fcfcfc", border: "1px solid #e2e2e2", borderRadius: 8, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, color: "#171717" }}>{title}</h2>
      {children}
    </div>
  );
}

function Btn({ onClick, disabled, variant = "dark", children }: {
  onClick: () => void;
  disabled?: boolean;
  variant?: "dark" | "purple";
  children: React.ReactNode;
}) {
  const bg = disabled ? "#d1d5db" : variant === "purple" ? "#5746af" : "#171717";
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ background: bg, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 14, fontWeight: 600, cursor: disabled ? "not-allowed" : "pointer" }}>
      {children}
    </button>
  );
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a href={`${EXPLORER_BASE}/${hash}`} target="_blank" rel="noopener noreferrer"
      style={{ color: "#5746af", fontSize: 13, fontFamily: "Inconsolata, monospace", wordBreak: "break-all" }}>
      {hash} ↗
    </a>
  );
}

function ErrorBox({ text }: { text: string }) {
  return (
    <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 8, padding: 12, fontSize: 13, color: "#b91c1c", fontWeight: 500 }}>
      {text}
    </div>
  );
}

function SuccessBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#dcfce7", border: "1px solid #86efac", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      {children}
    </div>
  );
}

// ── Pool Status ───────────────────────────────────────────────────────────────

interface PoolStatus {
  poolAddress: string;
  queueDepth: number;
  batchIntervalSeconds: number;
  network: string;
}

function PoolInfo() {
  const [status, setStatus] = useState<PoolStatus | null>(null);
  const [fetchStatus, setFetchStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function load() {
    setFetchStatus("loading");
    setError("");
    try {
      const r = await fetch(`${SERVER_URL}/pool-status`);
      if (!r.ok) throw new Error(r.statusText);
      setStatus(await r.json());
      setFetchStatus("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFetchStatus("error");
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <Card title="Pool Status">
      <Btn onClick={load} disabled={fetchStatus === "loading"}>
        {fetchStatus === "loading" ? "Loading…" : "Refresh"}
      </Btn>
      {error && <ErrorBox text={`Could not reach server — is it running? (${error})`} />}
      {status && (
        <dl style={{ display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 16px", fontSize: 14 }}>
          <dt style={{ color: "#6f6f6f", fontWeight: 500 }}>Pool address</dt>
          <dd style={{ fontFamily: "Inconsolata, monospace", wordBreak: "break-all" }}>{status.poolAddress}</dd>
          <dt style={{ color: "#6f6f6f", fontWeight: 500 }}>Network</dt>
          <dd>{status.network}</dd>
          <dt style={{ color: "#6f6f6f", fontWeight: 500 }}>Queue depth</dt>
          <dd>{status.queueDepth} payment(s) pending</dd>
          <dt style={{ color: "#6f6f6f", fontWeight: 500 }}>Batch interval</dt>
          <dd>every {status.batchIntervalSeconds}s</dd>
        </dl>
      )}
    </Card>
  );
}

// ── Freighter x402 Payment ────────────────────────────────────────────────────

interface SettleResult {
  transaction: string;
  network: string;
}

interface ProtectedContent {
  message: string;
  timestamp: string;
  data: Record<string, string>;
}

function FreighterPayment() {
  const [signer, setSigner] = useState<FreighterSigner | null>(null);
  const [connectStatus, setConnectStatus] = useState<Status>("idle");
  const [payStatus, setPayStatus] = useState<Status>("idle");
  const [settle, setSettle] = useState<SettleResult | null>(null);
  const [content, setContent] = useState<ProtectedContent | null>(null);
  const [error, setError] = useState("");

  async function connect() {
    setConnectStatus("loading");
    setError("");
    try {
      const s = await connectFreighter(STELLAR_NETWORK_PASSPHRASE);
      setSigner(s);
      setConnectStatus("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setConnectStatus("error");
    }
  }

  async function pay() {
    if (!signer) return;
    setPayStatus("loading");
    setError("");
    setSettle(null);
    setContent(null);

    try {
      // Build an x402 client backed by Freighter
      const client = new x402Client();
      client.register("stellar:*", new ExactStellarScheme(signer, { url: RPC_URL }));
      const payFetch = wrapFetchWithPayment(fetch, client);

      const res = await payFetch(`${SERVER_URL}/protected-data`);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }

      // Decode settlement header
      const header = res.headers.get("PAYMENT-RESPONSE");
      if (header) {
        setSettle(JSON.parse(atob(header)) as SettleResult);
      }

      setContent(await res.json());
      setPayStatus("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPayStatus("error");
    }
  }

  return (
    <Card title="Pay with Freighter (x402)">
      {/* Explain what will happen */}
      <div style={{ background: "#f5f2ff", border: "1px solid #d7cff9", borderRadius: 8, padding: 16, fontSize: 14, lineHeight: "22px", color: "#171717", fontWeight: 500, display: "flex", flexDirection: "column", gap: 6 }}>
        <strong>What happens when you click Pay:</strong>
        <ol style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
          <li>Freighter asks you to approve signing an auth entry (not a full transaction).</li>
          <li>The x402 client sends the signed auth entry in the request header to the server.</li>
          <li>The OZ facilitator verifies the auth entry, then settles it on-chain — the pool receives $0.01 USDC.</li>
          <li>Server returns 200 + the protected content.</li>
        </ol>
        <p style={{ marginTop: 4, color: "#6f6f6f" }}>
          Your address appears as sender on-chain for this payment. Privacy kicks in on the <em>outgoing</em> side — when the pool pays payees.
        </p>
      </div>

      {/* Step 1: connect */}
      {!signer ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Btn onClick={connect} disabled={connectStatus === "loading"} variant="purple">
            {connectStatus === "loading" ? "Connecting…" : "1. Connect Freighter"}
          </Btn>
          {connectStatus === "error" && <ErrorBox text={error} />}
          <p style={{ fontSize: 13, color: "#6f6f6f" }}>
            Need Freighter? Install at{" "}
            <a href="https://freighter.app" target="_blank" rel="noopener noreferrer" style={{ color: "#5746af" }}>freighter.app</a>
            {" "}and switch to Testnet in its settings.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Connected badge */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ background: "#dcfce7", color: "#166534", borderRadius: 6, padding: "3px 8px", fontWeight: 600 }}>✓ Connected</span>
            <span style={{ fontFamily: "Inconsolata, monospace", color: "#6f6f6f", wordBreak: "break-all" }}>{signer.address}</span>
          </div>

          {/* Step 2: pay */}
          <Btn onClick={pay} disabled={payStatus === "loading"} variant="purple">
            {payStatus === "loading" ? "Waiting for Freighter…" : "2. Pay $0.01 USDC → get content"}
          </Btn>

          {payStatus === "error" && <ErrorBox text={error} />}

          {payStatus === "ok" && settle && content && (
            <SuccessBox>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>✅ Payment settled on-chain</p>
              <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ color: "#6f6f6f" }}>Transaction:</span>
                <TxLink hash={settle.transaction} />
              </div>
              <div style={{ marginTop: 8 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#171717", marginBottom: 6 }}>Protected content:</p>
                <pre style={{ fontSize: 12, fontFamily: "Inconsolata, monospace", whiteSpace: "pre-wrap", color: "#171717", background: "#f0fdf4", padding: 12, borderRadius: 6 }}>
                  {JSON.stringify(content, null, 2)}
                </pre>
              </div>
            </SuccessBox>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Pay Privately ─────────────────────────────────────────────────────────────

interface QueueResult {
  status: string;
  queueDepth: number;
  nextBatchIn: string;
  message: string;
}

function PayPrivately() {
  const [payeeAddress, setPayeeAddress] = useState("");
  const [amountUsdc, setAmountUsdc] = useState("0.10");
  const [fetchStatus, setFetchStatus] = useState<Status>("idle");
  const [result, setResult] = useState<QueueResult | null>(null);
  const [error, setError] = useState("");

  async function submit() {
    setFetchStatus("loading");
    setError("");
    setResult(null);

    const intent = {
      payeeAddress,
      amountStroops: String(Math.round(parseFloat(amountUsdc) * 1e7)),
      nonce: crypto.randomUUID(),
      signerPublicKey: "",
    };

    let publicKeyBase64: string;
    let signatureBase64: string;

    try {
      const keyPair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
      const rawPublic = await crypto.subtle.exportKey("raw", keyPair.publicKey);
      publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(rawPublic)));
      intent.signerPublicKey = publicKeyBase64;

      const messageBytes = new TextEncoder().encode(JSON.stringify(intent));
      const sigBytes = await crypto.subtle.sign("Ed25519", keyPair.privateKey, messageBytes);
      signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));
    } catch (e) {
      setError("Key generation failed: " + (e instanceof Error ? e.message : String(e)));
      setFetchStatus("error");
      return;
    }

    try {
      const r = await fetch(`${SERVER_URL}/pay-privately`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent, signature: signatureBase64 }),
      });
      const json = await r.json();
      if (!r.ok) { setError(json.error || r.statusText); setFetchStatus("error"); return; }
      setResult(json);
      setFetchStatus("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFetchStatus("error");
    }
  }

  return (
    <Card title="Queue a Private Payout (agent API call)">
      {/* Privacy explanation */}
      <div style={{ background: "#f5f2ff", border: "1px solid #d7cff9", borderRadius: 8, padding: 16, fontSize: 14, lineHeight: "22px", color: "#171717", fontWeight: 500, display: "flex", flexDirection: "column", gap: 6 }}>
        <strong>What happens on-chain:</strong>
        <ul style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4 }}>
          <li>Your address is <strong>not</strong> on the explorer for the payout transaction.</li>
          <li>The pool address sends USDC to the payee — that is the only on-chain record.</li>
          <li>The amount you specify is what arrives at the payee, sent from the pool.</li>
          <li>Multiple agents' intents are batched — further obscuring timing.</li>
        </ul>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 14, fontWeight: 600 }}>
          Payee Stellar address
          <input value={payeeAddress} onChange={(e) => setPayeeAddress(e.target.value)}
            placeholder="G..."
            style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 12px", border: "1px solid #e2e2e2", borderRadius: 8, fontSize: 14, fontFamily: "Inconsolata, monospace" }} />
        </label>
        <label style={{ fontSize: 14, fontWeight: 600 }}>
          Amount (USDC)
          <input type="number" min="0.0000001" step="0.01" value={amountUsdc}
            onChange={(e) => setAmountUsdc(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: 4, padding: "8px 12px", border: "1px solid #e2e2e2", borderRadius: 8, fontSize: 14 }} />
        </label>
        <Btn onClick={submit} disabled={fetchStatus === "loading" || !payeeAddress || !amountUsdc}>
          {fetchStatus === "loading" ? "Queueing…" : "Queue Private Payment"}
        </Btn>
      </div>

      {error && <ErrorBox text={error} />}

      {fetchStatus === "ok" && result && (
        <SuccessBox>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#166534" }}>✅ Queued — your address will NOT appear on-chain</p>
          <p style={{ fontSize: 13, color: "#171717" }}>{result.message}</p>
          <p style={{ fontSize: 13, color: "#6f6f6f" }}>
            Queue: {result.queueDepth} intent(s) · Next batch in ~{result.nextBatchIn}
          </p>
        </SuccessBox>
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function Pool() {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "60px 24px", display: "flex", flexDirection: "column", gap: 40 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Link to="/" style={{ textDecoration: "none", fontSize: 14, color: "#6f6f6f", fontWeight: 600 }}>← Back</Link>
        <h1 style={{ fontSize: 36, fontWeight: 600, letterSpacing: -1 }}>Erebus Privacy Pool</h1>
        <p style={{ fontSize: 16, color: "#6f6f6f", fontWeight: 500 }}>
          All outgoing transactions originate from the shared pool — your address is never on the explorer for payouts.
        </p>
      </div>

      <PoolInfo />
      <FreighterPayment />
      <PayPrivately />
    </div>
  );
}
