// Invite-acceptance page. Validates token via service-role on the server,
// then renders the password set form (a client component).
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase-server";
import AcceptInviteForm from "./AcceptInviteForm";

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const svc = createServiceClient();

  const { data: invite, error: invErr } = await svc
    .from("invitations")
    .select("id, email, expires_at, accepted_at, client_id")
    .eq("token", token)
    .maybeSingle();

  if (invErr) {
    console.error("invite lookup failed", invErr);
    return <Invalid reason="not-found" />;
  }
  if (!invite) return <Invalid reason="not-found" />;
  if (invite.accepted_at) return <Invalid reason="already-used" />;
  if (new Date(invite.expires_at).getTime() < Date.now()) return <Invalid reason="expired" />;

  // Look up the business name as a separate query (no PostgREST join inference)
  const { data: client } = await svc
    .from("clients")
    .select("business_name")
    .eq("id", invite.client_id)
    .maybeSingle();

  return (
    <div className="card p-8">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Welcome to Outmark</h1>
      <p className="text-sm text-[--muted] mb-6">
        Set a password to access your portal for{" "}
        <strong>{client?.business_name || "your account"}</strong>.
      </p>
      <AcceptInviteForm token={token} email={invite.email} />
    </div>
  );
}

function Invalid({ reason }: { reason: "not-found" | "already-used" | "expired" }) {
  const text =
    reason === "not-found" ? "This invite link isn't valid." :
    reason === "already-used" ? "This invite has already been used." :
    "This invite has expired. Ask Felix to send a new one.";
  return (
    <div className="card p-8">
      <h1 className="text-xl font-bold mb-2">Invite unavailable</h1>
      <p className="text-sm text-[--muted]">{text}</p>
    </div>
  );
}
