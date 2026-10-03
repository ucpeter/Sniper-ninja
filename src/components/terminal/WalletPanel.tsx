"use client";

import { useState } from "react";
import type { useMainWallet } from "@/hooks/useMainWallet";
import { shortAddr } from "@/lib/format";
import { SolAmount } from "@/components/SolAmount";

export function WalletPanel({ wallet }: { wallet: ReturnType<typeof useMainWallet> }) {
  const [showOptions, setShowOptions] = useState(false);

  if (wallet.publicKey) {
    return (
      <div className="panel">
        <div className="panel-body flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="stat-label !mb-1">Main wallet ({wallet.kind})</p>
            <p className="mono text-sm font-semibold text-ink">{shortAddr(wallet.publicKey, 6)}</p>
            <SolAmount sol={wallet.balanceSol} stack className="mt-0.5 text-[13px] text-ink-dim" />
          </div>
          <button onClick={wallet.disconnect} className="btn btn-sm shrink-0">
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="panel-body">
        <p className="stat-label !mb-2">Main wallet</p>
        {!showOptions ? (
          <button onClick={() => setShowOptions(true)} className="btn btn-primary btn-block">
            Connect wallet
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => wallet.connect("phantom")} disabled={wallet.connecting} className="btn flex-1">
              Phantom
            </button>
            <button onClick={() => wallet.connect("solflare")} disabled={wallet.connecting} className="btn flex-1">
              Solflare
            </button>
          </div>
        )}
        {wallet.error && <p className="neg mt-2 text-xs">{wallet.error}</p>}
        <p className="mt-3 text-[11px] text-ink-mute">
          Non-custodial — used only to fund/withdraw the trading wallet below. We never see your keys.
        </p>
      </div>
    </div>
  );
}
