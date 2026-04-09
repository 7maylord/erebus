import { useEffect, useState } from "react";
import { Link } from "react-router";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/core/client";
import { ExactStellarScheme } from "@x402/stellar/exact/client";
import { SERVER_URL, EXPLORER_BASE } from "../constants";
import {
  connectFreighter,
  type FreighterSigner,
} from "../utils/freighterSigner";

const STELLAR_NETWORK_PASSPHRASE = "Test SDF Network ; September 2015";
const RPC_URL = "https://soroban-testnet.stellar.org";

// ── Design tokens (mirror CSS vars for inline styles) ─────────────────────────
const C = {
  bg: "var(--bg)",
  bgCard: "var(--bg-card)",
  bgRaised: "var(--bg-raised)",
  border: "var(--border)",
  borderDim: "var(--border-dim)",
  text: "var(--text)",
  textDim: "var(--text-dim)",
  textMuted: "var(--text-muted)",
  accent: "var(--accent)",
  accentDim: "var(--accent-dim)",
  accentBorder: "var(--accent-border)",
  green: "var(--green)",
  greenDim: "var(--green-dim)",
  red: "var(--red)",
  redDim: "var(--red-dim)",
  purple: "var(--purple)",
  purpleDim: "var(--purple-dim)",
};

// ── Shared UI primitives ──────────────────────────────────────────────────────

type Status = "idle" | "loading" | "ok" | "error";

function Card({
  title,
  label,
  children,
}: {
  title: string;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: C.bgCard,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "16px 24px",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <h2
          style={{
            fontSize: 15,
            fontWeight: 700,
            color: C.text,
            letterSpacing: -0.2,
            flex: 1,
          }}
        >
          {title}
        </h2>
        {label && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1,
              textTransform: "uppercase",
              color: C.textMuted,
              background: C.bgRaised,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              padding: "3px 7px",
            }}
          >
            {label}
          </span>
        )}
      </div>
      <div
        style={{
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Btn({
  onClick,
  disabled,
  variant = "accent",
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant?: "accent" | "ghost";
  children: React.ReactNode;
}) {
  const styles: React.CSSProperties =
    variant === "accent"
      ? {
          background: disabled ? C.bgRaised : C.accent,
          color: disabled ? C.textMuted : "#0a0a0f",
          border: "none",
        }
      : {
          background: "transparent",
          color: disabled ? C.textMuted : C.text,
          border: `1px solid ${C.border}`,
        };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        ...styles,
        borderRadius: 8,
        padding: "9px 16px",
        fontSize: 13,
        fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer",
        letterSpacing: -0.1,
        transition: "opacity 0.15s",
      }}
    >
      {children}
    </button>
  );
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={`${EXPLORER_BASE}/${hash}`}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: C.accent,
        fontSize: 12,
        fontFamily: "Inconsolata, monospace",
        wordBreak: "break-all",
        textDecoration: "none",
      }}
    >
      {hash} ↗
    </a>
  );
}

function AlertBox({
  type,
  children,
}: {
  type: "error" | "success" | "info";
  children: React.ReactNode;
}) {
  const colors = {
    error: { bg: C.redDim, border: "rgba(239,68,68,0.3)", text: C.red },
    success: { bg: C.greenDim, border: "rgba(34,197,94,0.3)", text: C.green },
    info: { bg: C.accentDim, border: C.accentBorder, text: C.accent },
  }[type];
  return (
    <div
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        borderRadius: 8,
        padding: "12px 16px",
        fontSize: 13,
        color: colors.text,
        lineHeight: "20px",
      }}
    >
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: C.textMuted,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: C.text,
          fontFamily: mono ? "Inconsolata, monospace" : undefined,
          wordBreak: "break-all",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: "9px 12px",
        background: C.bgRaised,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        fontSize: 13,
        color: C.text,
        fontFamily: type === "text" ? "Inconsolata, monospace" : "inherit",
        outline: "none",
      }}
    />
  );
}

