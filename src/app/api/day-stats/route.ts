importimport { loadDayLedger } from "@/lib/dayLedger";

export const dynamic = "force-dynamic";

/**
 * GET /api/day-stats?walletAddress=…&paper=true|false
 * Today's counters (UTC) the bot needs for its daily limits. See lib/dayLedger.ts.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const walletAddress = searchParams.get("walletAddress");
  if (!walletAddress) {
    return Response.json({ error: "walletAddress is required" }, { status: 400 });
  }
  try {
    const ledger = await loadDayLedger(walletAddress, searchParams.get("paper") === "true");
    return Response.json(ledger);
  } catch (err) {
    console.error("[api/day-stats] failed", err);
    return Response.json({ error: "Could not load today's counters" }, { status: 500 });
  }
}￼Enter
