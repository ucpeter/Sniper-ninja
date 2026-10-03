"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useMainWallet } from "@/hooks/useMainWallet";
import { useBurnerWallet } from "@/hooks/useBurnerWallet";
import { useTradeStats } from "@/hooks/useTradeStats";
import { pumpFeed, type FeedStatus } from "@/lib/pumpFeed";
import { WalletPanel } from "@/components/terminal/WalletPanel";
import { BurnerWalletPanel } from "@/components/terminal/BurnerWalletPanel";
import { WalletCockpit } from "@/components/terminal/WalletCockpit";
import { DashboardStats, type StatsMode } from "@/components/terminal/DashboardStats";

export default function TerminalPage() {
  const mainWallet = useMainWallet();
  const burner = useBurnerWallet();
  const [feedStatus, setFeedStatus] = useState<FeedStatus>("idle");
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [modeChoice, setModeChoice] = useState<StatsMode | null>(null);

  useEffect(() => {
    const unsub = pumpFeed.onStatus(setFeedStatus);
    return () => {
      unsub();
    };
  }, []);

  const unlockedWallets = burner.wallets.filter((w) => burner.unlockedIds.includes(w.id));

  // Derived, not synced: falls back to the first unlocked wallet whenever
  // activeTabId isn't (or is no longer) one of the unlocked wallets — e.g.
  // right after unlocking the first wallet, or after locking the one that
  // was active — without needing an effect to keep it in sync.
  const activeId =
    activeTabId && unlockedWallets.some((w) => w.id === activeTabId) ? activeTabId : (unlockedWallets[0]?.id ?? null);

  // Win/loss figures for every wallet (locked ones included), read from the
  // database so they also cover trades made by the always-on server bot.
  const { data: stats, failed: statsFailed, refreshSoon } = useTradeStats(burner.wallets.map((w) => w.publicKey));

  // Until the person picks a view: Live, unless there are only paper trades so far.
  const mode: StatsMode =
    modeChoice ?? (stats && stats.totals.live.bought === 0 && stats.totals.paper.bought > 0 ? "paper" : "live");

  return (
    <main className="min-h-screen">
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">
            <span className="brand-mark">⚡</span>
            <span>
              Volt<span className="text-accent">Snipe</span>
            </span>
          </Link>
          <span className="chip chip-danger text-center">
            <span className="hidden sm:inline">Real mainnet trading — you can lose all funds you deposit</span>
            <span className="sm:hidden">Mainnet — real funds</span>
          </span>
        </div>
      </header>

      <div className="page">
        {unlockedWallets.length === 0 && (
          <div className="notice info mb-4">
            <span>
              Unlock (or generate) a trading wallet below to load its saved configuration and start sniping. Unlock
              more than one to run them side by side, each with its own strategy.
            </span>
          </div>
        )}

        {burner.wallets.length > 0 && (
          <DashboardStats
            totals={stats ? stats.totals[mode] : null}
            mode={mode}
            onModeChange={setModeChoice}
            walletCount={burner.wallets.length}
            unavailable={statsFailed}
          />
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 lg:col-span-1">
            <WalletPanel wallet={mainWallet} />
            <BurnerWalletPanel burner={burner} mainWallet={mainWallet} />
            <div className="panel">
              <div className="panel-body text-[11px] leading-relaxed text-ink-mute">
                <p className="mb-1 font-semibold text-ink-dim">How execution works</p>
                <p>
                  Buys/sells are built by PumpPortal&apos;s public trade-local API, signed locally with each trading
                  wallet&apos;s own key in this browser, and broadcast through our RPC proxy. We never see or store any
                  private key. Every unlocked wallet below trades independently, using only its own saved
                  configuration — one wallet&apos;s settings never affect another&apos;s. Trading pump.fun tokens is
                  extremely high risk — most new tokens lose most of their value.
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-4 lg:col-span-2">
            {unlockedWallets.length > 1 && (
              <div className="tabs">
                {unlockedWallets.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => setActiveTabId(w.id)}
                    className={`tab ${w.id === activeId ? "active" : ""}`}
                  >
                    {w.label}
                  </button>
                ))}
                <span className="ml-auto self-center pr-2 text-[11px] text-ink-mute">
                  All {unlockedWallets.length} keep trading in the background regardless of which tab is open
                </span>
              </div>
            )}

            {/* Every unlocked wallet's cockpit stays mounted so its bot keeps
                running even while a different tab is visible; only the
                selected one is actually shown. */}
            {unlockedWallets.map((w) => (
              <WalletCockpit
                key={w.id}
                wallet={w}
                keypair={burner.getKeypair(w.id)!}
                burnerBalanceSol={burner.balances[w.id] ?? null}
                refreshBurnerBalance={() => burner.refreshBalance(w.id)}
                feedStatus={feedStatus}
                visible={w.id === activeId}
                stats={stats?.wallets[w.publicKey]?.[mode] ?? null}
                statsMode={mode}
                onTradeActivity={refreshSoon}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
