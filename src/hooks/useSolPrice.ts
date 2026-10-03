"use client";

import { useSyncExternalStore } from "react";

export interface SolPriceState {
  /** USD per SOL, or null until the first price arrives. */
  price: number | null;
  /** True when the server could not reach its price source and sent a last-known or fallback value. */
  approx: boolean;
}

const POLL_MS = 30_000;
const EMPTY: SolPriceState = { price: null, approx: false };

// One shared poller for the whole page, however many components show dollars.
let snapshot: SolPriceState = EMPTY;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inflight = false;

async function refresh() {
  if (inflight) return;
  inflight = true;
  try {
    const res = await fetch("/api/sol-price", { cache: "no-store" });
    const data = await res.json();
    const price = Number(data?.price);
    if (Number.isFinite(price) && price > 0) {
      snapshot = { price, approx: Boolean(data?.stale) };
      listeners.forEach((cb) => cb());
    }
  } catch {
    // keep showing the last good price
  } finally {
    inflight = false;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (listeners.size === 1) {
    void refresh();
    timer = setInterval(() => void refresh(), POLL_MS);
  } else if (snapshot.price === null) {
    void refresh();
  }
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function useSolPrice(): SolPriceState {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY,
  );
}
