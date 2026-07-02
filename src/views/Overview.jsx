import React, { useMemo } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { fmt } from "../lib/format.js";
import { Metric, Panel, ChartTooltip, VenueTag, DirTag, Pnl, chart } from "../components/ui.jsx";

export default function Overview({ metrics, equityCurve, trades }) {
  const recentTrades = useMemo(() => [...trades]
    .filter(t => t.status === "closed")
    .sort((a, b) => b.exitTime - a.exitTime)
    .slice(0, 10), [trades]);

  // Downsample equity curve for performance
  const chartData = useMemo(() => {
    if (equityCurve.length <= 500) return equityCurve;
    const step = Math.ceil(equityCurve.length / 500);
    return equityCurve.filter((_, i) => i % step === 0 || i === equityCurve.length - 1);
  }, [equityCurve]);

  return (
    <>
      <div className="metrics-grid cols-4">
        <Metric label="Total Net PnL" value={metrics.totalPnl} />
        <Metric label="Win Rate" value={metrics.winRate * 100} format="pct" sub={`${metrics.totalTrades} closed trades`} signed={false} />
        <Metric label="Profit Factor" value={metrics.profitFactor} format="ratio" signed={false} />
        <Metric label="Max Drawdown" value={-metrics.maxDrawdown} format="pct" />
        <Metric label="Sharpe" value={metrics.sharpe} format="ratio" signed={false} />
        <Metric label="Sortino" value={metrics.sortino} format="ratio" signed={false} />
        <Metric label="Calmar" value={metrics.calmar} format="ratio" signed={false} />
        <Metric label="Expectancy" value={metrics.expectancy} />
      </div>

      <div className="metrics-grid cols-6">
        <Metric label="Avg Win" value={metrics.avgWin} />
        <Metric label="Avg Loss" value={-metrics.avgLoss} />
        <Metric label="Avg R:R" value={metrics.avgRR} format="ratio" signed={false} />
        <Metric label="Largest Win" value={metrics.largestWin} />
        <Metric label="Largest Loss" value={metrics.largestLoss} />
        <Metric label="Avg Duration" value={metrics.avgDuration} format="duration" signed={false} />
        <Metric label="Total Fees" value={-metrics.totalFees} />
        <Metric label="Funding PnL" value={metrics.totalFunding} />
        <Metric label="Volume" value={metrics.totalVolume} signed={false} />
        <Metric label="Win Streak" value={metrics.maxWinStreak} format="raw" signed={false} />
        <Metric label="Loss Streak" value={metrics.maxLossStreak} format="raw" signed={false} />
        <Metric label="Open Trades" value={metrics.openTrades} format="raw" signed={false} />
      </div>

      <Panel title="Equity curve — realized PnL">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chart.accent} stopOpacity={0.25} />
                <stop offset="95%" stopColor={chart.accent} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={chart.grid} strokeDasharray="3 5" vertical={false} />
            <XAxis dataKey="time" tickFormatter={fmt.date} tick={chart.axisTick} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={v => fmt.usd(v)} tick={chart.axisTick} tickLine={false} axisLine={false} width={64} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={equityCurve[0]?.equity || 0} stroke={chart.grid} strokeDasharray="3 3" />
            <Area type="monotone" dataKey="equity" stroke={chart.accent} strokeWidth={1.5}
              fill="url(#equityGrad)" dot={false} name="equity" />
          </AreaChart>
        </ResponsiveContainer>
        <ResponsiveContainer width="100%" height={80}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chart.red} stopOpacity={0.3} />
                <stop offset="95%" stopColor={chart.red} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" hide />
            <YAxis tickFormatter={v => `${v.toFixed(1)}%`} tick={chart.axisTick} tickLine={false} axisLine={false} width={64} />
            <Tooltip content={<ChartTooltip />} />
            <ReferenceLine y={0} stroke={chart.grid} />
            <Area type="monotone" dataKey="drawdown" stroke={chart.red} strokeWidth={1}
              fill="url(#ddGrad)" dot={false} name="drawdown" />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>

      <Panel title="Recent closed trades" className="table-wrap">
        <table>
          <thead>
            <tr>
              {["Asset", "Venue", "Dir", "Entry", "Exit", "Avg Entry", "Avg Exit", "Size", "Net PnL", "Duration"].map(h => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {recentTrades.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 500 }}>{t.coin}</td>
                <td><VenueTag venue={t.venue} /></td>
                <td><DirTag direction={t.direction} /></td>
                <td className="mono dim">{fmt.time(t.entryTime)}</td>
                <td className="mono dim">{fmt.time(t.exitTime)}</td>
                <td className="mono">${parseFloat(t.avgEntry || 0).toFixed(4)}</td>
                <td className="mono">${parseFloat(t.avgExit || 0).toFixed(4)}</td>
                <td className="mono">{parseFloat(t.size || 0).toFixed(4)}</td>
                <td><Pnl value={t.netPnl} bold /></td>
                <td className="mono dim">{fmt.duration(t.holdingTimeMs)}</td>
              </tr>
            ))}
            {recentTrades.length === 0 && (
              <tr><td colSpan={10} className="empty-row">No closed trades yet</td></tr>
            )}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
