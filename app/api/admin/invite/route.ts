// Admin endpoint: create client + invitation, email the link.
import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { sendEmail, inviteEmail } from "@/lib/email";
import crypto from "node:crypto";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const businessName = (body.business_name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  if (!businessName || !email) {
    return NextResponse.json({ success: false, error: "business_name and email required" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Create the client record
  const { data: client, error: cErr } = await svc.from("clients").insert({
    business_name: businessName,
    primary_contact_name: body.primary_contact_name || null,
    billing_email: email,
    industry: body.industry || null,
    monthly_fee: body.monthly_fee ?? null,
    plan_name: body.plan_name || null,
    status: "onboarding",
  }).select().single();
  if (cErr || !client) return NextResponse.json({ success: false, error: cErr?.message }, { status: 500 });

  // Void any prior pending invitations for this email so the old links can't
  // be clicked and report "already used" on a stale token.
  await svc.from("invitations")
    .update({ expires_at: new Date(0).toISOString() })
    .is("accepted_at", null)
    .eq("email", email);

  // Create the invitation token (7-day expiry)
  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await svc.from("invitations").insert({
    client_id: client.id, email, token, invited_by: user.id, expires_at: expires,
  });

  // Email it
  const link = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${token}`;
  await sendEmail({ to: email, ...inviteEmail({ businessName, link }) });

  // Activity log
  await svc.from("activity_log").insert({
    client_id: client.id, actor_id: user.id,
    event_type: "client_invited", description: `Invited ${email} to ${businessName}`,
  });

  return NextResponse.json({ success: true, client_id: client.id, invite_link: link });
}
