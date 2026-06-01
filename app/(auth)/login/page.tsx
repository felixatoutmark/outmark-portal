"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function LoginPageWrapper() {
  return <Suspense fallback={<div className="card p-8">Loading…</div>}><LoginPage /></Suspense>;
}

function LoginPage() {
  const supabase = createClient();
  const search = useSearchParams();
  const next = search.get("next") || "/";
  const [mode, setMode] = useState<"password" | "magic">("password");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      if (mode === "password") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = next;
      } else {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) throw error;
        setMsg({ kind: "ok", text: "Check your email for a sign-in link." });
      }
    } catch (e: any) {
      setMsg({ kind: "err", text: e.message || "Sign in failed." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-8">
      <h1 className="text-2xl font-bold tracking-tight mb-1">Sign in</h1>
      <p className="text-sm text-[--muted] mb-6">to your Outmark portal</p>

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="label-text mb-1 block">Email</label>
          <input className="input" type="email" autoFocus required value={email}
            onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode === "password" && (
          <div>
            <label className="label-text mb-1 block">Password</label>
            <input className="input" type="password" required value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}
        <button type="submit" disabled={busy} className="btn-primary w-full justify-center mt-2">
          {busy ? "…" : mode === "password" ? "Sign in" : "Email me a sign-in link"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => { setMode(mode === "password" ? "magic" : "password"); setMsg(null); }}
        className="text-[13px] text-[--muted] hover:text-[--fg] mt-4 block w-full text-center"
      >
        {mode === "password" ? "Use a magic link instead" : "Use a password instead"}
      </button>

      {msg && (
        <p className={`mt-4 text-sm ${msg.kind === "ok" ? "text-green-700" : "text-red-700"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}