function Label({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: C.textDim,
          letterSpacing: 0.3,
        }}
      >
        {text}
      </span>
      {children}
    </label>
  );
}

// ── Pool Status ───────────────────────────────────────────────────────────────

interface PoolStatus {
  poolAddress: string;
  queueDepth: number;
  batchIntervalSeconds: number;
  network: string;
  totalAgentsWithBalance: number;
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

  useEffect(() => {
    load();
  }, []);

  return (
    <Card title="Pool Status" label="live">
      {error && (
        <AlertBox type="error">
          Could not reach server — is it running? ({error})
        </AlertBox>
      )}
      {status && (
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
        >
          <div style={{ gridColumn: "1 / -1" }}>
            <Stat label="Pool address" value={status.poolAddress} mono />
          </div>
          <Stat label="Network" value={status.network} />
          <Stat
            label="Batch interval"
            value={`${status.batchIntervalSeconds}s`}
          />
          <Stat label="Queue depth" value={`${status.queueDepth} pending`} />
          <Stat
            label="Agents with balance"
            value={String(status.totalAgentsWithBalance)}
          />
        </div>
      )}
      <Btn onClick={load} disabled={fetchStatus === "loading"} variant="ghost">
        {fetchStatus === "loading" ? "Refreshing…" : "↻ Refresh"}
      </Btn>
    </Card>
  );
}

// ── Freighter x402 Payment ────────────────────────────────────────────────────

interface SettleResult {
  transaction: string;
  network: string;
  payer?: string;
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
      const client = new x402Client();
      client.register(
        "stellar:*",
        new ExactStellarScheme(signer, { url: RPC_URL }),
      );
      const payFetch = wrapFetchWithPayment(fetch, client);

      const res = await payFetch(`${SERVER_URL}/protected-data`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

      const header = res.headers.get("PAYMENT-RESPONSE");
      if (header) setSettle(JSON.parse(atob(header)) as SettleResult);

      setContent(await res.json());
      setPayStatus("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPayStatus("error");
    }
  }

  return (
    <Card title="Pay with Freighter" label="x402">
      <AlertBox type="info">
        <strong>What happens:</strong> Freighter signs a Soroban auth entry (not
        a full tx). The x402 middleware verifies + settles on-chain — pool
        receives $0.01 USDC. Your balance is auto-credited so you can queue
        private payouts.
      </AlertBox>

      {!signer ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Btn onClick={connect} disabled={connectStatus === "loading"}>
            {connectStatus === "loading" ? "Connecting…" : "Connect Freighter"}
          </Btn>
          {connectStatus === "error" && (
            <AlertBox type="error">{error}</AlertBox>
          )}
          <p style={{ fontSize: 12, color: C.textMuted }}>
            Need Freighter?{" "}
            <a
              href="https://freighter.app"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: C.accent }}
            >
              freighter.app
            </a>{" "}
            · Switch to Testnet in extension settings.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: C.green,
                display: "inline-block",
              }}
            />
            <span
              style={{
                fontSize: 12,
                fontFamily: "Inconsolata, monospace",
                color: C.textDim,
                wordBreak: "break-all",
              }}
            >
              {signer.address}
            </span>
          </div>

          <Btn onClick={pay} disabled={payStatus === "loading"}>
            {payStatus === "loading"
              ? "Waiting for Freighter…"
              : "Pay $0.01 USDC → unlock content"}
          </Btn>

          {payStatus === "error" && <AlertBox type="error">{error}</AlertBox>}

          {payStatus === "ok" && settle && content && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <AlertBox type="success">
                <strong>✓ Settled on-chain</strong>
                <div style={{ marginTop: 6 }}>
                  <TxLink hash={settle.transaction} />
                </div>
              </AlertBox>
              <div
                style={{
                  background: C.bgRaised,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: 14,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: C.textMuted,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    marginBottom: 8,
                  }}
                >
                  Protected content
                </div>
                <pre
                  style={{
                    fontSize: 12,
                    fontFamily: "Inconsolata, monospace",
                    whiteSpace: "pre-wrap",
                    color: C.text,
                    lineHeight: "18px",
                  }}
                >
                  {JSON.stringify(content, null, 2)}
                </pre>
              </div>
            </div>
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
  remainingBalanceUsdc: string;
  message: string;
}

