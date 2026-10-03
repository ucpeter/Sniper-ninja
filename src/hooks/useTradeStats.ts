"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StatsPayload } from "@/lib/stats";

const POLL_MS = 10_000;

/**
 * Win/loss totals for the given wallet addresses (locked wallets included),
 * read from /api/stats. Refreshes every 10 seconds, and `refreshSoon` asks for
 * an early refresh — e.g. right after the bot buys or sells.
 */
export function useTradeStats(addresses: string[]) {
  const key = addresses.join(",");
  const [data, setData] = useState<StatsPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!key) return;
    try {
      const res = await fetch(`/api/stats?wallets=${encodeURIComponent(key)}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`stats ${res.status}`);
      setData((await res.json()) as StatsPayload);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [key]);

  useEffect(() => {
    // First read on the next tick, then every POLL_MS.
    const first = setTimeout(() => void load(), 0);
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const refreshSoon = useCallback(() => {
    if (pending.current) return;
    pending.current = setTimeout(() => {
      pending.current = null;
      void load();
    }, 800);
  }, [load]);

  useEffect(() => {
    return () => {
      if (pending.current) clearTimeout(pending.current);
    };
  }, []);

  return { data: key ? data : null, failed, refreshSoon };
}
