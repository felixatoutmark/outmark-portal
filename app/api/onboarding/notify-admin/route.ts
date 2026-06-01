import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { sendEmail, adminNotificationEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json();

  const { data: me } = await sb.from("users").select("client_id, email").eq("id", user.id).single();
  if (!me?.client_id) return NextResponse.json({ ok: false }, { status: 400 });

  const svc = createServiceClient();
  const { data: client } = await svc.from("clients").select("business_name").eq("id", me.client_id).single();

  const adminEmail = process.env.NEXT_PUBLIC_ADMIN_EMAIL;
  if (adminEmail) {
    await sendEmail({
      to: adminEmail,
      ...adminNotificationEmail({
        subject: `Onboarding step ${body.step} done — ${client?.business_name ?? "client"}`,
        body: `${me.email} just completed step ${body.step} (${body.step_id}) for <strong>${client?.business_name}</strong>. View progress: ${process.env.NEXT_PUBLIC_APP_URL}/admin/clients/${me.client_id}`,
      }),
    });
  }
  await svc.from("activity_log").insert({
    client_id: me.client_id, actor_id: user.id,
    event_type: "onboarding_step_completed",
    description: `Step ${body.step} (${body.step_id})`,
  });
  return NextResponse.json({ ok: true });
}