function PayPrivately() {
  const [payeeAddress, setPayeeAddress] = useState("");
  const [amountUsdc, setAmountUsdc] = useState("0.10");
  const [agentAddress, setAgentAddress] = useState("");
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

    let signatureBase64: string;
    try {
      const kp = await crypto.subtle.generateKey({ name: "Ed25519" }, true, [
        "sign",
        "verify",
      ]);
      const rawPub = await crypto.subtle.exportKey("raw", kp.publicKey);
      intent.signerPublicKey = btoa(
        String.fromCharCode(...new Uint8Array(rawPub)),
      );
      const sig = await crypto.subtle.sign(
        "Ed25519",
        kp.privateKey,
        new TextEncoder().encode(JSON.stringify(intent)),
      );
      signatureBase64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
    } catch (e) {
      setError(
        "Key generation failed: " +
          (e instanceof Error ? e.message : String(e)),
      );
      setFetchStatus("error");
      return;
    }

    try {
      const r = await fetch(`${SERVER_URL}/pay-privately`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentAddress,
          intent,
          signature: signatureBase64,
        }),
      });
      const json = await r.json();
      if (!r.ok) {
        setError(json.error || r.statusText);
        setFetchStatus("error");
        return;
      }
      setResult(json);
      setFetchStatus("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setFetchStatus("error");
    }
  }

  return (
    <Card title="Queue Private Payout" label="pool">
      <AlertBox type="info">
        Your address will <strong>not</strong> appear on the explorer. The pool
        sends USDC to the payee. Requires a credited balance — pay for a route
        first, or deposit via POST /deposit.
      </AlertBox>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Label text="Your Stellar address (for balance check)">
          <Input
            value={agentAddress}
            onChange={setAgentAddress}
            placeholder="G... (your address)"
          />
        </Label>
        <Label text="Payee address">
          <Input
            value={payeeAddress}
            onChange={setPayeeAddress}
            placeholder="G... (recipient)"
          />
        </Label>
        <Label text="Amount (USDC)">
          <Input
            type="number"
            value={amountUsdc}
            onChange={setAmountUsdc}
            placeholder="0.10"
          />
        </Label>
        <Btn
          onClick={submit}
          disabled={
            fetchStatus === "loading" ||
            !payeeAddress ||
            !amountUsdc ||
            !agentAddress
          }
        >
          {fetchStatus === "loading" ? "Queueing…" : "Queue Private Payment"}
        </Btn>
      </div>

      {error && <AlertBox type="error">{error}</AlertBox>}

      {fetchStatus === "ok" && result && (
        <AlertBox type="success">
          <strong>✓ Queued</strong> — your address is not in the payout
          transaction.
          <div
            style={{ marginTop: 6, fontSize: 12, color: C.green, opacity: 0.8 }}
          >
            Queue: {result.queueDepth} · Next batch: ~{result.nextBatchIn} ·
            Remaining balance: {result.remainingBalanceUsdc} USDC
          </div>
        </AlertBox>
      )}
    </Card>
  );
}

// ── Fund Pool ─────────────────────────────────────────────────────────────────

interface DepositResult {
  status: string;
  creditedUsdc: string;
  newBalanceUsdc: string;
}

interface FundPoolInfo {
  poolAddress: string;
  network: string;
  usdcContract: string;
}

