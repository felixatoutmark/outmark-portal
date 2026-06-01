import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";
import GoalsManager from "./GoalsManager";

export const dynamic = "force-dynamic";

export default async function Goals() {
  const u = await requireClient();
  const sb = await createClient();
  const { data: goals } = await sb.from("monthly_goals")
    .select("*").eq("client_id", u.client_id!)
    .order("month", { ascending: false });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="section-title">Goals</h1>
        <p className="text-[--muted]">
          Set a target every month — or change this month's mid-flight. Outmark tracks progress and updates the status as the month goes.
        </p>
      </header>
      <GoalsManager initial={goals ?? []} />
    </div>
  );
}
