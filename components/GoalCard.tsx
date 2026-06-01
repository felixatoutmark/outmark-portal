// Shared visual card for a monthly goal — used on the client dashboard
// and the Goals page. Renders a progress bar + percentage when both
// target and current values parse as numbers; otherwise falls back to
// a plain text summary.

const STATUS_PILL: Record<string, string> = {
  on_track: "bg-blue-100 text-blue-800",
  at_risk: "bg-yellow-100 text-yellow-900",
  achieved: "bg-green-100 text-green-800",
  missed: "bg-red-100 text-red-700",
};
const STATUS_LABEL: Record<string, string> = {
  on_track: "On track", at_risk: "At risk", achieved: "Achieved", missed: "Missed",
};

// Parse a YYYY-MM-DD date as a *local* date so timezones west of UTC don't
// roll it back a day when formatting.
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function parseNum(v: string | null | undefined): number | null {
  if (v == null) return null;
  const cleaned = String(v).replace(/[^0-9.\-]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export default function GoalCard({
  goal, monthLabel,
}: {
  goal: { kpi_label: string; target_value: string | null; current_value: string | null; status: string; notes: string | null };
  monthLabel?: string;
}) {
  const target = parseNum(goal.target_value);
  const current = parseNum(goal.current_value);
  const hasNumeric = target != null && current != null && target > 0;
  // Allow >100% so over-achievement is visible; clamp the bar fill but not the number.
  const pct = hasNumeric ? Math.max(0, Math.round((current! / target!) * 100)) : null;
  const barPct = pct == null ? 0 : Math.min(100, pct);

  return (
    <div
      className="rounded-card p-6 border"
      style={{
        background: "linear-gradient(135deg, #FFF6F1 0%, #FFFFFF 60%)",
        borderColor: "var(--border)",
        boxShadow: "0 4px 18px rgba(255,79,0,0.08)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          {monthLabel && <div className="label-text mb-1">{monthLabel}</div>}
          <div className="text-[20px] font-bold tracking-tight">{goal.kpi_label}</div>
        </div>
        <span className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_PILL[goal.status] || ""}`}>
          {STATUS_LABEL[goal.status] || goal.status}
        </span>
      </div>

      {hasNumeric ? (
        <>
          <div className="flex items-baseline gap-3 mt-4">
            <div
              className="text-[44px] font-black tracking-tight leading-none grad-text"
            >
              {pct}%
            </div>
            <div className="text-[13px] text-[--muted]">
              <div><span className="text-[--fg] font-semibold">{current!.toLocaleString()}</span> of {target!.toLocaleString()}</div>
              <div className="text-[--subtle]">to hit your {goal.kpi_label.toLowerCase()} target</div>
            </div>
          </div>
          <div className="h-3 mt-4 bg-[--border] rounded-full overflow-hidden">
            <div
              className="h-full transition-[width] duration-700 rounded-full"
              style={{
                width: `${barPct}%`,
                background: "linear-gradient(to right, #FF4F00, #FFA27A)",
                boxShadow: "0 0 12px rgba(255,79,0,0.35)",
              }}
            />
          </div>
        </>
      ) : (
        <div className="mt-3 inline-flex items-baseline gap-2 px-3 py-2 rounded-md border border-[--border] bg-white">
          <span className="text-[12px] text-[--muted] uppercase tracking-wider">Target</span>
          <span className="text-[18px] font-bold">{goal.target_value || "—"}</span>
          {goal.current_value && (
            <span className="text-[12px] text-[--muted] ml-2">· Current <span className="text-[--fg] font-semibold">{goal.current_value}</span></span>
          )}
        </div>
      )}

      {goal.notes && <p className="text-[13px] text-[--muted] mt-3 whitespace-pre-wrap">{goal.notes}</p>}
    </div>
  );
}
