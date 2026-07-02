// QFEX API layer.
// Auth per https://docs.qfex.com: HMAC-SHA256(secret, `${nonce}:${unix_ts}`),
// hex-encoded, sent with public key / nonce / timestamp headers.
import { QFEX_API_URL, QFEX_VENUE, PAGINATION_DELAY } from "../constants.js";

const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");

async function qfexAuthHeaders({ publicKey, secretKey }) {
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const ts = Math.floor(Date.now() / 1000).toString();
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${nonce}:${ts}`));
  return {
    "x-qfex-public-key": publicKey,
    "x-qfex-hmac-signature": hex(new Uint8Array(sigBuf)),
    "x-qfex-nonce": nonce,
    "x-qfex-timestamp": ts,
  };
}

async function qfexGet(creds, path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
  ).toString();
  const res = await fetch(`${QFEX_API_URL}${path}${qs ? `?${qs}` : ""}`, {
    headers: await qfexAuthHeaders(creds),
  });
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).detail || ""; } catch { /* not json */ }
    throw new Error(`QFEX ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return res.json();
}

// QFEX order_timestamp unit is unspecified in the OpenAPI spec (double).
// Normalize to ms defensively: seconds < 1e12 <= ms < 1e15 <= us.
function qfexTsToMs(ts) {
  if (!ts) return 0;
  if (ts < 1e12) return Math.round(ts * 1000);
  if (ts < 1e15) return Math.round(ts);
  return Math.round(ts / 1000);
}

// Normalize a QFEX Trade to the Hyperliquid fill shape consumed by
// reconstructTrades/buildEquityCurve/calcMetrics:
// { coin, time, sz, px, side: "B"|"A", closedPnl, fee, venue }
function normalizeQfexTrade(t) {
  return {
    coin: t.symbol,
    time: qfexTsToMs(t.order_timestamp),
    sz: String(t.quantity),
    px: String(t.price),
    side: t.side === "BUY" ? "B" : "A",
    closedPnl: String(t.realised_pnl_change ?? 0),
    fee: String(t.fee ?? 0),
    venue: QFEX_VENUE,
    qfexId: t.id,
  };
}

export async function fetchQfexFills(creds, startTimeMs, onProgress) {
  const PAGE = 1000;
  let offset = 0;
  let page = 0;
  const fills = [];
  while (true) {
    page++;
    if (onProgress) onProgress(`Fetching QFEX trades page ${page}...`);
    const body = await qfexGet(creds, "/user/trade", {
      limit: PAGE,
      offset,
      start_time: startTimeMs ? new Date(startTimeMs).toISOString() : undefined,
    });
    const batch = body.data || [];
    fills.push(...batch.map(normalizeQfexTrade));
    if (batch.length < PAGE) break;
    offset += PAGE;
    await new Promise(r => setTimeout(r, PAGINATION_DELAY));
  }
  return fills.sort((a, b) => a.time - b.time);
}

// Positions + balance in one call: GET /user/positions
export async function fetchQfexAccount(creds) {
  const body = await qfexGet(creds, "/user/positions");
  const balance = body.balance || null;
  const positions = (body.positions || []).filter(p => (p.position ?? 0) !== 0);
  // Per https://docs.qfex.com/qfex/definitions:
  //   Available Balance = Equity − Margin  =>  Equity = available + margins.
  // unrealised_pnl is already inside available_balance — do NOT add it again.
  const equity = balance
    ? (balance.available_balance ?? 0) + (balance.order_margin ?? 0) +
      (balance.position_margin ?? 0)
    : 0;
  return { balance, positions, equity };
}
