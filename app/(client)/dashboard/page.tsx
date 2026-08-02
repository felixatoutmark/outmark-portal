import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { requireClient } from "@/lib/auth";
import GoalCard, { parseLocalDate } from "@/components/GoalCard";
import MonthPicker from "./MonthPicker";

export const dynamic = "force-dynamic";

function pad(n: number) { return String(n).padStart(2, "0"); }
function monthKey(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`; }
function monthEnd(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`;
}
function shiftMonth(iso: string, delta: number) {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + delta);
  return monthKey(d);
}
function monthLabel(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const u = await requireClient();
  const sb = await createClient();
  const { data: client } = await sb.from("clients").select("*").eq("id", u.client_id!).single();

  if (!client?.onboarding_completed_at) redirect("/onboarding");

  // Resolve selected month (default = current real month)
  const sp = await searchParams;
  const selectedMonth = /^\d{4}-\d{2}-01$/.test(sp.month ?? "") ? sp.month! : monthKey();
  const mStart = selectedMonth;
  const mEnd = monthEnd(selectedMonth);
  const prevMonth = shiftMonth(selectedMonth, -1);
  const prevStart = prevMonth;
  const prevEnd = monthEnd(prevMonth);

  // Metrics for the selected month (any row whose period_end falls in the month)
  const { data: curMetrics } = await sb
    .from("dashboard_metrics")
    .select("*")
    .eq("client_id", u.client_id!)
    .gte("period_end", mStart).lte("period_end", mEnd)
    .order("period_end", { ascending: false }).limit(1);
  const cur = curMetrics?.[0];

  // Previous month's metrics for delta comparison
  const { data: prevMetrics } = await sb
    .from("dashboard_metrics")
    .select("*")
    .eq("client_id", u.client_id!)
    .gte("period_end", prevStart).lte("period_end", prevEnd)
    .order("period_end", { ascending: false }).limit(1);
  const prev = prevMetrics?.[0];

  // Deliverables for the selected month
  const { data: deliverables } = await sb.from("deliverables")
    .select("*").eq("client_id", u.client_id!)
    .gte("period_end", mStart).lte("period_end", mEnd)
    .order("period_end", { ascending: false });

  // Goal for the selected month
  const { data: monthGoal } = await sb.from("monthly_goals")
    .select("*").eq("client_id", u.client_id!).eq("month", selectedMonth).maybeSingle();

  // Hours for the selected month
  const { data: monthHours } = await sb.from("monthly_hours")
    .select("*").eq("client_id", u.client_id!).eq("month", selectedMonth).maybeSingle();

  // Top 3 winning reels + top performing ad for the selected month
  const { data: winning } = await sb.from("winning_content")
    .select("*").eq("client_id", u.client_id!).eq("month", selectedMonth)
    .order("position", { ascending: true });
  const { data: topAd } = await sb.from("top_ad")
    .select("*").eq("client_id", u.client_id!).eq("month", selectedMonth).maybeSingle();

  const hasMetrics = !!cur;
  const hasPaidSpend = hasMetrics && Number(cur?.paid_spend ?? 0) > 0;

  // Hours computed values
  const hoursDelivered = Number(monthHours?.hours_delivered ?? 0);
  const hoursTarget = Number(monthHours?.hours_target ?? 12);
  const hoursPct = hoursTarget > 0 ? (hoursDelivered / hoursTarget) * 100 : 0;
  const hoursOver = hoursPct > 100;

  // Last updated label
  const updatedCandidates: (string | null | undefined)[] = [
    client?.updated_at, cur?.updated_at, monthHours?.updated_at, monthGoal?.updated_at,
    ...(deliverables ?? []).map((d) => d.updated_at),
    ...(winning ?? []).map((w) => w.updated_at),
    topAd?.updated_at,
  ];
  const lastUpdated = updatedCandidates
    .filter((v): v is string => !!v)
    .map((v) => new Date(v).getTime())
    .reduce((m, t) => Math.max(m, t), 0);
  const lastUpdatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;


  return (
    <div className="space-y-10">
      <header>
        <h1 className="section-title">{client?.business_name}</h1>
        <p className="text-[--muted]">
          Showing <MonthPicker selected={selectedMonth} />
          {lastUpdatedLabel && (
            <span className="block text-[12px] text-[--subtle] mt-1">Last updated by Outmark · {lastUpdatedLabel}</span>
          )}
        </p>
      </header>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* SECTION 1: GOALS & TARGETS                                   */}
      {/* ──────────────────────────────────────────────────────────── */}
      <section className="space-y-5">
        <SectionHeader title="Goals & targets" subtitle="What we're shooting for and how the numbers are tracking." />

        {monthGoal ? (
          <GoalCard goal={monthGoal} monthLabel={parseLocalDate(monthGoal.month).toLocaleDateString(undefined, { month: "long", year: "numeric" })} />
        ) : (
          <Empty body={`No goal set for ${monthLabel(selectedMonth)}.`} />
        )}

        {hasMetrics ? (
          <>
            <SubHeader>Organic reach</SubHeader>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Organic reach"   value={cur.organic_reach}    prev={prev?.organic_reach} />
              <Stat label="Profile visits"  value={cur.profile_visits}   prev={prev?.profile_visits} />
              <Stat label="Website clicks"  value={cur.website_clicks}   prev={prev?.website_clicks} />
              <Stat label="Followers gained" value={cur.followers_gained} prev={prev?.followers_gained} />
            </div>

            <SubHeader>Paid ads</SubHeader>
            {hasPaidSpend ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Paid reach"  value={cur.paid_reach}  prev={prev?.paid_reach} />
                <Stat label="Spend"       value={`$${Number(cur.paid_spend).toLocaleString()}`} />
                <Stat label="ROAS"        value={cur.roas != null ? `${Number(cur.roas).toFixed(1)}x` : "—"} />
              </div>
            ) : (
              <Empty body="No paid spend this month." />
            )}
          </>
        ) : (
          <Empty title="No metrics for this month" body={`Nothing logged yet for ${monthLabel(selectedMonth)}.`} />
        )}
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* SECTION: TOP 3 WINNING REELS                                 */}
      {/* ──────────────────────────────────────────────────────────── */}
      <section className="space-y-5">
        <SectionHeader title="Top performing content" subtitle={`The winning reels and top ad for ${monthLabel(selectedMonth)}.`} />
        {winning?.length || topAd ? (
          <div className="flex flex-col lg:flex-row gap-5">
            {/* Reels — 3-up, compact */}
            <div className="lg:flex-[3] min-w-0 space-y-2">
              <SubHeader>Top 3 winning reels</SubHeader>
              {winning?.length ? (
                <div className="grid grid-cols-3 gap-3">
                  {winning.map((w) => (
                    <a key={w.id} href={w.url} target="_blank" rel="noopener noreferrer"
                      className="card overflow-hidden group block">
                      <div className="relative aspect-[4/5] bg-[--warm] overflow-hidden">
                        {w.thumbnail_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={w.thumbnail_url} alt={w.title ?? `Winning reel #${w.position}`}
                            referrerPolicy="no-referrer"
                            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center text-[32px] text-[--subtle]">▶</div>
                        )}
                        <span className="absolute top-1.5 left-1.5 bg-grad text-white text-[11px] font-bold px-1.5 py-0.5 rounded-full shadow">
                          #{w.position}
                        </span>
                        <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="bg-black/60 text-white rounded-full w-10 h-10 flex items-center justify-center text-[15px] pl-0.5">▶</span>
                        </span>
                      </div>
                      <div className="p-2.5">
                        <div className="font-semibold text-[13px] leading-snug truncate">{w.title ?? "Watch the reel"}</div>
                        {w.metric_label && <div className="text-[11px] text-[--muted] mt-0.5 truncate">{w.metric_label}</div>}
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="card p-5 text-center text-[13px] text-[--muted]">No reels logged this month.</div>
              )}
            </div>

            {/* Divider between reels and the ad */}
            <div className="hidden lg:block w-px self-stretch bg-[--border]" />
            <div className="lg:hidden h-px w-full bg-[--border]" />

            {/* Top performing ad — photo or video */}
            <div className="lg:flex-1 min-w-0 space-y-2 lg:max-w-[240px]">
              <SubHeader>Top performing ad</SubHeader>
              {topAd ? (
                <div className="card overflow-hidden max-w-[240px]">
                  <div className="relative aspect-[4/5] bg-black overflow-hidden">
                    {topAd.media_type === "video" ? (
                      <video src={topAd.media_url} controls playsInline preload="metadata"
                        className="absolute inset-0 w-full h-full object-cover" />
                    ) : (
                      <a href={topAd.media_url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={topAd.media_url} alt={topAd.title ?? "Top performing ad"}
                          className="absolute inset-0 w-full h-full object-cover" />
                      </a>
                    )}
                    <span className="absolute top-1.5 left-1.5 bg-black/70 text-white text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full">
                      Ad
                    </span>
                  </div>
                  <div className="p-2.5">
                    <div className="font-semibold text-[13px] leading-snug truncate">{topAd.title ?? "Top performing ad"}</div>
                    {topAd.metric_label && <div className="text-[11px] text-[--muted] mt-0.5 truncate">{topAd.metric_label}</div>}
                  </div>
                </div>
              ) : (
                <div className="card p-5 text-center text-[13px] text-[--muted]">No ad highlighted this month.</div>
              )}
            </div>
          </div>
        ) : (
          <Empty body={`No winning content logged for ${monthLabel(selectedMonth)}.`} />
        )}
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* SECTION 2: FULFILLMENT                                       */}
      {/* ──────────────────────────────────────────────────────────── */}
      <section className="space-y-5">
        <SectionHeader title="Fulfillment" subtitle="Hours delivered and contracted deliverables for the month." />

        {/* Hours (selected month) */}
        <SubHeader>Hours</SubHeader>
        <div className="card p-4 space-y-2">
          {monthHours ? (
            <>
              <div className="flex items-baseline justify-between">
                <span className="font-semibold text-[14px]">{hoursDelivered.toFixed(2)} hrs delivered</span>
                <span className={`text-[13px] ${hoursOver ? "text-green-700 font-semibold" : "text-[--muted]"}`}>
                  of {hoursTarget.toFixed(2)} target{hoursOver ? ` · +${(hoursDelivered - hoursTarget).toFixed(2)} over` : ""}
                </span>
              </div>
              <div className="h-2 bg-[--border] rounded-full overflow-hidden relative">
                <div className="h-full bg-grad" style={{ width: `${Math.min(100, hoursPct)}%` }} />
                {hoursOver && (
                  <div className="absolute top-0 left-0 h-full bg-green-500 opacity-70"
                    style={{ width: `${Math.min(100, ((hoursDelivered - hoursTarget) / hoursTarget) * 100)}%` }} />
                )}
              </div>
            </>
          ) : (
            <div className="text-[13px] text-[--muted]">No hours logged for {monthLabel(selectedMonth)}.</div>
          )}
          <div className="text-[11px] text-[--subtle]">Resets on the 1st of each month.</div>
        </div>

        {/* Monthly deliverables (selected month) */}
        <SubHeader>Monthly deliverables</SubHeader>
        {deliverables?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {deliverables.map((d) => {
              const pct = d.contracted_count ? Math.min(100, Math.round((d.delivered_count / d.contracted_count) * 100)) : 0;
              return (
                <div key={d.id} className="card p-4">
                  <div className="flex justify-between text-[13px] mb-2">
                    <span className="font-semibold">{labelForType(d.content_type)}</span>
                    <span className="text-[--muted]">{d.delivered_count}/{d.contracted_count}</span>
                  </div>
                  <div className="h-1.5 bg-[--border] rounded-full overflow-hidden">
                    <div className="h-full bg-grad" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[11px] text-[--subtle] mt-2">{formatDate(d.period_start)} – {formatDate(d.period_end)}</div>
                </div>
              );
            })}
          </div>
        ) : <Empty body={`No deliverables tracked for ${monthLabel(selectedMonth)}.`} />}

      </section>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="border-b border-[--border] pb-3">
      <h2 className="text-[22px] font-bold tracking-tight">{title}</h2>
      <p className="text-[13px] text-[--muted] mt-0.5">{subtitle}</p>
    </div>
  );
}
function SubHeader({ children }: { children: React.ReactNode }) {
  return <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[--muted] mt-2">{children}</h3>;
}
function Stat({ label, value, prev }: { label: string; value: any; prev?: any }) {
  const v = value == null ? "—" : typeof value === "number" ? value.toLocaleString() : value;
  let delta: string | null = null;
  if (typeof value === "number" && typeof prev === "number" && prev > 0) {
    const pct = Math.round(((value - prev) / prev) * 100);
    delta = (pct >= 0 ? "+" : "") + pct + "%";
  }
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wider text-[--muted] mb-1">{label}</div>
      <div className="text-2xl font-bold leading-none">{v}</div>
      {delta && <div className={`text-[11px] mt-1 ${delta.startsWith("-") ? "text-red-700" : "text-green-700"}`}>{delta} vs prior month</div>}
    </div>
  );
}
function Empty({ title, body }: { title?: string; body: string }) {
  return (
    <div className="card p-6 text-center">
      {title && <div className="font-semibold mb-1">{title}</div>}
      <div className="text-[--muted] text-[14px]">{body}</div>
    </div>
  );
}
function labelForType(t: string) {
  return ({ reach_reel: "Reach Reel", conversion_content: "Conversion", paid_ad: "Paid ad" } as any)[t] ?? t;
}
function formatDate(d: string) {
  const s = String(d ?? "");
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, day] = s.slice(0, 10).split("-").map(Number);
    return new Date(y, (m || 1) - 1, day || 1).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  }
  return new Date(s).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}
