"use client";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type Props = {
  client: any;
  openRequests: number;
  mood?: number;
  manage: boolean;
};

const MOOD_EMOJI: Record<number, string> = { 1: "😞", 2: "🙁", 3: "😐", 4: "🙂", 5: "😄" };

const STATUSES = ["onboarding", "active", "paused", "churned"] as const;

export default function ClientRow({ client, openRequests, mood, manage }: Props) {
  const sb = createClient();
  const [status, setStatus] = useState<string>(client.status);
  const [plan, setPlan] = useState<string>(client.plan_name ?? "");
  const [fee, setFee] = useState<string>(client.monthly_fee != null ? String(client.monthly_fee) : "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await sb.from("clients").update({
        status,
        plan_name: plan.trim() || null,
        monthly_fee: fee === "" ? null : Number(fee),
      }).eq("id", client.id);
      setEditing(false);
      // Soft refresh to pick up server-side counts.
      location.reload();
    } finally { setBusy(false); }
  }

  async function remove() {
    const ok = window.confirm(
      `Delete "${client.business_name}"?\n\nThis permanently removes the client and ALL their data ` +
      `(metrics, content, deliverables, requests, invoices, onboarding answers). Storage files are NOT auto-deleted. ` +
      `\n\nThis cannot be undone.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const { error } = await sb.from("clients").delete().eq("id", client.id);
      if (error) throw error;
      location.reload();
    } catch (err: any) {
      alert(err.message ?? "Delete failed");
    } finally { setBusy(false); }
  }

  return (
    <tr className="border-t border-[--border] align-top">
      <td className="px-4 py-3">
        <div className="font-semibold">{client.business_name}</div>
        <div className="text-[12px] text-[--muted]">{client.primary_contact_name ?? client.billing_email ?? "—"}</div>
      </td>
      <td className="px-4 py-3">
        {manage && editing ? (
          <select className="select !py-1 !text-[12px]" value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <StatusPill s={client.status} />
        )}
      </td>
      <td className="px-4 py-3">
        {manage && editing ? (
          <div className="flex items-center gap-1">
            <input className="input !py-1 !text-[12px] !w-24" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Plan" />
            <input className="input !py-1 !text-[12px] !w-20" type="number" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="Fee" />
          </div>
        ) : (
          <>
            {client.plan_name ?? "—"}
            {client.monthly_fee ? <span className="text-[--muted] text-[12px]"> · ${Number(client.monthly_fee).toLocaleString("en-US")}</span> : null}
          </>
        )}
      </td>
      <td className="px-4 py-3">
        {openRequests ? <span className="text-[--orange] font-semibold">{openRequests}</span> : <span className="text-[--subtle]">0</span>}
      </td>
      <td className="px-4 py-3">
        {mood ? <span className="text-[20px]" title={`Mood ${mood}/5`}>{MOOD_EMOJI[mood]}</span> : <span className="text-[--subtle]">—</span>}
      </td>
      <td className="px-4 py-3 text-[--muted]">{new Date(client.created_at).toLocaleDateString("en-US")}</td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-2 justify-end">
          {manage && editing && (
            <>
              <button disabled={busy} className="btn-primary !py-1 !text-[11px]" onClick={save}>{busy ? "…" : "Save"}</button>
              <button disabled={busy} className="btn-ghost !py-1 !text-[11px]" onClick={() => setEditing(false)}>Cancel</button>
            </>
          )}
          {manage && !editing && (
            <>
              <button className="btn-ghost !py-1 !text-[11px]" onClick={() => setEditing(true)}>Edit</button>
              <button
                disabled={busy}
                onClick={remove}
                className="text-[11px] px-2 py-1 rounded-pill border border-red-200 text-red-700 hover:bg-red-50"
              >
                Delete
              </button>
            </>
          )}
          {!manage && (
            <Link className="text-[--orange] font-medium text-[13px]" href={`/admin/clients/${client.id}`}>Open →</Link>
          )}
        </div>
      </td>
    </tr>
  );
}

function StatusPill({ s }: { s: string }) {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    onboarding: "bg-orange-100 text-[--orange]",
    paused: "bg-yellow-100 text-yellow-800",
    churned: "bg-gray-100 text-[--muted]",
  };
  return <span className={`text-[11px] uppercase tracking-wider px-2 py-0.5 rounded-full ${styles[s] || ""}`}>{s}</span>;
}
