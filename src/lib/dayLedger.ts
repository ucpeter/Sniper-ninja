import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { positions } from "@/db/schema";
import { utcDayKey, type DayLedger } from "./strategy";

/**
 * Today's (UTC) trading counters for one wallet, read from the positions table:
 * positions opened, realised P&L of positions closed, the current losing streak
 * and the last buy time. Only trades in the same mode (live or paper) count, so
 * paper testing never uses up a live wallet's daily limits. Both engines load
 * this when they start, then keep the counters up to date in memory.
 */
export async function loadDayLedger(walletAddress: string, paper: boolean, nowMs = Date.now()): Promise<DayLedger> {
  const day = utcDayKey(nowMs);
  const dayStart = new Date(`${day}T00:00:00.000Z`);
  const mine = and(eq(positions.walletAddress, walletAddress), eq(positions.paperTrading, paper));

  const opened = await db
    .select({ openedAt: positions.openedAt })
    .from(positions)
    .where(and(mine, gte(positions.openedAt, dayStart)))
    .orderBy(desc(positions.openedAt));

  const closed = await db
    .select({ pnl: positions.realizedPnlSol })
    .from(positions)
    .where(and(mine, eq(positions.status, "closed"), gte(positions.closedAt, dayStart)))
    .orderBy(desc(positions.closedAt));

  let pnl = 0;
  for (const c of closed) pnl += Number(c.pnl ?? 0);
  let streak = 0;
  for (const c of closed) {
    if (Number(c.pnl ?? 0) > 0) break;
    streak += 1;
  }

  return {
    day,
    buys: opened.length,
    pnlSol: Math.round(pnl * 1e9) / 1e9,
    consecutiveLosses: streak,
    lastBuyAtMs: opened[0] ? opened[0].openedAt.getTime() : null,
  };
}
