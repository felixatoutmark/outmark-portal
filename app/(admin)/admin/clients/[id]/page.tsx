import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";
import { notFound } from "next/navigation";
import AdminClientPanels from "./AdminClientPanels";

export const dynamic = "force-dynamic";

export default async function AdminClientDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const sb = await createClient();

  const [{ data: client }, metricsRes, contentRes, deliverablesRes, docsRes, reqsRes, notesRes, prefsRes, filmingRes, progressRes, goalsRes, feedbackRes, hoursRes] = await Promise.all([
    sb.from("clients").select("*").eq("id", id).single(),
    sb.from("dashboard_metrics").select("*").eq("client_id", id).order("period_end", { ascending: false }),
    sb.from("content_items").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    sb.from("deliverables").select("*").eq("client_id", id).order("period_end", { ascending: false }),
    sb.from("documents").select("*").eq("client_id", id).order("uploaded_at", { ascending: false }),
    sb.from("requests").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    sb.from("admin_notes").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    sb.from("content_preferences").select("*").eq("client_id", id).maybeSingle(),
    sb.from("filming_logistics").select("*").eq("client_id", id).maybeSingle(),
    sb.from("onboarding_progress").select("*").eq("client_id", id),
    sb.from("monthly_goals").select("*").eq("client_id", id).order("month", { ascending: false }),
    sb.from("feedback").select("*").eq("client_id", id).order("created_at", { ascending: false }),
    sb.from("monthly_hours").select("*").eq("client_id", id).order("month", { ascending: false }),
  ]);
  if (!client) notFound();

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-[13px] text-[--muted] hover:text-[--fg]">← All clients</Link>
      <header className="flex items-center justify-between">
        <div>
          <h1 className="section-title">{client.business_name}</h1>
          <p className="text-[--muted] text-[14px]">
            {client.status} · {client.plan_name ?? "no plan"} · {client.primary_contact_name ?? client.billing_email}
          </p>
        </div>
      </header>

      <AdminClientPanels
        client={client}
        metrics={metricsRes.data ?? []}
        content={contentRes.data ?? []}
        deliverables={deliverablesRes.data ?? []}
        documents={docsRes.data ?? []}
        requests={reqsRes.data ?? []}
        notes={notesRes.data ?? []}
        prefs={prefsRes.data ?? null}
        filming={filmingRes.data ?? null}
        progress={progressRes.data ?? []}
        goals={goalsRes.data ?? []}
        feedback={feedbackRes.data ?? []}
        hours={hoursRes.data ?? []}
      />
    </div>
  );
}
