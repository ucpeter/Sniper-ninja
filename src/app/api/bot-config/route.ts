import { db } from "@/db";
import { botConfigs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_BOT_CONFIG } from "@/lib/types";
import { normalizeAdvanced } from "@/lib/strategy";

export const dynamic = "force-dynamic";

function toNumberConfig(row: typeof botConfigs.$inferSelect) {
  return {
    walletAddress: row.walletAddress,
    minAmountSol: Number(row.minAmountSol),
    maxAmountSol: Number(row.maxAmountSol),
    slippagePct: Number(row.slippagePct),
    priorityFeeSol: Number(row.priorityFeeSol),
    takeProfitPct: Number(row.takeProfitPct),
    stopLossPct: Number(row.stopLossPct),
    trailingStopPct: Number(row.trailingStopPct),
    maxHoldTimeSec: row.maxHoldTimeSec,
    maxDevHoldPct: Number(row.maxDevHoldPct),
    minLiquidityUsd: Number(row.minLiquidityUsd),
    maxLiquidityUsd: Number(row.maxLiquidityUsd),
    maxPositions: row.maxPositions,
    positionSizeMode: row.positionSizeMode,
    riskTolerance: row.riskTolerance,
    pool: row.pool,
    autoCompound: row.autoCompound,
    useBlacklist: row.useBlacklist,
    honeypotDetection: row.honeypotDetection,
    rugProtection: row.rugProtection,
    paperTrading: row.paperTrading,
    advanced: normalizeAdvanced(row.advanced),
    isRunning: row.isRunning,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const walletAddress = searchParams.get("walletAddress");
  if (!walletAddress) {
    return Response.json({ error: "walletAddress is required" }, { status: 400 });
  }

  const rows = await db
    .select()
    .from(botConfigs)
    .where(eq(botConfigs.walletAddress, walletAddress))
    .limit(1);

  if (rows.length === 0) {
    return Response.json({ walletAddress, ...DEFAULT_BOT_CONFIG, isNew: true });
  }

  return Response.json(toNumberConfig(rows[0]));
}

export async function POST(req: Request) {
  const body = await req.json();
  const walletAddress: string | undefined = body.walletAddress;
  if (!walletAddress) {
    return Response.json({ error: "walletAddress is required" }, { status: 400 });
  }

  const values = {
    walletAddress,
    minAmountSol: String(body.minAmountSol ?? DEFAULT_BOT_CONFIG.minAmountSol),
    maxAmountSol: String(body.maxAmountSol ?? DEFAULT_BOT_CONFIG.maxAmountSol),
    slippagePct: String(body.slippagePct ?? DEFAULT_BOT_CONFIG.slippagePct),
    priorityFeeSol: String(body.priorityFeeSol ?? DEFAULT_BOT_CONFIG.priorityFeeSol),
    takeProfitPct: String(body.takeProfitPct ?? DEFAULT_BOT_CONFIG.takeProfitPct),
    stopLossPct: String(body.stopLossPct ?? DEFAULT_BOT_CONFIG.stopLossPct),
    trailingStopPct: String(body.trailingStopPct ?? DEFAULT_BOT_CONFIG.trailingStopPct),
    maxHoldTimeSec: Number(body.maxHoldTimeSec ?? DEFAULT_BOT_CONFIG.maxHoldTimeSec),
    maxDevHoldPct: String(body.maxDevHoldPct ?? DEFAULT_BOT_CONFIG.maxDevHoldPct),
    minLiquidityUsd: String(body.minLiquidityUsd ?? DEFAULT_BOT_CONFIG.minLiquidityUsd),
    maxLiquidityUsd: String(body.maxLiquidityUsd ?? DEFAULT_BOT_CONFIG.maxLiquidityUsd),
    maxPositions: Number(body.maxPositions ?? DEFAULT_BOT_CONFIG.maxPositions),
    positionSizeMode: String(body.positionSizeMode ?? DEFAULT_BOT_CONFIG.positionSizeMode),
    riskTolerance: String(body.riskTolerance ?? DEFAULT_BOT_CONFIG.riskTolerance),
    pool: String(body.pool ?? DEFAULT_BOT_CONFIG.pool),
    autoCompound: Boolean(body.autoCompound ?? DEFAULT_BOT_CONFIG.autoCompound),
    useBlacklist: Boolean(body.useBlacklist ?? DEFAULT_BOT_CONFIG.useBlacklist),
    honeypotDetection: Boolean(body.honeypotDetection ?? DEFAULT_BOT_CONFIG.honeypotDetection),
    rugProtection: Boolean(body.rugProtection ?? DEFAULT_BOT_CONFIG.rugProtection),
    paperTrading: Boolean(body.paperTrading ?? DEFAULT_BOT_CONFIG.paperTrading),
    // Only written when the client sent it, so an older page that does not know
    // about these settings can never wipe them by saving.
    ...(body.advanced !== undefined ? { advanced: normalizeAdvanced(body.advanced) } : {}),
    isRunning: Boolean(body.isRunning ?? false),
    updatedAt: new Date(),
  };

  const rows = await db
    .insert(botConfigs)
    .values(values)
    .onConflictDoUpdate({ target: botConfigs.walletAddress, set: values })
    .returning();

  return Response.json(toNumberConfig(rows[0]));
    }
