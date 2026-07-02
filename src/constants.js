export const DEFAULT_WALLET = import.meta.env.VITE_WALLET_ADDRESS || "";
export const START_TIME = 1772409600000; // 2 March 2026
export const HL_API_URL = "https://api.hyperliquid.xyz/info";
export const POLL_INTERVAL_FILLS = 10000;
export const PAGINATION_DELAY = 500;

// QFEX — routed through /qfex (Vite dev proxy locally, Vercel rewrite in prod)
// because api.qfex.com only allows CORS from qfex.com origins.
export const QFEX_API_URL = "/qfex";
export const QFEX_VENUE = "QFEX";
export const HL_VENUE = "HL";
export const QFEX_LS_PUBLIC = "qfex_public_key";
export const QFEX_LS_SECRET = "qfex_secret_key";
