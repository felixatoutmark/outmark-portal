// Accepts an invite: creates the auth user (or signs them in), inserts the
// public.users row with role='client', marks the invite consumed, and returns
// a session via the password sign-in flow.
import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient, createClient } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  try {
    const { token, password } = await req.json();
    if (!token || !password || password.length < 8) {
      return NextResponse.json({ success: false, error: "Invalid input" }, { status: 400 });
    }

    const svc = createServiceClient();
    const { data: invite } = await svc
      .from("invitations").select("*").eq("token", token).single();
    if (!invite) return NextResponse.json({ success: false, error: "Invalid token" }, { status: 404 });
    if (invite.accepted_at) return NextResponse.json({ success: false, error: "Already used" }, { status: 410 });
    if (new Date(invite.expires_at).getTime() < Date.now())
      return NextResponse.json({ success: false, error: "Expired" }, { status: 410 });

    // Create auth user (or update password if they already exist somehow)
    const { data: created, error: createErr } = await svc.auth.admin.createUser({
      email: invite.email,
      password,
      email_confirm: true,
    });
    let authUserId = created?.user?.id;
    if (createErr && createErr.message?.toLowerCase().includes("already")) {
      const { data: list } = await svc.auth.admin.listUsers();
      authUserId = list?.users?.find((u) => u.email === invite.email)?.id;
      if (authUserId) await svc.auth.admin.updateUserById(authUserId, { password });
    }
    if (!authUserId) {
      return NextResponse.json({ success: false, error: createErr?.message || "Account create failed" }, { status: 500 });
    }

    // Insert public.users row
    await svc.from("users").upsert({
      id: authUserId, role: "client", client_id: invite.client_id, email: invite.email,
    }, { onConflict: "id" });

    // Mark invite consumed
    await svc.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);

    // Activity log
    await svc.from("activity_log").insert({
      client_id: invite.client_id, actor_id: authUserId,
      event_type: "invite_accepted", description: `Invite accepted by ${invite.email}`,
    });

    // Sign them in immediately by setting a session
    const supabase = await createClient();
    await supabase.auth.signInWithPassword({ email: invite.email, password });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message || "Server error" }, { status: 500 });
  }
}
