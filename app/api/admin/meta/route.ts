// Admin endpoint for the Meta integration:
//   GET  ?action=assets            → IG accounts + ad accounts visible to the Business Manager
//   POST { action: "save", ... }   → upsert a client's connection
//   POST { action: "sync", client_id } → run the sync for that client now (previous + current month)
//   POST { action: "sync_month", client_id, month: "YYYY-MM", parts, force } → sync ONE month on demand;
//        force = resume sync on a manually-overridden month (replaces the manual numbers)
//   POST { action: "disconnect", client_id }
//   GET  ?action=lead_events&client_id=…  → the ad account's action events (last 90 days) + current selection
//   POST { action: "save_lead_events", client_id, lead_action_types: [] } → which events count as a lead
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { listBusinessAssets, listAdActionEvents, whoAmI } from "@/lib/meta";
import { syncClient, syncClientMonth, type MetaConnection } from "@/lib/meta-sync";
import { normalizeLeadTypes, monthRange } from "@/lib/meta-util";

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
  const { supabase, error } = await requireAdminSession();
  if (error) return error;

  if (req.nextUrl.searchParams.get("action") === "lead_events") {
    if (!process.env.META_SYSTEM_USER_TOKEN) return NextResponse.json({ success: false, error: "META_SYSTEM_USER_TOKEN is not set" }, { status: 400 });
    const clientId = String(req.nextUrl.searchParams.get("client_id") ?? "").trim();
    const { data: conn, error: cErr } = await supabase.from("meta_connections").select("*").eq("client_id", clientId).maybeSingle();
    if (cErr) return NextResponse.json({ success: false, error: cErr.message }, { status: 500 });
    if (!conn?.ad_account_id) return NextResponse.json({ success: false, error: "Connect an ad account for this client first" }, { status: 400 });
    if (!Array.isArray(conn.lead_action_types)) return NextResponse.json({ success: false, error: "Run migration 0015_leads.sql in Supabase first" }, { status: 400 });
    try {
      const events = await listAdActionEvents(conn.ad_account_id, conn.lead_action_types);
      return NextResponse.json({ success: true, events, selected: conn.lead_action_types });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e?.message ?? String(e) }, { status: 502 });
    }
  }

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
    const row: Record<string, unknown> = {
      client_id: clientId,
      ig_user_id: igUserId,
      ig_username: String(body.ig_username ?? "").trim() || null,
      page_id: String(body.page_id ?? "").trim() || null,
      ad_account_id: adAccountId || null,
      sync_enabled: body.sync_enabled !== false,
    };
    // Custom-conversion ids belong to one ad account; carrying them over to a
    // different account would silently count 0 leads forever.
    const { data: before } = await supabase.from("meta_connections").select("*").eq("client_id", clientId).maybeSingle();
    if (before && Array.isArray(before.lead_action_types) && (before.ad_account_id ?? null) !== (adAccountId || null)) {
      const portable = before.lead_action_types.filter((t: string) => !/^offsite_conversion\.custom\./.test(t));
      if (portable.length !== before.lead_action_types.length) row.lead_action_types = portable.length ? portable : ["lead"];
    }
    const { data, error: dbErr } = await supabase.from("meta_connections").upsert(row, { onConflict: "client_id" }).select().single();
    if (dbErr) return NextResponse.json({ success: false, error: dbErr.message }, { status: 500 });
    return NextResponse.json({ success: true, connection: data });
  }

  if (body.action === "save_lead_events") {
    const raw = Array.isArray(body.lead_action_types) ? body.lead_action_types : null;
    if (!raw) return NextResponse.json({ success: false, error: "lead_action_types must be a list" }, { status: 400 });
    const asked = raw.map((t: unknown) => String(t).trim()).filter(Boolean) as string[];
    if (asked.length > 20 || asked.some((t) => !/^[A-Za-z0-9_.:]{1,120}$/.test(t))) {
      return NextResponse.json({ success: false, error: "Invalid event selection" }, { status: 400 });
    }
    // An aggregate and its parts would double count → parts are dropped server-side.
    const { types, dropped } = normalizeLeadTypes(asked);
    const { data: saved, error: dbErr } = await supabase.from("meta_connections")
      .update({ lead_action_types: types }).eq("client_id", clientId).select("*");
    if (dbErr) return NextResponse.json({ success: false, error: dbErr.message }, { status: 500 });
    const conn = saved?.[0] as MetaConnection | undefined;
    if (!conn) return NextResponse.json({ success: false, error: "No Meta connection saved for this client yet" }, { status: 404 });

    // Every Meta-synced month must now follow the new definition — otherwise old
    // and new counts would sit side by side and feed deltas / cost per lead.
    // Manual months are never touched.
    const { data: metaRows } = await supabase.from("dashboard_metrics")
      .select("period_end").eq("client_id", clientId).eq("source", "meta").order("period_end", { ascending: false });
    const months = [...new Set((metaRows ?? []).map((r) => `${String(r.period_end).slice(0, 7)}-01`))];
    const blank = async (month: string) => {
      const r = monthRange(month);
      await supabase.from("dashboard_metrics").update({ leads: null })
        .eq("client_id", clientId).eq("source", "meta").gte("period_end", r.start).lte("period_end", r.end);
    };
    let recounted = 0, blanked = 0;
    const canCount = types.length > 0 && !!conn.ad_account_id && !!process.env.META_SYSTEM_USER_TOKEN;
    const deadline = Date.now() + 40_000;
    for (const month of months) {
      let ok = false;
      if (canCount && Date.now() < deadline) {
        try {
          const s = await syncClientMonth(conn, month, { parts: "paid" });
          ok = s.metrics === "written" && s.paid === "written";
        } catch { ok = false; }
      }
      if (ok) recounted++; else { await blank(month); blanked++; }
    }
    return NextResponse.json({ success: true, lead_action_types: types, dropped, recounted, blanked });
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
