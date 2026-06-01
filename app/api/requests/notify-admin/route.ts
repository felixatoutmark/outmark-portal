import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { sendEmail, adminNotificationEmail, escapeHtml } from "@/lib/email";

export async function POST(req: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const body = await req.json();
  const { data: me } = await sb.from("users").select("client_id, email").eq("id", user.id).single();
  if (!me?.client_id) return NextResponse.json({ ok: false }, { status: 400 });
  const svc = createServiceClient();
  const { data: client } = await svc.from("clients").select("business_name").eq("id", me.client_id).single();
  if (process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
    await sendEmail({
      to: process.env.NEXT_PUBLIC_ADMIN_EMAIL,
      ...adminNotificationEmail({
        subject: `New request from ${client?.business_name ?? "client"} (${String(body.category ?? "").slice(0, 50)})`,
        body: `${escapeHtml(me.email)}: ${escapeHtml(String(body.message ?? ""))}<br><br><a href="${process.env.NEXT_PUBLIC_APP_URL}/admin/clients/${me.client_id}">View client</a>`,
      }),
    });
  }
  return NextResponse.json({ ok: true });
}
