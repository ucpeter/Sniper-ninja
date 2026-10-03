"use client";

import { useEffect, useState } from "react";
import { useLaunchFeed } from "@/hooks/useLaunchFeed";
import { SolAmount } from "@/components/SolAmount";
import { fmtAge, shortAddr } from "@/lib/format";

/**
 * Live pump.fun launch scanner for the homepage. It only watches: it has its
 * own list and counter, is not connected to any wallet, and never buys. The
 * scanner inside a wallet's cockpit is a separate component with separate state.
 */
export function HomeLaunchScanner() {
  const { rows, status, seen } = useLaunchFeed();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const live = status === "open";
  const dotClass = live ? "on" : status === "closed" || status === "error" ? "off" : "";
  const dotText = live ? "Live" : status === "closed" || status === "error" ? "Reconnecting" : "Connecting";

  return (
    <section className="panel" aria-label="Live pump.fun launches">
      <div className="panel-head">
        <div>
          <div className="panel-title">
            Live pump.fun launches
            {seen > 0 && <span className="count">{seen} seen</span>}
          </div>
          <div className="panel-sub">Watching only — nothing here buys. Newest first.</div>
        </div>
        <div className="panel-actions">
          <span className={`feed-dot ${dotClass}`}>
            <i />
            {dotText}
          </span>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <b>{live ? "Waiting for the next launch" : "Connecting to the live feed"}</b>
          {live
            ? "New tokens appear here the moment they launch."
            : "This reconnects on its own if the connection drops."}
        </div>
      ) : (
        <div className="scan-feed">
          <div className="scan-row head" aria-hidden="true">
            <div>Token</div>
            <div className="r">Dev hold</div>
            <div className="r">Liquidity</div>
            <div className="r">Age</div>
          </div>
          {rows.map((r) => (
            <div className="scan-row" key={r.mint}>
              <div className="min-w-0">
                <div className="scan-sym">{r.symbol || "?"}</div>
                {r.name && <div className="scan-name">{r.name}</div>}
                <a
                  className="scan-mint"
                  href={`https://pump.fun/coin/${encodeURIComponent(r.mint)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {shortAddr(r.mint, 4)}
                </a>
              </div>
              <div className="r">{r.devHoldPct.toFixed(1)}%</div>
              <div className="r">
                <SolAmount sol={r.liquiditySol} digits={1} stack />
              </div>
              <div className="r mute">{fmtAge(r.seenAt, now)}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
