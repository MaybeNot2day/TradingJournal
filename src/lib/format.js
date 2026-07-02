export const fmt = {
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
