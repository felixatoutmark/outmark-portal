"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import GoalCard, { parseLocalDate } from "@/components/GoalCard";

type Goal = {
  id?: string;
  month: string; // YYYY-MM-01
  kpi_label: string;
  target_value: string | null;
  current_value: string | null;
  status: string;
  notes: string | null;
  updated_at?: string;
};

const STATUS_LABEL: Record<string, string> = {
  on_track: "On track",
  at_risk: "At risk",
  achieved: "Achieved",
  missed: "Missed",
};

const STATUS_PILL: Record<string, string> = {
  on_track: "bg-blue-100 text-blue-800",
  at_risk: "bg-yellow-100 text-yellow-900",
  achieved: "bg-green-100 text-green-800",
  missed: "bg-red-100 text-red-700",
};

function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatMonth(m: string) {
  return parseLocalDate(m).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function GoalsManager({ initial }: { initial: Goal[] }) {
  const sb = createClient();
  const [goals, setGoals] = useState<Goal[]>(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const tm = thisMonth();
  const currentMonthGoal = goals.find((g) => g.month === tm);

  async function logNewGoal(e: React.FormEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const month = String(f.get("month") || tm);
    const kpi = String(f.get("kpi_label") || "").trim();
    const target = String(f.get("target_value") || "").trim() || null;
    const notes = String(f.get("notes") || "").trim() || null;
    if (!kpi) return;
    setBusy(true); setErr(null);
    try {
      const { data: { user } } = await sb.auth.getUser();
      const { data: me } = await sb.from("users").select("client_id").eq("id", user!.id).single();
      const { error } = await sb.from("monthly_goals").upsert({
        client_id: me!.client_id, month, kpi_label: kpi, target_value: target, notes,
      }, { onConflict: "client_id,month" });
      if (error) throw error;
      location.reload();
    } catch (e: any) {
      setErr(e?.message ?? "Could not save goal.");
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-8">
      {/* Current month status card */}
      {currentMonthGoal && (
        <GoalCard goal={currentMonthGoal} monthLabel={formatMonth(currentMonthGoal.month)} />
      )}

      {/* Log / change form */}
      <form onSubmit={logNewGoal} className="card p-5 space-y-3">
        <h2 className="font-bold">{currentMonthGoal ? "Update or log a new month's goal" : "Log this month's goal"}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label-text mb-1 block">Month</label>
            <input type="month" name="month_picker" defaultValue={tm.slice(0, 7)} className="input"
              onChange={(e) => {
                const v = e.target.value; // YYYY-MM
                const hidden = (e.currentTarget.form?.elements.namedItem("month") as HTMLInputElement);
                if (hidden) hidden.value = v ? `${v}-01` : tm;
              }}
            />
            <input type="hidden" name="month" defaultValue={tm} />
          </div>
          <div>
            <label className="label-text mb-1 block">KPI</label>
            <input className="input" name="kpi_label" placeholder="e.g. Profile visits" required
              defaultValue={currentMonthGoal?.kpi_label ?? ""} />
          </div>
          <div className="md:col-span-2">
            <label className="label-text mb-1 block">Target</label>
            <input className="input" name="target_value" placeholder="e.g. 5,000"
              defaultValue={currentMonthGoal?.target_value ?? ""} />
          </div>
          <div className="md:col-span-2">
            <label className="label-text mb-1 block">Notes (optional)</label>
            <textarea className="textarea" rows={2} name="notes"
              defaultValue={currentMonthGoal?.notes ?? ""}
              placeholder="Why this number? Anything Outmark should know?" />
          </div>
        </div>
        {err && <p className="text-[13px] text-red-600">{err}</p>}
        <button className="btn-primary" disabled={busy}>{busy ? "…" : "Save goal"}</button>
      </form>

      {/* History */}
      <section>
        <h2 className="font-bold text-[16px] mb-3">History</h2>
        {goals.length === 0 ? (
          <div className="card p-6 text-center text-[--muted]">No goals logged yet.</div>
        ) : (
          <div className="space-y-2">
            {goals.map((g) => (
              <div key={g.id} className="card p-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-[12px] text-[--muted] uppercase tracking-wider">{formatMonth(g.month)}</div>
                  <div className="text-[14px] font-semibold">{g.kpi_label}</div>
                  <div className="text-[13px] text-[--muted]">
                    Target: {g.target_value || "—"}{g.current_value ? ` · Current: ${g.current_value}` : ""}
                  </div>
                </div>
                <span className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full ${STATUS_PILL[g.status] || ""}`}>
                  {STATUS_LABEL[g.status] || g.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
