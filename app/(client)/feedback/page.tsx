import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";
import FeedbackForm from "./FeedbackForm";
import { MOOD_EMOJI, MOOD_LABEL } from "./moods";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const u = await requireClient();
  const sb = await createClient();
  const { data: list } = await sb.from("feedback").select("*")
    .eq("client_id", u.client_id!)
    .order("created_at", { ascending: false });

  const withMood = (list ?? []).filter((f: any) => f.mood_score != null);
  const avg = withMood.length
    ? withMood.reduce((s: number, f: any) => s + f.mood_score, 0) / withMood.length
    : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="section-title">Feedback</h1>
        <p className="text-[--muted]">
          How are you feeling about the work? Drop a quick mood check or a note —
          Felix sees everything you submit.
        </p>
      </header>

      {avg != null && (
        <div className="card p-4 flex items-center gap-3">
          <span className="text-[28px]">{MOOD_EMOJI[Math.round(avg) as 1|2|3|4|5]}</span>
          <div>
            <div className="text-[14px] font-semibold">Your average mood</div>
            <div className="text-[12px] text-[--muted]">
              {avg.toFixed(1)} / 5 across {withMood.length} check-in{withMood.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      )}

      <FeedbackForm />

      <section>
        <h2 className="font-bold text-[16px] mb-3">Past feedback</h2>
        {list?.length ? (
          <div className="space-y-2">
            {list.map((f: any) => (
              <div key={f.id} className="card p-4">
                <div className="flex items-center gap-2 mb-1">
                  {f.mood_score != null && (
                    <>
                      <span className="text-[22px]">{MOOD_EMOJI[f.mood_score as 1|2|3|4|5]}</span>
                      <span className="text-[12px] text-[--muted]">{MOOD_LABEL[f.mood_score as 1|2|3|4|5]}</span>
                    </>
                  )}
                  <span className="text-[11px] text-[--subtle] ml-auto">
                    {new Date(f.created_at).toLocaleString("en-US")}
                  </span>
                </div>
                {f.message && <p className="text-[14px] whitespace-pre-wrap">{f.message}</p>}
              </div>
            ))}
          </div>
        ) : (
          <div className="card p-6 text-center text-[--muted]">
            No feedback yet — share a quick mood or note above.
          </div>
        )}
      </section>
    </div>
  );
}
