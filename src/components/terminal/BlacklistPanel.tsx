"use client";

import { useState } from "react";
import { shortAddr } from "@/lib/format";

export function BlacklistPanel({
  walletAddress,
  blacklist,
  onChange,
}: {
  walletAddress: string;
  blacklist: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");

  const add = async () => {
    const dev = input.trim();
    if (!dev) return;
    await fetch("/api/blacklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, devWallet: dev }),
    });
    onChange([...blacklist, dev]);
    setInput("");
  };

  const remove = async (dev: string) => {
    await fetch(`/api/blacklist?walletAddress=${walletAddress}&devWallet=${dev}`, { method: "DELETE" });
    onChange(blacklist.filter((d) => d !== dev));
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <div className="panel-title">
          Deployer blacklist
          <span className="count">{blacklist.length}</span>
        </div>
      </div>
      <div className="panel-body">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Wallet address to block"
            className="input flex-1"
          />
          <button onClick={add} className="btn">
            Block
          </button>
        </div>
        <div className="mt-3 max-h-28 space-y-1 overflow-y-auto">
          {blacklist.length === 0 && <p className="text-xs text-ink-mute">No blocked deployers yet.</p>}
          {blacklist.map((dev) => (
            <div key={dev} className="flex items-center justify-between rounded-md bg-panel2 px-2.5 py-1.5 text-xs">
              <span className="mono text-ink-dim">{shortAddr(dev, 6)}</span>
              <button onClick={() => remove(dev)} className="neg hover:underline">
                remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
