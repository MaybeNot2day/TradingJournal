// TRADE.XYZ TRADING JOURNAL
// Single-file React artifact — Technocapitalcore design
// Venues: Hyperliquid (wallet-keyed public API) + QFEX (HMAC-authed REST via /qfex proxy)

import React, { useState, useEffect, useReducer, useCallback, useRef, useMemo } from "react";
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, ComposedChart
} from "recharts";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const DEFAULT_WALLET = import.meta.env.VITE_WALLET_ADDRESS || "";
const START_TIME = 1772409600000; // 2 March 2026
const API_URL = "https://api.hyperliquid.xyz/info";
const POLL_INTERVAL_FILLS = 10000;
const POLL_INTERVAL_STATE = 10000;
const PAGINATION_DELAY = 500;

// QFEX — routed through the Vite dev proxy (see vite.config.js) because
// api.qfex.com only allows CORS from qfex.com origins.
const QFEX_API_URL = "/qfex";
const QFEX_VENUE = "QFEX";
const HL_VENUE = "HL";
const QFEX_LS_PUBLIC = "qfex_public_key";
const QFEX_LS_SECRET = "qfex_secret_key";

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────

const C = {
  bgPrimary:   "#0a0a0f",
  bgSecondary: "#12121a",
  bgTertiary:  "#1a1a28",
  border:      "#1f1f33",
  textPrimary: "#e8e8f0",
  textSecondary:"#6b6b8a",
  green:       "#00ff88",
  red:         "#ff3366",
  blue:        "#4488ff",
  cyan:        "#00d4ff",
  gold:        "#ffd700",
};

