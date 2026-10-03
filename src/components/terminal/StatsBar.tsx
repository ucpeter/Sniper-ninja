"use client";

import { emptyStats, type TradeStats } from "@/lib/stats";
import { StatCard } from "./StatCard";
import { fmtWinRate, signTone, type StatsMode } from "./DashboardStats";

/**
 * Results for one trading wallet. The numbers come from the same /api/stats
 * read as the all-wallet cards at the top, so the two always add up.
 */
export function StatsBar({
  walletLabel,
  stats,
  mode,
}: {
  walletLabel: string;
  stats: TradeStats | null;
  mode: StatsMode;
}) {
  const s = stats ?? emptyStats();
  const num = (n: number) => (stats ? n : "—");

  return (
    <section aria-label={`${walletLabel} results`}>
      <div className="board-head">
        <div>
          <div className="board-title">This wallet — {walletLabel}</div>
          <div className="board-sub">Closed trades only. Follows the Live / Paper switch at the top.</div>
        </div>
        <span className={`chip ${mode === "paper" ? "chip-warn" : "chip-danger"}`}>
          {mode === "paper" ? "Paper trades" : "Live trades"}
        </span>
      </div>
      <div className="stats stats-6">
        <StatCard label="Tokens bought" value={num(s.bought)} tone="blue" sub="all time" />
        <StatCard label="In wallet" value={num(s.open)} tone="amber" sub="open positions" />
        <StatCard label="Wins" value={num(s.wins)} tone="accent" sub="closed in profit" />
        <StatCard label="Losses" value={num(s.losses)} tone="red" sub="closed at a loss" />
        <StatCard
          label="Win rate"
          value={stats ? fmtWinRate(s) : "—"}
          sub={stats && s.closed > 0 ? `${s.closed} closed` : "no closed trades yet"}
        />
        <StatCard
          label="Realised P&L"
          sol={stats ? s.profitSol : null}
          signed
          tone={signTone(s.profitSol)}
        />
      </div>
    </section>
  );
}
