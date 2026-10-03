/**
 * Trading rules added in the config update: partial sells, break-even stop,
 * daily limits, extra entry filters, percent sizing and presets.
 *
 * Everything here is a pure function (no network, database or React), and both
 * the in-browser engine and the always-on server engine call the same code, so
 * the two can never disagree about a rule. Every setting defaults to OFF, and a
 * position opened with no plan behaves exactly as before this update.
 */

/** One partial sell: when the gain reaches `gainPct`, sell `sellPct` of the tokens still held. */
export interface PartialStep {
  gainPct: number;
  sellPct: number;
}

export interface AdvancedConfig {
  /** Up to 3 steps, lowest gain first. Empty = partial sells off. */
  partialSells: PartialStep[];
  /** Step 1 sells exactly the share that returns the original buy, ignoring its own sellPct. */
  recoverCapitalFirst: boolean;
  /** After the first partial sell, the stop-loss moves up from -stopLoss% to the entry level. */
  moveStopToEntryAfterPartial: boolean;
  /** Once the peak gain reaches this %, the stop moves up to the entry level. 0 = off. */
  breakEvenTriggerPct: number;
  /** The raised stop sits this many % above entry (0 = exactly at entry). */
  breakEvenOffsetPct: number;

  /** Daily limits and pacing. 0 = off. The day resets at 00:00 UTC. */
  dailyLossLimitSol: number;
  dailyProfitTargetSol: number;
  maxTradesPerDay: number;
  maxOpenExposureSol: number;
  stopAfterConsecutiveLosses: number;
  buyCooldownSec: number;

  /** Hard entry filters: skip the token when the condition is not met. */
  requireMintAuthorityRenounced: boolean;
  requireFreezeAuthorityRenounced: boolean;
  blockCopycatNames: boolean;

  /** Used when the position size mode is "percent". */
  positionSizePercent: number;
}

export const MAX_PARTIAL_STEPS = 3;

export const DEFAULT_ADVANCED: AdvancedConfig = {
  partialSells: [],
  recoverCapitalFirst: false,
  moveStopToEntryAfterPartial: true,
  breakEvenTriggerPct: 0,
  breakEvenOffsetPct: 0,
  dailyLossLimitSol: 0,
  dailyProfitTargetSol: 0,
  maxTradesPerDay: 0,
  maxOpenExposureSol: 0,
  stopAfterConsecutiveLosses: 0,
  buyCooldownSec: 0,
  requireMintAuthorityRenounced: false,
  requireFreezeAuthorityRenounced: false,
  blockCopycatNames: false,
  positionSizePercent: 2,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function asBool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

/** Turns whatever came from the database or the form into a safe, complete AdvancedConfig. */
export function normalizeAdvanced(raw: unknown): AdvancedConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_ADVANCED;

  const steps: PartialStep[] = [];
  if (Array.isArray(r.partialSells)) {
    for (const item of r.partialSells) {
      const s = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const gainPct = Number(s.gainPct);
      if (!Number.isFinite(gainPct) || gainPct <= 0) continue;
      steps.push({
        gainPct: round2(Math.min(gainPct, 100_000)),
        sellPct: round2(clampNum(s.sellPct, 1, 99, 50)),
      });
    }
  }
  steps.sort((a, b) => a.gainPct - b.gainPct);
  const unique = steps.filter((s, i) => i === 0 || s.gainPct !== steps[i - 1].gainPct).slice(0, MAX_PARTIAL_STEPS);

  return {
    partialSells: unique,
    recoverCapitalFirst: asBool(r.recoverCapitalFirst, d.recoverCapitalFirst),
    moveStopToEntryAfterPartial: asBool(r.moveStopToEntryAfterPartial, d.moveStopToEntryAfterPartial),
    breakEvenTriggerPct: clampNum(r.breakEvenTriggerPct, 0, 100_000, d.breakEvenTriggerPct),
    breakEvenOffsetPct: clampNum(r.breakEvenOffsetPct, 0, 1000, d.breakEvenOffsetPct),
    dailyLossLimitSol: clampNum(r.dailyLossLimitSol, 0, 1_000_000, d.dailyLossLimitSol),
    dailyProfitTargetSol: clampNum(r.dailyProfitTargetSol, 0, 1_000_000, d.dailyProfitTargetSol),
    maxTradesPerDay: Math.floor(clampNum(r.maxTradesPerDay, 0, 100_000, d.maxTradesPerDay)),
    maxOpenExposureSol: clampNum(r.maxOpenExposureSol, 0, 1_000_000, d.maxOpenExposureSol),
    stopAfterConsecutiveLosses: Math.floor(clampNum(r.stopAfterConsecutiveLosses, 0, 1000, d.stopAfterConsecutiveLosses)),
    buyCooldownSec: clampNum(r.buyCooldownSec, 0, 86_400, d.buyCooldownSec),
    requireMintAuthorityRenounced: asBool(r.requireMintAuthorityRenounced, d.requireMintAuthorityRenounced),
    requireFreezeAuthorityRenounced: asBool(r.requireFreezeAuthorityRenounced, d.requireFreezeAuthorityRenounced),
    blockCopycatNames: asBool(r.blockCopycatNames, d.blockCopycatNames),
    positionSizePercent: clampNum(r.positionSizePercent, 0.1, 100, d.positionSizePercent),
  };
}

