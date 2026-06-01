"use client";
import { useState } from "react";

export default function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) return setErr("Password must be at least 8 characters.");
    if (pw !== pw2) return setErr("Passwords don't match.");
    setBusy(true);
    try {
      const r = await fetch("/api/invite/accept", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: pw }),
      });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || "Failed");
      window.location.href = "/dashboard";
    } catch (e: any) {
      setErr(e.message);
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <label className="label-text mb-1 block">Email</label>
        <input className="input" value={email} readOnly disabled />
      </div>
      <div>
        <label className="label-text mb-1 block">Set a password</label>
        <input className="input" type="password" required minLength={8}
          value={pw} onChange={(e) => setPw(e.target.value)} />
      </div>
      <div>
        <label className="label-text mb-1 block">Confirm password</label>
        <input className="input" type="password" required minLength={8}
          value={pw2} onChange={(e) => setPw2(e.target.value)} />
      </div>
      <button className="btn-primary w-full justify-center mt-2" disabled={busy}>
        {busy ? "…" : "Create my account"}
      </button>
      {err && <p className="text-sm text-red-700">{err}</p>}
    </form>
  );
}
