import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";
import ClientsTable from "./ClientsTable";

export const dynamic = "force-dynamic";

export default async function AdminClients() {
  await requireAdmin();
  const sb = await createClient();
  const { data: clients } = await sb.from("clients")
    .select("*").order("created_at", { ascending: false });

  const ids = (clients ?? []).map(c => c.id);
  const { data: openReq } = await sb.from("requests")
    .select("client_id, id").in("client_id", ids).eq("status", "open");
  const reqCount: Record<string, number> = {};
  for (const r of openReq ?? []) reqCount[r.client_id] = (reqCount[r.client_id] || 0) + 1;

  const { data: moods } = await sb.from("feedback")
    .select("client_id, mood_score, created_at")
    .in("client_id", ids)
    .not("mood_score", "is", null)
    .order("created_at", { ascending: false });
  const latestMood: Record<string, number> = {};
  for (const m of moods ?? []) if (!(m.client_id in latestMood)) latestMood[m.client_id] = m.mood_score;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="section-title">Clients</h1>
          <p className="text-[--muted]">{clients?.length ?? 0} total</p>
        </div>
        <Link href="/admin/invite" className="btn-primary">+ Invite client</Link>
      </div>

      <ClientsTable clients={clients ?? []} reqCount={reqCount} latestMood={latestMood} />
    </div>
  );
}
