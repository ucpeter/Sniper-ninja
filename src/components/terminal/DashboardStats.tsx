"use client";

import { emptyStats, winRate, type TradeStats } from "@/lib/stats";
import { StatCard, type StatTone } from "./StatCard";

export type StatsMode = "live" | "paper";

export function ModeToggle({ mode, onChange }: { mode: StatsMode; onChange: (m: StatsMode) => void }) {
  return (
    <div className="seg" role="group" aria-label="Show live or paper trades">
      <button
        type="button"
        className={`seg-opt live ${mode === "live" ? "on" : ""}`}
        aria-pressed={mode === "live"}
        onClick={() => onChange("live")}
      >
        Live
      </button>
      <button
        type="button"
        className={`seg-opt paper ${mode === "paper" ? "on" : ""}`}
        aria-pressed={mode === "paper"}
        onClick={() => onChange("paper")}
      >
        Paper
      </button>
    </div>
  );
}

export function fmtWinRate(s: TradeStats): string {
  const rate = winRate(s);
  return rate === null ? "—" : `${rate.toFixed(1)}%`;
}

export function signTone(value: number): StatTone {
  return value > 0 ? "accent" : value < 0 ? "red" : "none";
}

/** Combined results across every trading wallet, locked ones included. */
export function DashboardStats({
  totals,
  mode,
  onModeChange,
  walletCount,
  unavailable,
}: {
  totals: TradeStats | null;
  mode: StatsMode;
  onModeChange: (m: StatsMode) => void;
  walletCount: number;
  unavailable: boolean;
}) {
  const t = totals ?? emptyStats();
  const ready = totals !== null;
  const num = (n: number) => (ready ? n : "—");
  const sub =
    mode === "paper"
      ? "Simulated paper trades — no real funds moved."
      : "Real trades only. Paper trades are under the Paper tab.";

  return (
    <section aria-label="All wallets combined" className="mb-4">
      <div className="board-head">
        <div>
          <div className="board-title">
            All wallets — combined
            <span className="count">{walletCount}</span>
          </div>
          <div className="board-sub">
            {sub} Closed trades only; profit is price-based and excludes network fees.
          </div>
        </div>
        <ModeToggle mode={mode} onChange={onModeChange} />
      </div>

      {unavailable && (
        <div className="notice warn mb-3">
          <span>Could not load trade totals just now — retrying. The figures below may be out of date.</span>
        </div>
      )}

      <div className="stats stats-6 full">
        <StatCard
          label="Net profit"
          sol={ready ? t.profitSol : null}
          signed
          tone={signTone(t.profitSol)}
          title="Realised P&L of all closed trades, wins minus losses"
        />
        <StatCard
          label="Trades"
          value={num(t.closed)}
          sub={ready ? `${t.bought} bought · ${t.open} open` : undefined}
          tone="blue"
          title="Closed trades"
        />
        <StatCard label="Wins" value={num(t.wins)} tone="accent" sub="closed in profit" />
        <StatCard label="Losses" value={num(t.losses)} tone="red" sub="closed at a loss" />
        <StatCard
          label="Win rate"
          value={ready ? fmtWinRate(t) : "—"}
          tone="amber"
          sub={ready && t.closed > 0 ? `${t.wins}W / ${t.losses}L` : "no closed trades yet"}
        />
        <StatCard
          label="Loss"
          sol={ready ? -t.lossSol : null}
          signed
          tone="red"
          title="Total SOL lost on trades that closed at a loss"
        />
      </div>
    </section>
  );
}
