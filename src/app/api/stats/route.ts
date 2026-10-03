importimport { db } from "@/db";
import { positions } from "@/db/schema";
import { inArray, sql } from "drizzle-orm";
import { addStats, emptyStats, type ModeStats, type StatsPayload } from "@/lib/stats";

export const dynamic = "force-dynamic";

const MAX_WALLETS = 50;

/**
 * GET /api/stats?wallets=addr1,addr2,…
 *
 * Win/loss totals per wallet and combined, split into live and paper, read from
 * the positions table. Counting in the database means the figures include
 * trades made by the always-on server bot and are not limited to the last 300
 * trade records the browser loads.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallets = [
    ...new Set(
      (searchParams.get("wallets") ?? "")
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean),
    ),
  ].slice(0, MAX_WALLETS);

  if (wallets.length === 0) {
    return Response.json({ error: "wallets is required (comma-separated addresses)" }, { status: 400 });
  }

  try {
    const rows = await db
      .select({
        walletAddress: positions.walletAddress,
        paper: positions.paperTrading,
        bought: sql<number>`count(*)`.mapWith(Number),
        open: sql<number>`count(*) filter (where ${positions.status} = 'open')`.mapWith(Number),
        closed: sql<number>`count(*) filter (where ${positions.status} = 'closed')`.mapWith(Number),
        wins: sql<number>`count(*) filter (where ${positions.status} = 'closed' and ${positions.realizedPnlSol} > 0)`.mapWith(Number),
        profit: sql<number>`coalesce(sum(${positions.realizedPnlSol}) filter (where ${positions.status} = 'closed'), 0)`.mapWith(Number),
        loss: sql<number>`coalesce(-sum(${positions.realizedPnlSol}) filter (where ${positions.status} = 'closed' and ${positions.realizedPnlSol} <= 0), 0)`.mapWith(Number),
      })
      .from(positions)
      .where(inArray(positions.walletAddress, wallets))
      .groupBy(positions.walletAddress, positions.paperTrading);

    const payload: StatsPayload = { wallets: {}, totals: { live: emptyStats(), paper: emptyStats() } };
    for (const w of wallets) payload.wallets[w] = { live: emptyStats(), paper: emptyStats() };

    for (const r of rows) {
      const mode: keyof ModeStats = r.paper ? "paper" : "live";
      const stats = {
        bought: r.bought,
        open: r.open,
        closed: r.closed,
        wins: r.wins,
        losses: r.closed - r.wins,
        profitSol: r.profit,
        lossSol: r.loss,
      };
      payload.wallets[r.walletAddress][mode] = stats;
      payload.totals[mode] = addStats(payload.totals[mode], stats);
    }

    return Response.json(payload);
  } catch (err) {
    console.error("[api/stats] failed", err);
    return Response.json({ error: "Could not load stats" }, { status: 500 });
  }
}￼Enter
