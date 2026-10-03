"use client";

import { useState } from "react";
import type { BotConfig } from "@/lib/types";
import { useUsd } from "@/components/SolAmount";
import {
  DEFAULT_ADVANCED,
  MAX_PARTIAL_STEPS,
  PRESETS,
  PRESET_ORDER,
  capitalRecoverySellPct,
  presetPatch,
  type AdvancedConfig,
  type PartialStep,
  type PresetName,
} from "@/lib/strategy";

interface Props {
  config: BotConfig;
  onChange: (patch: Partial<BotConfig>) => void;
  onSave: () => void;
  saving: boolean;
  disabled: boolean;
}

function Field({
  label,
  hint,
  usd,
  children,
}: {
  label: string;
  hint?: string;
  usd?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      {children}
      {(hint || usd) && (
        <span className="hint block">
          {hint}
          {hint && usd ? " · " : ""}
          {usd && <span className="usd">{usd}</span>}
        </span>
      )}
    </label>
  );
}

/** A collapsible group of settings with its on/off state visible even when closed. */
function Group({ title, status, children }: { title: string; status: string; children: React.ReactNode }) {
  return (
    <details className="grp">
      <summary>
        <span>{title}</span>
        <span className={`grp-status ${status === "off" ? "" : "on"}`}>{status}</span>
      </summary>
      <div className="grp-body">{children}</div>
    </details>
  );
}

type NumKey =
  | "minAmountSol"
  | "maxAmountSol"
  | "slippagePct"
  | "priorityFeeSol"
  | "takeProfitPct"
  | "stopLossPct"
  | "trailingStopPct"
  | "maxHoldTimeSec"
  | "maxDevHoldPct"
  | "minLiquidityUsd"
  | "maxLiquidityUsd"
  | "maxPositions";

// `sol: true` marks amounts in SOL, which get their dollar equivalent shown underneath.
const NUMBER_FIELDS: { key: NumKey; label: string; step?: string; hint?: string; sol?: boolean }[] = [
  { key: "minAmountSol", label: "Min buy (SOL)", step: "0.001", sol: true },
  { key: "maxAmountSol", label: "Max buy (SOL)", step: "0.001", sol: true },
  { key: "slippagePct", label: "Slippage (%)" },
  { key: "priorityFeeSol", label: "Priority fee (SOL)", step: "0.0001", sol: true },
  { key: "takeProfitPct", label: "Take profit (%)", hint: "sells everything that is left" },
  { key: "stopLossPct", label: "Stop loss (%)" },
  { key: "trailingStopPct", label: "Trailing stop (%)", hint: "0 = disabled" },
  { key: "maxHoldTimeSec", label: "Max hold time (sec)" },
  { key: "maxDevHoldPct", label: "Max dev hold (%)" },
  { key: "minLiquidityUsd", label: "Min liquidity (USD)" },
  { key: "maxLiquidityUsd", label: "Max liquidity (USD)", hint: "0 = no ceiling" },
  { key: "maxPositions", label: "Max concurrent positions" },
];

type AdvNumKey =
  | "positionSizePercent"
  | "breakEvenTriggerPct"
  | "breakEvenOffsetPct"
  | "dailyLossLimitSol"
  | "dailyProfitTargetSol"
  | "maxTradesPerDay"
  | "maxOpenExposureSol"
  | "stopAfterConsecutiveLosses"
  | "buyCooldownSec";

/** Share of the original position still held after steps 0..upTo (each step sells a share of what is left). */
function leftAfter(steps: PartialStep[], recoverFirst: boolean, upTo: number): number {
  let left = 1;
  for (let k = 0; k <= upTo; k++) {
    const sell = k === 0 && recoverFirst ? capitalRecoverySellPct(steps[0].gainPct) : steps[k].sellPct;
    left *= 1 - sell / 100;
  }
  return Math.round(left * 100);
}

