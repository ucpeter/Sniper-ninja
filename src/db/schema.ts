import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import type { AdvancedConfig, ExitPlan } from "@/lib/strategy";

// One config row per connected (main) wallet address.
export const botConfigs = pgTable("bot_configs", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull().unique(),

  minAmountSol: numeric("min_amount_sol").notNull().default("0.02"),
  maxAmountSol: numeric("max_amount_sol").notNull().default("0.1"),
  slippagePct: numeric("slippage_pct").notNull().default("15"),
  priorityFeeSol: numeric("priority_fee_sol").notNull().default("0.0005"),

  takeProfitPct: numeric("take_profit_pct").notNull().default("50"),
  stopLossPct: numeric("stop_loss_pct").notNull().default("25"),
  trailingStopPct: numeric("trailing_stop_pct").notNull().default("0"),
  maxHoldTimeSec: integer("max_hold_time_sec").notNull().default(300),

  maxDevHoldPct: numeric("max_dev_hold_pct").notNull().default("8"),
  minLiquidityUsd: numeric("min_liquidity_usd").notNull().default("2000"),
  maxLiquidityUsd: numeric("max_liquidity_usd").notNull().default("0"),
  maxPositions: integer("max_positions").notNull().default(3),

  positionSizeMode: text("position_size_mode").notNull().default("fixed"),
  riskTolerance: text("risk_tolerance").notNull().default("medium"),
  pool: text("pool").notNull().default("pump"),

  autoCompound: boolean("auto_compound").notNull().default(false),
  useBlacklist: boolean("use_blacklist").notNull().default(true),
  honeypotDetection: boolean("honeypot_detection").notNull().default(true),
  rugProtection: boolean("rug_protection").notNull().default(true),
  paperTrading: boolean("paper_trading").notNull().default(false),

  // Partial sells, break-even, daily limits, extra filters, percent sizing (see lib/strategy.ts).
  advanced: jsonb("advanced").$type<AdvancedConfig>().notNull().default(sql`'{}'::jsonb`),

  isRunning: boolean("is_running").notNull().default(false),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  mint: text("mint").notNull(),
  symbol: text("symbol").notNull().default(""),
  name: text("name").notNull().default(""),

  entryAmountSol: numeric("entry_amount_sol").notNull(),
  tokenAmount: numeric("token_amount").notNull(),
  entryPriceSol: numeric("entry_price_sol").notNull(),
  highWaterMarkPriceSol: numeric("high_water_mark_price_sol").notNull(),

  takeProfitPct: numeric("take_profit_pct").notNull(),
  stopLossPct: numeric("stop_loss_pct").notNull(),
  trailingStopPct: numeric("trailing_stop_pct").notNull().default("0"),
  maxHoldTimeSec: integer("max_hold_time_sec").notNull().default(300),

  riskScore: integer("risk_score"),
  paperTrading: boolean("paper_trading").notNull().default(false),

  status: text("status").notNull().default("open"), // open | closed | failed
  closeReason: text("close_reason"), // take_profit | stop_loss | break_even_stop | trailing_stop | timeout | manual | failed

  buyTxSignature: text("buy_tx_signature"),
  sellTxSignature: text("sell_tx_signature"),

  exitPriceSol: numeric("exit_price_sol"),
  realizedPnlSol: numeric("realized_pnl_sol"),
  realizedPnlPct: numeric("realized_pnl_pct"),

  // Partial sells: tokens still held, SOL received from partial sells so far,
  // how many steps are done, and the exit plan frozen when the position opened.
  remainingTokenAmount: numeric("remaining_token_amount"),
  proceedsSoFarSol: numeric("proceeds_so_far_sol"),
  partialStepsDone: integer("partial_steps_done").notNull().default(0),
  exitPlan: jsonb("exit_plan").$type<ExitPlan>(),

  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const trades = pgTable("trades", {
  id: serial("id").primaryKey(),
  walletAddress: text("wallet_address").notNull(),
  positionId: integer("position_id"),
  mint: text("mint").notNull(),
  symbol: text("symbol").notNull().default(""),
  side: text("side").notNull(), // buy | sell
  amountSol: numeric("amount_sol").notNull(),
  tokenAmount: numeric("token_amount").notNull(),
  priceSol: numeric("price_sol").notNull(),
  txSignature: text("tx_signature"),
  status: text("status").notNull().default("confirmed"), // confirmed | failed | pending
  paperTrading: boolean("paper_trading").notNull().default(false),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const blacklistedDevs = pgTable(
  "blacklisted_devs",
  {
    id: serial("id").primaryKey(),
    walletAddress: text("wallet_address").notNull(),
    devWallet: text("dev_wallet").notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique().on(t.walletAddress, t.devWallet)],
);
