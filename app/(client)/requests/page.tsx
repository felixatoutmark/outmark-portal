import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";
import RequestForm from "./RequestForm";

export const dynamic = "force-dynamic";

export default async function Requests() {
  const u = await requireClient();
  const sb = await createClient();
  // Only show ideas the client has submitted from the simplified form.
  const { data: list } = await sb.from("requests").select("*")
    .eq("client_id", u.client_id!)
    .eq("category", "new_idea")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="section-title">Ideas</h1>
        <p className="text-[--muted]">A place to drop content ideas. We'll pick them up and bring them into production.</p>
      </header>
      <RequestForm />
      <section>
        <h2 className="font-bold text-[16px] mb-3">Your ideas</h2>
        {list?.length ? (
          <div className="space-y-2">
            {list.map((r) => (
              <div key={r.id} className="card p-4">
                <div className="flex items-center justify-end mb-2">
                  <span className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    r.status === "open" ? "bg-orange-100 text-[--orange]" :
                    r.status === "in_progress" ? "bg-blue-100 text-blue-800" :
                    r.status === "resolved" ? "bg-green-100 text-green-800" :
                    "bg-gray-100 text-[--muted]"
                  }`}>
                    {r.status === "in_progress" ? "in progress" :
                     r.status === "resolved" ? "completed" : r.status}
                  </span>
                </div>
                <p className="text-[14px] whitespace-pre-wrap">{r.message}</p>
                {Array.isArray(r.attachments) && r.attachments.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {r.attachments.map((a: any, i: number) => (
                      <li key={i} className="text-[12px] text-[--muted] flex items-center gap-2">
                        <span>📎</span>
                        <span className="truncate">{a.name}</span>
                        <span className="text-[--subtle]">({Math.round((a.size ?? 0) / 1024)} KB)</span>
                      </li>
                    ))}
                  </ul>
                )}
                {r.admin_response && (
                  <div className="mt-3 pt-3 border-t border-[--border]">
                    <div className="label-text mb-1">Felix replied</div>
                    <p className="text-[14px] whitespace-pre-wrap">{r.admin_response}</p>
                  </div>
                )}
                <div className="text-[11px] text-[--subtle] mt-2">{new Date(r.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>
        ) : <div className="card p-6 text-center text-[--muted]">No ideas yet — drop your first one above.</div>}
      </section>
    </div>
  );
}
