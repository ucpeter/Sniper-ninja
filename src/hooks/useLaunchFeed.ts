"use client";

import { useEffect, useRef, useState } from "react";
import { pumpFeed, type FeedStatus } from "@/lib/pumpFeed";
import { PUMP_FUN_TOTAL_SUPPLY } from "@/lib/types";

export interface LaunchRow {
  mint: string;
  name: string;
  symbol: string;
  seenAt: number;
  devHoldPct: number;
  liquiditySol: number;
  marketCapSol: number;
}

const MAX_ROWS = 40;
const FLUSH_MS = 400;

/**
 * The homepage's own view of new pump.fun launches. It keeps its own list and
 * counter, completely separate from the scanner inside the wallet cockpit, and
 * shares only the single PumpPortal connection (PumpPortal asks apps to keep
 * exactly one open). Launches are batched every 400 ms so a burst of tokens
 * does not re-render the page dozens of times a second.
 */
export function useLaunchFeed() {
  const [rows, setRows] = useState<LaunchRow[]>([]);
  const [status, setStatus] = useState<FeedStatus>("idle");
  const [seen, setSeen] = useState(0);
  const buffer = useRef<LaunchRow[]>([]);

  useEffect(() => {
    pumpFeed.connect();
    const offStatus = pumpFeed.onStatus(setStatus);
    const offEvent = pumpFeed.onEvent((evt) => {
      if (evt.txType !== "create") return;
      buffer.current.push({
        mint: evt.mint,
        name: String(evt.name ?? ""),
        symbol: String(evt.symbol ?? ""),
        seenAt: Date.now(),
        devHoldPct: ((Number(evt.initialBuy) || 0) / PUMP_FUN_TOTAL_SUPPLY) * 100,
        liquiditySol: Number(evt.vSolInBondingCurve) || 0,
        marketCapSol: Number(evt.marketCapSol) || 0,
      });
    });
    const flush = setInterval(() => {
      if (buffer.current.length === 0) return;
      const incoming = buffer.current;
      buffer.current = [];
      setSeen((n) => n + incoming.length);
      setRows((prev) => {
        const known = new Set(prev.map((r) => r.mint));
        const fresh = incoming.filter((r) => !known.has(r.mint)).reverse();
        return [...fresh, ...prev].slice(0, MAX_ROWS);
      });
    }, FLUSH_MS);
    return () => {
      offStatus();
      offEvent();
      clearInterval(flush);
    };
  }, []);

  return { rows, status, seen };
}