export function ConfigPanel({ config, onChange, onSave, saving, disabled }: Props) {
  const { usd } = useUsd();
  const [presetNote, setPresetNote] = useState<string | null>(null);
  const num = (v: string) => (v === "" ? 0 : Number(v));
  // A numeric field whose value is 0 shows as an empty box instead of a
  // literal "0" — so typing a number means just typing, not deleting a
  // zero first. Clearing the box all the way back out still saves as 0,
  // same as before; this only changes what's displayed while at rest.
  const displayVal = (v: number) => (v === 0 ? "" : v);

  // The new settings live in one object. It is shown as typed (not cleaned up
  // while editing) and cleaned up by the server when saved.
  const adv: AdvancedConfig = config.advanced ?? DEFAULT_ADVANCED;
  const setAdv = (patch: Partial<AdvancedConfig>) => onChange({ advanced: { ...adv, ...patch } });
  const steps = adv.partialSells;
  const setStep = (i: number, patch: Partial<PartialStep>) =>
    setAdv({ partialSells: steps.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
  const addStep = () =>
    setAdv({
      partialSells: [
        ...steps,
        { gainPct: steps.length ? Math.round(steps[steps.length - 1].gainPct * 2) : 50, sellPct: 50 },
      ],
    });
  const removeStep = (i: number) => setAdv({ partialSells: steps.filter((_, k) => k !== i) });

  const applyPreset = (name: PresetName) => {
    onChange(presetPatch(name, adv));
    setPresetNote(`${PRESETS[name].label} loaded — ${PRESETS[name].description} Review it, then press Save configuration.`);
  };

  const advField = (key: AdvNumKey, label: string, opts: { step?: string; hint?: string; sol?: boolean } = {}) => (
    <Field key={key} label={label} hint={opts.hint} usd={opts.sol && adv[key] > 0 ? usd(adv[key]) : undefined}>
      <input
        className="input"
        type="number"
        step={opts.step}
        placeholder="0"
        disabled={disabled}
        value={displayVal(adv[key])}
        onChange={(e) => setAdv({ [key]: num(e.target.value) } as Partial<AdvancedConfig>)}
      />
    </Field>
  );

  const limitsOn = [
    adv.dailyLossLimitSol,
    adv.dailyProfitTargetSol,
    adv.maxTradesPerDay,
    adv.maxOpenExposureSol,
    adv.stopAfterConsecutiveLosses,
    adv.buyCooldownSec,
  ].filter((v) => v > 0).length;
  const filtersOn = [adv.requireMintAuthorityRenounced, adv.requireFreezeAuthorityRenounced, adv.blockCopycatNames].filter(
    Boolean,
  ).length;

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Strategy configuration</div>
        <div className="panel-actions">
          <label className="flex items-center gap-2 text-xs font-semibold text-warn">
            <input
              type="checkbox"
              className="check"
              checked={config.paperTrading}
              onChange={(e) => onChange({ paperTrading: e.target.checked })}
              disabled={disabled}
            />
            Paper trading (no real funds)
          </label>
        </div>
      </div>

      <div className="panel-body">
        <div className="section-label">Presets</div>
        <div className="flex flex-wrap gap-2">
          {PRESET_ORDER.map((name) => (
            <button
              key={name}
              type="button"
              className="btn btn-sm"
              disabled={disabled}
              title={PRESETS[name].description}
              onClick={() => applyPreset(name)}
            >
              {PRESETS[name].label}
            </button>
          ))}
        </div>
        <p className="hint">
          {presetNote ??
            "A preset fills in take profit, stop loss, trailing stop, max dev hold, max positions and two partial sells (replacing the ones below). It never changes buy size, slippage or fees. Nothing is saved until you press Save configuration."}
        </p>

        <div className="section-label">Strategy</div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {NUMBER_FIELDS.map((f) => (
            <Field key={f.key} label={f.label} hint={f.hint} usd={f.sol && config[f.key] > 0 ? usd(config[f.key]) : undefined}>
              <input
                className="input"
                type="number"
                step={f.step}
                placeholder="0"
                disabled={disabled}
                value={displayVal(config[f.key])}
                onChange={(e) => onChange({ [f.key]: num(e.target.value) } as Partial<BotConfig>)}
              />
            </Field>
          ))}
          <Field label="Position size mode">
            <select
              className="input"
              disabled={disabled}
              value={config.positionSizeMode}
              onChange={(e) => onChange({ positionSizeMode: e.target.value as BotConfig["positionSizeMode"] })}
            >
              <option value="fixed">Fixed (min)</option>
              <option value="random">Random (min–max)</option>
              <option value="risk_scaled">Risk-scaled</option>
              <option value="percent">Percent of balance</option>
            </select>
          </Field>
          {config.positionSizeMode === "percent" &&
            advField("positionSizePercent", "Position size (% of balance)", {
              step: "0.1",
              hint: "capped at max buy; skipped if below min buy",
            })}
          <Field label="Risk tolerance">
            <select
              className="input"
              disabled={disabled}
              value={config.riskTolerance}
              onChange={(e) => onChange({ riskTolerance: e.target.value as BotConfig["riskTolerance"] })}
            >
              <option value="low">Low (score ≥ 70)</option>
              <option value="medium">Medium (score ≥ 50)</option>
              <option value="high">High (score ≥ 30)</option>
            </select>
          </Field>
          <Field label="Pool">
            <select
              className="input"
              disabled={disabled}
              value={config.pool}
              onChange={(e) => onChange({ pool: e.target.value as BotConfig["pool"] })}
            >
              <option value="pump">Pump.fun bonding curve</option>
              <option value="raydium">Raydium (post-migration)</option>
              <option value="auto">Auto-detect</option>
            </select>
          </Field>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            { key: "useBlacklist", label: "Use wallet blacklist" },
            { key: "honeypotDetection", label: "Honeypot detection" },
            { key: "rugProtection", label: "Rug-pull protection" },
            { key: "autoCompound", label: "Auto-compound" },
          ].map((t) => (
            <label key={t.key} className="flex items-center gap-2 text-xs text-ink-dim">
              <input
                type="checkbox"
                className="check"
                disabled={disabled}
                checked={Boolean(config[t.key as keyof BotConfig])}
                onChange={(e) => onChange({ [t.key]: e.target.checked } as Partial<BotConfig>)}
              />
              {t.label}
            </label>
          ))}
        </div>

        <div className="section-label">Protect your capital</div>

        <Group title="Partial sells" status={steps.length === 0 ? "off" : `${steps.length} step${steps.length > 1 ? "s" : ""}`}>
          <p className="hint mt-3">
            When a position gains the set amount, the bot sells a share of the tokens you still hold and keeps the rest
            running. Each step sells a share of <b>what is left after the previous step</b>. What remains at the end
            is sold at your Take profit, or earlier by the stop loss, trailing stop or max hold time.
          </p>

          {steps.map((step, i) => {
            const recovery = i === 0 && adv.recoverCapitalFirst;
            const sellShown = recovery ? capitalRecoverySellPct(step.gainPct) : step.sellPct;
            return (
              <div key={i} className="mt-3 rounded-[10px] border border-line bg-panel p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-ink-dim">
                  <span className="font-semibold text-ink">Step {i + 1}</span>
                  <span>at +</span>
                  <input
                    className="input !w-20"
                    type="number"
                    aria-label={`Step ${i + 1} gain in percent`}
                    disabled={disabled}
                    value={displayVal(step.gainPct)}
                    onChange={(e) => setStep(i, { gainPct: num(e.target.value) })}
                  />
                  <span>% gain, sell</span>
                  <input
                    className="input !w-20"
                    type="number"
                    aria-label={`Step ${i + 1} share to sell in percent`}
                    disabled={disabled || recovery}
                    value={recovery ? sellShown : displayVal(step.sellPct)}
                    onChange={(e) => setStep(i, { sellPct: num(e.target.value) })}
                  />
                  <span>% of what&apos;s left</span>
                  <button
                    type="button"
                    className="btn btn-sm btn-ghost ml-auto"
                    disabled={disabled}
                    onClick={() => removeStep(i)}
                    aria-label={`Remove step ${i + 1}`}
                  >
                    ✕
                  </button>
                </div>
                {step.gainPct > 0 && (
                  <p className="hint">
                    {leftAfter(steps, adv.recoverCapitalFirst, i)}% of your original position is left after this step
                    {recovery ? " — it sells just enough to return your original buy" : ""}.
                  </p>
                )}
              </div>
            );
          })}

          <button
            type="button"
            className="btn btn-sm mt-3"
            disabled={disabled || steps.length >= MAX_PARTIAL_STEPS}
            onClick={addStep}
          >
            + Add a step {steps.length >= MAX_PARTIAL_STEPS ? `(max ${MAX_PARTIAL_STEPS})` : ""}
          </button>

          <div className="mt-4 space-y-2">
            <label className="flex items-start gap-2 text-xs text-ink-dim">
              <input
                type="checkbox"
                className="check mt-0.5"
                disabled={disabled || steps.length === 0}
                checked={adv.recoverCapitalFirst}
                onChange={(e) => setAdv({ recoverCapitalFirst: e.target.checked })}
              />
              <span>First step recovers my original buy: it sells exactly the share that returns the SOL I spent (50% at +100%, about 67% at +50%).</span>
            </label>
            <label className="flex items-start gap-2 text-xs text-ink-dim">
              <input
                type="checkbox"
                className="check mt-0.5"
                disabled={disabled || steps.length === 0}
                checked={adv.moveStopToEntryAfterPartial}
                onChange={(e) => setAdv({ moveStopToEntryAfterPartial: e.target.checked })}
              />
              <span>After the first partial sell, move my stop loss up to my entry price, so what is left can no longer lose money.</span>
            </label>
          </div>
          <p className="hint">
            Each partial sell is its own transaction with its own network and priority fees, so on small buys several
            steps can eat a visible share of the profit. A partial sell only happens if the price actually reaches the step.
          </p>
        </Group>

        <Group
          title="Break-even stop"
          status={adv.breakEvenTriggerPct > 0 ? `at +${adv.breakEvenTriggerPct}%` : "off"}
        >
          <p className="hint mt-3">
            Once a position&apos;s peak gain reaches the trigger, its stop loss moves up from the normal level to your
            entry price (plus the offset), so a winner cannot turn into a loss.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {advField("breakEvenTriggerPct", "Trigger at gain (%)", { hint: "0 = off" })}
            {advField("breakEvenOffsetPct", "Stop sits above entry by (%)", { step: "0.1", hint: "0 = exactly at entry" })}
          </div>
        </Group>

        <Group title="Entry filters" status={filtersOn === 0 ? "off" : `${filtersOn} on`}>
          <p className="hint mt-3">
            Skip a token when the condition is not met. The mint and freeze authorities are the keys that let a
            creator print more supply or freeze your tokens; pump.fun tokens normally launch with both already
            renounced, so these two will rarely skip anything here. If a check cannot be completed, the token is
            skipped.
          </p>
          <div className="mt-3 space-y-2">
            {[
              { key: "requireMintAuthorityRenounced", label: "Require mint authority renounced" },
              { key: "requireFreezeAuthorityRenounced", label: "Require freeze authority renounced" },
              { key: "blockCopycatNames", label: "Block copycat names (look-alike letters, or a ticker copying an established token)" },
            ].map((t) => (
              <label key={t.key} className="flex items-start gap-2 text-xs text-ink-dim">
                <input
                  type="checkbox"
                  className="check mt-0.5"
                  disabled={disabled}
                  checked={Boolean(adv[t.key as keyof AdvancedConfig])}
                  onChange={(e) => setAdv({ [t.key]: e.target.checked } as Partial<AdvancedConfig>)}
                />
                <span>{t.label}</span>
              </label>
            ))}
          </div>
        </Group>

        <Group title="Daily limits and pacing" status={limitsOn === 0 ? "off" : `${limitsOn} on`}>
          <p className="hint mt-3">
            When a limit is reached the bot keeps managing the positions it already has and only stops opening new
            ones. The day resets at 00:00 UTC, and only trades in the current mode (live or paper) are counted, so
            paper testing never uses up a live wallet&apos;s limits.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {advField("dailyLossLimitSol", "Daily loss limit (SOL)", { step: "0.01", sol: true, hint: "stop buying once today's net loss reaches this" })}
            {advField("dailyProfitTargetSol", "Daily profit target (SOL)", { step: "0.01", sol: true, hint: "stop buying once today's net profit reaches this" })}
            {advField("maxTradesPerDay", "Max trades per day", { hint: "buys opened today" })}
            {advField("maxOpenExposureSol", "Max open exposure (SOL)", { step: "0.01", sol: true, hint: "open positions plus the new buy" })}
            {advField("stopAfterConsecutiveLosses", "Pause after losing trades in a row", { hint: "until a win or the next UTC day" })}
            {advField("buyCooldownSec", "Buy cooldown (sec)", { hint: "minimum gap between buys" })}
          </div>
          <p className="hint">0 = off for every field above.</p>
        </Group>

        <button onClick={onSave} disabled={saving} className="btn btn-primary btn-block mt-5">
          {saving ? "Saving…" : "Save configuration"}
        </button>
      </div>
    </div>
  );
}
