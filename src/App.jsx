import React, { useState, useEffect, useReducer, useCallback, useRef } from "react";
import {
  DEFAULT_WALLET, DEFAULT_QFEX_PUBLIC, DEFAULT_QFEX_SECRET,
  START_TIME, POLL_INTERVAL_FILLS,
  QFEX_LS_PUBLIC, QFEX_LS_SECRET, WALLET_LS_KEY,
} from "./constants.js";
import {
  fetchAllFills, fetchClearinghouseState, fetchFunding, fetchAllMids, hlAccountTotals,
} from "./api/hyperliquid.js";
import { fetchQfexFills, fetchQfexAccount } from "./api/qfex.js";
import { reconstructTrades, buildEquityCurve, calcMetrics } from "./lib/trades.js";
import { fmt } from "./lib/format.js";
import { LoadingScreen } from "./components/ui.jsx";
import Overview from "./views/Overview.jsx";
import TradeLog from "./views/TradeLog.jsx";
import Analysis from "./views/Analysis.jsx";
import Calendar from "./views/Calendar.jsx";
import Positions from "./views/Positions.jsx";

const NAV_ITEMS = [
  { id: "overview", label: "Overview" },
  { id: "trades", label: "Trade Log" },
  { id: "analysis", label: "Analysis" },
  { id: "calendar", label: "Calendar" },
  { id: "positions", label: "Positions" },
];

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

function loadStoredWallet() {
  try { return localStorage.getItem(WALLET_LS_KEY) || ""; } catch { return ""; }
}

// Stored creds win; .env values are the fallback so keys never need re-entering.
function loadStoredQfexCreds() {
  let publicKey = "", secretKey = "";
  try {
    publicKey = localStorage.getItem(QFEX_LS_PUBLIC) || "";
    secretKey = localStorage.getItem(QFEX_LS_SECRET) || "";
  } catch { /* private mode */ }
  if (!publicKey || !secretKey) {
    publicKey = DEFAULT_QFEX_PUBLIC;
    secretKey = DEFAULT_QFEX_SECRET;
  }
  return publicKey && secretKey ? { publicKey, secretKey } : null;
}

