import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { sendEmail, adminNotificationEmail } from "@/lib/email";

export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const { data: me } = await sb.from("users").select("client_id").eq("id", user.id).single();
  if (!me?.client_id) return NextResponse.json({ ok: false }, { status: 400 });

  const svc = createServiceClient();
  await svc.from("clients").update({
    onboarding_completed_at: new Date().toISOString(),
    status: "active",
  }).eq("id", me.client_id);

  const { data: client } = await svc.from("clients").select("business_name").eq("id", me.client_id).single();
  if (process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    await sendEmail({
      to: process.env.NEXT_PUBLIC_ADMIN_EMAIL,
      ...adminNotificationEmail({
        subject: `Onboarding complete — ${client?.business_name}`,
        body: `${client?.business_name} just finished onboarding. Status set to active.`,
      }),
    });
  }
  await svc.from("activity_log").insert({
    client_id: me.client_id, actor_id: user.id,
    event_type: "onboarding_completed", description: "All onboarding steps completed.",
  });
  return NextResponse.json({ ok: true });
}
