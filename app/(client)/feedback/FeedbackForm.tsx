"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { MOOD_EMOJI, MOOD_LABEL } from "./moods";

const SCORES = [1, 2, 3, 4, 5] as const;
type Score = (typeof SCORES)[number];

export default function FeedbackForm() {
  const sb = createClient();
  const [mood, setMood] = useState<Score | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mood == null && !message.trim()) {
      setError("Pick a mood or leave a note (or both).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data: { user } } = await sb.auth.getUser();
      const { data: me } = await sb.from("users").select("client_id").eq("id", user!.id).single();
      const { error } = await sb.from("feedback").insert({
        client_id: me!.client_id,
        user_id: user!.id,
        mood_score: mood,
        message: message.trim() || null,
      });
      if (error) throw error;
      void fetch("/api/feedback/notify-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood, hasMessage: !!message.trim() }),
      });
      setDone(true);
      setMood(null);
      setMessage("");
      setTimeout(() => { setDone(false); window.location.reload(); }, 1200);
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card p-6 space-y-5">
      <div>
        <label className="label-text mb-2 block">How are you feeling about the work together?</label>
        <div className="flex items-center justify-between gap-2">
          {SCORES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setMood(s)}
              className={`flex-1 flex flex-col items-center gap-1 rounded-xl border px-2 py-3 transition-colors ${
                mood === s
                  ? "border-[--orange] bg-orange-50"
                  : "border-[--border] hover:border-[--orange]"
              }`}
              aria-pressed={mood === s}
              aria-label={MOOD_LABEL[s]}
            >
              <span className="text-[28px] leading-none">{MOOD_EMOJI[s]}</span>
              <span className="text-[11px] text-[--muted]">{MOOD_LABEL[s]}</span>
            </button>
          ))}
        </div>
        {mood != null && (
          <button
            type="button"
            onClick={() => setMood(null)}
            className="text-[11px] text-[--muted] hover:text-[--fg] mt-2"
          >
            Clear mood
          </button>
        )}
      </div>

      <div>
        <label className="label-text mb-1 block">Note (optional)</label>
        <textarea
          className="textarea"
          rows={4}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Anything you want to flag — what's working, what isn't, ideas for the partnership."
        />
      </div>

      {error && <p className="text-[13px] text-red-600">{error}</p>}
      <button className="btn-primary" disabled={busy || (mood == null && !message.trim())}>
        {done ? "Sent ✓" : busy ? "…" : "Send feedback"}
      </button>
    </form>
  );
}
