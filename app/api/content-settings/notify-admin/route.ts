import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { sendEmail, adminNotificationEmail } from "@/lib/email";

// Throttle: only email admin once per 10 minutes per client (to avoid spam during typing)
const COOLDOWN_MS = 10 * 60 * 1000;

export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { data: me } = await sb.from("users").select("client_id, email").eq("id", user.id).single();
  if (!me?.client_id) return NextResponse.json({ ok: false }, { status: 400 });

  const svc = createServiceClient();
  const { data: last } = await svc.from("activity_log")
    .select("created_at")
    .eq("client_id", me.client_id)
    .eq("event_type", "content_settings_changed")
    .order("created_at", { ascending: false })
    .limit(1).maybeSingle();
  const recent = last && (Date.now() - new Date(last.created_at).getTime() < COOLDOWN_MS);
  if (recent) return NextResponse.json({ ok: true, throttled: true });

  await svc.from("activity_log").insert({
    client_id: me.client_id, actor_id: user.id,
    event_type: "content_settings_changed", description: "Client edited content settings",
  });

  if (process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    const { data: client } = await svc.from("clients").select("business_name").eq("id", me.client_id).single();
    await sendEmail({
      to: process.env.NEXT_PUBLIC_ADMIN_EMAIL,
      ...adminNotificationEmail({
        subject: `${client?.business_name} updated content settings`,
        body: `${me.email} edited content preferences or filming logistics. ${process.env.NEXT_PUBLIC_APP_URL}/admin/clients/${me.client_id}`,
      }),
    });
  }
  return NextResponse.json({ ok: true });
}