const styles = {
  app: {
    fontFamily: "'IBM Plex Mono', 'JetBrains Mono', monospace",
    background: C.bgPrimary,
    color: C.textPrimary,
    minHeight: "100vh",
    fontSize: "12px",
    lineHeight: "1.4",
  },
  header: {
    background: C.bgSecondary,
    borderBottom: `1px solid ${C.border}`,
    padding: "10px 20px",
    display: "flex",
    alignItems: "center",
    gap: "16px",
    flexWrap: "wrap",
  },
  logo: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontWeight: 700,
    fontSize: "14px",
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: C.cyan,
    textShadow: `0 0 12px ${C.cyan}88`,
  },
  input: {
    background: C.bgPrimary,
    border: `1px solid ${C.border}`,
    color: C.textPrimary,
    fontFamily: "inherit",
    fontSize: "11px",
    padding: "5px 8px",
    outline: "none",
    width: "340px",
  },
  btn: (active = false, color = C.cyan) => ({
    background: active ? color + "22" : "transparent",
    border: `1px solid ${active ? color : C.border}`,
    color: active ? color : C.textSecondary,
    fontFamily: "inherit",
    fontSize: "11px",
    padding: "5px 12px",
    cursor: "pointer",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    transition: "all 0.15s",
  }),
  statusDot: (status) => ({
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    background: status === "live" ? C.green : status === "error" ? C.red : C.textSecondary,
    boxShadow: status === "live" ? `0 0 6px ${C.green}` : "none",
    display: "inline-block",
  }),
  layout: {
    display: "flex",
    height: "calc(100vh - 49px)",
    overflow: "hidden",
  },
  sidebar: {
    width: "180px",
    minWidth: "180px",
    background: C.bgSecondary,
    borderRight: `1px solid ${C.border}`,
    display: "flex",
    flexDirection: "column",
    padding: "16px 0",
    overflowY: "auto",
  },
  navItem: (active) => ({
    padding: "8px 16px",
    cursor: "pointer",
    color: active ? C.cyan : C.textSecondary,
    background: active ? C.bgTertiary : "transparent",
    borderLeft: `2px solid ${active ? C.cyan : "transparent"}`,
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    transition: "all 0.1s",
  }),
  main: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  panel: {
    background: C.bgSecondary,
    border: `1px solid ${C.border}`,
    padding: "12px 16px",
  },
  panelHeader: {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: C.textSecondary,
    marginBottom: "12px",
    borderBottom: `1px solid ${C.border}`,
    paddingBottom: "8px",
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "1px",
    background: C.border,
  },
  metricCell: {
    background: C.bgSecondary,
    padding: "12px",
  },
  metricLabel: {
    fontSize: "9px",
    color: C.textSecondary,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    marginBottom: "4px",
  },
  metricValue: (val, neutral = false) => ({
    fontSize: "18px",
    fontWeight: 700,
    color: neutral ? C.textPrimary : val > 0 ? C.green : val < 0 ? C.red : C.textPrimary,
    textShadow: neutral ? "none" : val > 0 ? `0 0 10px ${C.green}66` : val < 0 ? `0 0 10px ${C.red}66` : "none",
    fontVariantNumeric: "tabular-nums",
  }),
  metricSub: {
    fontSize: "9px",
    color: C.textSecondary,
    marginTop: "2px",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "11px",
  },
  th: {
    padding: "6px 8px",
    textAlign: "left",
    fontSize: "9px",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.1em",
    color: C.textSecondary,
    borderBottom: `1px solid ${C.border}`,
    cursor: "pointer",
    userSelect: "none",
    whiteSpace: "nowrap",
  },
  td: {
    padding: "6px 8px",
    borderBottom: `1px solid ${C.border}22`,
    fontVariantNumeric: "tabular-nums",
    whiteSpace: "nowrap",
  },
  tag: (color) => ({
    display: "inline-block",
    padding: "1px 6px",
    border: `1px solid ${color}44`,
    color: color,
    fontSize: "9px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  }),
  sidebarSection: {
    padding: "8px 16px",
    marginTop: "8px",
  },
  sidebarLabel: {
    fontSize: "9px",
    color: C.textSecondary,
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    marginBottom: "6px",
  },
  sidebarValue: (color = C.textPrimary) => ({
    fontSize: "13px",
    fontWeight: 700,
    color,
    fontVariantNumeric: "tabular-nums",
  }),
};

// ─── API LAYER ─────────────────────────────────────────────────────────────────

async function apiPost(body) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

async function fetchAllFills(wallet, startTime = START_TIME, onProgress) {
  let allFills = [];
  let cursor = startTime;
  let page = 0;
  while (true) {
    page++;
    if (onProgress) onProgress(`Fetching fills page ${page}...`);
    const fills = await apiPost({
      type: "userFillsByTime",
      user: wallet,
      startTime: cursor,
      aggregateByTime: true,
    });
    allFills = allFills.concat(fills);
    if (fills.length < 2000) break;
    cursor = fills[fills.length - 1].time + 1;
    await new Promise(r => setTimeout(r, PAGINATION_DELAY));
  }
  return allFills;
}

async function fetchClearinghouseState(wallet) {
  const [main, xyz] = await Promise.all([
    apiPost({ type: "clearinghouseState", user: wallet }),
    apiPost({ type: "clearinghouseState", user: wallet, dex: "xyz" }).catch(() => null),
  ]);
  return { main, xyz };
}

// HL keeps separate collateral per dex; funds can sit entirely on the builder
// dex (e.g. trade.xyz) while `main` reads 0. Sum both for account totals.
function hlAccountTotals(chState) {
  let accountValue = 0;
  let marginUsed = 0;
  for (const s of [chState?.main, chState?.xyz]) {
    accountValue += parseFloat(s?.marginSummary?.accountValue || "0");
    marginUsed += parseFloat(s?.marginSummary?.totalMarginUsed || "0");
  }
  return { accountValue, marginUsed };
}

async function fetchFunding(wallet) {
  return apiPost({ type: "userFunding", user: wallet, startTime: START_TIME });
}

async function fetchAllMids() {
  return apiPost({ type: "allMids" });
}

// ─── QFEX API LAYER ───────────────────────────────────────────────────────────
// Auth per https://docs.qfex.com: HMAC-SHA256(secret, `${nonce}:${unix_ts}`),
// hex-encoded, sent with public key / nonce / timestamp headers.

async function qfexAuthHeaders({ publicKey, secretKey }) {
  const nonceBytes = crypto.getRandomValues(new Uint8Array(16));
  const nonce = Array.from(nonceBytes, b => b.toString(16).padStart(2, "0")).join("");
  const ts = Math.floor(Date.now() / 1000).toString();
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secretKey),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${nonce}:${ts}`));
  const sig = Array.from(new Uint8Array(sigBuf), b => b.toString(16).padStart(2, "0")).join("");
  return {
    "x-qfex-public-key": publicKey,
    "x-qfex-hmac-signature": sig,
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

async function fetchQfexFills(creds, startTimeMs, onProgress) {
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
async function fetchQfexAccount(creds) {
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

// ─── DATA PROCESSING ──────────────────────────────────────────────────────────

function reconstructTrades(fills) {
  // Group by venue+coin so same-named symbols on different venues never merge
  const byKey = {};
  for (const f of fills) {
    const key = `${f.venue || HL_VENUE}\u0000${f.coin}`;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(f);
  }

  const trades = [];

  for (const coinFills of Object.values(byKey)) {
    const { coin, venue = HL_VENUE } = coinFills[0];
    const sorted = [...coinFills].sort((a, b) => a.time - b.time);
    let position = 0; // positive = long, negative = short
    let currentTrade = null;

    for (const fill of sorted) {
      const sz = parseFloat(fill.sz);
      const px = parseFloat(fill.px);
      const side = fill.side === "B" ? 1 : -1;
      const fillSize = sz * side;
      const closedPnl = parseFloat(fill.closedPnl || "0");
      const fee = parseFloat(fill.fee || "0");

      const prevPosition = position;
      const newPosition = position + fillSize;

      // Handle position flip (long→short or short→long in one fill)
      if (prevPosition !== 0 && Math.sign(newPosition) !== Math.sign(prevPosition) && newPosition !== 0) {
        // Close existing trade
        if (currentTrade) {
          const closingSize = Math.abs(prevPosition);
          const totalSize = closingSize + Math.abs(fillSize) - Math.abs(newPosition);
          const closingRatio = closingSize / (closingSize + Math.abs(newPosition));
          currentTrade.exitFills.push({ ...fill, effectiveSize: closingSize });
          currentTrade.realizedPnl += closedPnl * closingRatio;
          currentTrade.totalFees += fee * closingRatio;
          currentTrade.exitTime = fill.time;
          currentTrade.avgExit = px;
          currentTrade.status = "closed";
          currentTrade.netPnl = currentTrade.realizedPnl - currentTrade.totalFees;
          currentTrade.holdingTimeMs = currentTrade.exitTime - currentTrade.entryTime;
          trades.push(currentTrade);
        }
        // Open new trade in opposite direction
        const openingSize = Math.abs(newPosition);
        currentTrade = {
          id: `${venue}-${coin}-${fill.time}-flip`,
          coin,
          venue,
          direction: newPosition > 0 ? "LONG" : "SHORT",
          entryFills: [{ ...fill, effectiveSize: openingSize }],
          exitFills: [],
          avgEntry: px,
          avgExit: null,
          size: openingSize,
          realizedPnl: closedPnl * (1 - Math.abs(prevPosition) / (Math.abs(prevPosition) + openingSize)),
          totalFees: fee * (openingSize / (Math.abs(prevPosition) + openingSize)),
          entryTime: fill.time,
          exitTime: null,
          status: "open",
          netPnl: 0,
          holdingTimeMs: 0,
        };
      } else if (prevPosition === 0) {
        // Opening new trade
        currentTrade = {
          id: `${venue}-${coin}-${fill.time}`,
          coin,
          venue,
          direction: fillSize > 0 ? "LONG" : "SHORT",
          entryFills: [fill],
          exitFills: [],
          avgEntry: px,
          avgExit: null,
          size: Math.abs(fillSize),
          realizedPnl: 0,
          totalFees: fee,
          entryTime: fill.time,
          exitTime: null,
          status: "open",
          netPnl: 0,
          holdingTimeMs: 0,
        };
      } else if (Math.abs(newPosition) > Math.abs(prevPosition)) {
        // Scaling in (adding to position)
        if (currentTrade) {
          currentTrade.entryFills.push(fill);
          currentTrade.totalFees += fee;
          // Update avg entry
          const totalCost = currentTrade.entryFills.reduce(
            (sum, f) => sum + parseFloat(f.sz) * parseFloat(f.px), 0
          );
          const totalSize = currentTrade.entryFills.reduce(
            (sum, f) => sum + parseFloat(f.sz), 0
          );
          currentTrade.avgEntry = totalCost / totalSize;
          currentTrade.size = Math.abs(newPosition);
        }
      } else {
        // Reducing position / closing
        if (currentTrade) {
          currentTrade.exitFills.push(fill);
          currentTrade.realizedPnl += closedPnl;
          currentTrade.totalFees += fee;

          if (Math.abs(newPosition) < 0.0000001) {
            // Fully closed
            currentTrade.exitTime = fill.time;
            // Weighted avg exit
            const totalExitCost = currentTrade.exitFills.reduce(
              (sum, f) => sum + parseFloat(f.sz) * parseFloat(f.px), 0
            );
            const totalExitSize = currentTrade.exitFills.reduce(
              (sum, f) => sum + parseFloat(f.sz), 0
            );
            currentTrade.avgExit = totalExitCost / totalExitSize;
            currentTrade.status = "closed";
            currentTrade.netPnl = currentTrade.realizedPnl - currentTrade.totalFees;
            currentTrade.holdingTimeMs = currentTrade.exitTime - currentTrade.entryTime;
            trades.push(currentTrade);
            currentTrade = null;
          }
        }
      }

      position = newPosition;
      if (Math.abs(position) < 0.0000001) position = 0;
    }

    // Any open trade remaining
    if (currentTrade && position !== 0) {
      currentTrade.status = "open";
      currentTrade.netPnl = currentTrade.realizedPnl - currentTrade.totalFees;
      trades.push(currentTrade);
    }
  }

  return trades.sort((a, b) => a.entryTime - b.entryTime);
}

function buildEquityCurve(fills, startingBalance) {
  const sorted = [...fills].sort((a, b) => a.time - b.time);
  let cumPnl = 0;
  let cumFees = 0;
  const points = [{ time: START_TIME, equity: startingBalance, drawdown: 0, cumPnl: 0 }];
  let peak = startingBalance;

  for (const fill of sorted) {
    cumPnl += parseFloat(fill.closedPnl || "0");
    cumFees += parseFloat(fill.fee || "0");
    const equity = startingBalance + cumPnl - cumFees;
    if (equity > peak) peak = equity;
    const drawdown = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    points.push({
      time: fill.time,
      equity: parseFloat(equity.toFixed(2)),
      drawdown: parseFloat((-drawdown).toFixed(3)),
      cumPnl: parseFloat((cumPnl - cumFees).toFixed(2)),
    });
  }
  return points;
}

function calcMetrics(trades, equityCurve, fills, fundingData, extraFunding = 0) {
  const closed = trades.filter(t => t.status === "closed");
  const wins = closed.filter(t => t.netPnl > 0);
  const losses = closed.filter(t => t.netPnl <= 0);

  const totalPnl = closed.reduce((s, t) => s + t.netPnl, 0);
  const winRate = closed.length > 0 ? wins.length / closed.length : 0;
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.netPnl, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.netPnl, 0) / losses.length) : 0;
  const totalWins = wins.reduce((s, t) => s + t.netPnl, 0);
  const totalLosses = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;
  const avgRR = avgLoss > 0 ? avgWin / avgLoss : 0;
  const totalFees = fills.reduce((s, f) => s + parseFloat(f.fee || "0"), 0);
  const totalVolume = fills.reduce((s, f) => s + parseFloat(f.sz) * parseFloat(f.px), 0);

  // Drawdown from equity curve
  const drawdowns = equityCurve.map(p => Math.abs(p.drawdown));
  const maxDrawdown = drawdowns.length > 0 ? Math.max(...drawdowns) : 0;

  // Daily returns for Sharpe/Sortino
  const dailyMap = {};
  for (const pt of equityCurve) {
    const day = new Date(pt.time).toISOString().slice(0, 10);
    dailyMap[day] = pt.cumPnl;
  }
  const days = Object.keys(dailyMap).sort();
  const dailyReturns = [];
  for (let i = 1; i < days.length; i++) {
    dailyReturns.push(dailyMap[days[i]] - dailyMap[days[i - 1]]);
  }

  const meanReturn = dailyReturns.length > 0 ? dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length : 0;
  const variance = dailyReturns.length > 1
    ? dailyReturns.reduce((s, r) => s + Math.pow(r - meanReturn, 2), 0) / (dailyReturns.length - 1)
    : 0;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (meanReturn / std) * Math.sqrt(365) : 0;

  const downside = dailyReturns.filter(r => r < 0);
  const downsideVar = downside.length > 1
    ? downside.reduce((s, r) => s + Math.pow(r, 2), 0) / downside.length
    : 0;
  const downsideStd = Math.sqrt(downsideVar);
  const sortino = downsideStd > 0 ? (meanReturn / downsideStd) * Math.sqrt(365) : 0;

  // Calmar
  const totalDays = days.length || 1;
  const annualizedReturn = (totalPnl / (equityCurve[0]?.equity || 1)) * (365 / totalDays);
  const calmar = maxDrawdown > 0 ? annualizedReturn / (maxDrawdown / 100) : 0;

  // Streaks
  let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
  for (const t of closed) {
    if (t.netPnl > 0) { curWin++; curLoss = 0; maxWinStreak = Math.max(maxWinStreak, curWin); }
    else { curLoss++; curWin = 0; maxLossStreak = Math.max(maxLossStreak, curLoss); }
  }

  const largestWin = wins.length > 0 ? Math.max(...wins.map(t => t.netPnl)) : 0;
  const largestLoss = losses.length > 0 ? Math.min(...losses.map(t => t.netPnl)) : 0;

  const avgDuration = closed.length > 0
    ? closed.reduce((s, t) => s + (t.holdingTimeMs || 0), 0) / closed.length
    : 0;

  // Funding (HL funding events + QFEX account-level net_funding)
  const totalFunding = (fundingData
    ? fundingData.reduce((s, f) => s + parseFloat(f.delta?.usdc || "0"), 0)
    : 0) + extraFunding;

  // PnL by asset
  const byAsset = {};
  for (const t of closed) {
    if (!byAsset[t.coin]) byAsset[t.coin] = { pnl: 0, trades: 0, wins: 0 };
    byAsset[t.coin].pnl += t.netPnl;
    byAsset[t.coin].trades++;
    if (t.netPnl > 0) byAsset[t.coin].wins++;
  }

  // PnL by day of week
  const byDow = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  for (const t of closed) {
    const dow = new Date(t.entryTime).getDay();
    byDow[dow] += t.netPnl;
  }

  // PnL by hour
  const byHour = {};
  for (let h = 0; h < 24; h++) byHour[h] = 0;
  for (const t of closed) {
    const h = new Date(t.entryTime).getUTCHours();
    byHour[h] += t.netPnl;
  }

  // Long vs Short
  const longTrades = closed.filter(t => t.direction === "LONG");
  const shortTrades = closed.filter(t => t.direction === "SHORT");
  const longPnl = longTrades.reduce((s, t) => s + t.netPnl, 0);
  const shortPnl = shortTrades.reduce((s, t) => s + t.netPnl, 0);

  // Duration buckets
  const durationBuckets = {
    "<1m":   closed.filter(t => t.holdingTimeMs < 60000),
    "1-5m":  closed.filter(t => t.holdingTimeMs >= 60000 && t.holdingTimeMs < 300000),
    "5-30m": closed.filter(t => t.holdingTimeMs >= 300000 && t.holdingTimeMs < 1800000),
    "30m-4h":closed.filter(t => t.holdingTimeMs >= 1800000 && t.holdingTimeMs < 14400000),
    ">4h":   closed.filter(t => t.holdingTimeMs >= 14400000),
  };

  // Daily PnL for calendar
  const dailyPnl = {};
  for (const t of closed) {
    const day = new Date(t.entryTime).toISOString().slice(0, 10);
    dailyPnl[day] = (dailyPnl[day] || 0) + t.netPnl;
  }

  return {
    totalPnl, winRate, profitFactor, expectancy, avgRR,
    avgWin, avgLoss, totalFees, totalVolume,
    maxDrawdown, sharpe, sortino, calmar,
    maxWinStreak, maxLossStreak,
    largestWin, largestLoss, avgDuration,
    totalFunding, netFeesAndFunding: totalFees + Math.abs(totalFunding),
    byAsset, byDow, byHour, longPnl, shortPnl,
    longTrades: longTrades.length, shortTrades: shortTrades.length,
    totalTrades: closed.length, openTrades: trades.filter(t => t.status === "open").length,
    durationBuckets, dailyPnl, dailyReturns,
  };
}

// ─── FORMATTING HELPERS ───────────────────────────────────────────────────────

const fmt = {
  usd: (v, digits = 2) => {
    if (v === null || v === undefined || isNaN(v)) return "—";
    const abs = Math.abs(v);
    const sign = v < 0 ? "-" : v > 0 ? "+" : "";
    if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(2)}K`;
    return `${sign}$${abs.toFixed(digits)}`;
  },
  pct: (v, digits = 1) => {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
  },
  num: (v, digits = 2) => {
    if (v === null || v === undefined || isNaN(v)) return "—";
    return v.toFixed(digits);
  },
  ratio: (v) => {
    if (v === null || v === undefined || isNaN(v)) return "—";
    if (!isFinite(v)) return "∞";
    return v.toFixed(2);
  },
  duration: (ms) => {
    if (!ms) return "—";
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  },
  time: (ts) => {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("en-US", {
      month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
      hour12: false,
    });
  },
  date: (ts) => {
    if (!ts) return "—";
    return new Date(ts).toISOString().slice(0, 10);
  },
};

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function VenueTag({ venue }) {
  const v = venue || HL_VENUE;
  return <span style={styles.tag(v === QFEX_VENUE ? C.blue : C.cyan)}>{v}</span>;
}