function Sidebar({ view, setView, metrics }) {
  return (
    <nav className="sidebar">
      {NAV_ITEMS.map(item => (
        <button key={item.id}
          className={`nav-item ${view === item.id ? "active" : ""}`}
          onClick={() => setView(item.id)}>
          {item.label}
        </button>
      ))}
      {metrics && (
        <div className="sidebar-stats">
          <div>
            <div className="sidebar-stat-label">Net PnL</div>
            <div className={`sidebar-stat-value mono ${metrics.totalPnl >= 0 ? "pos" : "neg"}`}>
              {fmt.usd(metrics.totalPnl)}
            </div>
          </div>
          <div>
            <div className="sidebar-stat-label">Win Rate</div>
            <div className="sidebar-stat-value mono">{fmt.pct(metrics.winRate * 100)}</div>
          </div>
          <div>
            <div className="sidebar-stat-label">Closed Trades</div>
            <div className="sidebar-stat-value mono">{metrics.totalTrades}</div>
          </div>
          <div>
            <div className="sidebar-stat-label">Max Drawdown</div>
            <div className="sidebar-stat-value mono neg">{fmt.pct(-metrics.maxDrawdown)}</div>
          </div>
          <div>
            <div className="sidebar-stat-label">Sharpe</div>
            <div className="sidebar-stat-value mono">{fmt.ratio(metrics.sharpe)}</div>
          </div>
        </div>
      )}
    </nav>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [view, setView] = useState("overview");
  const [walletInput, setWalletInput] = useState(() => loadStoredWallet() || DEFAULT_WALLET);
  const [qfexPubInput, setQfexPubInput] = useState(() => loadStoredQfexCreds()?.publicKey || "");
  const [qfexSecInput, setQfexSecInput] = useState(() => loadStoredQfexCreds()?.secretKey || "");
  // Settings popover: open automatically only when nothing is configured yet.
  const [showSettings, setShowSettings] = useState(() => !(loadStoredWallet() || DEFAULT_WALLET));
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
      localStorage.setItem(WALLET_LS_KEY, wallet);
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

  // Auto-connect on mount with stored wallet + QFEX creds
  useEffect(() => {
    const creds = loadStoredQfexCreds();
    if (creds) dispatch({ type: "SET_QFEX_CREDS", creds });
    const wallet = loadStoredWallet() || DEFAULT_WALLET;
    if (wallet) {
      dispatch({ type: "SET_WALLET", wallet });
      loadData(wallet, creds);
    }
  }, []);

  if (state.status === "loading") {
    return <LoadingScreen message={state.loadingMessage} />;
  }

  const renderView = () => {
    if (!state.metrics) return null;
    switch (view) {
      case "overview":
        return <Overview metrics={state.metrics} equityCurve={state.equityCurve} trades={state.trades} />;
      case "trades":
        return <TradeLog trades={state.trades} />;
      case "analysis":
        return <Analysis metrics={state.metrics} trades={state.trades} equityCurve={state.equityCurve} />;
      case "calendar":
        return <Calendar metrics={state.metrics} />;
      case "positions":
        return <Positions clearinghouseState={state.clearinghouseState}
          qfexState={state.qfexState} allMids={state.allMids} trades={state.trades} />;
      default:
        return null;
    }
  };

  const qfexTagClass = !state.qfexCreds ? "neutral"
    : state.qfexError ? "short"
    : state.qfexState ? "long" : "warn";

  return (
    <div className="app">
      <header className="header">
        <div className="logo">Trading Journal <span>· trade.xyz</span></div>
        {walletInput && (
          <span className="dim mono" style={{ fontSize: 11 }}>
            {walletInput.slice(0, 6)}…{walletInput.slice(-4)}
          </span>
        )}
        <div style={{ position: "relative" }}>
          <button className={`btn ghost ${showSettings ? "active" : ""}`}
            onClick={() => setShowSettings(s => !s)} title="Connection settings">
            ⚙ Settings
          </button>
          {showSettings && (
            <div className="settings-pop">
              <label className="settings-label">Hyperliquid wallet
                <input className="input"
                  value={walletInput}
                  onChange={e => setWalletInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (setShowSettings(false), handleConnect())}
                  placeholder="0x... wallet address" />
              </label>
              <label className="settings-label">QFEX public key
                <input className="input"
                  value={qfexPubInput}
                  onChange={e => setQfexPubInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (setShowSettings(false), handleConnect())}
                  placeholder="optional" />
              </label>
              <label className="settings-label">QFEX secret key
                <input className="input" type="password"
                  value={qfexSecInput}
                  onChange={e => setQfexSecInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (setShowSettings(false), handleConnect())}
                  placeholder="optional" />
              </label>
              <button className="btn primary" style={{ width: "100%" }}
                onClick={() => { setShowSettings(false); handleConnect(); }}>
                Connect
              </button>
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <span className={`status-dot ${state.status}`} />
          <span className="dim" style={{ fontSize: 12 }}>
            {state.status === "live" ? "Live" : state.status === "error" ? "Error" : "Idle"}
          </span>
          <span className={`tag ${qfexTagClass}`} title={
            !state.qfexCreds ? "QFEX not configured — enter API keys to add it"
            : state.qfexError ? `QFEX error: ${state.qfexError}`
            : "QFEX connected"
          }>
            QFEX
          </span>
          {state.lastRefresh && (
            <span className="dim mono" style={{ fontSize: 11 }}>
              {new Date(state.lastRefresh).toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      <div className="layout">
        <Sidebar view={view} setView={setView} metrics={state.metrics} />
        <main className="main">
          {state.error && <div className="banner error">Error: {state.error}</div>}
          {state.qfexError && (
            <div className="banner warn">QFEX: {state.qfexError} — showing Hyperliquid data only</div>
          )}
          {state.status === "error" && !state.metrics && (
            <div className="panel" style={{ textAlign: "center", padding: 40 }}>
              <div style={{ marginBottom: 12, color: "var(--red)" }}>Connection failed</div>
              <button className="btn" onClick={handleConnect}>Retry</button>
            </div>
          )}
          {state.status === "idle" && (
            <div className="panel" style={{ textAlign: "center", padding: 48, color: "var(--text-dim)" }}>
              Enter a wallet address and connect
            </div>
          )}
          {state.metrics && renderView()}
        </main>
      </div>
    </div>
  );
}
