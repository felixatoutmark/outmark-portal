import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";
import { STEPS } from "@/lib/onboarding-config";

export const dynamic = "force-dynamic";

export default async function OnboardingTracker() {
  await requireAdmin();
  const sb = await createClient();
  const { data: clients } = await sb.from("clients")
    .select("id, business_name, status, onboarding_completed_at, created_at")
    .order("created_at", { ascending: false });
  const { data: progress } = await sb.from("onboarding_progress").select("*");

  const byClient = new Map<string, Set<number>>();
  for (const p of progress ?? []) {
    if (!p.completed) continue;
    if (!byClient.has(p.client_id)) byClient.set(p.client_id, new Set());
    byClient.get(p.client_id)!.add(p.step_number);
  }

  return (
    <div className="space-y-6">
      <header><h1 className="section-title">Onboarding tracker</h1>
        <p className="text-[--muted]">Who's stuck where.</p></header>
      <div className="space-y-3">
        {(clients ?? []).map((c) => {
          const done = byClient.get(c.id) ?? new Set();
          const nextStep = STEPS.find(s => !done.has(s.n))?.n;
          const finished = !!c.onboarding_completed_at;
          return (
            <Link key={c.id} href={`/admin/clients/${c.id}`} className="card p-4 block hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">{c.business_name}</div>
                <div className="text-[12px] text-[--muted]">
                  {finished ? "✓ complete" : `step ${nextStep ?? STEPS.length} of ${STEPS.length}`}
                </div>
              </div>
              <div className="flex gap-1">
                {STEPS.map((s) => (
                  <div key={s.n} className={`h-1.5 flex-1 rounded-full ${done.has(s.n) || finished ? "bg-grad" : "bg-[--border]"}`} />
                ))}
              </div>
            </Link>
          );
        })}
        {!clients?.length && <div className="card p-6 text-center text-[--muted]">No clients yet.</div>}
      </div>
    </div>
  );
}