function MetricCell({ label, value, sub, format = "usd", neutral = false }) {
  let display = value;
  let numVal = typeof value === "number" ? value : null;
  if (format === "usd") display = fmt.usd(value);
  else if (format === "pct") display = fmt.pct(value);
  else if (format === "ratio") display = fmt.ratio(value);
  else if (format === "num") display = fmt.num(value, 0);
  else if (format === "duration") display = fmt.duration(value);
  else if (format === "raw") display = value !== null && value !== undefined ? String(value) : "—";
  else display = value !== null && value !== undefined ? value : "—";

  return (
    <div style={styles.metricCell}>
      <div style={styles.metricLabel}>{label}</div>
      <div style={styles.metricValue(numVal, neutral)}>{display}</div>
      {sub && <div style={styles.metricSub}>{sub}</div>}
    </div>
  );
}

function LoadingScreen({ message }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", height: "100vh",
      background: C.bgPrimary, color: C.textSecondary,
      fontFamily: "'IBM Plex Mono', monospace",
    }}>
      <div style={{
        fontSize: "11px", letterSpacing: "0.15em", textTransform: "uppercase",
        color: C.cyan, marginBottom: "16px",
        textShadow: `0 0 20px ${C.cyan}`,
      }}>
        TRADE.XYZ JOURNAL
      </div>
      <div style={{ fontSize: "10px", color: C.textSecondary, letterSpacing: "0.1em" }}>
        {message || "Initializing..."}
      </div>
      <div style={{
        marginTop: "24px", width: "200px", height: "1px",
        background: `linear-gradient(90deg, transparent, ${C.cyan}, transparent)`,
        animation: "none",
      }} />
    </div>
  );
}

function CustomTooltip({ active, payload, label, type = "equity" }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: C.bgTertiary, border: `1px solid ${C.border}`,
      padding: "8px 10px", fontSize: "10px",
    }}>
      <div style={{ color: C.textSecondary, marginBottom: "4px" }}>
        {new Date(label).toLocaleString()}
      </div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.textPrimary }}>
          {p.name}: {p.name === "drawdown" ? fmt.pct(p.value) : fmt.usd(p.value)}
        </div>
      ))}
    </div>
  );
}

// ─── VIEW: OVERVIEW ───────────────────────────────────────────────────────────

