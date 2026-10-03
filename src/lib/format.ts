export function fmtSol(value: number | null | undefined, digits = 4): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)} SOL`;
}

export function fmtUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function shortAddr(addr: string | null | undefined, size = 4): string {
  if (!addr) return "—";
  if (addr.length <= size * 2 + 3) return addr;
  return `${addr.slice(0, size)}…${addr.slice(-size)}`;
}

export function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** The number part of a SOL amount, optionally with + for gains. Never prints "-0.0000". */
export function fmtSolNum(value: number | null | undefined, digits = 4, signed = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(digits));
  const shown = rounded === 0 ? 0 : value;
  return `${signed && shown > 0 ? "+" : ""}${shown.toFixed(digits)}`;
}

/** SOL with an explicit + on gains — for profit and loss figures. */
export function fmtSolSigned(value: number | null | undefined, digits = 4): string {
  const num = fmtSolNum(value, digits, true);
  return num === "—" ? num : `${num} SOL`;
}

/**
 * USD equivalent of a SOL amount, e.g. "$7.50". Returns "" when there is no
 * rate yet so callers can simply skip rendering it. Always en-US so the server
 * and the browser print identical text.
 */
export function fmtUsdSol(
  sol: number | null | undefined,
  rate: number | null | undefined,
  signed = false,
): string {
  if (sol === null || sol === undefined || !Number.isFinite(sol)) return "";
  if (rate === null || rate === undefined || !Number.isFinite(rate) || rate <= 0) return "";
  const usd = sol * rate;
  const abs = Math.abs(usd);
  const sign = usd < 0 ? "-" : signed && usd > 0 ? "+" : "";
  if (abs > 0 && abs < 0.01) return `${sign}<$0.01`;
  const digits = abs >= 1000 ? 0 : 2;
  return `${sign}$${abs.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Compact age such as "12s", "4m", "2h". */
export function fmtAge(fromMs: number, nowMs: number): string {
  const s = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}