/* ────────────────────────────── exits ────────────────────────────── */

/**
 * The exit rules frozen onto a position when it is opened, so changing the
 * settings later never alters a position that is already running.
 */
export interface ExitPlan {
  steps: PartialStep[];
  moveStopToEntry: boolean;
  breakEvenTriggerPct: number;
  breakEvenOffsetPct: number;
}

/** Share (in %) of the tokens to sell at `gainPct` so the proceeds equal the original buy. */
export function capitalRecoverySellPct(gainPct: number): number {
  if (!Number.isFinite(gainPct) || gainPct <= 0) return 50;
  return round2(Math.min(99, Math.max(1, 100 / (1 + gainPct / 100))));
}

/** Returns null when no exit feature is switched on, which keeps a position on the classic rules. */
export function buildExitPlan(adv: AdvancedConfig | undefined | null): ExitPlan | null {
  if (!adv) return null;
  const cfg = normalizeAdvanced(adv);
  const steps = cfg.partialSells.map((s, i) =>
    i === 0 && cfg.recoverCapitalFirst ? { gainPct: s.gainPct, sellPct: capitalRecoverySellPct(s.gainPct) } : s,
  );
  const usesBreakEven = cfg.breakEvenTriggerPct > 0;
  if (steps.length === 0 && !usesBreakEven) return null;
  return {
    steps,
    moveStopToEntry: steps.length > 0 && cfg.moveStopToEntryAfterPartial,
    breakEvenTriggerPct: cfg.breakEvenTriggerPct,
    breakEvenOffsetPct: cfg.breakEvenOffsetPct,
  };
}

/** Cleans an exit plan that arrived over HTTP; returns null for anything that is not a usable plan. */
export function normalizeExitPlan(raw: unknown): ExitPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const steps = normalizeAdvanced({ partialSells: r.steps }).partialSells;
  const breakEvenTriggerPct = clampNum(r.breakEvenTriggerPct, 0, 100_000, 0);
  if (steps.length === 0 && breakEvenTriggerPct === 0) return null;
  return {
    steps,
    moveStopToEntry: steps.length > 0 && asBool(r.moveStopToEntry, true),
    breakEvenTriggerPct,
    breakEvenOffsetPct: clampNum(r.breakEvenOffsetPct, 0, 1000, 0),
  };
}

export interface ExitState {
  entryPriceSol: number;
  highWaterMarkPriceSol: number;
  stopLossPct: number;
  plan: ExitPlan | null;
  partialStepsDone: number;
}

// Prices are floats (1.4 - 1 is 0.3999…), so thresholds are compared with a tiny tolerance.
const EPS = 1e-9;

export function gainPct(entryPriceSol: number, priceSol: number): number {
  return ((priceSol - entryPriceSol) / entryPriceSol) * 100;
}

/**
 * The gain (in %) at or below which the position is stopped out. Normally
 * -stopLoss%. Once protection is active (a partial sell happened, or the peak
 * reached the break-even trigger) it rises to the break-even level, but never
 * drops below the normal stop.
 */
