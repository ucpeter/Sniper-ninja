"use client";

import { useEffect, useState } from "react";
import type { useBurnerWallet, BurnerWalletSummary } from "@/hooks/useBurnerWallet";
import type { useMainWallet } from "@/hooks/useMainWallet";
import { shortAddr } from "@/lib/format";
import { bytesToBase64 } from "@/lib/txUtils";
import { SolAmount, useUsd } from "@/components/SolAmount";

type Burner = ReturnType<typeof useBurnerWallet>;
type MainWallet = ReturnType<typeof useMainWallet>;

function WalletCard({
  wallet,
  unlocked,
  balanceSol,
  mainWallet,
  persistentRunning,
  onUnlock,
  onLock,
  onForget,
  onFund,
  onWithdraw,
  onTogglePersistent,
}: {
  wallet: BurnerWalletSummary;
  unlocked: boolean;
  balanceSol: number | null;
  mainWallet: MainWallet;
  persistentRunning: boolean;
  onUnlock: (passphrase: string) => Promise<void>;
  onLock: () => void;
  onForget: () => void;
  onFund: (amountSol: number) => Promise<void>;
  onWithdraw: (amountSol?: number) => Promise<void>;
  onTogglePersistent: () => Promise<void>;
}) {
  const [passphrase, setPassphrase] = useState("");
  const [fundAmount, setFundAmount] = useState("0.2");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { usd } = useUsd();
  const fundUsd = Number(fundAmount) > 0 ? usd(Number(fundAmount)) : "";
  const withdrawUsd = Number(withdrawAmount) > 0 ? usd(Number(withdrawAmount)) : "";

  const runAction = async (name: string, fn: () => Promise<void>) => {
    setBusyAction(name);
    setMessage(null);
    try {
      await fn();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="rounded-[10px] border border-line bg-panel2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <p className="text-sm font-bold text-ink">{wallet.label}</p>
        <div className="flex gap-1">
          {persistentRunning && <span className="badge open">Running on server</span>}
          {unlocked ? <span className="badge won">Unlocked · trading</span> : <span className="badge mute">Locked</span>}
        </div>
      </div>
      <p className="mono mt-1 text-xs text-ink-mute">{shortAddr(wallet.publicKey, 6)}</p>
      <SolAmount sol={balanceSol} stack className="mt-1 text-[13px] font-semibold text-ink" />

      {!unlocked ? (
        <div className="mt-3 flex gap-2">
          <input
            type="password"
            placeholder="Passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="input"
          />
          <button
            disabled={busyAction === "unlock" || !passphrase}
            onClick={() =>
              runAction("unlock", async () => {
                await onUnlock(passphrase);
                setPassphrase("");
              })
            }
            className="btn btn-primary shrink-0"
          >
            Unlock
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              aria-label="Amount of SOL to fund"
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value)}
              className="input w-24"
            />
            <span className="text-xs text-ink-mute">SOL</span>
            {fundUsd && <span className="usd">{fundUsd}</span>}
            <button
              disabled={!mainWallet.publicKey || busyAction === "fund"}
              onClick={() => runAction("fund", () => onFund(Number(fundAmount)))}
              className="btn btn-sm flex-1"
            >
              Fund
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount"
              aria-label="Amount of SOL to withdraw"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="input w-24"
            />
            <span className="text-xs text-ink-mute">SOL</span>
            {withdrawUsd && <span className="usd">{withdrawUsd}</span>}
            <button
              disabled={!mainWallet.publicKey || busyAction === "withdraw" || !withdrawAmount}
              onClick={() => runAction("withdraw", () => onWithdraw(Number(withdrawAmount)))}
              className="btn btn-sm flex-1"
            >
              Withdraw
            </button>
            <button
              disabled={!mainWallet.publicKey || busyAction === "withdraw-all"}
              onClick={() => runAction("withdraw-all", () => onWithdraw())}
              className="btn btn-sm flex-1"
            >
              Withdraw all
            </button>
          </div>
          <div>
            <button
              disabled={busyAction === "persistent"}
              onClick={() =>
                runAction("persistent", async () => {
                  if (
                    persistentRunning ||
                    confirm(
                      "This sends your decrypted key to the server once, held only in its memory, so trading continues with this tab closed. It stops if you stop it here, or if the server itself restarts. Continue?",
                    )
                  ) {
                    await onTogglePersistent();
                  }
                })
              }
              className={`btn btn-sm btn-block ${persistentRunning ? "btn-warn" : ""}`}
            >
              {persistentRunning ? "Stop running on server" : "Keep running with this tab closed"}
            </button>
            <p className="mt-1.5 text-[10.5px] text-ink-mute">
              {persistentRunning
                ? "Trading continues even if you close this tab. Stop here when you want it to actually stop."
                : "Sends your key to the server once, held only in memory, so it survives closing this tab."}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={onLock} className="btn btn-sm btn-ghost flex-1">
              Lock
            </button>
            <button
              onClick={() => {
                if (confirm("This permanently deletes the encrypted key from this device. Withdraw funds first. Continue?")) {
                  onForget();
                }
              }}
              className="btn btn-sm btn-danger flex-1"
            >
              Forget
            </button>
          </div>
        </div>
      )}
      {message && <p className="neg mt-2 text-[11px]">{message}</p>}
    </div>
  );
}

