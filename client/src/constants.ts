export const SERVER_URL =
  (import.meta as unknown as { env: Record<string, string> }).env
    .VITE_SERVER_URL ?? "https://erebus.up.railway.app";

export const EXPLORER_BASE = "https://testnet.stellarchain.io/transactions";
