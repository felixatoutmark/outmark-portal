// Export everything we hold for the current client as JSON. Pulls from
// the structured tables — the format is independent of UI changes.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({}, { status: 401 });
  const { data: me } = await sb.from("users").select("client_id, role").eq("id", user.id).single();
  if (!me?.client_id) return NextResponse.json({}, { status: 400 });

  const cid = me.client_id;
  const grab = (table: string, q?: any) =>
    sb.from(table).select("*").eq("client_id", cid)
      .then(r => ({ [table]: r.data ?? [] }));

  const blocks = await Promise.all([
    sb.from("clients").select("*").eq("id", cid).then(r => ({ client: r.data?.[0] ?? null })),
    grab("onboarding_progress"),
    grab("content_preferences"),
    grab("filming_logistics"),
    grab("dashboard_metrics"),
    grab("content_items"),
    grab("deliverables"),
    grab("documents"),
    grab("requests"),
    grab("activity_log"),
  ]);
  const payload = Object.assign({ exported_at: new Date().toISOString() }, ...blocks);
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="outmark-export.json"`,
    },
  });
}
