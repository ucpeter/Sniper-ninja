import { Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { botConfigs, positions, trades, blacklistedDevs } from "@/db/schema";
import { getServerFeed } from "./serverFeed";
import { getServerConnection } from "./solanaServer";
import { buildTrade } from "./tradeBuilder";
import { prepareForFastLane, broadcastSigned, readFastLaneConfig } from "./fastSend";
import { assessTokenRisk } from "./riskCheck";
import { base64ToBytes, pollForConfirmation } from "./txUtils";
import { loadDayLedger } from "./dayLedger";
import {
  authorityGate,
  buildExitPlan,
  copycatReason,
  duePartial,
  emptyLedger,
  entryGate,
  exposureGate,
  exposureOf,
  gainPct,
  ledgerOnBuyFailed,
  ledgerOnBuyStart,
  ledgerOnClose,
  needsRiskLookup,
  normalizeAdvanced,
  sizeByPercent,
  stopFloorPct,
  type DayLedger,
  type ExitPlan,
  type ExitState,
} from "./strategy";
import { PUMP_FUN_TOTAL_SUPPLY, type BotConfig, type PumpPortalNewTokenEvent, type PumpPortalTradeEvent } from "./types";

const RISK_THRESHOLD: Record<BotConfig["riskTolerance"], number> = { low: 70, medium: 50, high: 30 };
const FEE_BUFFER_SOL = 0.006; // same buffer the browser engine uses before attempting a buy
// After a partial sell fails, wait this long before trying the same step again.
const PARTIAL_RETRY_MS = 15_000;

// This engine exists specifically so a wallet keeps trading with zero
// browser tabs open. Everything it needs — the keypair, the config, open
// positions — lives only in this server process's memory or in the same
// Postgres database the browser UI already reads from, so a page opened
// later sees exactly the same positions and trade history either way.
//
// The keypair is held ONLY in the in-memory map below. It is never written
// to the database, never to disk, never logged. Stopping a bot (or the
// server process restarting for any reason) drops it immediately — trading
// then requires reconnecting and unlocking again. That's a deliberate
// limit, not a bug: persisting the raw key anywhere durable would be a
// materially worse security decision than accepting that limit.
//
// Every buy and sell here is verified with an actual on-chain confirmation
// check (pollForConfirmation) before anything is recorded as successful.
// Submitting a transaction returns a signature immediately regardless of
// whether it will ultimately succeed — skipPreflight submissions in
// particular will happily return a signature for a transaction that's
// about to fail on-chain — so a signature alone is never treated as proof
// a trade happened.

interface OpenPosition {
  id: number;
  mint: string;
  symbol: string;
  entryAmountSol: number;
  tokenAmount: number;
  entryPriceSol: number;
  highWaterMarkPriceSol: number;
  takeProfitPct: number;
  stopLossPct: number;
  trailingStopPct: number;
  maxHoldTimeSec: number;
  openedAtMs: number;
  // Partial sells: tokens still held (null until the first partial sell), SOL banked
  // so far, steps done, and the exit plan frozen when the position opened.
  remainingTokenAmount: number | null;
  proceedsSoFarSol: number;
  partialStepsDone: number;
  exitPlan: ExitPlan | null;
  partialRetryAtMs: number;
  peakSaved: boolean;
}

interface RunningBot {
  walletAddress: string;
  keypair: Keypair;
  config: BotConfig;
  openPositions: Map<string, OpenPosition>; // keyed by mint
  inFlight: Set<string>;
  /** Today's counters for the daily limits. */
  ledger: DayLedger;
  /** SOL committed to buys that are still in flight, so they count toward the exposure cap. */
  pendingExposureSol: number;
  lastGateNote: { reason: string; atMs: number } | null;
  unsubscribeFeed: () => void;
  timeoutWatchdog: ReturnType<typeof setInterval>;
  configRefresh: ReturnType<typeof setInterval>;
  heartbeat: ReturnType<typeof setInterval>;
}

const globalForBots = globalThis as typeof globalThis & {
  __persistentBots?: Map<string, RunningBot>;
};

function registry(): Map<string, RunningBot> {
  if (!globalForBots.__persistentBots) globalForBots.__persistentBots = new Map();
  return globalForBots.__persistentBots;
}

export function isRunningPersistently(walletAddress: string): boolean {
  return registry().has(walletAddress);
}

export function listRunningWallets(): string[] {
  return [...registry().keys()];
}

function tag(walletAddress: string): string {
  return `[persistent-bot ${walletAddress.slice(0, 8)}]`;
}

// --- SOL/USD price, same 20s cache pattern as /api/sol-price ---
let priceCache: { price: number; ts: number } | null = null;
async function getSolPriceUsd(): Promise<number> {
  if (priceCache && Date.now() - priceCache.ts < 20_000) return priceCache.price;
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd", {
      cache: "no-store",
    });
    const data = await res.json();
    const price = Number(data?.solana?.usd);
    if (!Number.isFinite(price)) throw new Error("bad price payload");
    priceCache = { price, ts: Date.now() };
    return price;
  } catch {
    return priceCache?.price ?? 150;
  }
}

