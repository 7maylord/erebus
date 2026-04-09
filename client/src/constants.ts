export const SERVER_URL =
  (import.meta as unknown as { env: Record<string, string> }).env
    .VITE_SERVER_URL ?? "http://localhost:4021";

export const EXPLORER_BASE = "https://testnet.stellarchain.io/transactions";
