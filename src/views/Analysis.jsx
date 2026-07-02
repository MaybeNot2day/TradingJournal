import React, { useMemo } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Cell,
} from "recharts";
import { fmt } from "../lib/format.js";
import { Metric, Panel, chart } from "../components/ui.jsx";

const tooltipStyle = {
  background: "var(--bg-hover)",
  border: "1px solid var(--border-strong)",
  borderRadius: 5,
  fontSize: 11,
};

function PnlBarChart({ data, xKey, height = 220, angled = false }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: angled ? 40 : 4 }}>
        <CartesianGrid stroke={chart.grid} strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey={xKey} tick={{ ...chart.axisTick, fontSize: angled ? 9 : 10 }}
          angle={angled ? -45 : 0} textAnchor={angled ? "end" : "middle"}
          tickLine={false} axisLine={false} />
        <YAxis tickFormatter={v => fmt.usd(v)} tick={chart.axisTick} tickLine={false} axisLine={false} width={58} />
        <Tooltip formatter={v => fmt.usd(v)} contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <ReferenceLine y={0} stroke={chart.grid} />
        <Bar dataKey="pnl" name="PnL" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.pnl >= 0 ? chart.green : chart.red} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
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
        <CartesianGrid stroke={chart.grid} strokeDasharray="3 5" vertical={false} />
        <XAxis dataKey="label" tick={{ ...chart.axisTick, fontSize: 9 }}
          angle={-45} textAnchor="end" tickLine={false} axisLine={false} />
        <YAxis tick={chart.axisTick} tickLine={false} axisLine={false} width={30} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
        <Bar dataKey="count" name="# Trades" radius={[3, 3, 0, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.positive ? chart.green : chart.red} fillOpacity={0.7} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function Analysis({ metrics, trades, equityCurve }) {
  const assetData = useMemo(() => Object.entries(metrics.byAsset)
    .map(([coin, d]) => ({ coin: coin.replace("xyz:", ""), pnl: d.pnl }))
    .sort((a, b) => b.pnl - a.pnl), [metrics.byAsset]);

  const dowData = Object.entries(metrics.byDow).map(([d, pnl]) => ({
    day: DOW_LABELS[parseInt(d)], pnl,
  }));

  const hourData = Object.entries(metrics.byHour).map(([h, pnl]) => ({
    hour: `${h.padStart(2, "0")}`, pnl: parseFloat(pnl.toFixed(2)),
  }));

  const durationData = Object.entries(metrics.durationBuckets).map(([label, tArr]) => ({
    label,
    pnl: tArr.reduce((s, t) => s + t.netPnl, 0),
  }));

  // Rolling 7d Sharpe
  const rollingData = useMemo(() => {
    const pts = equityCurve.slice(-200);
    if (pts.length < 8) return [];
    const dailyMap = {};
    for (const p of pts) {
      dailyMap[new Date(p.time).toISOString().slice(0, 10)] = p.cumPnl;
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
      const std = Math.sqrt(window.reduce((s, r) => s + (r - mean) ** 2, 0) / window.length);
      const sharpe = std > 0 ? (mean / std) * Math.sqrt(365) : 0;
      result.push({ date: days[i], sharpe: parseFloat(sharpe.toFixed(2)) });
    }
    return result;
  }, [equityCurve]);

  return (
    <>
      <div className="metrics-grid cols-4">
        <Metric label="Long PnL" value={metrics.longPnl} />
        <Metric label="Short PnL" value={metrics.shortPnl} />
        <Metric label="Long Trades" value={metrics.longTrades} format="raw" signed={false} />
        <Metric label="Short Trades" value={metrics.shortTrades} format="raw" signed={false} />
      </div>

      <div className="grid-2">
        <Panel title="PnL by asset">
          <PnlBarChart data={assetData} xKey="coin" angled />
        </Panel>
        <Panel title="PnL by day of week">
          <PnlBarChart data={dowData} xKey="day" />
        </Panel>
        <Panel title="PnL by hour (UTC)">
          <PnlBarChart data={hourData} xKey="hour" height={200} />
        </Panel>
        <Panel title="PnL by trade duration">
          <PnlBarChart data={durationData} xKey="label" height={200} />
        </Panel>
      </div>

      {rollingData.length > 0 && (
        <Panel title="Rolling 7-day Sharpe">
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={rollingData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid stroke={chart.grid} strokeDasharray="3 5" vertical={false} />
              <XAxis dataKey="date" tick={chart.axisTick} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => v.toFixed(1)} tick={chart.axisTick} tickLine={false} axisLine={false} width={40} />
              <Tooltip formatter={v => v.toFixed(2)} contentStyle={tooltipStyle} />
              <ReferenceLine y={0} stroke={chart.grid} />
              <ReferenceLine y={1} stroke={chart.green} strokeOpacity={0.3} strokeDasharray="3 3" />
              <Line type="monotone" dataKey="sharpe" stroke={chart.accent} strokeWidth={1.5} dot={false} name="7d Sharpe" />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
      )}

      <Panel title="Trade PnL distribution">
        <PnlDistribution trades={trades.filter(t => t.status === "closed")} />
      </Panel>
    </>
  );
}