function sizeForRisk(cfg: BotConfig, score: number): number {
  if (cfg.positionSizeMode === "fixed") return cfg.minAmountSol;
  if (cfg.positionSizeMode === "random") {
    return cfg.minAmountSol + Math.random() * (cfg.maxAmountSol - cfg.minAmountSol);
  }
  return cfg.minAmountSol + (cfg.maxAmountSol - cfg.minAmountSol) * (score / 100);
}

async function loadConfig(walletAddress: string): Promise<BotConfig> {
  const rows = await db.select().from(botConfigs).where(eq(botConfigs.walletAddress, walletAddress)).limit(1);
  const row = rows[0];
  if (!row) throw new Error("No saved configuration for this wallet");
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
    positionSizeMode: row.positionSizeMode as BotConfig["positionSizeMode"],
    riskTolerance: row.riskTolerance as BotConfig["riskTolerance"],
    pool: row.pool as BotConfig["pool"],
    autoCompound: row.autoCompound,
    useBlacklist: row.useBlacklist,
    honeypotDetection: row.honeypotDetection,
    rugProtection: row.rugProtection,
    paperTrading: row.paperTrading,
    advanced: normalizeAdvanced(row.advanced),
  } as BotConfig;
}

async function loadOpenPositions(walletAddress: string): Promise<Map<string, OpenPosition>> {
  const rows = await db
    .select()
    .from(positions)
    .where(and(eq(positions.walletAddress, walletAddress), eq(positions.status, "open")));
  const map = new Map<string, OpenPosition>();
  for (const r of rows) {
    map.set(r.mint, {
      id: r.id,
      mint: r.mint,
      symbol: r.symbol,
      entryAmountSol: Number(r.entryAmountSol),
      tokenAmount: Number(r.tokenAmount),
      entryPriceSol: Number(r.entryPriceSol),
      highWaterMarkPriceSol: Number(r.highWaterMarkPriceSol),
      takeProfitPct: Number(r.takeProfitPct),
      stopLossPct: Number(r.stopLossPct),
      trailingStopPct: Number(r.trailingStopPct),
      maxHoldTimeSec: r.maxHoldTimeSec,
      openedAtMs: new Date(r.openedAt).getTime(),
      remainingTokenAmount: r.remainingTokenAmount === null ? null : Number(r.remainingTokenAmount),
      proceedsSoFarSol: Number(r.proceedsSoFarSol ?? 0),
      partialStepsDone: r.partialStepsDone,
      exitPlan: r.exitPlan ?? null,
      partialRetryAtMs: 0,
      peakSaved: false,
    });
  }
  return map;
}