export function stopFloorPct(s: ExitState): number {
  const base = -Math.abs(s.stopLossPct);
  const plan = s.plan;
  if (!plan) return base;
  const afterPartial = plan.moveStopToEntry && s.partialStepsDone > 0;
  const peak = gainPct(s.entryPriceSol, s.highWaterMarkPriceSol);
  const atBreakEven = plan.breakEvenTriggerPct > 0 && peak >= plan.breakEvenTriggerPct - EPS;
  return afterPartial || atBreakEven ? Math.max(base, plan.breakEvenOffsetPct) : base;
}

export interface DuePartial {
  /** Share of the tokens still held that should be sold now (0 to 1). */
  fraction: number;
  /** How many steps are done after this sell. */
  newStepsDone: number;
}

/**
 * Which partial sell is due at this price? If the price jumped past several
 * steps at once they are merged into one sell, so it costs one set of fees and
 * lands before the price can fall back.
 */
export function duePartial(s: ExitState, priceSol: number): DuePartial | null {
  const plan = s.plan;
  if (!plan || plan.steps.length === 0) return null;
  const gain = gainPct(s.entryPriceSol, priceSol);
  let keep = 1;
  let done = s.partialStepsDone;
  while (done < plan.steps.length && gain >= plan.steps[done].gainPct - EPS) {
    keep *= 1 - plan.steps[done].sellPct / 100;
    done += 1;
  }
  if (done === s.partialStepsDone) return null;
  return { fraction: 1 - keep, newStepsDone: done };
}

/* ───────────────────────── daily limits & pacing ───────────────────────── */

export interface DayLedger {
  /** UTC date the counters belong to, e.g. "2026-10-02". */
  day: string;
  /** Positions opened today. */
  buys: number;
  /** Realised P&L of positions closed today, in SOL. */
  pnlSol: number;
  consecutiveLosses: number;
  lastBuyAtMs: number | null;
}

export function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function emptyLedger(nowMs: number): DayLedger {
  return { day: utcDayKey(nowMs), buys: 0, pnlSol: 0, consecutiveLosses: 0, lastBuyAtMs: null };
}

/** Starts a fresh day (keeping the last buy time for the cooldown) once the UTC date changes. */
export function rollLedger(l: DayLedger, nowMs: number): DayLedger {
  return l.day === utcDayKey(nowMs) ? l : { ...emptyLedger(nowMs), lastBuyAtMs: l.lastBuyAtMs };
}

export function ledgerOnBuyStart(l: DayLedger, nowMs: number): DayLedger {
  const r = rollLedger(l, nowMs);
  return { ...r, buys: r.buys + 1, lastBuyAtMs: nowMs };
}

export function ledgerOnBuyFailed(l: DayLedger): DayLedger {
  return { ...l, buys: Math.max(0, l.buys - 1) };
}

export function ledgerOnClose(l: DayLedger, pnlSol: number, nowMs: number): DayLedger {
  const r = rollLedger(l, nowMs);
  return {
    ...r,
    pnlSol: Math.round((r.pnlSol + pnlSol) * 1e9) / 1e9,
    consecutiveLosses: pnlSol > 0 ? 0 : r.consecutiveLosses + 1,
  };
}

export type Gate = { ok: true } | { ok: false; reason: string };
const blocked = (reason: string): Gate => ({ ok: false, reason });

const sol = (n: number) => `${n >= 0 ? "" : "-"}${Math.abs(n).toFixed(3)} SOL`;

/** Daily limits, losing-streak pause and buy cooldown. Checked before any paid lookup. */
export function entryGate(adv: AdvancedConfig, ledger: DayLedger, nowMs: number): Gate {
  const l = rollLedger(ledger, nowMs);
  if (adv.dailyLossLimitSol > 0 && l.pnlSol <= -adv.dailyLossLimitSol) {
    return blocked(`Daily loss limit reached (${sol(l.pnlSol)} today)`);
  }
  if (adv.dailyProfitTargetSol > 0 && l.pnlSol >= adv.dailyProfitTargetSol) {
    return blocked(`Daily profit target reached (${sol(l.pnlSol)} today)`);
  }
  if (adv.maxTradesPerDay > 0 && l.buys >= adv.maxTradesPerDay) {
    return blocked(`Max trades per day reached (${l.buys})`);
  }
  if (adv.stopAfterConsecutiveLosses > 0 && l.consecutiveLosses >= adv.stopAfterConsecutiveLosses) {
    return blocked(`Paused after ${l.consecutiveLosses} losing trades in a row`);
  }
  if (adv.buyCooldownSec > 0 && l.lastBuyAtMs !== null && nowMs - l.lastBuyAtMs < adv.buyCooldownSec * 1000) {
    return blocked("Buy cooldown");
  }
  return { ok: true };
}

