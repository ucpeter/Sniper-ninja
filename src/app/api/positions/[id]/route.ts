import { db } from "@/db";
import { positions } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const updates: Partial<typeof positions.$inferInsert> = {};

  if (body.highWaterMarkPriceSol !== undefined) {
    updates.highWaterMarkPriceSol = String(body.highWaterMarkPriceSol);
  }
  if (body.status !== undefined) updates.status = body.status;
  if (body.closeReason !== undefined) updates.closeReason = body.closeReason;
  if (body.sellTxSignature !== undefined) updates.sellTxSignature = body.sellTxSignature;
  if (body.exitPriceSol !== undefined) updates.exitPriceSol = String(body.exitPriceSol);
  if (body.realizedPnlSol !== undefined) updates.realizedPnlSol = String(body.realizedPnlSol);
  if (body.realizedPnlPct !== undefined) updates.realizedPnlPct = String(body.realizedPnlPct);
  if (body.remainingTokenAmount !== undefined) updates.remainingTokenAmount = String(body.remainingTokenAmount);
  if (body.proceedsSoFarSol !== undefined) updates.proceedsSoFarSol = String(body.proceedsSoFarSol);
  if (body.partialStepsDone !== undefined) updates.partialStepsDone = Math.max(0, Math.floor(Number(body.partialStepsDone) || 0));
  if (body.status === "closed" || body.status === "failed") {
    updates.closedAt = new Date();
  }

  const rows = await db
    .update(positions)
    .set(updates)
    .where(eq(positions.id, Number(id)))
    .returning();

  if (rows.length === 0) {
    return Response.json({ error: "Position not found" }, { status: 404 });
  }

  return Response.json({ ok: true, id: rows[0].id });
}
