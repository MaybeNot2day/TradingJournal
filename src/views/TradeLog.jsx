import React, { useState, useMemo } from "react";
import { fmt } from "../lib/format.js";
import { Panel, VenueTag, DirTag, Pnl } from "../components/ui.jsx";

const PAGE_SIZE = 50;

const COLUMNS = [
  ["coin", "Asset"], ["venue", "Venue"], ["direction", "Dir"], ["entryTime", "Entry"],
  ["exitTime", "Exit"], ["avgEntry", "Avg Entry"], ["avgExit", "Avg Exit"],
  ["size", "Size"], ["realizedPnl", "Realized"], ["totalFees", "Fees"],
  ["netPnl", "Net PnL"], ["holdingTimeMs", "Duration"], ["status", "Status"],
];

export default function TradeLog({ trades }) {
  const [sortKey, setSortKey] = useState("entryTime");
  const [sortDir, setSortDir] = useState(-1);
  const [filter, setFilter] = useState({ asset: "", direction: "", status: "all", minPnl: "", maxPnl: "" });
  const [page, setPage] = useState(0);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  };

  const setF = (patch) => { setFilter(f => ({ ...f, ...patch })); setPage(0); };

  const sorted = useMemo(() => {
    const filtered = trades.filter(t => {
      if (filter.asset && !t.coin.toLowerCase().includes(filter.asset.toLowerCase())) return false;
      if (filter.direction && t.direction !== filter.direction) return false;
      if (filter.status !== "all" && t.status !== filter.status) return false;
      if (filter.minPnl !== "" && t.netPnl < parseFloat(filter.minPnl)) return false;
      if (filter.maxPnl !== "" && t.netPnl > parseFloat(filter.maxPnl)) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir;
    });
  }, [trades, filter, sortKey, sortDir]);

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

  return (
    <>
      <Panel className="filter-bar">
        <input className="input" style={{ width: 110 }} placeholder="Asset"
          value={filter.asset} onChange={e => setF({ asset: e.target.value })} />
        <input className="input" style={{ width: 90 }} placeholder="Min PnL"
          value={filter.minPnl} onChange={e => setF({ minPnl: e.target.value })} />
        <input className="input" style={{ width: 90 }} placeholder="Max PnL"
          value={filter.maxPnl} onChange={e => setF({ maxPnl: e.target.value })} />
        <div className="seg">
          {["all", "closed", "open"].map(s => (
            <button key={s} className={`btn ghost ${filter.status === s ? "active" : ""}`}
              onClick={() => setF({ status: s })}>
              {s[0].toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="seg">
          {[["", "Both"], ["LONG", "Long"], ["SHORT", "Short"]].map(([d, label]) => (
            <button key={label} className={`btn ghost ${filter.direction === d ? "active" : ""}`}
              onClick={() => setF({ direction: d })}>
              {label}
            </button>
          ))}
        </div>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={exportCsv}>Export CSV</button>
        <span className="dim" style={{ fontSize: 12 }}>{sorted.length} trades</span>
      </Panel>

      <Panel className="table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map(([key, label]) => (
                <th key={key} className="sortable" onClick={() => handleSort(key)}>
                  {label}{sortKey === key ? (sortDir === 1 ? " ↑" : " ↓") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map(t => (
              <tr key={t.id}>
                <td style={{ fontWeight: 500 }}>{t.coin}</td>
                <td><VenueTag venue={t.venue} /></td>
                <td><DirTag direction={t.direction} /></td>
                <td className="mono dim">{fmt.time(t.entryTime)}</td>
                <td className="mono dim">{t.exitTime ? fmt.time(t.exitTime) : "—"}</td>
                <td className="mono">${parseFloat(t.avgEntry || 0).toFixed(4)}</td>
                <td className="mono">{t.avgExit ? `$${parseFloat(t.avgExit).toFixed(4)}` : "—"}</td>
                <td className="mono">{parseFloat(t.size || 0).toFixed(4)}</td>
                <td><Pnl value={t.realizedPnl} /></td>
                <td className="mono neg">{fmt.usd(-t.totalFees)}</td>
                <td><Pnl value={t.netPnl} bold /></td>
                <td className="mono dim">{fmt.duration(t.holdingTimeMs)}</td>
                <td><span className={`tag ${t.status === "open" ? "warn" : "neutral"}`}>{t.status}</span></td>
              </tr>
            ))}
            {paginated.length === 0 && (
              <tr><td colSpan={13} className="empty-row">No trades match filter</td></tr>
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="pagination">
            <button className="btn ghost" onClick={() => setPage(0)} disabled={page === 0}>«</button>
            <button className="btn ghost" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>‹</button>
            <span className="dim" style={{ fontSize: 12 }}>Page {page + 1} / {totalPages}</span>
            <button className="btn ghost" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page === totalPages - 1}>›</button>
            <button className="btn ghost" onClick={() => setPage(totalPages - 1)} disabled={page === totalPages - 1}>»</button>
          </div>
        )}
      </Panel>
    </>
  );
}
