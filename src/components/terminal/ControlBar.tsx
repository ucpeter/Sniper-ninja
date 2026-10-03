"use client";

import { useState } from "react";
import { useUsd } from "@/components/SolAmount";

interface Props {
  running: boolean;
  paperTrading: boolean;
  canStart: boolean;
  onStart: () => void;
  onStop: () => void;
  onKillSwitch: () => void;
  onManualBuy: (mint: string, amountSol: number) => void;
}

export function ControlBar({ running, paperTrading, canStart, onStart, onStop, onKillSwitch, onManualBuy }: Props) {
  const [mint, setMint] = useState("");
  const [amount, setAmount] = useState("0.05");
  const { usd } = useUsd();
  const amountUsd = Number(amount) > 0 ? usd(Number(amount)) : "";

  return (
    <div className="panel">
      <div className="panel-body">
        <div className="flex flex-wrap items-center gap-3">
          {!running ? (
            <button
              onClick={onStart}
              disabled={!canStart}
              className={`btn ${paperTrading ? "btn-warn" : "btn-primary"}`}
            >
              {paperTrading ? "▶ Start (paper trading)" : "▶ Start LIVE sniping"}
            </button>
          ) : (
            <button onClick={onStop} className="btn">
              ⏸ Stop bot
            </button>
          )}
          <button onClick={onKillSwitch} className="btn btn-danger">
            🛑 Kill switch (sell everything)
          </button>
          <span className={`chip ${running ? (paperTrading ? "chip-warn" : "chip-danger") : ""}`}>
            {running ? (paperTrading ? "PAPER MODE RUNNING" : "LIVE — real funds at risk") : "STOPPED"}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <span className="text-xs font-semibold text-ink-dim">Manual snipe</span>
          <input
            value={mint}
            onChange={(e) => setMint(e.target.value)}
            placeholder="Token mint address"
            className="input min-w-[200px] flex-1"
          />
          <div className="flex items-center gap-2">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              type="number"
              step="0.01"
              aria-label="Amount in SOL"
              className="input w-24"
            />
            <span className="text-xs text-ink-mute">SOL</span>
            {amountUsd && <span className="usd whitespace-nowrap">{amountUsd}</span>}
          </div>
          <button
            onClick={() => mint && onManualBuy(mint.trim(), Number(amount))}
            disabled={!canStart || !mint}
            className="btn btn-sm"
          >
            Buy now
          </button>
        </div>
      </div>
    </div>
  );
}
