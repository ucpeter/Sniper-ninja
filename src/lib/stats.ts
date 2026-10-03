/**
 * Win/loss figures shared by the /api/stats route and the cards that show them.
 *
 * One trade = one closed position. A win is a closed position with realised P&L
 * above zero; everything else that closed is a loss. P&L is price based
 * (tokens × price change), the same number the bot stores when it sells, so it
 * does not include network or priority fees.
 */
export interface TradeStats {
  /** Positions opened (every token the bot bought). */
  bought: number;
  /** Positions still open, i.e. tokens currently held. */
  open: number;
  /** Positions closed — the number of finished trades. */
  closed: number;
  wins: number;
  losses: number;
  /** Net realised P&L in SOL across closed positions (negative when losing). */
  profitSol: number;
  /** SOL lost on losing positions, as a positive number. */
  lossSol: number;
}

export interface ModeStats {
  live: TradeStats;
  paper: TradeStats;
}

export interface StatsPayload {
  wallets: Record<string, ModeStats>;
  totals: ModeStats;
}

export function emptyStats(): TradeStats {
  return { bought: 0, open: 0, closed: 0, wins: 0, losses: 0, profitSol: 0, lossSol: 0 };
}

export function addStats(a: TradeStats, b: TradeStats): TradeStats {
  return {
    bought: a.bought + b.bought,
    open: a.open + b.open,
    closed: a.closed + b.closed,
    wins: a.wins + b.wins,
    losses: a.losses + b.losses,
    profitSol: round9(a.profitSol + b.profitSol),
    lossSol: round9(a.lossSol + b.lossSol),
  };
}

/** Sums of decimal SOL amounts pick up float noise (0.24000000000000002); trim it. */
function round9(n: number): number {
  return Math.round(n * 1e9) / 1e9;
}

/** Win rate in percent, or null when nothing has closed yet. */
export function winRate(s: TradeStats): number | null {
  return s.closed > 0 ? (s.wins / s.closed) * 100 : null;
}
