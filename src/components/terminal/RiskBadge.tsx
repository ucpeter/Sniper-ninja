import type { RiskAssessment } from "@/lib/types";

export function RiskBadge({ risk }: { risk?: RiskAssessment | null }) {
  if (!risk) {
    return <span className="badge mute">unchecked</span>;
  }
  const tone = risk.verdict === "safe" ? "won" : risk.verdict === "caution" ? "warn" : "lost";
  return (
    <span className={`badge ${tone}`} title={risk.reasons.join(" · ")}>
      {risk.score}/100
    </span>
  );
}