/** True when any daily limit or the cooldown is on, i.e. when the engine needs today's counters. */
export function usesDailyLimits(adv: AdvancedConfig): boolean {
  return (
    adv.dailyLossLimitSol > 0 ||
    adv.dailyProfitTargetSol > 0 ||
    adv.maxTradesPerDay > 0 ||
    adv.stopAfterConsecutiveLosses > 0 ||
    adv.buyCooldownSec > 0
  );
}

/** Open positions plus this buy must stay within the exposure cap. */
export function exposureGate(adv: AdvancedConfig, openExposureSol: number, newBuySol: number): Gate {
  if (adv.maxOpenExposureSol > 0 && openExposureSol + newBuySol > adv.maxOpenExposureSol + 1e-9) {
    return blocked(
      `Open exposure cap (${openExposureSol.toFixed(3)} open + ${newBuySol.toFixed(3)} > ${adv.maxOpenExposureSol} SOL)`,
    );
  }
  return { ok: true };
}

/** SOL still at risk in a position: its cost scaled by the share of tokens not yet sold. */
export function exposureOf(entryAmountSol: number, tokenAmount: number, remainingTokenAmount: number | null): number {
  if (remainingTokenAmount === null || tokenAmount <= 0) return entryAmountSol;
  return entryAmountSol * Math.max(0, Math.min(1, remainingTokenAmount / tokenAmount));
}

/* ───────────────────────────── entry filters ───────────────────────────── */

// Letters from alphabets that look like Latin ones (Cyrillic, Greek, full-width).
const LOOKALIKE = /[\u0400-\u04FF\u0370-\u03FF\uFF00-\uFFEF]/;

// Established tickers a brand-new token should not be reusing.
const KNOWN_TICKERS = new Set([
  "SOL", "BTC", "WBTC", "ETH", "WETH", "USDC", "USDT", "BNB", "XRP", "ADA", "DOGE", "SHIB", "PEPE", "TRX", "AVAX",
  "LINK", "DOT", "MATIC", "LTC", "TON", "BONK", "WIF", "JUP", "PYTH", "RAY", "ORCA", "JTO", "RENDER", "MSOL",
  "JITOSOL", "TRUMP", "MELANIA", "POPCAT", "FARTCOIN", "GOAT", "PNUT", "MOODENG", "BOME", "MEW",
]);

/** Returns why a name/symbol looks like a copycat, or null when it looks fine. */
export function copycatReason(name: string, symbol: string): string | null {
  if (LOOKALIKE.test(name) || LOOKALIKE.test(symbol)) return "Name uses look-alike characters";
  const sym = symbol.trim().toUpperCase();
  if (sym && KNOWN_TICKERS.has(sym)) return `Ticker ${sym} copies an established token`;
  return null;
}

/** The two authority filters, judged from the risk check's result (null = could not be checked). */
export function authorityGate(
  adv: AdvancedConfig,
  risk: { mintAuthorityRenounced: boolean | null; freezeAuthorityRenounced: boolean | null } | null,
): Gate {
  const checks: [boolean, string, boolean | null | undefined][] = [
    [adv.requireMintAuthorityRenounced, "Mint authority", risk?.mintAuthorityRenounced],
    [adv.requireFreezeAuthorityRenounced, "Freeze authority", risk?.freezeAuthorityRenounced],
  ];
  for (const [required, label, value] of checks) {
    if (!required) continue;
    if (value === false) return blocked(`${label} not renounced`);
    if (value !== true) return blocked(`${label} could not be verified`);
  }
  return { ok: true };
}

/** True when a hard filter needs the on-chain risk check even if the score checks are off. */
export function needsRiskLookup(adv: AdvancedConfig): boolean {
  return adv.requireMintAuthorityRenounced || adv.requireFreezeAuthorityRenounced;
}

/* ───────────────────────────── position size ───────────────────────────── */

export type SizeResult = { ok: true; amountSol: number } | { ok: false; reason: string };

/**
 * Percent-of-balance sizing. Never exceeds the max buy or 95% of the balance;
 * if the result is below the min buy the buy is skipped rather than rounded up,
 * so the percentage is a real ceiling on risk.
 */
