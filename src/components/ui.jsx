import React from "react";
import { fmt } from "../lib/format.js";
import { QFEX_VENUE, HL_VENUE } from "../constants.js";

// Recharts theme shared across all charts
export const chart = {
  grid: "var(--border)",
  axisTick: { fill: "#5c6170", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" },
  green: "#34d399",
  red: "#f87171",
  accent: "#7aa2f7",
};

export function VenueTag({ venue }) {
  const v = venue || HL_VENUE;
  return <span className={`tag ${v === QFEX_VENUE ? "neutral" : "accent"}`}>{v}</span>;
}

export function DirTag({ direction }) {
  return <span className={`tag ${direction === "LONG" ? "long" : "short"}`}>{direction}</span>;
}

export function Pnl({ value, bold = false }) {
  return (
    <span className={`mono ${value >= 0 ? "pos" : "neg"}`} style={bold ? { fontWeight: 600 } : undefined}>
      {fmt.usd(value)}
    </span>
  );
}

export function Metric({ label, value, sub, format = "usd", signed = true }) {
  let display;
  switch (format) {
    case "usd": display = fmt.usd(value); break;
    case "pct": display = fmt.pct(value); break;
    case "ratio": display = fmt.ratio(value); break;
    case "duration": display = fmt.duration(value); break;
    case "raw": display = value ?? "—"; break;
    default: display = value ?? "—";
  }
  const cls = signed && typeof value === "number" && value !== 0
    ? (value > 0 ? "pos" : "neg")
    : "";
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className={`metric-value mono ${cls}`}>{display}</div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}

export function Panel({ title, children, className = "" }) {
  return (
    <div className={`panel ${className}`}>
      {title && <div className="panel-title">{title}</div>}
      {children}
    </div>
  );
}

export function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="dim" style={{ marginBottom: 4 }}>{new Date(label).toLocaleString()}</div>
      {payload.map((p, i) => (
        <div key={i} className="mono" style={{ color: p.color }}>
          {p.name}: {p.name === "drawdown" ? fmt.pct(p.value) : fmt.usd(p.value)}
        </div>
      ))}
    </div>
  );
}

export function LoadingScreen({ message }) {
  return (
    <div className="loading-screen">
      <div className="spinner" />
      <div style={{ fontSize: 13, fontWeight: 500 }}>Trading Journal</div>
      <div style={{ fontSize: 12, color: "var(--text-faint)" }}>{message || "Loading..."}</div>
    </div>
  );
}
