"use client";

import { fmtSol, fmtSolSigned, fmtUsdSol } from "@/lib/format";
import { useSolPrice } from "@/hooks/useSolPrice";

const APPROX_TIP = "Live SOL price unavailable — using the last known (or a fallback) price";

/** Returns a formatter that turns a SOL amount into its USD equivalent ("" until a price is known). */
export function useUsd() {
  const { price, approx } = useSolPrice();
  return {
    approx,
    usd: (sol: number | null | undefined, signed = false): string => {
      const text = fmtUsdSol(sol, price, signed);
      return text && approx ? `≈ ${text}` : text;
    },
  };
}

/** A SOL amount with its dollar equivalent beside it (or under it with `stack`). */
export function SolAmount({
  sol,
  digits = 4,
  signed = false,
  stack = false,
  className = "",
  usdClassName = "",
}: {
  sol: number | null | undefined;
  digits?: number;
  signed?: boolean;
  stack?: boolean;
  className?: string;
  usdClassName?: string;
}) {
  const { usd, approx } = useUsd();
  const text = signed ? fmtSolSigned(sol, digits) : fmtSol(sol, digits);
  const dollars = usd(sol, signed);
  const tip = approx ? APPROX_TIP : undefined;

  if (stack) {
    return (
      <span className={`inline-flex flex-col leading-tight ${className}`}>
        <span>{text}</span>
        {dollars && (
          <span className={`usd ${usdClassName}`} title={tip}>
            {dollars}
          </span>
        )}
      </span>
    );
  }
  return (
    <span className={className}>
      {text}
      {dollars && (
        <span className={`usd ml-1.5 ${usdClassName}`} title={tip}>
          ({dollars})
        </span>
      )}
    </span>
  );
}
