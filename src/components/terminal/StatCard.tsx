"use client";

import type { ReactNode } from "react";
import { fmtSolNum } from "@/lib/format";
import { useUsd } from "@/components/SolAmount";

export type StatTone = "none" | "accent" | "red" | "blue" | "amber";

/**
 * One stat card. Pass `value` for a plain figure, or `sol` for a SOL amount:
 * the card then prints the number with a small SOL unit and puts the dollar
 * equivalent on the line underneath.
 */
export function StatCard({
  label,
  value,
  sol,
  signed = false,
  digits = 3,
  sub,
  tone = "none",
  title,
}: {
  label: string;
  value?: ReactNode;
  sol?: number | null;
  signed?: boolean;
  digits?: number;
  sub?: ReactNode;
  tone?: StatTone;
  title?: string;
}) {
  const { usd } = useUsd();
  let main: ReactNode = value;
  let subline: ReactNode = sub;

  if (sol !== undefined) {
    main = (
      <>
        <span>{fmtSolNum(sol, digits, signed)}</span>
        <span className="ml-1 text-[12px] font-semibold text-ink-mute">SOL</span>
      </>
    );
    subline = usd(sol, signed) || sub;
  }

  return (
    <div className={`stat ${tone === "none" ? "" : tone}`} title={title}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{main}</div>
      <div className="stat-sub">{subline}</div>
    </div>
  );
}
