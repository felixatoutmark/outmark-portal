"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

type Attachment = { path: string; name: string; size: number };

export default function RequestForm() {
  const sb = createClient();
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    setFiles((prev) => [...prev, ...list]);
    e.target.value = "";
  }
  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { data: { user } } = await sb.auth.getUser();
      const { data: me } = await sb.from("users").select("client_id").eq("id", user!.id).single();
      const clientId = me!.client_id;

      const attachments: Attachment[] = [];
      for (const f of files) {
        const safe = f.name.replace(/[^\w.\-]+/g, "_");
        const path = `clients/${clientId}/requests/${Date.now()}-${safe}`;
        const { error: upErr } = await sb.storage.from("client-files").upload(path, f, { upsert: false });
        if (upErr) throw upErr;
        attachments.push({ path, name: f.name, size: f.size });
      }

      const { error } = await sb.from("requests").insert({
        category: "new_idea", message, client_id: clientId, attachments,
      });
      if (error) throw error;

      void fetch("/api/requests/notify-admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: "new_idea", message, attachments: attachments.length }),
      });
      setDone(true); setMessage(""); setFiles([]);
      setTimeout(() => { setDone(false); window.location.reload(); }, 1200);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="card p-6 space-y-3">
      <div>
        <label className="label-text mb-1 block">Your idea</label>
        <textarea
          className="textarea"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="What should we make? A topic, a hook, something a customer asked you, a competitor reel you want a take on — anything goes."
          required
        />
      </div>
      <div>
        <label className="label-text mb-1 block">Attachments (optional)</label>
        <input type="file" multiple onChange={pickFiles} className="text-[13px]" />
        {files.length > 0 && (
          <ul className="mt-2 space-y-1">
            {files.map((f, i) => (
              <li key={i} className="flex items-center justify-between text-[13px] bg-[--warm] rounded-md px-3 py-1.5">
                <span className="truncate">{f.name} <span className="text-[--muted]">({Math.round(f.size / 1024)} KB)</span></span>
                <button type="button" className="text-[12px] text-[--muted] hover:text-[--orange]" onClick={() => removeFile(i)}>Remove</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && <p className="text-[13px] text-red-600">{error}</p>}
      <button className="btn-primary" disabled={busy || !message.trim()}>
        {done ? "Sent ✓" : busy ? "…" : "Submit idea"}
      </button>
    </form>
  );
}
