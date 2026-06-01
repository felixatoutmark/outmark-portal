"use client";
import { useState } from "react";

export default function InvitePage() {
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setLink(null);
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const body = Object.fromEntries(f.entries());
    if (body.monthly_fee) body.monthly_fee = Number(body.monthly_fee) as any;
    try {
      const r = await fetch("/api/admin/invite", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Failed");
      setLink(d.invite_link);
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6 max-w-[640px]">
      <header><h1 className="section-title">Invite a new client</h1>
        <p className="text-[--muted]">Creates the client record and emails them a setup link.</p></header>
      <form onSubmit={submit} className="card p-6 space-y-3">
        <Field label="Business name" name="business_name" required />
        <Field label="Primary contact name" name="primary_contact_name" />
        <Field label="Billing email" name="email" type="email" required />
        <Field label="Industry" name="industry" />
        <Field label="Plan name" name="plan_name" />
        <Field label="Monthly fee (CAD)" name="monthly_fee" type="number" />
        <button className="btn-primary" disabled={busy}>{busy ? "Sending…" : "Send invite"}</button>
      </form>
      {link && (
        <div className="card p-4 text-[13px]">
          <div className="font-semibold mb-1">Invite sent ✓</div>
          <div className="text-[--muted] break-all">Setup link: {link}</div>
        </div>
      )}
      {err && <div className="text-red-700 text-[13px]">{err}</div>}
    </div>
  );
}
function Field({ label, name, type = "text", required }: any) {
  return (
    <div>
      <label className="label-text mb-1 block">{label}</label>
      <input className="input" name={name} type={type} required={required} />
    </div>
  );
}
