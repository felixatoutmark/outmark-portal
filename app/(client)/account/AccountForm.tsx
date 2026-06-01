"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function AccountForm({ user }: { user: any }) {
  const sb = createClient();
  const [fullName, setFullName] = useState(user.full_name || "");
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null); setBusy(true);
    try {
      await sb.from("users").update({ full_name: fullName }).eq("id", user.id);
      setMsg({ kind: "ok", text: "Profile saved." });
    } finally { setBusy(false); }
  }
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (pw.length < 8) return setMsg({ kind: "err", text: "Min 8 characters." });
    if (pw !== pw2)    return setMsg({ kind: "err", text: "Passwords don't match." });
    setBusy(true);
    try {
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) throw error;
      setMsg({ kind: "ok", text: "Password updated." });
      setPw(""); setPw2("");
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
    finally { setBusy(false); }
  }
  async function downloadAll() {
    const r = await fetch("/api/account/export");
    const blob = await r.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `outmark-data-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
  }

  return (
    <>
      <form onSubmit={saveProfile} className="card p-6 space-y-3">
        <h2 className="font-bold">Profile</h2>
        <div><label className="label-text mb-1 block">Email</label>
          <input className="input" value={user.email} disabled /></div>
        <div><label className="label-text mb-1 block">Full name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
        <button className="btn-primary" disabled={busy}>Save profile</button>
      </form>

      <form onSubmit={changePassword} className="card p-6 space-y-3">
        <h2 className="font-bold">Change password</h2>
        <div><label className="label-text mb-1 block">New password</label>
          <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div><label className="label-text mb-1 block">Confirm</label>
          <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        <button className="btn-primary" disabled={busy}>Update password</button>
      </form>

      <div className="card p-6">
        <h2 className="font-bold mb-2">Download all my data</h2>
        <p className="text-[14px] text-[--muted] mb-3">Exports everything we hold for your account as a JSON file. Independent of how the UI currently renders it.</p>
        <button onClick={downloadAll} className="btn-ghost">Download JSON</button>
      </div>

      {msg && <p className={`text-sm ${msg.kind === "ok" ? "text-green-700" : "text-red-700"}`}>{msg.text}</p>}
    </>
  );
}