export function BurnerWalletPanel({ burner, mainWallet }: { burner: Burner; mainWallet: MainWallet }) {
  const [newLabel, setNewLabel] = useState("");
  const [newPassphrase, setNewPassphrase] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [persistentStatus, setPersistentStatus] = useState<Record<string, boolean>>({});

  const noWallets = !burner.hasStored;

  useEffect(() => {
    if (burner.wallets.length === 0) return;
    let cancelled = false;
    const checkAll = () => {
      burner.wallets.forEach((w) => {
        fetch(`/api/persistent-bot/status?walletAddress=${w.publicKey}`)
          .then((r) => r.json())
          .then((data) => {
            if (!cancelled) setPersistentStatus((prev) => ({ ...prev, [w.id]: Boolean(data.running) }));
          })
          .catch(() => {});
      });
    };
    checkAll();
    const interval = setInterval(checkAll, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burner.wallets.map((w) => w.id).join(",")]);

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">Trading wallets</div>
        {burner.unlockedIds.length > 1 && (
          <div className="panel-actions">
            <span className="pos text-[11px] font-semibold">{burner.unlockedIds.length} running concurrently</span>
          </div>
        )}
      </div>
      <div className="panel-body">
        <p className="text-xs leading-relaxed text-ink-dim">
          Each wallet is generated in your browser and encrypted with its own passphrase, stored only on this device —
          never sent to our server. Unlock as many as you want to run at once; each one trades independently using its
          own saved configuration.
        </p>

        {burner.wallets.length > 0 && (
          <div className="mt-3 space-y-2">
            {burner.wallets.map((w) => (
              <WalletCard
                key={w.id}
                wallet={w}
                unlocked={burner.unlockedIds.includes(w.id)}
                balanceSol={burner.balances[w.id] ?? null}
                mainWallet={mainWallet}
                persistentRunning={persistentStatus[w.id] ?? false}
                onUnlock={(passphrase) => burner.unlock(w.id, passphrase)}
                onLock={() => burner.lock(w.id)}
                onForget={() => burner.forget(w.id)}
                onFund={async (amountSol) => {
                  await mainWallet.sendSol(w.publicKey, amountSol);
                  await burner.refreshBalance(w.id);
                }}
                onWithdraw={async (amountSol) => {
                  if (!mainWallet.publicKey) return;
                  await burner.withdraw(w.id, mainWallet.publicKey, amountSol);
                }}
                onTogglePersistent={async () => {
                  const running = persistentStatus[w.id] ?? false;
                  if (running) {
                    await fetch("/api/persistent-bot/stop", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ walletAddress: w.publicKey }),
                    });
                    setPersistentStatus((prev) => ({ ...prev, [w.id]: false }));
                  } else {
                    const keypair = burner.getKeypair(w.id);
                    if (!keypair) throw new Error("Unlock this wallet first");
                    const res = await fetch("/api/persistent-bot/start", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        walletAddress: w.publicKey,
                        secretKeyBase64: bytesToBase64(keypair.secretKey),
                      }),
                    });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Failed to start");
                    setPersistentStatus((prev) => ({ ...prev, [w.id]: true }));
                  }
                }}
              />
            ))}
          </div>
        )}

        {(noWallets || showAddForm) && (
          <div className="mt-3 space-y-2 rounded-[10px] border border-dashed border-line-hi p-3">
            <input
              type="text"
              placeholder="Label (optional, e.g. Main sniper)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="input"
            />
            <input
              type="password"
              placeholder="Choose a passphrase (min 8 chars)"
              value={newPassphrase}
              onChange={(e) => setNewPassphrase(e.target.value)}
              className="input"
            />
            <div className="flex gap-2">
              <button
                disabled={generating || newPassphrase.length < 8}
                onClick={async () => {
                  setGenerating(true);
                  await burner.generate(newPassphrase, newLabel);
                  setGenerating(false);
                  setNewLabel("");
                  setNewPassphrase("");
                  setShowAddForm(false);
                }}
                className="btn btn-primary flex-1"
              >
                Generate trading wallet
              </button>
              {!noWallets && (
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    setNewLabel("");
                    setNewPassphrase("");
                  }}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {!noWallets && !showAddForm && (
          <button onClick={() => setShowAddForm(true)} className="btn btn-sm btn-block mt-3 border-dashed">
            + Add another wallet
          </button>
        )}
        {burner.error && <p className="neg mt-2 text-xs">{burner.error}</p>}
      </div>
    </div>
  );
}
