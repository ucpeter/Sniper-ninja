// Shared types used by the client engine, hooks and API routes.
import { DEFAULT_ADVANCED, type AdvancedConfig, type ExitPlan } from "./strategy";

export type PositionSizeMode = "fixed" | "random" | "risk_scaled" | "percent";
export type RiskTolerance = "low" | "medium" | "high";
export type PoolChoice = "pump" | "raydium" | "auto";

export interface BotConfig {
  walletAddress: string;
  minAmountSol: number;
  maxAmountSol: number;
  slippagePct: number;
  priorityFeeSol: number;

  takeProfitPct: number;
  stopLossPct: number;
  trailingStopPct: number;
  maxHoldTimeSec: number;

  maxDevHoldPct: number;
  minLiquidityUsd: number;
  maxLiquidityUsd: number;
  maxPositions: number;

  positionSizeMode: PositionSizeMode;
  riskTolerance: RiskTolerance;
  pool: PoolChoice;

  autoCompound: boolean;
  useBlacklist: boolean;
  honeypotDetection: boolean;
  rugProtection: boolean;
  paperTrading: boolean;

  /** Partial sells, break-even, daily limits, extra filters and percent sizing. All off by default. */
  advanced: AdvancedConfig;

  isRunning: boolean;
}

export const DEFAULT_BOT_CONFIG: Omit<BotConfig, "walletAddress"> = {
  minAmountSol: 0.02,
  maxAmountSol: 0.1,
  slippagePct: 15,
  priorityFeeSol: 0.0005,
  takeProfitPct: 50,
  stopLossPct: 25,
  trailingStopPct: 15,
  maxHoldTimeSec: 300,
  maxDevHoldPct: 8,
  minLiquidityUsd: 2000,
  maxLiquidityUsd: 0,
  maxPositions: 3,
  positionSizeMode: "fixed",
  riskTolerance: "medium",
  pool: "pump",
  autoCompound: false,
  useBlacklist: true,
  honeypotDetection: true,
  rugProtection: true,
  paperTrading: false,
  advanced: DEFAULT_ADVANCED,
  isRunning: false,
};

// Raw event shapes coming from the PumpPortal public WebSocket feed.
export interface PumpPortalNewTokenEvent {
  txType: "create";
  signature: string;
  mint: string;
  traderPublicKey: string;
  name: string;
  symbol: string;
  uri?: string;
  initialBuy: number;
  solAmount: number;
  bondingCurveKey: string;
  vTokensInBondingCurve: number;
  vSolInBondingCurve: number;
  marketCapSol: number;
}

export interface PumpPortalTradeEvent {
  txType: "buy" | "sell";
  signature: string;
  mint: string;
  traderPublicKey: string;
  solAmount: number;
  tokenAmount: number;
  newTokenBalance?: number;
  bondingCurveKey: string;
  vTokensInBondingCurve: number;
  vSolInBondingCurve: number;
  marketCapSol: number;
}

export type PumpPortalEvent = PumpPortalNewTokenEvent | PumpPortalTradeEvent;

export interface RiskAssessment {
  score: number; // 0-100, higher = safer
  verdict: "safe" | "caution" | "danger";
  reasons: string[];
  mintAuthorityRenounced: boolean | null;
  freezeAuthorityRenounced: boolean | null;
  devHoldPct: number;
}

export interface ScannedToken {
  mint: string;
  name: string;
  symbol: string;
  uri?: string;
  devWallet: string;
  createdAt: number;
  marketCapSol: number;
  vSolInBondingCurve: number;
  vTokensInBondingCurve: number;
  devHoldPct: number;
  liquidityUsd: number;
  risk?: RiskAssessment;
  decision: "pending" | "checking" | "passed" | "skipped" | "bought" | "error";
  skipReason?: string;
}

export interface Position {
  id: number;
  walletAddress: string;
  mint: string;
  symbol: string;
  name: string;
  entryAmountSol: number;
  tokenAmount: number;
  entryPriceSol: number;
  highWaterMarkPriceSol: number;
  takeProfitPct: number;
  stopLossPct: number;
  trailingStopPct: number;
  maxHoldTimeSec: number;
  riskScore: number | null;
  paperTrading: boolean;
  status: "open" | "closed" | "failed";
  closeReason: string | null;
  buyTxSignature: string | null;
  sellTxSignature: string | null;
  exitPriceSol: number | null;
  realizedPnlSol: number | null;
  realizedPnlPct: number | null;
  // Partial sells: null / 0 until the first partial sell happens.
  remainingTokenAmount: number | null;
  proceedsSoFarSol: number | null;
  partialStepsDone: number;
  /** Exit rules frozen when the position was opened; null = classic rules only. */
  exitPlan: ExitPlan | null;
  openedAt: string;
  closedAt: string | null;
  // client-side live tracking (not persisted)
  currentPriceSol?: number;
}

export interface TradeRecord {
  id: number;
  walletAddress: string;
  positionId: number | null;
  mint: string;
  symbol: string;
  side: "buy" | "sell";
  amountSol: number;
  tokenAmount: number;
  priceSol: number;
  txSignature: string | null;
  status: "confirmed" | "failed" | "pending";
  paperTrading: boolean;
  errorMessage: string | null;
  createdAt: string;
}

export const PUMP_FUN_TOTAL_SUPPLY = 1_000_000_000;
