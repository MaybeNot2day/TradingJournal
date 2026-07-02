import React, { useMemo } from "react";
import { fmt } from "../lib/format.js";
import { Panel } from "../components/ui.jsx";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GREEN = [52, 211, 153];
const RED = [248, 113, 113];

export default function Calendar({ metrics }) {
  const { dailyPnl } = metrics;

  const weeks = useMemo(() => {
    const days = Object.keys(dailyPnl).sort();
    if (!days.length) return [];
    const end = new Date(days[days.length - 1]);
    const cur = new Date(days[0]);
    cur.setDate(cur.getDate() - cur.getDay()); // back to Sunday
    const all = [];
    while (cur <= end || all.length % 7 !== 0) {
      const iso = cur.toISOString().slice(0, 10);
      all.push({ date: iso, pnl: dailyPnl[iso] ?? null });
      cur.setDate(cur.getDate() + 1);
    }
    const out = [];
    for (let i = 0; i < all.length; i += 7) out.push(all.slice(i, i + 7));
    return out;
  }, [dailyPnl]);

  const maxAbsPnl = useMemo(() => {
    const vals = Object.values(dailyPnl).map(Math.abs);
    return vals.length ? Math.max(...vals) : 1;
  }, [dailyPnl]);

  const cellStyle = (pnl) => {
    if (pnl === null || pnl === 0) return undefined;
    const [r, g, b] = pnl > 0 ? GREEN : RED;
    const alpha = 0.15 + Math.min(1, Math.abs(pnl) / maxAbsPnl) * 0.75;
    return { background: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(2)})` };
  };

  const monthLabels = useMemo(() => {
    const labels = [];
    let lastMonth = null;
    weeks.forEach((week, wi) => {
      const month = week[0]?.date?.slice(0, 7);
      if (month && month !== lastMonth) {
        labels.push({
          index: wi,
          label: new Date(week[0].date).toLocaleString("default", { month: "short", year: "2-digit" }),
        });
        lastMonth = month;
      }
    });
    return labels;
  }, [weeks]);

  return (
    <Panel title="Daily PnL calendar">
      {weeks.length === 0 ? (
        <div className="empty-row" style={{ padding: 32, textAlign: "center", color: "var(--text-faint)" }}>
          No data
        </div>
      ) : (
        <div className="table-wrap">
          <div style={{ display: "flex", marginLeft: 36, marginBottom: 4 }}>
            {weeks.map((_, wi) => (
              <div key={wi} style={{ width: 15, marginRight: 3, fontSize: 9, color: "var(--text-faint)", whiteSpace: "nowrap" }}>
                {monthLabels.find(l => l.index === wi)?.label || ""}
              </div>
            ))}
          </div>
          <div style={{ display: "flex" }}>
            <div style={{ display: "flex", flexDirection: "column", marginRight: 6 }}>
              {DOW.map(d => (
                <div key={d} style={{ height: 15, marginBottom: 3, fontSize: 9, color: "var(--text-faint)", width: 30, display: "flex", alignItems: "center" }}>
                  {d}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 3 }}>
              {weeks.map((week, wi) => (
                <div key={wi} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {week.map((day, di) => (
                    <div key={di} className="cal-cell" style={cellStyle(day.pnl)}
                      title={`${day.date}: ${day.pnl !== null ? fmt.usd(day.pnl) : "no trades"}`} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 14, alignItems: "center", fontSize: 11, color: "var(--text-faint)" }}>
            <span style={{ marginRight: 6 }}>Loss</span>
            {[1, 0.6, 0.3].map(i => (
              <div key={`r${i}`} className="cal-cell" style={{ background: `rgba(248, 113, 113, ${0.15 + i * 0.75})` }} />
            ))}
            <div className="cal-cell" />
            {[0.3, 0.6, 1].map(i => (
              <div key={`g${i}`} className="cal-cell" style={{ background: `rgba(52, 211, 153, ${0.15 + i * 0.75})` }} />
            ))}
            <span style={{ marginLeft: 6 }}>Profit</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
