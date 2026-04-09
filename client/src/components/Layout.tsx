import { Link, Outlet, useLocation } from "react-router";

export function Layout() {
  const { pathname } = useLocation();
  const isPool = pathname.startsWith("/pool");

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f8", color: "#171717", display: "flex", flexDirection: "column" }}>
      <header style={{ borderBottom: "1px solid #e2e2e2", background: "#fcfcfc" }}>
        <nav style={{ width: "100%", padding: "8px 32px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link to="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Stellar</span>
            <span style={{ fontFamily: "Inconsolata, monospace", fontWeight: 700, fontSize: 16, borderRadius: 999, padding: "2px 8px", background: "#fbfaff", border: "1px solid #d7cff9", color: "#5746af" }}>
              Privacy Pool
            </span>
          </Link>
          {!isPool && (
            <Link
              to="/pool"
              style={{ background: "#171717", color: "#fff", fontSize: 14, fontWeight: 600, borderRadius: 8, padding: "6px 12px", textDecoration: "none" }}
            >
              Open Pool
            </Link>
          )}
        </nav>
      </header>

      <main style={{ flex: 1 }}>
        <Outlet />
      </main>

      <footer style={{ borderTop: "1px solid #e2e2e2", padding: "24px 32px", textAlign: "center", fontSize: 14, color: "#6f6f6f" }}>
        Powered by{" "}
        <a href="https://www.x402.org/" target="_blank" rel="noopener noreferrer" style={{ color: "#5746af" }}>x402</a>
        {" "}+{" "}
        <a href="https://www.openzeppelin.com/" target="_blank" rel="noopener noreferrer" style={{ color: "#5746af" }}>OpenZeppelin Relayer</a>
        {" "}on{" "}
        <a href="https://stellar.org/" target="_blank" rel="noopener noreferrer" style={{ color: "#5746af" }}>Stellar</a>
      </footer>
    </div>
  );
}