function OverviewView({ metrics, equityCurve, trades, fills }) {
  const recentTrades = [...trades]
    .filter(t => t.status === "closed")
    .sort((a, b) => b.exitTime - a.exitTime)
    .slice(0, 10);

  // Downsample equity curve for performance
  const chartData = useMemo(() => {
    if (equityCurve.length <= 500) return equityCurve;
    const step = Math.ceil(equityCurve.length / 500);
    return equityCurve.filter((_, i) => i % step === 0 || i === equityCurve.length - 1);
  }, [equityCurve]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Metrics Grid Row 1 */}
      <div>
        <div style={styles.panelHeader}>Performance Metrics</div>
        <div style={{ ...styles.metricsGrid, gridTemplateColumns: "repeat(4, 1fr)" }}>
          <MetricCell label="Total Net PnL" value={metrics.totalPnl} />
          <MetricCell label="Win Rate" value={metrics.winRate * 100} format="pct" sub={`${metrics.totalTrades} trades`} />
          <MetricCell label="Sharpe Ratio" value={metrics.sharpe} format="ratio" neutral />
          <MetricCell label="Max Drawdown" value={-metrics.maxDrawdown} format="pct" />
          <MetricCell label="Profit Factor" value={metrics.profitFactor} format="ratio" neutral />
          <MetricCell label="Expectancy" value={metrics.expectancy} />
          <MetricCell label="Sortino Ratio" value={metrics.sortino} format="ratio" neutral />
          <MetricCell label="Calmar Ratio" value={metrics.calmar} format="ratio" neutral />
        </div>
      </div>

      {/* Secondary metrics */}
      <div style={{ ...styles.metricsGrid, gridTemplateColumns: "repeat(6, 1fr)" }}>
        <MetricCell label="Avg Win" value={metrics.avgWin} />
        <MetricCell label="Avg Loss" value={-metrics.avgLoss} />
        <MetricCell label="Avg R:R" value={metrics.avgRR} format="ratio" neutral />
        <MetricCell label="Largest Win" value={metrics.largestWin} />
        <MetricCell label="Largest Loss" value={metrics.largestLoss} />
        <MetricCell label="Avg Duration" value={metrics.avgDuration} format="duration" neutral />
        <MetricCell label="Total Fees" value={-metrics.totalFees} />
        <MetricCell label="Funding P&L" value={metrics.totalFunding} />
        <MetricCell label="Total Volume" value={metrics.totalVolume} />
        <MetricCell label="Win Streak" value={metrics.maxWinStreak} format="raw" neutral />
        <MetricCell label="Loss Streak" value={metrics.maxLossStreak} format="raw" neutral />
        <MetricCell label="Open Trades" value={metrics.openTrades} format="raw" neutral />
      </div>

      {/* Equity Curve */}
      <div style={styles.panel}>
        <div style={styles.panelHeader}>Equity Curve — Realized PnL</div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.cyan} stopOpacity={0.3} />
                <stop offset="95%" stopColor={C.cyan} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.border} strokeDasharray="2 4" />
            <XAxis dataKey="time" tickFormatter={t => fmt.date(t)}
              tick={{ fill: C.textSecondary, fontSize: 9 }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={v => fmt.usd(v)}
              tick={{ fill: C.textSecondary, fontSize: 9 }} tickLine={false} axisLine={false} width={60} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={equityCurve[0]?.equity || 0} stroke={C.border} strokeDasharray="3 3" />
            <Area type="monotone" dataKey="equity" stroke={C.cyan} strokeWidth={1.5}
              fill="url(#equityGrad)" dot={false} name="equity" />
          </AreaChart>
        </ResponsiveContainer>

        {/* Drawdown subplot */}
        <div style={{ marginTop: "2px" }}>
          <ResponsiveContainer width="100%" height={80}>
            <AreaChart data={chartData} margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.red} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={C.red} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" />
              <XAxis dataKey="time" hide />
              <YAxis tickFormatter={v => `${v.toFixed(1)}%`}
                tick={{ fill: C.textSecondary, fontSize: 9 }} tickLine={false} axisLine={false} width={60} />
              <Tooltip content={<CustomTooltip type="drawdown" />} />
              <ReferenceLine y={0} stroke={C.border} />
              <Area type="monotone" dataKey="drawdown" stroke={C.red} strokeWidth={1}
                fill="url(#ddGrad)" dot={false} name="drawdown" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Trades */}
      <div style={styles.panel}>
        <div style={styles.panelHeader}>Recent Closed Trades</div>
        <table style={styles.table}>
          <thead>
            <tr>
              {["Asset", "Venue", "Dir", "Entry", "Exit", "Avg Entry", "Avg Exit", "Size", "Net PnL", "Duration"].map(h => (
                <th key={h} style={styles.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentTrades.map((t, i) => (
              <tr key={t.id} style={{ background: i % 2 === 0 ? "transparent" : C.bgTertiary + "44" }}>
                <td style={styles.td}><span style={{ color: C.gold }}>{t.coin}</span></td>
                <td style={styles.td}><VenueTag venue={t.venue} /></td>
                <td style={styles.td}>
                  <span style={styles.tag(t.direction === "LONG" ? C.green : C.red)}>{t.direction}</span>
                </td>
                <td style={styles.td}>{fmt.time(t.entryTime)}</td>
                <td style={styles.td}>{fmt.time(t.exitTime)}</td>
                <td style={styles.td}>${parseFloat(t.avgEntry || 0).toFixed(4)}</td>
                <td style={styles.td}>${parseFloat(t.avgExit || 0).toFixed(4)}</td>
                <td style={styles.td}>{parseFloat(t.size || 0).toFixed(4)}</td>
                <td style={{ ...styles.td, color: t.netPnl >= 0 ? C.green : C.red,
                  textShadow: t.netPnl >= 0 ? `0 0 8px ${C.green}66` : `0 0 8px ${C.red}66` }}>
                  {fmt.usd(t.netPnl)}
                </td>
                <td style={styles.td}>{fmt.duration(t.holdingTimeMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── VIEW: TRADE LOG ─────────────────────────────────────────────────────────

function TradeLogView({ trades }) {
  const [sortKey, setSortKey] = useState("entryTime");
  const [sortDir, setSortDir] = useState(-1);
  const [filter, setFilter] = useState({ asset: "", direction: "", status: "all", minPnl: "", maxPnl: "" });
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  };

  const filtered = useMemo(() => {
    return trades.filter(t => {
      if (filter.asset && !t.coin.toLowerCase().includes(filter.asset.toLowerCase())) return false;
      if (filter.direction && t.direction !== filter.direction) return false;
      if (filter.status === "closed" && t.status !== "closed") return false;
      if (filter.status === "open" && t.status !== "open") return false;
      if (filter.minPnl !== "" && t.netPnl < parseFloat(filter.minPnl)) return false;
      if (filter.maxPnl !== "" && t.netPnl > parseFloat(filter.maxPnl)) return false;
      return true;
    });
  }, [trades, filter]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir;
    });
  }, [filtered, sortKey, sortDir]);

  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);

  const exportCsv = () => {
    const headers = ["coin","venue","direction","entryTime","exitTime","avgEntry","avgExit","size","realizedPnl","totalFees","netPnl","holdingTimeMs","status"];
    const rows = sorted.map(t => headers.map(h => t[h] ?? "").join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "trades.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const SortIndicator = ({ col }) => (
    <span style={{ color: sortKey === col ? C.cyan : C.textSecondary, marginLeft: "4px" }}>
      {sortKey === col ? (sortDir === 1 ? "↑" : "↓") : "⇅"}
    </span>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Filters */}
      <div style={{ ...styles.panel, display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: C.textSecondary, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.1em" }}>FILTER:</span>
        {[
          { key: "asset", placeholder: "Asset", width: "100px" },
          { key: "minPnl", placeholder: "Min PnL", width: "80px" },
          { key: "maxPnl", placeholder: "Max PnL", width: "80px" },
        ].map(({ key, placeholder, width }) => (
          <input key={key} style={{ ...styles.input, width }}
            placeholder={placeholder}
            value={filter[key]}
            onChange={e => { setFilter(f => ({ ...f, [key]: e.target.value })); setPage(0); }}
          />
        ))}
        {["all", "closed", "open"].map(s => (
          <button key={s} style={styles.btn(filter.status === s)}
            onClick={() => { setFilter(f => ({ ...f, status: s })); setPage(0); }}>
            {s}
          </button>
        ))}
        {["", "LONG", "SHORT"].map(d => (
          <button key={d || "both"} style={styles.btn(filter.direction === d)}
            onClick={() => { setFilter(f => ({ ...f, direction: d })); setPage(0); }}>
            {d || "Both"}
          </button>
        ))}
        <button style={{ ...styles.btn(false, C.gold), marginLeft: "auto" }} onClick={exportCsv}>
          Export CSV
        </button>
        <span style={{ color: C.textSecondary, fontSize: "9px" }}>
          {sorted.length} trades
        </span>
      </div>

      {/* Table */}
      <div style={styles.panel}>
        <div style={{ overflowX: "auto" }}>
          <table style={styles.table}>
            <thead>
              <tr>
                {[
                  ["coin", "Asset"], ["venue", "Venue"], ["direction", "Dir"], ["entryTime", "Entry"],
                  ["exitTime", "Exit"], ["avgEntry", "Avg Entry"], ["avgExit", "Avg Exit"],
                  ["size", "Size"], ["realizedPnl", "Realized"], ["totalFees", "Fees"],
                  ["netPnl", "Net PnL"], ["holdingTimeMs", "Duration"], ["status", "Status"],
                ].map(([key, label]) => (
                  <th key={key} style={styles.th} onClick={() => handleSort(key)}>
                    {label}<SortIndicator col={key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((t, i) => (
                <tr key={t.id} style={{ background: i % 2 === 0 ? "transparent" : C.bgTertiary + "44" }}>
                  <td style={styles.td}><span style={{ color: C.gold }}>{t.coin}</span></td>
                  <td style={styles.td}><VenueTag venue={t.venue} /></td>
                  <td style={styles.td}>
                    <span style={styles.tag(t.direction === "LONG" ? C.green : C.red)}>{t.direction}</span>
                  </td>
                  <td style={styles.td}>{fmt.time(t.entryTime)}</td>
                  <td style={styles.td}>{t.exitTime ? fmt.time(t.exitTime) : <span style={{ color: C.textSecondary }}>OPEN</span>}</td>
                  <td style={styles.td}>${parseFloat(t.avgEntry || 0).toFixed(4)}</td>
                  <td style={styles.td}>{t.avgExit ? `$${parseFloat(t.avgExit).toFixed(4)}` : "—"}</td>
                  <td style={styles.td}>{parseFloat(t.size || 0).toFixed(4)}</td>
                  <td style={{ ...styles.td, color: t.realizedPnl >= 0 ? C.green : C.red }}>
                    {fmt.usd(t.realizedPnl)}
                  </td>
                  <td style={{ ...styles.td, color: C.red }}>{fmt.usd(-t.totalFees)}</td>
                  <td style={{
                    ...styles.td,
                    color: t.netPnl >= 0 ? C.green : C.red,
                    fontWeight: 700,
                    textShadow: t.netPnl >= 0 ? `0 0 8px ${C.green}66` : `0 0 8px ${C.red}66`,
                  }}>
                    {fmt.usd(t.netPnl)}
                  </td>
                  <td style={styles.td}>{fmt.duration(t.holdingTimeMs)}</td>
                  <td style={styles.td}>
                    <span style={styles.tag(t.status === "open" ? C.gold : C.textSecondary)}>
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr><td colSpan={13} style={{ ...styles.td, textAlign: "center", color: C.textSecondary, padding: "24px" }}>
                  No trades match filter
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ display: "flex", gap: "8px", marginTop: "12px", alignItems: "center" }}>
            <button style={styles.btn(false)} onClick={() => setPage(0)} disabled={page === 0}>«</button>
            <button style={styles.btn(false)} onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>‹</button>
            <span style={{ color: C.textSecondary, fontSize: "10px" }}>
              Page {page + 1} / {totalPages}
            </span>
            <button style={styles.btn(false)} onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>›</button>
            <button style={styles.btn(false)} onClick={() => setPage(totalPages - 1)} disabled={page === totalPages - 1}>»</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── VIEW: ANALYSIS ──────────────────────────────────────────────────────────

function AnalysisView({ metrics, trades, equityCurve }) {
  // PnL by asset
  const assetData = useMemo(() => {
    return Object.entries(metrics.byAsset)
      .map(([coin, d]) => ({ coin: coin.replace("xyz:", ""), pnl: d.pnl, trades: d.trades, winRate: d.wins / d.trades }))
      .sort((a, b) => b.pnl - a.pnl);
  }, [metrics.byAsset]);

  // DoW data
  const dowLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dowData = Object.entries(metrics.byDow).map(([d, pnl]) => ({
    day: dowLabels[parseInt(d)], pnl
  }));

  // Hour data
  const hourData = Object.entries(metrics.byHour).map(([h, pnl]) => ({
    hour: `${h.padStart(2, "0")}:00`, pnl: parseFloat(pnl.toFixed(2))
  }));

  // Duration buckets
  const durationData = Object.entries(metrics.durationBuckets).map(([label, tArr]) => ({
    label,
    pnl: tArr.reduce((s, t) => s + t.netPnl, 0),
    count: tArr.length,
  }));

  // Rolling 7d Sharpe
  const rollingData = useMemo(() => {
    const pts = equityCurve.slice(-200);
    if (pts.length < 8) return [];
    const dailyMap = {};
    for (const p of pts) {
      const d = new Date(p.time).toISOString().slice(0, 10);
      dailyMap[d] = p.cumPnl;
    }
    const days = Object.keys(dailyMap).sort();
    const result = [];
    for (let i = 7; i < days.length; i++) {
      const window = [];
      for (let j = i - 6; j <= i; j++) {
        if (j > 0) window.push(dailyMap[days[j]] - dailyMap[days[j - 1]]);
      }
      if (window.length < 3) continue;
      const mean = window.reduce((s, r) => s + r, 0) / window.length;
      const std = Math.sqrt(window.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / window.length);
      const sharpe = std > 0 ? (mean / std) * Math.sqrt(365) : 0;
      result.push({ date: days[i], sharpe: parseFloat(sharpe.toFixed(2)) });
    }
    return result;
  }, [equityCurve]);

  const barFill = (val) => val >= 0 ? C.green : C.red;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Long vs Short */}
      <div style={{ ...styles.metricsGrid, gridTemplateColumns: "repeat(4, 1fr)" }}>
        <MetricCell label="Long PnL" value={metrics.longPnl} />
        <MetricCell label="Short PnL" value={metrics.shortPnl} />
        <MetricCell label="Long Trades" value={metrics.longTrades} format="raw" neutral />
        <MetricCell label="Short Trades" value={metrics.shortTrades} format="raw" neutral />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
        {/* PnL by Asset */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>PnL by Asset</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={assetData} margin={{ top: 4, right: 8, left: 8, bottom: 40 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" />
              <XAxis dataKey="coin" tick={{ fill: C.textSecondary, fontSize: 8 }}
                angle={-45} textAnchor="end" tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => fmt.usd(v)} tick={{ fill: C.textSecondary, fontSize: 9 }}
                tickLine={false} axisLine={false} width={55} />
              <Tooltip formatter={(v) => fmt.usd(v)} contentStyle={{
                background: C.bgTertiary, border: `1px solid ${C.border}`, fontSize: "10px"
              }} />
              <ReferenceLine y={0} stroke={C.border} />
              <Bar dataKey="pnl" name="PnL">
                {assetData.map((entry, i) => <Cell key={i} fill={barFill(entry.pnl)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* PnL by Day of Week */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>PnL by Day of Week</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dowData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" />
              <XAxis dataKey="day" tick={{ fill: C.textSecondary, fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => fmt.usd(v)} tick={{ fill: C.textSecondary, fontSize: 9 }}
                tickLine={false} axisLine={false} width={55} />
              <Tooltip formatter={(v) => fmt.usd(v)} contentStyle={{
                background: C.bgTertiary, border: `1px solid ${C.border}`, fontSize: "10px"
              }} />
              <ReferenceLine y={0} stroke={C.border} />
              <Bar dataKey="pnl" name="PnL">
                {dowData.map((entry, i) => <Cell key={i} fill={barFill(entry.pnl)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* PnL by Hour */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>PnL by Hour (UTC)</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" />
              <XAxis dataKey="hour" tick={{ fill: C.textSecondary, fontSize: 8 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => fmt.usd(v)} tick={{ fill: C.textSecondary, fontSize: 9 }}
                tickLine={false} axisLine={false} width={55} />
              <Tooltip formatter={(v) => fmt.usd(v)} contentStyle={{
                background: C.bgTertiary, border: `1px solid ${C.border}`, fontSize: "10px"
              }} />
              <ReferenceLine y={0} stroke={C.border} />
              <Bar dataKey="pnl" name="PnL">
                {hourData.map((entry, i) => <Cell key={i} fill={barFill(entry.pnl)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Duration Buckets */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>PnL by Trade Duration</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={durationData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" />
              <XAxis dataKey="label" tick={{ fill: C.textSecondary, fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => fmt.usd(v)} tick={{ fill: C.textSecondary, fontSize: 9 }}
                tickLine={false} axisLine={false} width={55} />
              <Tooltip formatter={(v, n) => n === "count" ? v : fmt.usd(v)} contentStyle={{
                background: C.bgTertiary, border: `1px solid ${C.border}`, fontSize: "10px"
              }} />
              <ReferenceLine y={0} stroke={C.border} />
              <Bar dataKey="pnl" name="PnL">
                {durationData.map((entry, i) => <Cell key={i} fill={barFill(entry.pnl)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Rolling 7d Sharpe */}
      {rollingData.length > 0 && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>Rolling 7-Day Sharpe Ratio</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={rollingData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={C.border} strokeDasharray="2 4" />
              <XAxis dataKey="date" tick={{ fill: C.textSecondary, fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => v.toFixed(1)} tick={{ fill: C.textSecondary, fontSize: 9 }}
                tickLine={false} axisLine={false} width={40} />
              <Tooltip formatter={v => v.toFixed(2)} contentStyle={{
                background: C.bgTertiary, border: `1px solid ${C.border}`, fontSize: "10px"
              }} />
              <ReferenceLine y={0} stroke={C.border} />
              <ReferenceLine y={1} stroke={C.green + "44"} strokeDasharray="3 3" />
              <Line type="monotone" dataKey="sharpe" stroke={C.blue} strokeWidth={1.5}
                dot={false} name="7d Sharpe" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* PnL Distribution */}
      <div style={styles.panel}>
        <div style={styles.panelHeader}>Trade PnL Distribution</div>
        <PnlDistribution trades={trades.filter(t => t.status === "closed")} />
      </div>
    </div>
  );
}

function PnlDistribution({ trades }) {
  const data = useMemo(() => {
    if (!trades.length) return [];
    const pnls = trades.map(t => t.netPnl);
    const min = Math.min(...pnls);
    const max = Math.max(...pnls);
    const buckets = 20;
    const step = (max - min) / buckets || 1;
    const bins = Array.from({ length: buckets }, (_, i) => ({
      label: fmt.usd(min + i * step, 0),
      from: min + i * step,
      to: min + (i + 1) * step,
      count: 0,
      positive: min + i * step >= 0,
    }));
    for (const p of pnls) {
      const idx = Math.min(buckets - 1, Math.floor((p - min) / step));
      if (idx >= 0) bins[idx].count++;
    }
    return bins;
  }, [trades]);

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 24 }}>
        <CartesianGrid stroke={C.border} strokeDasharray="2 4" />
        <XAxis dataKey="label" tick={{ fill: C.textSecondary, fontSize: 8 }}
          angle={-45} textAnchor="end" tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: C.textSecondary, fontSize: 9 }} tickLine={false} axisLine={false} width={30} />
        <Tooltip contentStyle={{ background: C.bgTertiary, border: `1px solid ${C.border}`, fontSize: "10px" }} />
        <Bar dataKey="count" name="# Trades">
          {data.map((entry, i) => <Cell key={i} fill={entry.positive ? C.green + "aa" : C.red + "aa"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── VIEW: CALENDAR ───────────────────────────────────────────────────────────

function CalendarView({ metrics }) {
  const { dailyPnl } = metrics;

  const allDays = useMemo(() => {
    const days = Object.keys(dailyPnl).sort();
    if (!days.length) return [];
    const start = new Date(days[0]);
    const end = new Date(days[days.length - 1]);
    const result = [];
    const cur = new Date(start);
    // Start from the Sunday of that week
    cur.setDate(cur.getDate() - cur.getDay());
    while (cur <= end || result.length % 7 !== 0) {
      const iso = cur.toISOString().slice(0, 10);
      result.push({ date: iso, pnl: dailyPnl[iso] ?? null });
      cur.setDate(cur.getDate() + 1);
    }
    return result;
  }, [dailyPnl]);

  const maxAbsPnl = useMemo(() => {
    const vals = Object.values(dailyPnl).map(Math.abs);
    return vals.length ? Math.max(...vals) : 1;
  }, [dailyPnl]);

  const cellColor = (pnl) => {
    if (pnl === null) return C.bgTertiary;
    if (pnl === 0) return C.bgTertiary;
    const intensity = Math.min(1, Math.abs(pnl) / maxAbsPnl);
    const alpha = Math.floor(intensity * 200 + 55).toString(16).padStart(2, "0");
    return pnl > 0 ? `${C.green}${alpha}` : `${C.red}${alpha}`;
  };

  const weeks = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  const monthLabels = useMemo(() => {
    const labels = [];
    let lastMonth = null;
    weeks.forEach((week, wi) => {
      const month = week[0]?.date?.slice(0, 7);
      if (month && month !== lastMonth) {
        labels.push({ index: wi, label: new Date(week[0].date).toLocaleString("default", { month: "short", year: "2-digit" }) });
        lastMonth = month;
      }
    });
    return labels;
  }, [weeks]);

  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div style={styles.panel}>
      <div style={styles.panelHeader}>Daily PnL Calendar</div>
      {allDays.length === 0 ? (
        <div style={{ color: C.textSecondary, textAlign: "center", padding: "32px" }}>No data</div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          {/* Month labels */}
          <div style={{ display: "flex", marginLeft: "32px", marginBottom: "4px" }}>
            {weeks.map((_, wi) => {
              const label = monthLabels.find(l => l.index === wi);
              return (
                <div key={wi} style={{ width: "16px", marginRight: "3px", fontSize: "8px",
                  color: C.textSecondary, whiteSpace: "nowrap" }}>
                  {label?.label || ""}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex" }}>
            {/* Day labels */}
            <div style={{ display: "flex", flexDirection: "column", marginRight: "4px" }}>
              {DOW.map(d => (
                <div key={d} style={{ height: "16px", marginBottom: "3px", fontSize: "8px",
                  color: C.textSecondary, width: "28px", display: "flex", alignItems: "center" }}>
                  {d}
                </div>
              ))}
            </div>
            {/* Grid */}
            <div style={{ display: "flex", gap: "3px" }}>
              {weeks.map((week, wi) => (
                <div key={wi} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                  {week.map((day, di) => (
                    <div key={di} title={`${day.date}: ${day.pnl !== null ? fmt.usd(day.pnl) : "no trades"}`}
                      style={{
                        width: "14px", height: "14px",
                        background: cellColor(day.pnl),
                        border: `1px solid ${C.border}`,
                        cursor: day.pnl !== null ? "pointer" : "default",
                      }} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: "16px", marginTop: "12px", alignItems: "center" }}>
            <span style={{ fontSize: "9px", color: C.textSecondary }}>LESS</span>
            {[0.1, 0.3, 0.5, 0.7, 1.0].map(i => (
              <div key={i} style={{
                width: "14px", height: "14px",
                background: `${C.green}${Math.floor(i * 200 + 55).toString(16).padStart(2, "0")}`,
                border: `1px solid ${C.border}`,
              }} />
            ))}
            <span style={{ fontSize: "9px", color: C.textSecondary }}>MORE PROFIT</span>
            {[0.1, 0.3, 0.5, 0.7, 1.0].map(i => (
              <div key={i} style={{
                width: "14px", height: "14px",
                background: `${C.red}${Math.floor(i * 200 + 55).toString(16).padStart(2, "0")}`,
                border: `1px solid ${C.border}`,
              }} />
            ))}
            <span style={{ fontSize: "9px", color: C.textSecondary }}>MORE LOSS</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── VIEW: OPEN POSITIONS ─────────────────────────────────────────────────────

function PositionsView({ clearinghouseState, qfexState, allMids, trades }) {
  // Normalize every venue's positions to one row shape.
  const positions = useMemo(() => {
    const rows = [];
    const hlPos = [
      ...(clearinghouseState?.main?.assetPositions || []),
      ...(clearinghouseState?.xyz?.assetPositions || []),
    ].filter(p => parseFloat(p.position?.szi || "0") !== 0);

    for (const p of hlPos) {
      const pos = p.position;
      const szi = parseFloat(pos.szi || "0");
      rows.push({
        venue: HL_VENUE,
        coin: pos.coin,
        szi,
        entryPx: parseFloat(pos.entryPx || "0"),
        markPx: allMids ? parseFloat(allMids[pos.coin] || "0") : 0,
        unrealizedPnl: parseFloat(pos.unrealizedPnl || "0"),
        roe: pos.returnOnEquity ? parseFloat(pos.returnOnEquity) * 100 : null,
        leverage: pos.leverage?.value ? parseFloat(pos.leverage.value) : null,
        liqPx: parseFloat(pos.liquidationPx || "0"),
      });
    }

    for (const p of qfexState?.positions || []) {
      const szi = p.position ?? 0; // signed
      const entryPx = p.average_price ?? 0;
      const upnl = p.unrealised_pnl ?? 0;
      // QFEX doesn't return mark price here; derive it from uPnL identity:
      // upnl = (mark - avgEntry) * signedSize  =>  mark = avgEntry + upnl/signedSize
      const markPx = szi !== 0 ? entryPx + upnl / szi : 0;
      const im = p.initial_margin ?? 0;
      rows.push({
        venue: QFEX_VENUE,
        coin: p.symbol,
        szi,
        entryPx,
        markPx,
        unrealizedPnl: upnl,
        roe: im > 0 ? (upnl / im) * 100 : null,
        leverage: p.leverage ?? null,
        liqPx: 0, // not exposed by /user/positions
      });
    }
    return rows;
  }, [clearinghouseState, qfexState, allMids]);

  const openTrades = trades.filter(t => t.status === "open");

  const { accountValue: hlAccountValue, marginUsed: hlMarginUsed } = hlAccountTotals(clearinghouseState);
  const qfexEquity = qfexState?.equity ?? 0;
  const qfexMarginUsed = (qfexState?.balance?.position_margin ?? 0) + (qfexState?.balance?.order_margin ?? 0);
  const totalUpnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {/* Combined account summary */}
      <div style={{ ...styles.metricsGrid, gridTemplateColumns: "repeat(4, 1fr)" }}>
        <MetricCell
          label="Total Account Value"
          value={hlAccountValue + qfexEquity}
          sub={qfexState ? `HL ${fmt.usd(hlAccountValue)} · QFEX ${fmt.usd(qfexEquity)}` : undefined}
          neutral
        />
        <MetricCell
          label="Total Margin Used"
          value={hlMarginUsed + qfexMarginUsed}
          sub={qfexState ? `HL ${fmt.usd(hlMarginUsed)} · QFEX ${fmt.usd(qfexMarginUsed)}` : undefined}
          neutral
        />
        <MetricCell label="Unrealized PnL" value={totalUpnl} />
        <MetricCell label="Open Positions" value={positions.length} format="raw" neutral />
      </div>

      {/* Positions Table */}
      <div style={styles.panel}>
        <div style={styles.panelHeader}>Open Positions</div>
        {positions.length === 0 ? (
          <div style={{ color: C.textSecondary, textAlign: "center", padding: "32px" }}>
            No open positions
          </div>
        ) : (
          <table style={styles.table}>
            <thead>
              <tr>
                {["Asset", "Venue", "Side", "Size", "Entry Price", "Mark Price", "Unrealized PnL", "ROE%", "Leverage", "Liquidation"].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map((p, i) => (
                <tr key={`${p.venue}-${p.coin}`} style={{ background: i % 2 === 0 ? "transparent" : C.bgTertiary + "44" }}>
                  <td style={styles.td}><span style={{ color: C.gold }}>{p.coin}</span></td>
                  <td style={styles.td}><VenueTag venue={p.venue} /></td>
                  <td style={styles.td}>
                    <span style={styles.tag(p.szi > 0 ? C.green : C.red)}>
                      {p.szi > 0 ? "LONG" : "SHORT"}
                    </span>
                  </td>
                  <td style={styles.td}>{Math.abs(p.szi).toFixed(4)}</td>
                  <td style={styles.td}>${p.entryPx.toFixed(4)}</td>
                  <td style={styles.td}>{p.markPx > 0 ? `$${p.markPx.toFixed(4)}` : "—"}</td>
                  <td style={{ ...styles.td, color: p.unrealizedPnl >= 0 ? C.green : C.red,
                    textShadow: p.unrealizedPnl >= 0 ? `0 0 8px ${C.green}66` : `0 0 8px ${C.red}66` }}>
                    {fmt.usd(p.unrealizedPnl)}
                  </td>
                  <td style={{ ...styles.td, color: p.roe !== null ? (p.roe >= 0 ? C.green : C.red) : C.textSecondary }}>
                    {p.roe !== null ? fmt.pct(p.roe) : "—"}
                  </td>
                  <td style={styles.td}>{p.leverage !== null ? `${p.leverage}×` : "—"}</td>
                  <td style={{ ...styles.td, color: C.gold }}>
                    {p.liqPx > 0 ? `$${p.liqPx.toFixed(4)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* QFEX balance detail */}
      {qfexState?.balance && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>QFEX Account</div>
          <div style={{ ...styles.metricsGrid, gridTemplateColumns: "repeat(6, 1fr)" }}>
            <MetricCell label="Available" value={qfexState.balance.available_balance} neutral />
            <MetricCell label="Deposit" value={qfexState.balance.deposit} neutral />
            <MetricCell label="Realised PnL" value={qfexState.balance.realised_pnl} />
            <MetricCell label="Unrealised PnL" value={qfexState.balance.unrealised_pnl} />
            <MetricCell label="Net Funding" value={qfexState.balance.net_funding} />
            <MetricCell label="Margin Held" value={(qfexState.balance.position_margin ?? 0) + (qfexState.balance.order_margin ?? 0)} neutral />
          </div>
        </div>
      )}

      {/* Open Trades (reconstructed) */}
      {openTrades.length > 0 && (
        <div style={styles.panel}>
          <div style={styles.panelHeader}>Open Trade Positions (Reconstructed)</div>
          <table style={styles.table}>
            <thead>
              <tr>
                {["Asset", "Venue", "Dir", "Entry Time", "Avg Entry", "Size", "Realized So Far", "Fees So Far"].map(h => (
                  <th key={h} style={styles.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {openTrades.map((t, i) => (
                <tr key={t.id} style={{ background: i % 2 === 0 ? "transparent" : C.bgTertiary + "44" }}>
                  <td style={styles.td}><span style={{ color: C.gold }}>{t.coin}</span></td>
                  <td style={styles.td}><VenueTag venue={t.venue} /></td>
                  <td style={styles.td}>
                    <span style={styles.tag(t.direction === "LONG" ? C.green : C.red)}>{t.direction}</span>
                  </td>
                  <td style={styles.td}>{fmt.time(t.entryTime)}</td>
                  <td style={styles.td}>${parseFloat(t.avgEntry || 0).toFixed(4)}</td>
                  <td style={styles.td}>{parseFloat(t.size || 0).toFixed(4)}</td>
                  <td style={{ ...styles.td, color: t.realizedPnl >= 0 ? C.green : C.red }}>
                    {fmt.usd(t.realizedPnl)}
                  </td>
                  <td style={{ ...styles.td, color: C.red }}>{fmt.usd(-t.totalFees)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────

function Sidebar({ view, setView, metrics, status }) {
  const navItems = [
    { id: "overview", label: "Overview" },
    { id: "trades", label: "Trade Log" },
    { id: "analysis", label: "Analysis" },
    { id: "calendar", label: "Calendar" },
    { id: "positions", label: "Positions" },
  ];

  return (
    <div style={styles.sidebar}>
      {navItems.map(item => (
        <div key={item.id} style={styles.navItem(view === item.id)}
          onClick={() => setView(item.id)}>
          {item.label}
        </div>
      ))}

      {metrics && (
        <>
          <div style={{ borderTop: `1px solid ${C.border}`, margin: "12px 0" }} />
          <div style={styles.sidebarSection}>
            <div style={styles.sidebarLabel}>Net PnL</div>
            <div style={styles.sidebarValue(metrics.totalPnl >= 0 ? C.green : C.red)}>
              {fmt.usd(metrics.totalPnl)}
            </div>
          </div>
          <div style={styles.sidebarSection}>
            <div style={styles.sidebarLabel}>Win Rate</div>
            <div style={styles.sidebarValue(metrics.winRate >= 0.5 ? C.green : C.red)}>
              {fmt.pct(metrics.winRate * 100)}
            </div>
          </div>
          <div style={styles.sidebarSection}>
            <div style={styles.sidebarLabel}>Trades</div>
            <div style={styles.sidebarValue()}>
              {metrics.totalTrades} <span style={{ color: C.textSecondary, fontSize: "10px" }}>closed</span>
            </div>
          </div>
          <div style={styles.sidebarSection}>
            <div style={styles.sidebarLabel}>Max DD</div>
            <div style={styles.sidebarValue(C.red)}>
              {fmt.pct(-metrics.maxDrawdown)}
            </div>
          </div>
          <div style={styles.sidebarSection}>
            <div style={styles.sidebarLabel}>Sharpe</div>
            <div style={styles.sidebarValue(C.blue)}>
              {fmt.ratio(metrics.sharpe)}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

const initialState = {
  fills: [],
  trades: [],
  equityCurve: [],
  metrics: null,
  clearinghouseState: null,
  qfexState: null,       // { balance, positions, equity } | null
  qfexError: null,       // string | null — QFEX failures never block HL
  qfexCreds: null,       // { publicKey, secretKey } | null
  allMids: null,
  fundingData: null,
  startingBalance: 0,
  status: "idle",        // idle | loading | live | error
  loadingMessage: "",
  error: null,
  lastRefresh: null,
  wallet: DEFAULT_WALLET,
};

function reducer(state, action) {
  switch (action.type) {
    case "SET_WALLET": return { ...state, wallet: action.wallet };
    case "SET_QFEX_CREDS": return { ...state, qfexCreds: action.creds };
    case "SET_STATUS": return { ...state, status: action.status, loadingMessage: action.message || "" };
    case "SET_ERROR": return { ...state, status: "error", error: action.error };
    case "SET_DATA": return {
      ...state,
      fills: action.fills ?? state.fills,
      trades: action.trades ?? state.trades,
      equityCurve: action.equityCurve ?? state.equityCurve,
      metrics: action.metrics ?? state.metrics,
      clearinghouseState: action.clearinghouseState ?? state.clearinghouseState,
      qfexState: action.qfexState !== undefined ? action.qfexState : state.qfexState,
      qfexError: action.qfexError !== undefined ? action.qfexError : state.qfexError,
      allMids: action.allMids ?? state.allMids,
      fundingData: action.fundingData ?? state.fundingData,
      startingBalance: action.startingBalance ?? state.startingBalance,
      status: "live",
      error: null,
      lastRefresh: Date.now(),
    };
    case "UPDATE_PRICES": return {
      ...state,
      allMids: action.allMids,
      clearinghouseState: action.clearinghouseState ?? state.clearinghouseState,
      qfexState: action.qfexState !== undefined ? action.qfexState : state.qfexState,
      qfexError: action.qfexError !== undefined ? action.qfexError : state.qfexError,
      lastRefresh: Date.now(),
    };
    default: return state;
  }
}

function loadStoredQfexCreds() {
  try {
    const publicKey = localStorage.getItem(QFEX_LS_PUBLIC) || "";
    const secretKey = localStorage.getItem(QFEX_LS_SECRET) || "";
    return publicKey && secretKey ? { publicKey, secretKey } : null;
  } catch { return null; }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [view, setView] = useState("overview");
  const [walletInput, setWalletInput] = useState(DEFAULT_WALLET);
  const [qfexPubInput, setQfexPubInput] = useState(() => { try { return localStorage.getItem(QFEX_LS_PUBLIC) || ""; } catch { return ""; } });
  const [qfexSecInput, setQfexSecInput] = useState(() => { try { return localStorage.getItem(QFEX_LS_SECRET) || ""; } catch { return ""; } });
  const pollRef = useRef(null);
  const lastFillTimeRef = useRef(START_TIME);
  const lastQfexFillTimeRef = useRef(START_TIME);
  const qfexIdsRef = useRef(new Set());
  const stateRef = useRef(state);

  // Fetch QFEX fills + account, isolated so a QFEX failure never blocks HL.
  const fetchQfexSide = useCallback(async (creds, sinceMs, onProgress) => {
    if (!creds) return { fills: [], account: null, error: null };
    try {
      const [fills, account] = await Promise.all([
        fetchQfexFills(creds, sinceMs, onProgress),
        fetchQfexAccount(creds),
      ]);
      return { fills, account, error: null };
    } catch (err) {
      console.warn("QFEX error:", err.message);
      return { fills: [], account: null, error: err.message };
    }
  }, []);

  const loadData = useCallback(async (wallet, qfexCreds) => {
    dispatch({ type: "SET_STATUS", status: "loading", message: "Connecting to Hyperliquid..." });

    try {
      // Hyperliquid fills + QFEX side in parallel
      const onProgress = (msg) => dispatch({ type: "SET_STATUS", status: "loading", message: msg });
      const [hlFills, qfex] = await Promise.all([
        fetchAllFills(wallet, START_TIME, onProgress),
        fetchQfexSide(qfexCreds, START_TIME, onProgress),
      ]);

      dispatch({ type: "SET_STATUS", status: "loading", message: "Fetching account state..." });

      const [chState, fundingData, allMids] = await Promise.all([
        fetchClearinghouseState(wallet),
        fetchFunding(wallet).catch(() => []),
        fetchAllMids().catch(() => null),
      ]);

      const fills = [...hlFills, ...qfex.fills].sort((a, b) => a.time - b.time);

      // Starting balance per venue: current equity − cumulative closed PnL + fees.
      const hlAccountValue = hlAccountTotals(chState).accountValue;
      const totalFees = fills.reduce((s, f) => s + parseFloat(f.fee || "0"), 0);
      const cumulativePnl = fills.reduce((s, f) => s + parseFloat(f.closedPnl || "0"), 0);
      const totalEquityNow = hlAccountValue + (qfex.account?.equity ?? 0);
      const startingBalance = Math.max(0, totalEquityNow - cumulativePnl + totalFees);

      dispatch({ type: "SET_STATUS", status: "loading", message: "Reconstructing trades..." });
      const trades = reconstructTrades(fills);

      dispatch({ type: "SET_STATUS", status: "loading", message: "Computing metrics..." });
      const equityCurve = buildEquityCurve(fills, startingBalance);
      const metrics = calcMetrics(trades, equityCurve, fills, fundingData,
        qfex.account?.balance?.net_funding ?? 0);

      if (hlFills.length > 0) lastFillTimeRef.current = hlFills[hlFills.length - 1].time;
      if (qfex.fills.length > 0) lastQfexFillTimeRef.current = qfex.fills[qfex.fills.length - 1].time;
      qfexIdsRef.current = new Set(qfex.fills.map(f => f.qfexId));

      dispatch({
        type: "SET_DATA",
        fills, trades, equityCurve, metrics,
        clearinghouseState: chState,
        qfexState: qfex.account,
        qfexError: qfex.error,
        allMids,
        fundingData,
        startingBalance,
      });

    } catch (err) {
      console.error(err);
      dispatch({ type: "SET_ERROR", error: err.message });
    }
  }, [fetchQfexSide]);

  const pollForUpdates = useCallback(async (wallet, qfexCreds) => {
    try {
      const [newHlFills, chState, allMids, qfex] = await Promise.all([
        fetchAllFills(wallet, lastFillTimeRef.current + 1, null),
        fetchClearinghouseState(wallet),
        fetchAllMids().catch(() => null),
        fetchQfexSide(qfexCreds, lastQfexFillTimeRef.current + 1, null),
      ]);

      // QFEX start_time granularity is coarse — dedupe by trade id.
      const newQfexFills = qfex.fills.filter(f => !qfexIdsRef.current.has(f.qfexId));
      const newFills = [...newHlFills, ...newQfexFills];

      if (newFills.length > 0) {
        const current = stateRef.current;
        const allFills = [...current.fills, ...newFills].sort((a, b) => a.time - b.time);
        const totalFees = allFills.reduce((s, f) => s + parseFloat(f.fee || "0"), 0);
        const cumulativePnl = allFills.reduce((s, f) => s + parseFloat(f.closedPnl || "0"), 0);
        const hlAccountValue = hlAccountTotals(chState).accountValue;
        const qfexState = qfex.account ?? current.qfexState;
        const totalEquityNow = hlAccountValue + (qfexState?.equity ?? 0);
        const startingBalance = Math.max(0, totalEquityNow - cumulativePnl + totalFees);
        const trades = reconstructTrades(allFills);
        const equityCurve = buildEquityCurve(allFills, startingBalance);
        const metrics = calcMetrics(trades, equityCurve, allFills, current.fundingData,
          qfexState?.balance?.net_funding ?? 0);
        if (newHlFills.length > 0) lastFillTimeRef.current = newHlFills[newHlFills.length - 1].time;
        if (newQfexFills.length > 0) {
          lastQfexFillTimeRef.current = newQfexFills[newQfexFills.length - 1].time;
          for (const f of newQfexFills) qfexIdsRef.current.add(f.qfexId);
        }

        dispatch({
          type: "SET_DATA",
          fills: allFills, trades, equityCurve, metrics,
          clearinghouseState: chState,
          qfexState: qfex.account ?? undefined,
          qfexError: qfexCreds ? qfex.error : undefined,
          allMids,
          fundingData: current.fundingData,
          startingBalance,
        });
      } else {
        dispatch({
          type: "UPDATE_PRICES", allMids, clearinghouseState: chState,
          qfexState: qfex.account ?? undefined,
          qfexError: qfexCreds ? qfex.error : undefined,
        });
      }
    } catch (err) {
      console.warn("Poll error:", err.message);
    }
  }, [fetchQfexSide]);

  // Start polling when live
  useEffect(() => {
    if (state.status !== "live") return;
    const wallet = state.wallet;
    const creds = state.qfexCreds;
    pollRef.current = setInterval(() => pollForUpdates(wallet, creds), POLL_INTERVAL_FILLS);
    return () => clearInterval(pollRef.current);
  }, [state.status, state.wallet, state.qfexCreds, pollForUpdates]);

  const handleConnect = () => {
    clearInterval(pollRef.current);
    const wallet = walletInput.trim();
    if (!wallet.match(/^0x[0-9a-fA-F]{40}$/)) {
      dispatch({ type: "SET_ERROR", error: "Invalid wallet address format" });
      return;
    }
    const pub = qfexPubInput.trim();
    const sec = qfexSecInput.trim();
    const creds = pub && sec ? { publicKey: pub, secretKey: sec } : null;
    try {
      if (creds) {
        localStorage.setItem(QFEX_LS_PUBLIC, pub);
        localStorage.setItem(QFEX_LS_SECRET, sec);
      } else {
        localStorage.removeItem(QFEX_LS_PUBLIC);
        localStorage.removeItem(QFEX_LS_SECRET);
      }
    } catch { /* private mode */ }
    dispatch({ type: "SET_WALLET", wallet });
    dispatch({ type: "SET_QFEX_CREDS", creds });
    loadData(wallet, creds);
  };

  // Keep stateRef current
  useEffect(() => { stateRef.current = state; }, [state]);

  // Auto-connect on mount with stored QFEX creds
  useEffect(() => {
    const creds = loadStoredQfexCreds();
    if (creds) dispatch({ type: "SET_QFEX_CREDS", creds });
    loadData(DEFAULT_WALLET, creds);
  }, []);

  // Loading screen
  if (state.status === "loading") {
    return <LoadingScreen message={state.loadingMessage} />;
  }

  const renderView = () => {
    if (!state.metrics) return null;
    switch (view) {
      case "overview":
        return <OverviewView metrics={state.metrics} equityCurve={state.equityCurve}
          trades={state.trades} fills={state.fills} />;
      case "trades":
        return <TradeLogView trades={state.trades} />;
      case "analysis":
        return <AnalysisView metrics={state.metrics} trades={state.trades} equityCurve={state.equityCurve} />;
      case "calendar":
        return <CalendarView metrics={state.metrics} />;
      case "positions":
        return <PositionsView clearinghouseState={state.clearinghouseState}
          qfexState={state.qfexState} allMids={state.allMids} trades={state.trades} />;
      default:
        return null;
    }
  };

  const qfexChipColor = !state.qfexCreds ? C.textSecondary
    : state.qfexError ? C.red
    : state.qfexState ? C.green : C.gold;

  return (
    <div style={styles.app}>
      {/* Scanline overlay */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)",
        pointerEvents: "none", zIndex: 9999,
      }} />

      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>TRADE.XYZ // JOURNAL</div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flex: 1, flexWrap: "wrap" }}>
          <input
            style={styles.input}
            value={walletInput}
            onChange={e => setWalletInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleConnect()}
            placeholder="0x... wallet address"
          />
          <input
            style={{ ...styles.input, width: "170px" }}
            value={qfexPubInput}
            onChange={e => setQfexPubInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleConnect()}
            placeholder="QFEX public key (optional)"
          />
          <input
            style={{ ...styles.input, width: "170px" }}
            type="password"
            value={qfexSecInput}
            onChange={e => setQfexSecInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleConnect()}
            placeholder="QFEX secret key"
          />
          <button style={styles.btn(state.status === "live", C.cyan)} onClick={handleConnect}>
            {state.status === "loading" ? "Loading..." : "Connect"}
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
          <div style={styles.statusDot(state.status)} />
          <span style={{ fontSize: "9px", color: C.textSecondary, textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {state.status === "live" ? "LIVE" : state.status === "error" ? "ERROR" : state.status.toUpperCase()}
          </span>
          <span style={styles.tag(qfexChipColor)} title={
            !state.qfexCreds ? "QFEX not configured — enter API keys to add it"
            : state.qfexError ? `QFEX error: ${state.qfexError}`
            : "QFEX connected"
          }>
            QFEX
          </span>
          {state.lastRefresh && (
            <span style={{ fontSize: "9px", color: C.textSecondary }}>
              {new Date(state.lastRefresh).toLocaleTimeString()}
            </span>
          )}
        </div>
        {state.error && (
          <div style={{ width: "100%", color: C.red, fontSize: "10px", marginTop: "4px" }}>
            Error: {state.error}
          </div>
        )}
        {state.qfexError && (
          <div style={{ width: "100%", color: C.gold, fontSize: "10px", marginTop: "4px" }}>
            QFEX: {state.qfexError} — showing Hyperliquid data only
          </div>
        )}
      </div>

      {/* Body */}
      <div style={styles.layout}>
        <Sidebar view={view} setView={setView} metrics={state.metrics} status={state.status} />
        <div style={styles.main}>
          {state.status === "error" && !state.metrics && (
            <div style={{ ...styles.panel, color: C.red, textAlign: "center", padding: "32px" }}>
              <div style={{ fontSize: "12px", marginBottom: "8px" }}>Connection Error</div>
              <div style={{ fontSize: "10px", color: C.textSecondary }}>{state.error}</div>
              <button style={{ ...styles.btn(false, C.cyan), marginTop: "16px" }} onClick={handleConnect}>
                Retry
              </button>
            </div>
          )}
          {state.status === "idle" && (
            <div style={{ ...styles.panel, textAlign: "center", padding: "48px", color: C.textSecondary }}>
              <div style={{ fontSize: "11px", letterSpacing: "0.1em", marginBottom: "8px" }}>
                Enter wallet address and connect
              </div>
            </div>
          )}
          {state.metrics && renderView()}
        </div>
      </div>
    </div>
  );
}
