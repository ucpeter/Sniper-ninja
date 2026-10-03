import { useMemo } from "react";
import { shortAddr, timeAgo } from "@/lib/format";
import type { TradeRecord } from "@/lib/types";
import { SolAmount } from "@/components/SolAmount";

interface SellInfo {
  /** True for a sell that left part of the position still open. */
  partial: boolean;
  /** Profit of the whole position, set only on the sell that closed it. */
  pnlSol: number | null;
  /** Everything received so far from this position's sells covers the original buy. */
  capitalBack: boolean;
}

/**
 * Every buy and sell. A position's last sell is tagged WIN or LOSS with the
 * profit of the whole position (all its sells minus the buy). Earlier sells of a
 * position that was sold in parts are tagged Partial. Which sell is the last one
 * is worked out from the tokens sold: once the sells add up to the tokens bought,
 * the position is closed.
 */
export function HistoryTable({ history }: { history: TradeRecord[] }) {
  const sellInfo = useMemo(() => {
    const buys = new Map<number, TradeRecord>();
    const sells = new Map<number, TradeRecord[]>();
    for (const t of history) {
      if (t.positionId == null) continue;
      if (t.side === "buy" && !buys.has(t.positionId)) buys.set(t.positionId, t);
      if (t.side === "sell" && t.status === "confirmed") sells.set(t.positionId, [...(sells.get(t.positionId) ?? []), t]);
    }
    const info = new Map<number, SellInfo>();
    for (const [positionId, list] of sells) {
      const buy = buys.get(positionId);
      if (!buy) continue;
      list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      let soldTokens = 0;
      let received = 0;
      for (const sell of list) {
        soldTokens += sell.tokenAmount;
        received += sell.amountSol;
        const closed = soldTokens >= buy.tokenAmount * 0.999;
        info.set(sell.id, {
          partial: !closed,
          pnlSol: closed ? received - buy.amountSol : null,
          capitalBack: received >= buy.amountSol - 1e-9,
        });
      }
    }
    return info;
  }, [history]);

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">
          Trade history
          <span className="count">{history.length}</span>
        </div>
      </div>
      {history.length === 0 ? (
        <div className="empty">
          <b>No trades yet</b>
          Every buy and sell is listed here, with a win or loss on each closing sell.
        </div>
      ) : (
        <div className="tbl-wrap max-h-72 overflow-y-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Token</th>
                <th>Side</th>
                <th>Amount</th>
                <th>Result</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {history.map((t) => {
                const info = t.side === "sell" ? sellInfo.get(t.id) : undefined;
                return (
                  <tr key={t.id}>
                    <td>
                      <div className="font-sans text-[13px] font-bold text-ink">
                        {t.symbol || "?"} {t.paperTrading && <span className="badge sim">paper</span>}
                      </div>
                      <div className="text-[10px] text-ink-mute">{shortAddr(t.mint)}</div>
                    </td>
                    <td className={`font-semibold ${t.side === "buy" ? "text-info" : "text-violet"}`}>{t.side}</td>
                    <td>
                      <SolAmount sol={t.amountSol} digits={3} stack />
                    </td>
                    <td>
                      {!info ? (
                        <span className="text-ink-mute">—</span>
                      ) : info.partial ? (
                        <div className="flex flex-col items-start gap-1">
                          <span className="badge warn">Partial</span>
                          {info.capitalBack && <span className="pos text-[10px]">capital back</span>}
                        </div>
                      ) : (
                        <div className="flex flex-col items-start gap-1">
                          <span className={`badge ${(info.pnlSol ?? 0) > 0 ? "won" : "lost"}`}>
                            {(info.pnlSol ?? 0) > 0 ? "Win" : "Loss"}
                          </span>
                          <SolAmount
                            sol={info.pnlSol}
                            digits={3}
                            signed
                            stack
                            className={(info.pnlSol ?? 0) > 0 ? "pos" : "neg"}
                          />
                        </div>
                      )}
                    </td>
                    <td>
                      <div className={t.status === "confirmed" ? "pos" : t.status === "failed" ? "neg" : "text-warn"}>
                        {t.status}
                      </div>
                      {t.txSignature && !t.paperTrading && (
                        <a
                          href={`https://solscan.io/tx/${t.txSignature}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-info hover:underline"
                        >
                          view tx
                        </a>
                      )}
                    </td>
                    <td className="text-ink-mute">{timeAgo(t.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
