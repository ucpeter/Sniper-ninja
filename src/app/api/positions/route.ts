import { db } from "@/db";
import { positions } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { normalizeExitPlan } from "@/lib/strategy";

export const dynamic = "force-dynamic";

function toClient(row: typeof positions.$inferSelect) {
  return {
    id: row.id,
    walletAddress: row.walletAddress,
    mint: row.mint,
    symbol: row.symbol,
    name: row.name,
    entryAmountSol: Number(row.entryAmountSol),
    tokenAmount: Number(row.tokenAmount),
    entryPriceSol: Number(row.entryPriceSol),
    highWaterMarkPriceSol: Number(row.highWaterMarkPriceSol),
    takeProfitPct: Number(row.takeProfitPct),
    stopLossPct: Number(row.stopLossPct),
    trailingStopPct: Number(row.trailingStopPct),
    maxHoldTimeSec: row.maxHoldTimeSec,
    riskScore: row.riskScore,
    paperTrading: row.paperTrading,
    status: row.status,
    closeReason: row.closeReason,
    buyTxSignature: row.buyTxSignature,
    sellTxSignature: row.sellTxSignature,
    exitPriceSol: row.exitPriceSol ? Number(row.exitPriceSol) : null,
    realizedPnlSol: row.realizedPnlSol ? Number(row.realizedPnlSol) : null,
    realizedPnlPct: row.realizedPnlPct ? Number(row.realizedPnlPct) : null,
    remainingTokenAmount: row.remainingTokenAmount === null ? null : Number(row.remainingTokenAmount),
    proceedsSoFarSol: row.proceedsSoFarSol === null ? null : Number(row.proceedsSoFarSol),
    partialStepsDone: row.partialStepsDone,
    exitPlan: row.exitPlan ?? null,
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt ? row.closedAt.toISOString() : null,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const walletAddress = searchParams.get("walletAddress");
  const status = searchParams.get("status");
  if (!walletAddress) {
    return Response.json({ error: "walletAddress is required" }, { status: 400 });
  }

  const conditions = [eq(positions.walletAddress, walletAddress)];
  if (status) conditions.push(eq(positions.status, status));

  const rows = await db
    .select()
    .from(positions)
    .where(and(...conditions))
    .orderBy(desc(positions.openedAt))
    .limit(200);

  return Response.json(rows.map(toClient));
}

export async function POST(req: Request) {
  const body = await req.json();
  const required = ["walletAddress", "mint", "entryAmountSol", "tokenAmount", "entryPriceSol"];
  for (const key of required) {
    if (body[key] === undefined || body[key] === null) {
      return Response.json({ error: `${key} is required` }, { status: 400 });
    }
  }

  const rows = await db
    .insert(positions)
    .values({
      walletAddress: body.walletAddress,
      mint: body.mint,
      symbol: body.symbol ?? "",
      name: body.name ?? "",
      entryAmountSol: String(body.entryAmountSol),
      tokenAmount: String(body.tokenAmount),
      entryPriceSol: String(body.entryPriceSol),
      highWaterMarkPriceSol: String(body.entryPriceSol),
      takeProfitPct: String(body.takeProfitPct ?? 50),
      stopLossPct: String(body.stopLossPct ?? 25),
      trailingStopPct: String(body.trailingStopPct ?? 0),
      maxHoldTimeSec: Number(body.maxHoldTimeSec ?? 300),
      riskScore: body.riskScore ?? null,
      paperTrading: Boolean(body.paperTrading ?? false),
      exitPlan: normalizeExitPlan(body.exitPlan),
      buyTxSignature: body.buyTxSignature ?? null,
      status: "open",
    })
    .returning();

  return Response.json(toClient(rows[0]));
    }