async function isBlacklisted(walletAddress: string, devWallet: string): Promise<boolean> {
  try {
    const rows = await db
      .select()
      .from(blacklistedDevs)
      .where(and(eq(blacklistedDevs.walletAddress, walletAddress), eq(blacklistedDevs.devWallet, devWallet)))
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

async function signAndSend(bot: RunningBot, unsignedTxBase64: string): Promise<string> {
  const connection = getServerConnection();
  const unsignedTx = VersionedTransaction.deserialize(base64ToBytes(unsignedTxBase64));
  const fastLaneCfg = readFastLaneConfig();
  const prepared = await prepareForFastLane(connection, unsignedTx, bot.keypair.publicKey, fastLaneCfg);
  prepared.sign([bot.keypair]);
  return broadcastSigned(connection, prepared, fastLaneCfg);
}

async function executeBuy(bot: RunningBot, evt: PumpPortalNewTokenEvent, amountSol: number, riskScore: number | null): Promise<boolean> {
  bot.inFlight.add(evt.mint);
  try {
    const unsignedTx = await buildTrade({
      publicKey: bot.keypair.publicKey.toString(),
      action: "buy",
      mint: evt.mint,
      amount: amountSol,
      denominatedInSol: true,
      slippage: bot.config.slippagePct,
      priorityFee: bot.config.priorityFeeSol,
      pool: bot.config.pool,
    });
    const signature = await signAndSend(bot, unsignedTx);

    // A signature back from broadcast means "submitted," not "succeeded" —
    // skipPreflight submissions in particular will return one even for a
    // transaction that's about to fail on-chain. Only an actual
    // confirmation means the buy really happened.
    const { confirmed, error } = await pollForConfirmation(getServerConnection(), signature);
    if (!confirmed) {
      console.error(`${tag(bot.walletAddress)} BUY FAILED for ${evt.symbol}: ${error}`);
      await db.insert(trades).values({
        walletAddress: bot.walletAddress,
        mint: evt.mint,
        symbol: evt.symbol,
        side: "buy",
        amountSol: String(amountSol),
        tokenAmount: "0",
        priceSol: "0",
        txSignature: signature,
        status: "failed",
        paperTrading: bot.config.paperTrading,
        errorMessage: error ?? "Buy did not confirm on-chain",
      });
      return false;
    }

    const entryPriceSol = evt.vSolInBondingCurve / evt.vTokensInBondingCurve;
    const tokenAmount = amountSol / entryPriceSol;

    const [row] = await db
      .insert(positions)
      .values({
        walletAddress: bot.walletAddress,
        mint: evt.mint,
        symbol: evt.symbol,
        name: evt.name,
        entryAmountSol: String(amountSol),
        tokenAmount: String(tokenAmount),
        entryPriceSol: String(entryPriceSol),
        highWaterMarkPriceSol: String(entryPriceSol),
        takeProfitPct: String(bot.config.takeProfitPct),
        stopLossPct: String(bot.config.stopLossPct),
        trailingStopPct: String(bot.config.trailingStopPct),
        maxHoldTimeSec: bot.config.maxHoldTimeSec,
        riskScore,
        paperTrading: bot.config.paperTrading,
        exitPlan: buildExitPlan(bot.config.advanced),
        status: "open",
        buyTxSignature: signature,
      })
      .returning();

    bot.openPositions.set(evt.mint, {
      id: row.id,
      mint: evt.mint,
      symbol: evt.symbol,
      entryAmountSol: amountSol,
      tokenAmount,
      entryPriceSol,
      highWaterMarkPriceSol: entryPriceSol,
      takeProfitPct: bot.config.takeProfitPct,
      stopLossPct: bot.config.stopLossPct,
      trailingStopPct: bot.config.trailingStopPct,
      maxHoldTimeSec: bot.config.maxHoldTimeSec,
      openedAtMs: Date.now(),
      remainingTokenAmount: null,
      proceedsSoFarSol: 0,
      partialStepsDone: 0,
      exitPlan: buildExitPlan(bot.config.advanced),
      partialRetryAtMs: 0,
      peakSaved: false,
    });

    await db.insert(trades).values({
      walletAddress: bot.walletAddress,
      positionId: row.id,
      mint: evt.mint,
      symbol: evt.symbol,
      side: "buy",
      amountSol: String(amountSol),
      tokenAmount: String(tokenAmount),
      priceSol: String(entryPriceSol),
      txSignature: signature,
      status: "confirmed",
      paperTrading: bot.config.paperTrading,
    });

    getServerFeed().subscribeTokenTrade([evt.mint]);
    console.log(
      `${tag(bot.walletAddress)} BOUGHT ${evt.symbol} (${evt.mint.slice(0, 8)}…) — ${amountSol.toFixed(4)} SOL, risk ${riskScore ?? "n/a"}, tx ${signature.slice(0, 12)}…`,
    );
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Buy failed";
    console.error(`${tag(bot.walletAddress)} BUY FAILED for ${evt.symbol}: ${message}`);
    await db.insert(trades).values({
      walletAddress: bot.walletAddress,
      mint: evt.mint,
      symbol: evt.symbol,
      side: "buy",
      amountSol: String(amountSol),
      tokenAmount: "0",
      priceSol: "0",
      status: "failed",
      paperTrading: bot.config.paperTrading,
      errorMessage: message,
    });
    return false;
  } finally {
    bot.inFlight.delete(evt.mint);
  }
}

async function executeSell(
  bot: RunningBot,
  position: OpenPosition,
  currentPriceSol: number,
  reason: "take_profit" | "stop_loss" | "break_even_stop" | "trailing_stop" | "timeout" | "partial_sell",
  partial?: { fraction: number; newStepsDone: number },
) {
  bot.inFlight.add(position.mint);
  // A partial sell leaves the position in the map. A full sell takes it out (and
  // puts it back if the sell fails), exactly as before.
  if (!partial) bot.openPositions.delete(position.mint);
  // Tokens still held, and what this sell takes off them. A partial sell is sent as a
  // whole percent of the wallet's balance of that token, and the books use that share.
  const held = position.remainingTokenAmount ?? position.tokenAmount;
  const sentPct = partial ? Math.min(99, Math.max(1, Math.round(partial.fraction * 100))) : 100;
  const soldTokens = partial ? held * (sentPct / 100) : held;
  try {
    const unsignedTx = await buildTrade({
      publicKey: bot.keypair.publicKey.toString(),
      action: "sell",
      mint: position.mint,
      // Unchanged for a normal position (exact token count). Once part of it has
      // been sold, the old count is out of date, so sell "everything left" instead.
      amount: partial ? `${sentPct}%` : position.partialStepsDone > 0 ? "100%" : position.tokenAmount,
      denominatedInSol: false,
      slippage: bot.config.slippagePct,
      priorityFee: bot.config.priorityFeeSol,
      pool: bot.config.pool,
    });
    const signature = await signAndSend(bot, unsignedTx);
    const { confirmed, error } = await pollForConfirmation(getServerConnection(), signature);

    if (!confirmed) {
      // Not actually sold — keep it watched, and record what really happened
      // instead of a fabricated "confirmed".
      if (partial) position.partialRetryAtMs = Date.now() + PARTIAL_RETRY_MS;
      else bot.openPositions.set(position.mint, position);
      console.error(`${tag(bot.walletAddress)} SELL FAILED for ${position.symbol}: ${error}`);
      await db.insert(trades).values({
        walletAddress: bot.walletAddress,
        positionId: position.id,
        mint: position.mint,
        symbol: position.symbol,
        side: "sell",
        amountSol: "0",
        tokenAmount: String(soldTokens),
        priceSol: String(currentPriceSol),
        txSignature: signature,
        status: "failed",
        paperTrading: bot.config.paperTrading,
        errorMessage: error ?? "Sell did not confirm on-chain",
      });
      return;
    }

    const exitSol = soldTokens * currentPriceSol;

    if (partial) {
      const remaining = held - soldTokens;
      const banked = position.proceedsSoFarSol + exitSol;
      await db
        .update(positions)
        .set({
          remainingTokenAmount: String(remaining),
          proceedsSoFarSol: String(banked),
          partialStepsDone: partial.newStepsDone,
        })
        .where(eq(positions.id, position.id));
      await db.insert(trades).values({
        walletAddress: bot.walletAddress,
        positionId: position.id,
        mint: position.mint,
        symbol: position.symbol,
        side: "sell",
        amountSol: String(exitSol),
        tokenAmount: String(soldTokens),
        priceSol: String(currentPriceSol),
        txSignature: signature,
        status: "confirmed",
        paperTrading: bot.config.paperTrading,
      });
      position.remainingTokenAmount = remaining;
      position.proceedsSoFarSol = banked;
      position.partialStepsDone = partial.newStepsDone;
      console.log(
        `${tag(bot.walletAddress)} PARTIAL SELL ${position.symbol} — ${sentPct}% of what was left, ${exitSol.toFixed(4)} SOL back (${banked.toFixed(4)} banked of ${position.entryAmountSol.toFixed(4)} spent), tx ${signature.slice(0, 12)}…`,
      );
      return;
    }

    // Profit of the whole position: everything banked by earlier partial sells plus
    // this sell, minus what was spent. With no partial sell this is exitSol - entry, as before.
    const realizedPnlSol = position.proceedsSoFarSol + exitSol - position.entryAmountSol;
    const realizedPnlPct = (realizedPnlSol / position.entryAmountSol) * 100;

    await db
      .update(positions)
      .set({
        status: "closed",
        closeReason: reason,
        sellTxSignature: signature,
        exitPriceSol: String(currentPriceSol),
        realizedPnlSol: String(realizedPnlSol),
        realizedPnlPct: String(realizedPnlPct),
        closedAt: new Date(),
      })
      .where(eq(positions.id, position.id));

    await db.insert(trades).values({
      walletAddress: bot.walletAddress,
      positionId: position.id,
      mint: position.mint,
      symbol: position.symbol,
      side: "sell",
      amountSol: String(exitSol),
      tokenAmount: String(soldTokens),
      priceSol: String(currentPriceSol),
      txSignature: signature,
      status: "confirmed",
      paperTrading: bot.config.paperTrading,
    });
    bot.ledger = ledgerOnClose(bot.ledger, realizedPnlSol, Date.now());
    console.log(
      `${tag(bot.walletAddress)} SOLD ${position.symbol} (${reason}) — PnL ${realizedPnlSol.toFixed(4)} SOL (${realizedPnlPct.toFixed(1)}%), tx ${signature.slice(0, 12)}…`,
    );
  } catch (err) {
    console.error(`${tag(bot.walletAddress)} SELL FAILED for ${position.symbol}: ${err instanceof Error ? err.message : "Sell failed"}`);
    // The sell attempt failed, so it is still open and should keep being watched
    // rather than silently disappearing.
    if (partial) position.partialRetryAtMs = Date.now() + PARTIAL_RETRY_MS;
    else bot.openPositions.set(position.mint, position);
    await db.insert(trades).values({
      walletAddress: bot.walletAddress,
      positionId: position.id,
      mint: position.mint,
      symbol: position.symbol,
      side: "sell",
      amountSol: "0",
      tokenAmount: String(soldTokens),
      priceSol: String(currentPriceSol),
      status: "failed",
      paperTrading: bot.config.paperTrading,
      errorMessage: err instanceof Error ? err.message : "Sell failed",
    });
  } finally {
    bot.inFlight.delete(position.mint);
  }
}

/** Logs why the bot is not buying, at most once a minute per reason, so a full day of blocked tokens does not flood the log. */
function noteGate(bot: RunningBot, reason: string) {
  const now = Date.now();
  if (bot.lastGateNote && bot.lastGateNote.reason === reason && now - bot.lastGateNote.atMs < 60_000) return;
  bot.lastGateNote = { reason, atMs: now };
  console.log(`${tag(bot.walletAddress)} not buying — ${reason}`);
}

async function evaluateNewToken(bot: RunningBot, evt: PumpPortalNewTokenEvent) {
  const cfg = bot.config;
  if (bot.inFlight.has(evt.mint) || bot.openPositions.has(evt.mint)) return;
  if (bot.openPositions.size >= cfg.maxPositions) return;
  const adv = normalizeAdvanced(cfg.advanced);
  const earlyGate = entryGate(adv, bot.ledger, Date.now());
  if (!earlyGate.ok) {
    noteGate(bot, earlyGate.reason);
    return;
  }

  const devHoldPct = (evt.initialBuy / PUMP_FUN_TOTAL_SUPPLY) * 100;
  const solPriceUsd = await getSolPriceUsd();
  const liquidityUsd = evt.vSolInBondingCurve * solPriceUsd;

  if (liquidityUsd < cfg.minLiquidityUsd) return;
  if (cfg.maxLiquidityUsd > 0 && liquidityUsd > cfg.maxLiquidityUsd) return;
  if (devHoldPct > cfg.maxDevHoldPct) return;
  if (adv.blockCopycatNames && copycatReason(evt.name, evt.symbol)) return;

  let riskScore: number | null = null;
  let assessment: Awaited<ReturnType<typeof assessTokenRisk>> | null = null;
  const scoreChecks = cfg.honeypotDetection || cfg.rugProtection;
  if (scoreChecks || needsRiskLookup(adv)) {
    const blacklisted = cfg.useBlacklist ? await isBlacklisted(bot.walletAddress, evt.traderPublicKey) : false;
    try {
      assessment = await assessTokenRisk({
        mint: evt.mint,
        devHoldPct,
        liquidityUsd,
        minLiquidityUsd: cfg.minLiquidityUsd,
        maxDevHoldPct: cfg.maxDevHoldPct,
        devWallet: evt.traderPublicKey,
        blacklisted,
      });
      riskScore = assessment.score;
      // A lookup made only for the authority filters must not switch the score check on.
      if (scoreChecks && assessment.score < RISK_THRESHOLD[cfg.riskTolerance]) return;
    } catch {
      // Same as the browser engine: a risk-check failure isn't treated as
      // an automatic pass or automatic fail here — it just skips this one
      // token rather than buying blind or crashing the loop.
      return;
    }
  }

  if (!authorityGate(adv, assessment).ok) return;

  // Balance first: percent sizing needs it, and the buy needs the check anyway.
  // Same pre-check the browser engine does before ever attempting a buy —
  // this is the piece that was missing here, which is what let the engine
  // "buy" tokens with no real SOL to buy them with.
  let balanceSol: number;
  try {
    const lamports = await getServerConnection().getBalance(bot.keypair.publicKey);
    balanceSol = lamports / 1e9;
  } catch {
    // Can't verify balance right now — safer to skip this one than buy blind.
    return;
  }

  let amountSol: number;
  if (cfg.positionSizeMode === "percent") {
    const sized = sizeByPercent(balanceSol, adv.positionSizePercent, cfg.minAmountSol, cfg.maxAmountSol);
    if (!sized.ok) {
      noteGate(bot, sized.reason);
      return;
    }
    amountSol = sized.amountSol;
  } else {
    amountSol = Math.min(cfg.maxAmountSol, Math.max(cfg.minAmountSol, sizeForRisk(cfg, riskScore ?? 60)));
  }

  if (balanceSol < amountSol + FEE_BUFFER_SOL) {
    console.log(`${tag(bot.walletAddress)} skip buy — balance too low (${balanceSol.toFixed(4)} SOL)`);
    return;
  }

  // The final limit checks and the daily counters are updated in one synchronous step
  // (no await in between), so two tokens passing at the same moment cannot both slip
  // past a limit.
  const nowMs = Date.now();
  const finalGate = entryGate(adv, bot.ledger, nowMs);
  if (!finalGate.ok) {
    noteGate(bot, finalGate.reason);
    return;
  }
  let openExposure = bot.pendingExposureSol;
  for (const p of bot.openPositions.values()) {
    openExposure += exposureOf(p.entryAmountSol, p.tokenAmount, p.remainingTokenAmount);
  }
  const exposure = exposureGate(adv, openExposure, amountSol);
  if (!exposure.ok) {
    noteGate(bot, exposure.reason);
    return;
  }
  bot.ledger = ledgerOnBuyStart(bot.ledger, nowMs);
  bot.pendingExposureSol += amountSol;
  try {
    const opened = await executeBuy(bot, evt, amountSol, riskScore);
    if (!opened) bot.ledger = ledgerOnBuyFailed(bot.ledger);
  } finally {
    bot.pendingExposureSol = Math.max(0, bot.pendingExposureSol - amountSol);
  }
}

async function checkExitConditions(bot: RunningBot, mint: string, currentPriceSol: number) {
  const position = bot.openPositions.get(mint);
  if (!position || bot.inFlight.has(mint)) return;

  position.highWaterMarkPriceSol = Math.max(position.highWaterMarkPriceSol, currentPriceSol);
  const pnlPct = ((currentPriceSol - position.entryPriceSol) / position.entryPriceSol) * 100;
  const drawdownFromHwm = ((position.highWaterMarkPriceSol - currentPriceSol) / position.highWaterMarkPriceSol) * 100;
  const exitState: ExitState = {
    entryPriceSol: position.entryPriceSol,
    highWaterMarkPriceSol: position.highWaterMarkPriceSol,
    stopLossPct: position.stopLossPct,
    plan: position.exitPlan,
    partialStepsDone: position.partialStepsDone,
  };
  // Normally -stopLoss%. Raised to the entry level once a partial sell happened or
  // the break-even trigger was reached. Positions with no plan are unchanged.
  const stopFloor = stopFloorPct(exitState);

  // Save the peak once it first arms the break-even stop, so a restart keeps that protection.
  const armPct = position.exitPlan?.breakEvenTriggerPct ?? 0;
  if (armPct > 0 && !position.peakSaved && gainPct(position.entryPriceSol, position.highWaterMarkPriceSol) >= armPct - 1e-9) {
    position.peakSaved = true;
    void (async () => {
      try {
        await db
          .update(positions)
          .set({ highWaterMarkPriceSol: String(position.highWaterMarkPriceSol) })
          .where(eq(positions.id, position.id));
      } catch {
        // best effort
      }
    })();
  }

  if (pnlPct >= position.takeProfitPct) {
    await executeSell(bot, position, currentPriceSol, "take_profit");
  } else if (pnlPct <= stopFloor) {
    await executeSell(bot, position, currentPriceSol, stopFloor > -Math.abs(position.stopLossPct) ? "break_even_stop" : "stop_loss");
  } else if (position.trailingStopPct > 0 && pnlPct > 0 && drawdownFromHwm >= position.trailingStopPct) {
    await executeSell(bot, position, currentPriceSol, "trailing_stop");
  } else {
    const due = duePartial(exitState, currentPriceSol);
    if (due && Date.now() >= position.partialRetryAtMs) {
      await executeSell(bot, position, currentPriceSol, "partial_sell", due);
    }
  }
}

async function checkTimeouts(bot: RunningBot) {
  const now = Date.now();
  for (const position of [...bot.openPositions.values()]) {
    if (bot.inFlight.has(position.mint)) continue;
    if (now - position.openedAtMs >= position.maxHoldTimeSec * 1000) {
      // Need a current price to record an accurate exit — reuse the last
      // known high-water-mark price if a trade event hasn't arrived
      // recently; this only affects the recorded exit price, not whether
      // the position closes.
      await executeSell(bot, position, position.highWaterMarkPriceSol, "timeout");
    }
  }
}

export async function startPersistentBot(walletAddress: string, keypair: Keypair): Promise<void> {
  if (keypair.publicKey.toString() !== walletAddress) {
    throw new Error("Keypair does not match the given wallet address");
  }
  if (registry().has(walletAddress)) return; // already running

  const config = await loadConfig(walletAddress);
  const openPositions = await loadOpenPositions(walletAddress);
  // Today's counters for the daily limits. Always loaded here (it is one database
  // read), so a limit switched on later while the bot runs still sees earlier trades.
  let ledger = emptyLedger(Date.now());
  try {
    ledger = await loadDayLedger(walletAddress, config.paperTrading);
  } catch (err) {
    console.error(`${tag(walletAddress)} could not load today's trade counters, daily limits start from zero: ${err instanceof Error ? err.message : err}`);
  }

  const feed = getServerFeed();
  feed.connect();
  if (openPositions.size > 0) feed.subscribeTokenTrade([...openPositions.keys()]);

  const bot: RunningBot = {
    walletAddress,
    keypair,
    config,
    openPositions,
    inFlight: new Set(),
    ledger,
    pendingExposureSol: 0,
    lastGateNote: null,
    unsubscribeFeed: () => {},
    timeoutWatchdog: setInterval(() => {
      checkTimeouts(bot).catch(() => {});
    }, 10_000),
    configRefresh: setInterval(() => {
      loadConfig(walletAddress)
        .then((c) => {
          bot.config = c;
        })
        .catch(() => {});
    }, 30_000),
    heartbeat: setInterval(() => {
      console.log(`${tag(walletAddress)} alive — ${bot.openPositions.size} open position(s), watching the feed`);
    }, 5 * 60_000),
  };

  bot.unsubscribeFeed = feed.onEvent((event) => {
    if (event.txType === "create") {
      evaluateNewToken(bot, event as PumpPortalNewTokenEvent).catch(() => {});
    } else {
      const trade = event as PumpPortalTradeEvent;
      if (bot.openPositions.has(trade.mint)) {
        const priceSol = trade.vSolInBondingCurve / trade.vTokensInBondingCurve;
        checkExitConditions(bot, trade.mint, priceSol).catch(() => {});
      }
    }
  });

  registry().set(walletAddress, bot);
  await db
    .update(botConfigs)
    .set({ isRunning: true, updatedAt: new Date() })
    .where(eq(botConfigs.walletAddress, walletAddress));
  console.log(`${tag(walletAddress)} STARTED — ${openPositions.size} open position(s) loaded from the database`);
}

export async function stopPersistentBot(walletAddress: string): Promise<void> {
  const bot = registry().get(walletAddress);
  if (bot) {
    bot.unsubscribeFeed();
    clearInterval(bot.timeoutWatchdog);
    clearInterval(bot.configRefresh);
    clearInterval(bot.heartbeat);
    registry().delete(walletAddress);
    getServerFeed().disconnectIfIdle();
    console.log(`${tag(walletAddress)} STOPPED`);
  }
  await db
    .update(botConfigs)
    .set({ isRunning: false, updatedAt: new Date() })
    .where(eq(botConfigs.walletAddress, walletAddress));
}
