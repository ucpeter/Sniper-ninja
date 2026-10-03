import { fmtPct, shortAddr, timeAgo } from "@/lib/format";
import type { Position } from "@/lib/types";
import { SolAmount } from "@/components/SolAmount";
import { stopFloorPct } from "@/lib/strategy";

export function PositionsTable({ positions, onSell }: { positions: Position[]; onSell: (id: number) => void }) {
  const open = positions.filter((p) => p.status === "open");
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">
          Open positions
          <span className="count">{open.length}</span>
        </div>
      </div>
      {open.length === 0 ? (
        <div className="empty">
          <b>No open positions</b>
          Tokens the bot buys stay here until they are sold.
        </div>
      ) : (
        <div className="tbl-wrap max-h-72 overflow-y-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Token</th>
                <th>Entry</th>
                <th>PnL · age</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {open.map((p) => {
                const pnlPct = p.currentPriceSol
                  ? ((p.currentPriceSol - p.entryPriceSol) / p.entryPriceSol) * 100
                  : 0;
                const partlySold = p.partialStepsDone > 0;
                const heldPct =
                  p.remainingTokenAmount !== null && p.tokenAmount > 0
                    ? Math.round((p.remainingTokenAmount / p.tokenAmount) * 100)
                    : 100;
                const banked = p.proceedsSoFarSol ?? 0;
                const capitalBack = partlySold && banked >= p.entryAmountSol - 1e-9;
                const stopAtEntry =
                  stopFloorPct({
                    entryPriceSol: p.entryPriceSol,
                    highWaterMarkPriceSol: p.highWaterMarkPriceSol,
                    stopLossPct: p.stopLossPct,
                    plan: p.exitPlan,
                    partialStepsDone: p.partialStepsDone,
                  }) > -Math.abs(p.stopLossPct);
                return (
                  <tr key={p.id}>
                    <td>
                      <div className="font-sans text-[13px] font-bold text-ink">{p.symbol || "?"}</div>
                      <div className="flex items-center gap-1.5 text-[10px] text-ink-mute">
                        {shortAddr(p.mint)}
                        {p.paperTrading && <span className="badge sim">paper</span>}
                      </div>
                      {(partlySold || stopAtEntry) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {partlySold && <span className="badge warn">{100 - heldPct}% sold</span>}
                          {capitalBack && <span className="badge won">capital back</span>}
                          {stopAtEntry && <span className="badge mute">stop at entry</span>}
                        </div>
                      )}
                      {partlySold && (
                        <div className="mt-0.5 text-[10px] text-ink-mute">
                          banked <SolAmount sol={banked} digits={3} />
                        </div>
                      )}
                    </td>
                    <td>
                      <SolAmount sol={p.entryAmountSol} digits={3} stack />
                    </td>
                    <td>
                      <div className={`font-semibold ${pnlPct >= 0 ? "pos" : "neg"}`}>{fmtPct(pnlPct)}</div>
                      <div className="text-[10px] text-ink-mute">{timeAgo(p.openedAt)}</div>
                    </td>
                    <td>
                      <button onClick={() => onSell(p.id)} className="btn btn-sm" aria-label={`Sell ${p.symbol || "token"} now`}>
                        Sell
                      </button>
                    </td>
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
