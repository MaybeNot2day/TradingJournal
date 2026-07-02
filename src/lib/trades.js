// Trade reconstruction, equity curve, and metrics — pure functions over the
// normalized fill shape { coin, time, sz, px, side: "B"|"A", closedPnl, fee, venue }.
import { START_TIME, HL_VENUE } from "../constants.js";

const EPS = 1e-7;

export function reconstructTrades(fills) {
  // Group by venue+coin so same-named symbols on different venues never merge
  const byKey = {};
  for (const f of fills) {
    const key = `${f.venue || HL_VENUE}\u0000${f.coin}`;
    (byKey[key] ||= []).push(f);
  }

  const trades = [];

  for (const coinFills of Object.values(byKey)) {
    const { coin, venue = HL_VENUE } = coinFills[0];
    const sorted = [...coinFills].sort((a, b) => a.time - b.time);
    let position = 0; // positive = long, negative = short
    let currentTrade = null;

    const closeTrade = (trade, fill) => {
      trade.exitTime = fill.time;
      trade.status = "closed";
      trade.netPnl = trade.realizedPnl - trade.totalFees;
      trade.holdingTimeMs = trade.exitTime - trade.entryTime;
      trades.push(trade);
    };

    for (const fill of sorted) {
      const sz = parseFloat(fill.sz);
      const px = parseFloat(fill.px);
      const side = fill.side === "B" ? 1 : -1;
      const fillSize = sz * side;
      const closedPnl = parseFloat(fill.closedPnl || "0");
      const fee = parseFloat(fill.fee || "0");

      const prevPosition = position;
      const newPosition = position + fillSize;

      if (prevPosition !== 0 && Math.sign(newPosition) !== Math.sign(prevPosition) && newPosition !== 0) {
        // Position flip (long→short or short→long in one fill)
        if (currentTrade) {
          const closingSize = Math.abs(prevPosition);
          const closingRatio = closingSize / (closingSize + Math.abs(newPosition));
          currentTrade.exitFills.push({ ...fill, effectiveSize: closingSize });
          currentTrade.realizedPnl += closedPnl * closingRatio;
          currentTrade.totalFees += fee * closingRatio;
          currentTrade.avgExit = px;
          closeTrade(currentTrade, fill);
        }
        const openingSize = Math.abs(newPosition);
        currentTrade = {
          id: `${venue}-${coin}-${fill.time}-flip`,
          coin, venue,
          direction: newPosition > 0 ? "LONG" : "SHORT",
          entryFills: [{ ...fill, effectiveSize: openingSize }],
          exitFills: [],
          avgEntry: px, avgExit: null,
          size: openingSize,
          realizedPnl: closedPnl * (1 - Math.abs(prevPosition) / (Math.abs(prevPosition) + openingSize)),
          totalFees: fee * (openingSize / (Math.abs(prevPosition) + openingSize)),
          entryTime: fill.time, exitTime: null,
          status: "open", netPnl: 0, holdingTimeMs: 0,
        };
      } else if (prevPosition === 0) {
        // Opening new trade
        currentTrade = {
          id: `${venue}-${coin}-${fill.time}`,
          coin, venue,
          direction: fillSize > 0 ? "LONG" : "SHORT",
          entryFills: [fill],
          exitFills: [],
          avgEntry: px, avgExit: null,
          size: Math.abs(fillSize),
          realizedPnl: 0,
          totalFees: fee,
          entryTime: fill.time, exitTime: null,
          status: "open", netPnl: 0, holdingTimeMs: 0,
        };
      } else if (Math.abs(newPosition) > Math.abs(prevPosition)) {
        // Scaling in
        if (currentTrade) {
          currentTrade.entryFills.push(fill);
          currentTrade.totalFees += fee;
          let totalCost = 0, totalSize = 0;
          for (const f of currentTrade.entryFills) {
            const fsz = parseFloat(f.sz);
            totalCost += fsz * parseFloat(f.px);
            totalSize += fsz;
          }
          currentTrade.avgEntry = totalCost / totalSize;
          currentTrade.size = Math.abs(newPosition);
        }
      } else if (currentTrade) {
        // Reducing / closing
        currentTrade.exitFills.push(fill);
        currentTrade.realizedPnl += closedPnl;
        currentTrade.totalFees += fee;

        if (Math.abs(newPosition) < EPS) {
          let totalExitCost = 0, totalExitSize = 0;
          for (const f of currentTrade.exitFills) {
            const fsz = parseFloat(f.sz);
            totalExitCost += fsz * parseFloat(f.px);
            totalExitSize += fsz;
          }
          currentTrade.avgExit = totalExitCost / totalExitSize;
          closeTrade(currentTrade, fill);
          currentTrade = null;
        }
      }

      position = Math.abs(newPosition) < EPS ? 0 : newPosition;
    }

    if (currentTrade && position !== 0) {
      currentTrade.status = "open";
      currentTrade.netPnl = currentTrade.realizedPnl - currentTrade.totalFees;
      trades.push(currentTrade);
    }
  }

  return trades.sort((a, b) => a.entryTime - b.entryTime);
}