function FundPool() {
  const [poolInfo, setPoolInfo] = useState<FundPoolInfo | null>(null);
  const [agentAddress, setAgentAddress] = useState("");
  const [txHash, setTxHash] = useState("");
  const [claimStatus, setClaimStatus] = useState<Status>("idle");
  const [result, setResult] = useState<DepositResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${SERVER_URL}/fund-pool`)
      .then((r) => r.json())
      .then(setPoolInfo)
      .catch(() => {});
  }, []);

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  async function claimDeposit() {
    setClaimStatus("loading");
    setError("");
    setResult(null);
    try {
      const r = await fetch(`${SERVER_URL}/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentAddress, txHash }),
      });
      const json = await r.json();
      if (!r.ok) {
        setError(json.error || r.statusText);
        setClaimStatus("error");
        return;
      }
      setResult(json);
      setClaimStatus("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setClaimStatus("error");
    }
  }

  return (
    <Card title="Fund the Pool" label="deposit">
      {/* Honest privacy note */}
      <div
        style={{
          background: C.bgRaised,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: 14,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠</span>
          <div style={{ fontSize: 13, color: C.textDim, lineHeight: "20px" }}>
            <strong style={{ color: C.text }}>
              Deposit privacy is limited.
            </strong>{" "}
            Sending USDC directly to the pool is visible on-chain — your address
            appears as sender. The privacy model applies to{" "}
            <strong style={{ color: C.accent }}>outgoing payouts</strong> only:
            the pool sends funds to payees, and your address never appears in
            those transactions.
          </div>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            marginTop: 4,
          }}
        >
          <div
            style={{
              background: "var(--red-dim)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: 12,
            }}
          >
            <div style={{ color: C.red, fontWeight: 700, marginBottom: 2 }}>
              Deposit (visible)
            </div>
            <code
              style={{
                color: C.textDim,
                fontFamily: "Inconsolata, monospace",
                fontSize: 11,
              }}
            >
              You → Pool
            </code>
          </div>
          <div
            style={{
              background: "var(--green-dim)",
              border: "1px solid rgba(34,197,94,0.2)",
              borderRadius: 6,
              padding: "8px 10px",
              fontSize: 12,
            }}
          >
            <div style={{ color: C.green, fontWeight: 700, marginBottom: 2 }}>
              Payout (private)
            </div>
            <code
              style={{
                color: C.textDim,
                fontFamily: "Inconsolata, monospace",
                fontSize: 11,
              }}
            >
              Pool → Payee
            </code>
          </div>
        </div>
      </div>

      {/* Step 1: send USDC */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: C.textMuted,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Step 1 — Send USDC to pool
        </div>
        {poolInfo ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: C.bgRaised,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                padding: "10px 14px",
              }}
            >
              <code
                style={{
                  flex: 1,
                  fontSize: 12,
                  fontFamily: "Inconsolata, monospace",
                  color: C.text,
                  wordBreak: "break-all",
                }}
              >
                {poolInfo.poolAddress}
              </code>
              <button
                onClick={() => copy(poolInfo.poolAddress)}
                style={{
                  background: copied ? "var(--green-dim)" : C.accentDim,
                  border: `1px solid ${copied ? "rgba(34,197,94,0.3)" : C.accentBorder}`,
                  color: copied ? C.green : C.accent,
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                  flexShrink: 0,
                  letterSpacing: 0.5,
                }}
              >
                {copied ? "✓ COPIED" : "COPY"}
              </button>
            </div>
            <p style={{ fontSize: 12, color: C.textMuted, lineHeight: "18px" }}>
              Network:{" "}
              <span style={{ color: C.textDim }}>{poolInfo.network}</span>
              {" · "}
              Asset:{" "}
              <a
                href={`https://stellar.expert/explorer/testnet/contract/${poolInfo.usdcContract}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: C.accent }}
              >
                USDC ↗
              </a>
              {" · "}
              Get testnet USDC:{" "}
              <a
                href="https://faucet.circle.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: C.accent }}
              >
                faucet.circle.com ↗
              </a>
            </p>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: C.textMuted }}>
            Loading pool address…
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${C.borderDim}` }} />

      {/* Step 2: claim deposit */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: C.textMuted,
            letterSpacing: 1,
            textTransform: "uppercase",
          }}
        >
          Step 2 — Claim your deposit
        </div>
        <p style={{ fontSize: 12, color: C.textMuted, lineHeight: "18px" }}>
          After sending, paste your address and the transaction hash. The server
          verifies on Horizon and credits your balance.
        </p>
        <Label text="Your Stellar address">
          <Input
            value={agentAddress}
            onChange={setAgentAddress}
            placeholder="G..."
          />
        </Label>
        <Label text="Transaction hash">
          <Input value={txHash} onChange={setTxHash} placeholder="abc123..." />
        </Label>
        <Btn
          onClick={claimDeposit}
          disabled={claimStatus === "loading" || !agentAddress || !txHash}
        >
          {claimStatus === "loading"
            ? "Verifying on Horizon…"
            : "Claim Deposit"}
        </Btn>
      </div>

      {error && <AlertBox type="error">{error}</AlertBox>}

      {claimStatus === "ok" && result && (
        <AlertBox type="success">
          <strong>✓ Credited {result.creditedUsdc} USDC</strong>
          <div style={{ marginTop: 4, fontSize: 12, opacity: 0.85 }}>
            New balance: {result.newBalanceUsdc} USDC — you can now queue
            private payouts.
          </div>
        </AlertBox>
      )}
    </Card>
  );
}

