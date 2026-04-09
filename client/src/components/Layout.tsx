import { Link, Outlet, useLocation } from "react-router";

const S = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column" as const,
    background: "var(--bg)",
    color: "var(--text)",
  },
  header: {
    borderBottom: "1px solid var(--border)",
    background: "rgba(10,10,15,0.85)",
    backdropFilter: "blur(12px)",
    position: "sticky" as const,
    top: 0,
    zIndex: 50,
  },
  nav: {
    maxWidth: 1100,
    margin: "0 auto",
    padding: "0 32px",
    height: 56,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    textDecoration: "none",
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  logoMark: {
    width: 28,
    height: 28,
    borderRadius: 6,
    background: "var(--accent)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 14,
    fontWeight: 700,
    color: "#0a0a0f",
    fontFamily: "Inconsolata, monospace",
    letterSpacing: -0.5,
  },
  logoImage: {
    width: 36,
    height: 36,
    borderRadius: 8,
    objectFit: "contain" as const,
  },
  logoText: {
    fontSize: 24,
    fontWeight: 900,
    background: "linear-gradient(90deg, #d3b8ff, #80d4ff)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    letterSpacing: 2.0,
    fontFamily: "'Orbitron', sans-serif",
    textTransform: "uppercase" as const,
    textShadow: "0px 0px 8px rgba(176, 132, 255, 0.4)",
  },
  badge: {
    fontSize: 11,
    fontWeight: 600,
    color: "var(--accent)",
    background: "var(--accent-dim)",
    border: "1px solid var(--accent-border)",
    borderRadius: 4,
    padding: "2px 6px",
    letterSpacing: 0.5,
    textTransform: "uppercase" as const,
  },
  cta: {
    background: "var(--accent)",
    color: "#0a0a0f",
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 6,
    padding: "7px 14px",
    textDecoration: "none",
    letterSpacing: -0.2,
    transition: "opacity 0.15s",
  },
  main: { flex: 1 },
  footer: {
    borderTop: "1px solid var(--border)",
    padding: "20px 32px",
    textAlign: "center" as const,
    fontSize: 13,
    color: "var(--text-dim)",
  },
  footerLink: { color: "var(--accent)", textDecoration: "none" },
};

export function Layout() {
  const { pathname } = useLocation();
  const isPool = pathname.startsWith("/pool");

  return (
    <div style={S.wrap}>
      <header style={S.header}>
        <nav style={S.nav}>
          <Link to="/" style={S.logo}>
            <img src="/erebus-logo.png" alt="Erebus Logo" style={S.logoImage} />
            <span style={S.logoText}>Erebus</span>
            <span style={S.badge}>testnet</span>
          </Link>
          {!isPool && (
            <Link to="/pool" style={S.cta}>
              Launch Pool →
            </Link>
          )}
        </nav>
      </header>

      <main style={S.main}>
        <Outlet />
      </main>

      <footer style={S.footer}>
        Built with{" "}
        <a
          href="https://www.x402.org/"
          target="_blank"
          rel="noopener noreferrer"
          style={S.footerLink}
        >
          x402
        </a>
        {" · "}
        <a
          href="https://channels.openzeppelin.com"
          target="_blank"
          rel="noopener noreferrer"
          style={S.footerLink}
        >
          OpenZeppelin Relayer
        </a>
        {" · "}
        <a
          href="https://stellar.org/"
          target="_blank"
          rel="noopener noreferrer"
          style={S.footerLink}
        >
          Stellar
        </a>
      </footer>
    </div>
  );
}