export function buildEquityCurve(fills, startingBalance) {
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

export function calcMetrics(trades, equityCurve, fills, fundingData, extraFunding = 0) {
  const closed = trades.filter(t => t.status === "closed");
  const wins = closed.filter(t => t.netPnl > 0);
  const losses = closed.filter(t => t.netPnl <= 0);

  const totalPnl = closed.reduce((s, t) => s + t.netPnl, 0);
  const winRate = closed.length > 0 ? wins.length / closed.length : 0;
  const totalWins = wins.reduce((s, t) => s + t.netPnl, 0);
  const totalLosses = Math.abs(losses.reduce((s, t) => s + t.netPnl, 0));
  const avgWin = wins.length > 0 ? totalWins / wins.length : 0;
  const avgLoss = losses.length > 0 ? totalLosses / losses.length : 0;
  const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;
  const expectancy = winRate * avgWin - (1 - winRate) * avgLoss;
  const avgRR = avgLoss > 0 ? avgWin / avgLoss : 0;
  const totalFees = fills.reduce((s, f) => s + parseFloat(f.fee || "0"), 0);
  const totalVolume = fills.reduce((s, f) => s + parseFloat(f.sz) * parseFloat(f.px), 0);

  let maxDrawdown = 0;
  for (const p of equityCurve) maxDrawdown = Math.max(maxDrawdown, Math.abs(p.drawdown));

  // Daily returns for Sharpe/Sortino
  const dailyMap = {};
  for (const pt of equityCurve) {
    dailyMap[new Date(pt.time).toISOString().slice(0, 10)] = pt.cumPnl;
  }
  const days = Object.keys(dailyMap).sort();
  const dailyReturns = [];
  for (let i = 1; i < days.length; i++) {
    dailyReturns.push(dailyMap[days[i]] - dailyMap[days[i - 1]]);
  }

  const meanReturn = dailyReturns.length > 0 ? dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length : 0;
  const variance = dailyReturns.length > 1
    ? dailyReturns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / (dailyReturns.length - 1)
    : 0;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? (meanReturn / std) * Math.sqrt(365) : 0;

  const downside = dailyReturns.filter(r => r < 0);
  const downsideVar = downside.length > 1
    ? downside.reduce((s, r) => s + r ** 2, 0) / downside.length
    : 0;
  const downsideStd = Math.sqrt(downsideVar);
  const sortino = downsideStd > 0 ? (meanReturn / downsideStd) * Math.sqrt(365) : 0;

  const totalDays = days.length || 1;
  const annualizedReturn = (totalPnl / (equityCurve[0]?.equity || 1)) * (365 / totalDays);
  const calmar = maxDrawdown > 0 ? annualizedReturn / (maxDrawdown / 100) : 0;

  let maxWinStreak = 0, maxLossStreak = 0, curWin = 0, curLoss = 0;
  for (const t of closed) {
    if (t.netPnl > 0) { curWin++; curLoss = 0; maxWinStreak = Math.max(maxWinStreak, curWin); }
    else { curLoss++; curWin = 0; maxLossStreak = Math.max(maxLossStreak, curLoss); }
  }

  let largestWin = 0, largestLoss = 0;
  for (const t of closed) {
    if (t.netPnl > largestWin) largestWin = t.netPnl;
    if (t.netPnl < largestLoss) largestLoss = t.netPnl;
  }

  const avgDuration = closed.length > 0
    ? closed.reduce((s, t) => s + (t.holdingTimeMs || 0), 0) / closed.length
    : 0;

  // Funding (HL funding events + QFEX account-level net_funding)
  const totalFunding = (fundingData
    ? fundingData.reduce((s, f) => s + parseFloat(f.delta?.usdc || "0"), 0)
    : 0) + extraFunding;

  const byAsset = {};
  const byDow = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const byHour = {};
  for (let h = 0; h < 24; h++) byHour[h] = 0;
  const dailyPnl = {};
  for (const t of closed) {
    const a = (byAsset[t.coin] ||= { pnl: 0, trades: 0, wins: 0 });
    a.pnl += t.netPnl;
    a.trades++;
    if (t.netPnl > 0) a.wins++;
    const d = new Date(t.entryTime);
    byDow[d.getDay()] += t.netPnl;
    byHour[d.getUTCHours()] += t.netPnl;
    const day = d.toISOString().slice(0, 10);
    dailyPnl[day] = (dailyPnl[day] || 0) + t.netPnl;
  }

  const longTrades = closed.filter(t => t.direction === "LONG");
  const shortTrades = closed.filter(t => t.direction === "SHORT");
  const longPnl = longTrades.reduce((s, t) => s + t.netPnl, 0);
  const shortPnl = shortTrades.reduce((s, t) => s + t.netPnl, 0);

  const durationBuckets = {
    "<1m":    closed.filter(t => t.holdingTimeMs < 60000),
    "1-5m":   closed.filter(t => t.holdingTimeMs >= 60000 && t.holdingTimeMs < 300000),
    "5-30m":  closed.filter(t => t.holdingTimeMs >= 300000 && t.holdingTimeMs < 1800000),
    "30m-4h": closed.filter(t => t.holdingTimeMs >= 1800000 && t.holdingTimeMs < 14400000),
    ">4h":    closed.filter(t => t.holdingTimeMs >= 14400000),
  };

  return {
    totalPnl, winRate, profitFactor, expectancy, avgRR,
    avgWin, avgLoss, totalFees, totalVolume,
    maxDrawdown, sharpe, sortino, calmar,
    maxWinStreak, maxLossStreak,
    largestWin, largestLoss, avgDuration,
    totalFunding,
    byAsset, byDow, byHour, longPnl, shortPnl,
    longTrades: longTrades.length, shortTrades: shortTrades.length,
    totalTrades: closed.length, openTrades: trades.filter(t => t.status === "open").length,
    durationBuckets, dailyPnl, dailyReturns,
  };
}
