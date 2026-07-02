import React, { useMemo } from "react";
import { fmt } from "../lib/format.js";
import { hlAccountTotals } from "../api/hyperliquid.js";
import { QFEX_VENUE, HL_VENUE } from "../constants.js";
import { Metric, Panel, VenueTag, DirTag, Pnl } from "../components/ui.jsx";

export default function Positions({ clearinghouseState, qfexState, allMids, trades }) {
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
    <>
      <div className="metrics-grid cols-4">
        <Metric label="Total Account Value" value={hlAccountValue + qfexEquity} signed={false}
          sub={qfexState ? `HL ${fmt.usd(hlAccountValue)} · QFEX ${fmt.usd(qfexEquity)}` : undefined} />
        <Metric label="Total Margin Used" value={hlMarginUsed + qfexMarginUsed} signed={false}
          sub={qfexState ? `HL ${fmt.usd(hlMarginUsed)} · QFEX ${fmt.usd(qfexMarginUsed)}` : undefined} />
        <Metric label="Unrealized PnL" value={totalUpnl} />
        <Metric label="Open Positions" value={positions.length} format="raw" signed={false} />
      </div>

      <Panel title="Open positions" className="table-wrap">
        {positions.length === 0 ? (
          <div style={{ textAlign: "center", color: "var(--text-faint)", padding: 32 }}>
            No open positions
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                {["Asset", "Venue", "Side", "Size", "Entry Price", "Mark Price", "Unrealized PnL", "ROE%", "Leverage", "Liquidation"].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.map(p => (
                <tr key={`${p.venue}-${p.coin}`}>
                  <td style={{ fontWeight: 500 }}>{p.coin}</td>
                  <td><VenueTag venue={p.venue} /></td>
                  <td><DirTag direction={p.szi > 0 ? "LONG" : "SHORT"} /></td>
                  <td className="mono">{Math.abs(p.szi).toFixed(4)}</td>
                  <td className="mono">${p.entryPx.toFixed(4)}</td>
                  <td className="mono">{p.markPx > 0 ? `$${p.markPx.toFixed(4)}` : "—"}</td>
                  <td><Pnl value={p.unrealizedPnl} bold /></td>
                  <td className={`mono ${p.roe !== null ? (p.roe >= 0 ? "pos" : "neg") : "dim"}`}>
                    {p.roe !== null ? fmt.pct(p.roe) : "—"}
                  </td>
                  <td className="mono">{p.leverage !== null ? `${p.leverage}×` : "—"}</td>
                  <td className="mono dim">{p.liqPx > 0 ? `$${p.liqPx.toFixed(4)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {qfexState?.balance && (
        <Panel title="QFEX account">
          <div className="metrics-grid cols-6">
            <Metric label="Available" value={qfexState.balance.available_balance} signed={false} />
            <Metric label="Deposit" value={qfexState.balance.deposit} signed={false} />
            <Metric label="Realised PnL" value={qfexState.balance.realised_pnl} />
            <Metric label="Unrealised PnL" value={qfexState.balance.unrealised_pnl} />
            <Metric label="Net Funding" value={qfexState.balance.net_funding} />
            <Metric label="Margin Held" value={(qfexState.balance.position_margin ?? 0) + (qfexState.balance.order_margin ?? 0)} signed={false} />
          </div>
        </Panel>
      )}

      {openTrades.length > 0 && (
        <Panel title="Open trades (reconstructed)" className="table-wrap">
          <table>
            <thead>
              <tr>
                {["Asset", "Venue", "Dir", "Entry Time", "Avg Entry", "Size", "Realized So Far", "Fees So Far"].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {openTrades.map(t => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 500 }}>{t.coin}</td>
                  <td><VenueTag venue={t.venue} /></td>
                  <td><DirTag direction={t.direction} /></td>
                  <td className="mono dim">{fmt.time(t.entryTime)}</td>
                  <td className="mono">${parseFloat(t.avgEntry || 0).toFixed(4)}</td>
                  <td className="mono">{parseFloat(t.size || 0).toFixed(4)}</td>
                  <td><Pnl value={t.realizedPnl} /></td>
                  <td className="mono neg">{fmt.usd(-t.totalFees)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
