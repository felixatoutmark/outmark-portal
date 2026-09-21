// Admin endpoint for the Meta integration:
//   GET  ?action=assets            → IG accounts + ad accounts visible to the Business Manager
//   POST { action: "save", ... }   → upsert a client's connection
//   POST { action: "sync", client_id } → run the sync for that client now (previous + current month)
//   POST { action: "sync_month", client_id, month: "YYYY-MM", parts, force } → sync ONE month on demand;
//        force = resume sync on a manually-overridden month (replaces the manual numbers)
//   POST { action: "disconnect", client_id }
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { listBusinessAssets, whoAmI } from "@/lib/meta";
import { syncClient, syncClientMonth, type MetaConnection } from "@/lib/meta-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireAdminSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return { supabase, error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  return { supabase, error: null };
}

const envStatus = () => ({
  token: !!process.env.META_SYSTEM_USER_TOKEN,
  business: !!process.env.META_BUSINESS_ID,
  cron: !!process.env.CRON_SECRET,
});

export async function GET(req: NextRequest) {
  const { error } = await requireAdminSession();
  if (error) return error;
  if (req.nextUrl.searchParams.get("action") !== "assets") {
    return NextResponse.json({ success: false, error: "unknown action" }, { status: 400 });
  }
  const env = envStatus();
  if (!env.token || !env.business) {
    return NextResponse.json({ success: false, env, error: "META_SYSTEM_USER_TOKEN and META_BUSINESS_ID must be set in Vercel → Settings → Environment Variables" }, { status: 400 });
  }
  try {
    const [me, assets] = await Promise.all([whoAmI(), listBusinessAssets(process.env.META_BUSINESS_ID!)]);
    return NextResponse.json({ success: true, env, me, ...assets });
  } catch (e: any) {
    return NextResponse.json({ success: false, env, error: e?.message ?? String(e) }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireAdminSession();
  if (error) return error;
  const body = await req.json().catch(() => ({}));
  const clientId = String(body.client_id ?? "").trim();
  if (!clientId) return NextResponse.json({ success: false, error: "client_id required" }, { status: 400 });

  if (body.action === "save") {
    const igUserId = String(body.ig_user_id ?? "").trim();
    if (!/^\d{5,}$/.test(igUserId)) return NextResponse.json({ success: false, error: "Instagram account id must be numeric" }, { status: 400 });
    const adAccountId = String(body.ad_account_id ?? "").replace(/^act_/, "").trim();
    if (adAccountId && !/^\d{5,}$/.test(adAccountId)) return NextResponse.json({ success: false, error: "Ad account id must be numeric" }, { status: 400 });
    const { data, error: dbErr } = await supabase.from("meta_connections").upsert(
      {
        client_id: clientId,
        ig_user_id: igUserId,
        ig_username: String(body.ig_username ?? "").trim() || null,
        page_id: String(body.page_id ?? "").trim() || null,
        ad_account_id: adAccountId || null,
        sync_enabled: body.sync_enabled !== false,
      },
      { onConflict: "client_id" },
    ).select().single();
    if (dbErr) return NextResponse.json({ success: false, error: dbErr.message }, { status: 500 });
    return NextResponse.json({ success: true, connection: data });
  }

  if (body.action === "disconnect") {
    const { error: dbErr } = await supabase.from("meta_connections").delete().eq("client_id", clientId);
    if (dbErr) return NextResponse.json({ success: false, error: dbErr.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (body.action === "sync") {
    const env = envStatus();
    if (!env.token) return NextResponse.json({ success: false, env, error: "META_SYSTEM_USER_TOKEN is not set" }, { status: 400 });
    const { data: conn } = await supabase.from("meta_connections").select("*").eq("client_id", clientId).maybeSingle();
    if (!conn) return NextResponse.json({ success: false, error: "No Meta connection saved for this client yet" }, { status: 404 });
    try {
      const summaries = await syncClient(conn as MetaConnection, { backfill: 8, deadline: Date.now() + 40_000 });
      return NextResponse.json({ success: true, summaries });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e?.message ?? String(e) }, { status: 502 });
    }
  }

  if (body.action === "sync_month") {
    const env = envStatus();
    if (!env.token) return NextResponse.json({ success: false, env, error: "META_SYSTEM_USER_TOKEN is not set" }, { status: 400 });
    const month = String(body.month ?? "").trim();
    // +14 h grace: the admin's local month can run ahead of UTC.
    const keyOf = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const now = new Date();
    const latest = keyOf(new Date(now.getTime() + 14 * 3600 * 1000));
    const oldest = keyOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 47, 1)));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ success: false, error: "month must be YYYY-MM" }, { status: 400 });
    if (month > latest) return NextResponse.json({ success: false, error: "That month hasn't started yet" }, { status: 400 });
    if (month < oldest) return NextResponse.json({ success: false, error: "That month is too far back" }, { status: 400 });
    const parts = ["metrics", "reels", "all"].includes(body.parts) ? body.parts : "all";
    const force = body.force === true;
    const { data: conn } = await supabase.from("meta_connections").select("*").eq("client_id", clientId).maybeSingle();
    if (!conn) return NextResponse.json({ success: false, error: "No Meta connection saved for this client yet" }, { status: 404 });
    try {
      const summary = await syncClientMonth(conn as MetaConnection, `${month}-01`, {
        parts, forceMetrics: force && parts !== "reels", forceReels: force && parts !== "metrics",
      });
      return NextResponse.json({ success: true, summary });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e?.message ?? String(e) }, { status: 502 });
    }
  }

  return NextResponse.json({ success: false, error: "unknown action" }, { status: 400 });
}