// ── Balance Checker ───────────────────────────────────────────────────────────

interface BalanceInfo {
  address: string;
  balanceUsdc: string;
}

function BalanceChecker() {
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState<BalanceInfo | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function check() {
    if (!address) return;
    setStatus("loading");
    setError("");
    setBalance(null);
    try {
      const r = await fetch(`${SERVER_URL}/balance/${address}`);
      if (!r.ok) throw new Error(r.statusText);
      setBalance(await r.json());
      setStatus("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  return (
    <Card title="Check Balance" label="ledger">
      <p style={{ fontSize: 13, color: C.textDim, lineHeight: "20px" }}>
        Query an agent's credited pool balance — how much they can queue in
        private payouts.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <Input
            value={address}
            onChange={setAddress}
            placeholder="G... (Stellar address)"
          />
        </div>
        <Btn
          onClick={check}
          disabled={status === "loading" || !address}
          variant="ghost"
        >
          {status === "loading" ? "…" : "Check"}
        </Btn>
      </div>
      {error && <AlertBox type="error">{error}</AlertBox>}
      {status === "ok" && balance && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: C.bgRaised,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            padding: "12px 16px",
          }}
        >
          <code
            style={{
              fontSize: 12,
              fontFamily: "Inconsolata, monospace",
              color: C.textDim,
              wordBreak: "break-all",
              flex: 1,
              marginRight: 16,
            }}
          >
            {balance.address}
          </code>
          <span
            style={{
              fontSize: 20,
              fontWeight: 700,
              fontFamily: "Inconsolata, monospace",
              color: C.accent,
              flexShrink: 0,
            }}
          >
            {balance.balanceUsdc}{" "}
            <span style={{ fontSize: 13, color: C.textDim }}>USDC</span>
          </span>
        </div>
      )}
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function Pool() {
  return (
    <div
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "60px 24px 100px",
        display: "flex",
        flexDirection: "column",
        gap: 32,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <Link
          to="/"
          style={{
            textDecoration: "none",
            fontSize: 13,
            color: C.textMuted,
            fontWeight: 600,
            letterSpacing: 0.3,
          }}
        >
          ← Back
        </Link>
        <h1
          style={{
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: -1.2,
            fontFamily: "Inconsolata, monospace",
            color: C.text,
          }}
        >
          Erebus Pool
        </h1>
        <p style={{ fontSize: 14, color: C.textDim, lineHeight: "22px" }}>
          Fund the pool, pay for protected content, and queue private payouts.
          All outgoing transactions originate from the shared pool address.
        </p>
      </div>

      <PoolInfo />
      <FundPool />
      <BalanceChecker />
      <FreighterPayment />
      <PayPrivately />
    </div>
  );
}
