import { RiskBadge } from "./RiskBadge";
import { fmtPct, shortAddr } from "@/lib/format";
import type { ScannedToken } from "@/lib/types";
import { SolAmount } from "@/components/SolAmount";

const decisionStyles: Record<ScannedToken["decision"], string> = {
  pending: "text-ink-mute",
  checking: "text-warn",
  passed: "text-info",
  skipped: "text-ink-mute",
  bought: "pos",
  error: "neg",
};

export function LiveFeedTable({ tokens, feedStatus }: { tokens: ScannedToken[]; feedStatus: string }) {
  const live = feedStatus === "open";
  const dotClass = live ? "on" : feedStatus === "closed" || feedStatus === "error" ? "off" : "";
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Live pump.fun launch scanner</div>
        <div className="panel-actions">
          <span className={`feed-dot ${dotClass}`}>
            <i />
            {live ? "live" : feedStatus}
          </span>
        </div>
      </div>
      {tokens.length === 0 ? (
        <div className="empty">
          <b>No tokens scanned yet</b>
          Start the bot to begin monitoring pump.fun in real time.
        </div>
      ) : (
        <div className="tbl-wrap max-h-96 overflow-y-auto">
          <table className="tbl">
            <thead>
              <tr>
                <th>Token</th>
                <th>Dev</th>
                <th>Dev hold</th>
                <th>Liquidity</th>
                <th>Risk</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.mint + t.createdAt}>
                  <td>
                    <div className="font-sans text-[13px] font-bold text-ink">{t.symbol || "?"}</div>
                    <div className="text-[10px] text-ink-mute">{shortAddr(t.mint)}</div>
                  </td>
                  <td className="text-ink-mute">{shortAddr(t.devWallet)}</td>
                  <td>{fmtPct(t.devHoldPct, 1).replace("+", "")}</td>
                  <td>
                    <SolAmount sol={t.vSolInBondingCurve} digits={1} stack />
                  </td>
                  <td>
                    <RiskBadge risk={t.risk} />
                  </td>
                  <td className={`font-semibold ${decisionStyles[t.decision]}`}>
                    <div>{t.decision}</div>
                    {t.decision === "skipped" && t.skipReason && (
                      <div className="max-w-[220px] whitespace-normal text-[10px] font-normal text-ink-mute">
                        {t.skipReason}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
