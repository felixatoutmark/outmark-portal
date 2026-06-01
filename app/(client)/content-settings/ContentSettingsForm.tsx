"use client";
import { useEffect, useRef, useState } from "react";
import Cal, { getCalApi } from "@calcom/embed-react";
import { createClient } from "@/lib/supabase-browser";

export default function ContentSettingsForm({ clientId, prefs, filming }: any) {
  const sb = createClient();
  const [p, setP] = useState<any>(prefs ?? { client_id: clientId });
  const [f, setF] = useState<any>(filming ?? { client_id: clientId });
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (dRef.current) clearTimeout(dRef.current);
    dRef.current = setTimeout(async () => {
      await Promise.all([
        sb.from("content_preferences").upsert({ ...p, client_id: clientId }, { onConflict: "client_id" }),
        sb.from("filming_logistics").upsert({ ...f, client_id: clientId }, { onConflict: "client_id" }),
      ]);
      setSavedAt(new Date().toLocaleTimeString());
      void fetch("/api/content-settings/notify-admin", { method: "POST" }).catch(() => {});
    }, 800);
    return () => { if (dRef.current) clearTimeout(dRef.current); };
    // eslint-disable-next-line
  }, [p, f]);

  useEffect(() => { (async () => {
    const cal = await getCalApi();
    cal("ui", { theme: "light", styles: { branding: { brandColor: "#FF4F00" } } });
  })(); }, []);

  return (
    <div className="space-y-8">
      <header><h1 className="section-title">Content settings</h1>
        <p className="text-[--muted]">{savedAt ? `Saved at ${savedAt}` : "Auto-saves as you edit. Felix is notified of changes."}</p>
      </header>

      <section className="card p-6 space-y-4">
        <h2 className="font-bold">Content preferences</h2>
        <div>
          <label className="label-text mb-1 block">Dream customers</label>
          <textarea
            className="textarea"
            rows={5}
            value={p.dream_customers ?? ""}
            onChange={(e) => setP({ ...p, dream_customers: e.target.value })}
            placeholder="Who are they? Interests beyond security systems, hobbies, lifestyle, what they watch, where they hang out online — the more specific the better."
          />
        </div>
        <div>
          <label className="label-text mb-1 block">Topics to avoid</label>
          <textarea
            className="textarea"
            rows={4}
            value={p.topics_to_avoid ?? ""}
            onChange={(e) => setP({ ...p, topics_to_avoid: e.target.value })}
            placeholder="One per line — topic — reasoning (optional)"
          />
        </div>
        <div>
          <label className="label-text mb-1 block">Compliance / legal notes</label>
          <textarea className="textarea" rows={3} value={p.compliance_notes ?? ""} onChange={(e) => setP({ ...p, compliance_notes: e.target.value })} />
        </div>
        <div>
          <label className="label-text mb-1 block">Approval mode (Conversion Content)</label>
          <select className="select" value={p.approval_mode ?? ""} onChange={(e) => setP({ ...p, approval_mode: e.target.value })}>
            <option value="">— select —</option>
            <option value="auto">Auto (no approval needed)</option>
            <option value="manual">Manual (must approve every post)</option>
            <option value="none">No posting (production only)</option>
          </select>
        </div>
      </section>

      <section className="card p-6 space-y-4">
        <h2 className="font-bold">Key production contact</h2>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label-text mb-1 block">Name</label>
            <input className="input" value={f.key_contact_name ?? ""} onChange={(e) => setF({ ...f, key_contact_name: e.target.value })} /></div>
          <div><label className="label-text mb-1 block">Phone</label>
            <input className="input" value={f.key_contact_phone ?? ""} onChange={(e) => setF({ ...f, key_contact_phone: e.target.value })} /></div>
        </div>
      </section>

      <section className="card p-6">
        <h2 className="font-bold mb-2">Book another shoot day</h2>
        <p className="text-[14px] text-[--muted] mb-3">Pick a slot that works — we'll confirm by email.</p>
        <div className="rounded-card overflow-hidden border border-[--border]">
          <Cal calLink={process.env.NEXT_PUBLIC_CAL_LINK || "outmark/shoot-day"}
            style={{ width: "100%", height: 600, overflow: "scroll" }} />
        </div>
      </section>
    </div>
  );
}
