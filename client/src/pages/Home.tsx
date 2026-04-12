import { Link } from "react-router";

const features = [
  {
    icon: "⬡",
    title: "Shared Pool",
    description:
      "Agents pre-fund one address. Every outgoing payment leaves from the pool — no direct on-chain link between depositor and payee.",
  },
  {
    icon: "⚡",
    title: "x402 HTTP Payments",
    description:
      "API routes priced per-request via HTTP 402. Agents pay with a signed auth entry in the header — no accounts, no OAuth, no subscriptions.",
  },
  {
    icon: "◎",
    title: "Batched Settlement",
    description:
      "Payouts are grouped every 30 s. Multiple intents settle in one window, obscuring timing and reducing on-chain footprint.",
  },
  {
    icon: "↩",
    title: "Atomic Refunds",
    description:
      "If a transfer fails on-chain the agent's balance is refunded immediately. No silent losses, no manual reconciliation needed.",
  },
];

const steps = [
  {
    label: "Fund",
    desc: "Agent sends USDC on-chain to pool, calls POST /deposit → balance credited.",
  },
  {
    label: "Access",
    desc: "Agent fetches a protected route. Server replies HTTP 402 with price + pool address.",
  },
  {
    label: "Pay",
    desc: "Freighter (or any x402 client) signs a Soroban auth entry and retries — pool receives USDC.",
  },
  {
    label: "Queue",
    desc: "Agent posts a signed intent to POST /pay-privately with payee + amount.",
  },
  {
    label: "Settle",
    desc: "Every 30 s the pool sends USDC to each payee. Pool address is the only sender on-chain.",
  },
];

const privacyRows = [
  { scenario: "Standard x402", chain: "Agent → Payee", private: false },
  {
    scenario: "Erebus pool",
    chain: "Agent → Pool  ·  Pool → Payee",
    private: true,
  },
];

export function Home() {
  return (
    <div style={{ color: "var(--text)", fontFamily: "Inter, sans-serif" }}>
      {}
      <section
        style={{
          maxWidth: 860,
          margin: "0 auto",
          padding: "120px 24px 80px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
        }}
      >
        {}
        <div
          style={{
            position: "absolute",
            top: 80,
            left: "50%",
            transform: "translateX(-50%)",
            width: 600,
            height: 300,
            background:
              "radial-gradient(ellipse, rgba(245,166,35,0.07) 0%, transparent 70%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "var(--accent)",
              background: "var(--accent-dim)",
              border: "1px solid var(--accent-border)",
              borderRadius: 4,
              padding: "4px 10px",
            }}
          >
            Privacy-preserving · AI Agents · Stellar testnet
          </span>

          <h1
            style={{
              fontSize: "clamp(52px, 8vw, 88px)",
              fontWeight: 700,
              letterSpacing: -3,
              lineHeight: 1,
              fontFamily: "Inconsolata, monospace",
              color: "var(--text)",
            }}
          >
            Erebus
          </h1>

          <p
            style={{
              fontSize: 18,
              lineHeight: "28px",
              color: "var(--text-dim)",
              maxWidth: 520,
              fontWeight: 400,
            }}
          >
            A shared payment pool for AI agents. Agents fund a pool; the pool
            pays everyone. No direct on-chain link between payer and payee.
          </p>
        </div>

        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          <Link
            to="/pool"
            style={{
              background: "var(--accent)",
              color: "#0a0a0f",
              fontSize: 14,
              fontWeight: 700,
              borderRadius: 8,
              padding: "10px 20px",
              textDecoration: "none",
              letterSpacing: -0.2,
            }}
          >
            Launch Pool →
          </Link>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              background: "var(--bg-raised)",
              color: "var(--text)",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              padding: "10px 20px",
              textDecoration: "none",
              border: "1px solid var(--border)",
            }}
          >
            View on GitHub
          </a>
        </div>
      </section>

      {}
      <section
        style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px 80px" }}
      >
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "16px 24px",
              borderBottom: "1px solid var(--border)",
              background: "var(--bg-card)",
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                color: "var(--text-muted)",
              }}
            >
              On-chain visibility
            </span>
          </div>
          {privacyRows.map((r) => (
            <div
              key={r.scenario}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 2fr 80px",
                padding: "16px 24px",
                borderBottom: "1px solid var(--border-dim)",
                background: r.private
                  ? "rgba(245,166,35,0.03)"
                  : "var(--bg-card)",
                alignItems: "center",
                gap: 16,
              }}
            >
              <span
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: r.private ? "var(--accent)" : "var(--text-dim)",
                }}
              >
                {r.scenario}
              </span>
              <code
                style={{
                  fontSize: 13,
                  fontFamily: "Inconsolata, monospace",
                  color: r.private ? "var(--text)" : "var(--text-dim)",
                  background: "var(--bg-raised)",
                  padding: "4px 10px",
                  borderRadius: 4,
                  display: "inline-block",
                }}
              >
                {r.chain}
              </code>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 4,
                  padding: "3px 8px",
                  background: r.private ? "var(--green-dim)" : "var(--red-dim)",
                  color: r.private ? "var(--green)" : "var(--red)",
                  textAlign: "center",
                }}
              >
                {r.private ? "PRIVATE" : "EXPOSED"}
              </span>
            </div>
          ))}
        </div>
      </section>

      {}
      <section
        style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px 80px" }}
      >
        <h2
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginBottom: 32,
          }}
        >
          How Erebus works
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 1,
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {features.map((f) => (
            <div
              key={f.title}
              style={{
                background: "var(--bg-card)",
                padding: 28,
                borderRight: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontSize: 22,
                  marginBottom: 14,
                  color: "var(--accent)",
                }}
              >
                {f.icon}
              </div>
              <h3
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--text)",
                  marginBottom: 8,
                  letterSpacing: -0.2,
                }}
              >
                {f.title}
              </h3>
              <p
                style={{
                  fontSize: 14,
                  lineHeight: "22px",
                  color: "var(--text-dim)",
                }}
              >
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {}
      <section
        style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px 80px" }}
      >
        <h2
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginBottom: 32,
          }}
        >
          Payment flow
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {steps.map((s, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 20,
                padding: "20px 0",
                borderBottom:
                  i < steps.length - 1 ? "1px solid var(--border-dim)" : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 0,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: "var(--accent-dim)",
                    border: "1px solid var(--accent-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    fontFamily: "Inconsolata, monospace",
                    color: "var(--accent)",
                  }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: "var(--accent)",
                    marginBottom: 4,
                    letterSpacing: 0.3,
                  }}
                >
                  {s.label.toUpperCase()}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: "22px",
                    color: "var(--text-dim)",
                  }}
                >
                  {s.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {}
      <section
        style={{ maxWidth: 860, margin: "0 auto", padding: "0 24px 120px" }}
      >
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 12,
            padding: 28,
            background: "var(--bg-card)",
            display: "flex",
            flexWrap: "wrap" as const,
            gap: 12,
            alignItems: "center",
          }}
        >
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--text-muted)",
              marginRight: 8,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Built with
          </span>
          {[
            "x402 protocol",
            "OpenZeppelin Relayer",
            "Stellar Soroban",
            "Freighter",
            "React + Vite",
          ].map((t) => (
            <span
              key={t}
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text-dim)",
                background: "var(--bg-raised)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "4px 10px",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
