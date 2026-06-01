import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";
import DownloadLink from "../documents/DownloadLink";

export const dynamic = "force-dynamic";

export default async function Billing() {
  const u = await requireClient();
  const sb = await createClient();
  const { data: client } = await sb.from("clients").select("*").eq("id", u.client_id!).single();
  const { data: invoices } = await sb.from("documents")
    .select("*").eq("client_id", u.client_id!).eq("type", "invoice")
    .order("uploaded_at", { ascending: false });

  return (
    <div className="space-y-8">
      <header><h1 className="section-title">Billing</h1>
        <p className="text-[--muted]">Plan, invoices, and payment history.</p></header>

      <section className="card p-6">
        <h2 className="font-bold mb-3">Current plan</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-[14px]">
          <Cell label="Plan"        value={client?.plan_name ?? "—"} />
          <Cell label="Monthly fee" value={client?.monthly_fee != null ? `$${Number(client.monthly_fee).toLocaleString()}` : "—"} />
          <Cell label="Status"      value={client?.status ?? "—"} />
        </div>
      </section>

      <section>
        <h2 className="font-bold text-[16px] mb-3">Invoice history</h2>
        {invoices?.length ? (
          <div className="space-y-2">
            {invoices.map((d) => (
              <div key={d.id} className="card flex items-center justify-between p-4">
                <div>
                  <div className="font-semibold">{d.filename}</div>
                  <div className="text-[12px] text-[--muted]">{new Date(d.uploaded_at).toLocaleDateString()}</div>
                </div>
                <DownloadLink path={d.file_url} filename={d.filename} />
              </div>
            ))}
          </div>
        ) : (
          <div className="card p-6 text-center text-[--muted]">No invoices yet.</div>
        )}
      </section>

      <p className="text-[12px] text-[--muted]">
        Billing is handled manually by e-transfer or invoice. Questions? Submit a billing request from the Requests page.
      </p>
    </div>
  );
}
function Cell({ label, value }: { label: string; value: string }) {
  return <div><div className="label-text mb-1">{label}</div><div>{value}</div></div>;
}
