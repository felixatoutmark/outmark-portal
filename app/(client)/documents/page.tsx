import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";
import DownloadLink from "./DownloadLink";

export const dynamic = "force-dynamic";

const TYPE_ORDER = ["signed_contract","sow","addendum","brand_guidelines","monthly_recap","invoice","other"] as const;
const TYPE_LABEL: Record<string, string> = {
  signed_contract: "Signed Contract", sow: "Statement of Work", addendum: "Addendums",
  brand_guidelines: "Brand Guidelines", monthly_recap: "Monthly Recaps",
  invoice: "Invoices", other: "Other",
};

export default async function Documents() {
  const u = await requireClient();
  const sb = await createClient();
  const { data: docs } = await sb.from("documents").select("*")
    .eq("client_id", u.client_id!).order("uploaded_at", { ascending: false });

  const grouped: Record<string, any[]> = {};
  for (const d of docs ?? []) (grouped[d.type] ??= []).push(d);

  return (
    <div className="space-y-8">
      <header><h1 className="section-title">Documents</h1>
        <p className="text-[--muted]">All your contracts, recaps, and invoices in one place.</p></header>

      {(!docs || docs.length === 0) && (
        <div className="card p-6 text-center text-[--muted]">
          No documents yet. Your signed contract will appear here once executed.
        </div>
      )}

      {TYPE_ORDER.map((t) => {
        const list = grouped[t];
        if (!list?.length) return null;
        return (
          <section key={t}>
            <h2 className="font-bold text-[16px] mb-3">{TYPE_LABEL[t]}</h2>
            <div className="space-y-2">
              {list.map((d) => (
                <div key={d.id} className="card flex items-center justify-between p-4">
                  <div>
                    <div className="font-semibold">{d.filename}</div>
                    <div className="text-[12px] text-[--muted]">{new Date(d.uploaded_at).toLocaleDateString()}</div>
                  </div>
                  <DownloadLink path={d.file_url} filename={d.filename} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