export function sizeByPercent(balanceSol: number | null, pct: number, minSol: number, maxSol: number): SizeResult {
  if (balanceSol === null || !Number.isFinite(balanceSol) || balanceSol <= 0) {
    return { ok: false, reason: "Percent sizing needs the trading wallet's balance (it is 0 or unknown)" };
  }
  let amount = (balanceSol * pct) / 100;
  if (maxSol > 0) amount = Math.min(amount, maxSol);
  amount = Math.min(amount, balanceSol * 0.95);
  if (amount < minSol) {
    return { ok: false, reason: `${pct}% of balance (${amount.toFixed(3)} SOL) is below the min buy (${minSol} SOL)` };
  }
  return { ok: true, amountSol: amount };
}

/* ───────────────────────────────── presets ───────────────────────────────── */

export type PresetName = "safe" | "balanced" | "aggressive" | "degen" | "scalper";

export interface Preset {
  label: string;
  description: string;
  takeProfitPct: number;
  stopLossPct: number;
  trailingStopPct: number;
  maxDevHoldPct: number;
  maxPositions: number;
  partialSells: PartialStep[];
}

/**
 * The memesniper presets. Their take-profit tiers are shares of the ORIGINAL
 * position; here each partial sell is a share of what is still held, so the
 * second step is converted (e.g. 33% then 33% of the original becomes 33% then
 * 49% of what is left). The last tier becomes the normal take-profit.
 * Presets never touch buy size, slippage or fees.
 */
export const PRESETS: Record<PresetName, Preset> = {
  safe: {
    label: "Safe",
    description: "Tight stop, exits early, strict dev-hold, few positions.",
    takeProfitPct: 150, stopLossPct: 15, trailingStopPct: 12, maxDevHoldPct: 10, maxPositions: 2,
    partialSells: [{ gainPct: 35, sellPct: 40 }, { gainPct: 70, sellPct: 67 }],
  },
  balanced: {
    label: "Balanced",
    description: "Good risk and reward for most launches.",
    takeProfitPct: 300, stopLossPct: 25, trailingStopPct: 18, maxDevHoldPct: 20, maxPositions: 4,
    partialSells: [{ gainPct: 50, sellPct: 33 }, { gainPct: 120, sellPct: 49 }],
  },
  aggressive: {
    label: "Aggressive",
    description: "Further targets, wider stop, more positions.",
    takeProfitPct: 600, stopLossPct: 40, trailingStopPct: 25, maxDevHoldPct: 30, maxPositions: 6,
    partialSells: [{ gainPct: 120, sellPct: 25 }, { gainPct: 250, sellPct: 47 }],
  },
  degen: {
    label: "Degen",
    description: "Moonshots only: relaxed filters, accepts a large drawdown.",
    takeProfitPct: 2000, stopLossPct: 60, trailingStopPct: 35, maxDevHoldPct: 50, maxPositions: 8,
    partialSells: [{ gainPct: 300, sellPct: 25 }, { gainPct: 900, sellPct: 67 }],
  },
  scalper: {
    label: "Scalper",
    description: "Tiny targets, partials come off fast, many positions.",
    takeProfitPct: 60, stopLossPct: 10, trailingStopPct: 6, maxDevHoldPct: 20, maxPositions: 10,
    partialSells: [{ gainPct: 15, sellPct: 50 }, { gainPct: 30, sellPct: 60 }],
  },
};

export const PRESET_ORDER: PresetName[] = ["safe", "balanced", "aggressive", "degen", "scalper"];

/** The settings a preset changes, ready to merge into the form. */
export function presetPatch(
  name: PresetName,
  currentAdvanced: AdvancedConfig,
): {
  takeProfitPct: number;
  stopLossPct: number;
  trailingStopPct: number;
  maxDevHoldPct: number;
  maxPositions: number;
  advanced: AdvancedConfig;
} {
  const p = PRESETS[name];
  return {
    takeProfitPct: p.takeProfitPct,
    stopLossPct: p.stopLossPct,
    trailingStopPct: p.trailingStopPct,
    maxDevHoldPct: p.maxDevHoldPct,
    maxPositions: p.maxPositions,
    advanced: {
      ...currentAdvanced,
      partialSells: p.partialSells.map((s) => ({ ...s })),
      recoverCapitalFirst: false,
    },
  };
}
