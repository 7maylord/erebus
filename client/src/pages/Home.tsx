import { Link } from "react-router";

const features = [
  {
    title: "Shared Pool Account",
    description:
      "Agents pre-fund a shared pool. All outgoing payments originate from that pool address — no direct on-chain link between individual payers and payees.",
  },
  {
    title: "x402 HTTP Payments",
    description:
      "Protected API routes require a micropayment in the request header. The payment goes to the pool, not to a per-agent account.",
  },
  {
    title: "Batched Settlement",
    description:
      "Outgoing payouts are grouped and sent every 30 seconds, further obscuring timing and reducing fees.",
  },
];

const steps = [
  "Agents send USDC to the shared pool address.",
  "An agent requests a protected route — server replies HTTP 402.",
  "Agent pays $0.01 USDC via x402 header (payment goes to pool).",
  "Agent posts a signed intent to /pay-privately (destination + amount).",
  "Every 30 s the batch processor sends USDC from pool → payees.",
  "On-chain: pool → payee. Individual agent identity is hidden.",
];

export function Home() {
  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "80px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 80 }}>
      <section style={{ textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <div>
          <h1 style={{ fontSize: 64, lineHeight: "54px", fontWeight: 600, letterSpacing: -1.28, fontFamily: "Inconsolata, monospace" }}>
            Privacy Pool
          </h1>
          <span style={{ fontSize: 16, fontWeight: 500, color: "#171717" }}>on Stellar × x402</span>
        </div>
        <p style={{ fontSize: 16, lineHeight: "24px", fontWeight: 500, color: "#171717", maxWidth: 600 }}>
          A privacy-preserving payment layer for AI agents. Agents pre-fund a shared pool;
          the pool operator settles services — no direct on-chain link between payer and payee.
        </p>
        <Link
          to="/pool"
          style={{ background: "#171717", color: "#fff", fontSize: 14, fontWeight: 600, borderRadius: 8, padding: "8px 16px", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          Try the demo →
        </Link>
      </section>

      <section style={{ width: "100%", display: "grid", gap: 32, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        {features.map((f) => (
          <div key={f.title} style={{ background: "#fcfcfc", border: "1px solid #e2e2e2", borderRadius: 8, padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, color: "#171717", marginBottom: 8 }}>{f.title}</h3>
            <p style={{ fontSize: 15, lineHeight: "22px", fontWeight: 500, color: "#6f6f6f" }}>{f.description}</p>
          </div>
        ))}
      </section>

      <section style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.96 }}>How It Works</h2>
        <div style={{ background: "#fcfcfc", border: "1px solid #e2e2e2", borderRadius: 8, padding: 24, width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 16, lineHeight: "24px", fontWeight: 500 }}>
              <span style={{ width: 24, height: 24, borderRadius: "50%", border: "1px solid #e2e2e2", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, flexShrink: 0 }}>
                {i + 1}
              </span>
              <span>{s}</span>
            </div>
          ))}
        </div>
      </section>

      <section style={{ width: "100%", background: "#f5f2ff", border: "1px solid #d7cff9", borderRadius: 8, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
        <h2 style={{ fontSize: 24, fontWeight: 600, letterSpacing: -0.96 }}>Prerequisites</h2>
        <ul style={{ listStyle: "disc", paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10, fontSize: 16, fontWeight: 500 }}>
          <li>
            OZ Relayer running at{" "}
            <code style={{ background: "#e8e4ff", borderRadius: 4, padding: "2px 6px", fontSize: 14 }}>http://localhost:8080</code>
            {" "}with the x402-facilitator plugin loaded.
          </li>
          <li>
            Privacy Pool Service running at{" "}
            <code style={{ background: "#e8e4ff", borderRadius: 4, padding: "2px 6px", fontSize: 14 }}>http://localhost:4021</code>
            {" "}(set <code style={{ background: "#e8e4ff", borderRadius: 4, padding: "2px 6px", fontSize: 14 }}>POOL_STELLAR_SECRET</code> in .env).
          </li>
          <li>
            A funded Stellar testnet account — get USDC from the{" "}
            <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#5746af" }}>Circle Faucet</a>
            {" "}(select Stellar testnet).
          </li>
        </ul>
      </section>
    </div>
  );
}
