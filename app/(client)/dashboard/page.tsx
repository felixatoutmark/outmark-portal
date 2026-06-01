import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { requireClient } from "@/lib/auth";
import GoalCard, { parseLocalDate } from "@/components/GoalCard";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const u = await requireClient();
  const sb = await createClient();
  const { data: client } = await sb.from("clients").select("*").eq("id", u.client_id!).single();

  if (!client?.onboarding_completed_at) redirect("/onboarding");

  // Latest period metrics (for the Goals & Targets section)
  const { data: latestMetrics } = await sb
    .from("dashboard_metrics")
    .select("*")
    .eq("client_id", u.client_id!)
    .order("period_end", { ascending: false })
    .limit(2);
  const cur = latestMetrics?.[0];
  const prev = latestMetrics?.[1];

  // Pipeline (Fulfillment)
  const { data: pipeline } = await sb.from("content_items")
    .select("*").eq("client_id", u.client_id!).neq("status", "published")
    .order("created_at", { ascending: false });

  // Published content counts for fulfillment summary
  const { data: published } = await sb.from("content_items")
    .select("type").eq("client_id", u.client_id!).eq("status", "published");

  // Deliverables for the latest periods
  const { data: deliverables } = await sb.from("deliverables")
    .select("*").eq("client_id", u.client_id!)
    .order("period_end", { ascending: false }).limit(6);

  // This month's goal (if any)
  const _now = new Date();
  const _monthIso = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-01`;
  const { data: monthGoal } = await sb.from("monthly_goals")
    .select("*").eq("client_id", u.client_id!).eq("month", _monthIso).maybeSingle();

  // This month's hours delivered (resets on the 1st)
  const { data: monthHours } = await sb.from("monthly_hours")
    .select("*").eq("client_id", u.client_id!).eq("month", _monthIso).maybeSingle();

  const hasMetrics = !!cur;
  const hasPaidSpend = hasMetrics && Number(cur?.paid_spend ?? 0) > 0;

  // Last updated timestamp
  const updatedCandidates: (string | null | undefined)[] = [
    client?.updated_at, cur?.updated_at,
    ...(pipeline ?? []).map((p) => p.updated_at),
    ...(deliverables ?? []).map((d) => d.updated_at),
  ];
  const lastUpdated = updatedCandidates
    .filter((v): v is string => !!v)
    .map((v) => new Date(v).getTime())
    .reduce((m, t) => Math.max(m, t), 0);
  const lastUpdatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  // Fulfillment counts by type
  const publishedCounts: Record<string, number> = {};
  for (const r of published ?? []) publishedCounts[r.type] = (publishedCounts[r.type] || 0) + 1;
  const pipelineBuckets = (["in_production", "scheduled", "awaiting_approval"] as const).map((s) => ({
    status: s, items: (pipeline ?? []).filter((i) => i.status === s),
  }));

  return (
    <div className="space-y-12">
      <header>
        <h1 className="section-title">{client?.business_name}</h1>
        <p className="text-[--muted]">
          {hasMetrics
            ? `Showing ${formatDate(cur.period_start)} – ${formatDate(cur.period_end)}`
            : "Your dashboard will populate as soon as the first batch of content goes live."}
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

        {monthGoal && (
          <GoalCard goal={monthGoal} monthLabel={parseLocalDate(monthGoal.month).toLocaleDateString(undefined, { month: "long", year: "numeric" })} />
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
              <Empty body="No paid spend this period — switch on ads to start tracking ROAS." />
            )}
          </>
        ) : (
          <Empty title="No metrics yet" body="Your first monthly recap will appear here once we've gathered enough data." />
        )}
      </section>

      {/* ──────────────────────────────────────────────────────────── */}
      {/* SECTION 2: FULFILLMENT                                       */}
      {/* ──────────────────────────────────────────────────────────── */}
      <section className="space-y-5">
        <SectionHeader title="Fulfillment" subtitle="What's been produced, what's coming, and how the contract is tracking." />

        {/* Production snapshot */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Reels published"        value={publishedCounts.reach_reel ?? 0} />
          <Stat label="Conversion content"     value={publishedCounts.conversion_content ?? 0} />
          <Stat label="Paid ads"               value={publishedCounts.paid_ad ?? 0} />
          <Stat label="In progress"            value={pipeline?.length ?? 0} />
        </div>

        {/* Pipeline */}
        <SubHeader>Pipeline</SubHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {pipelineBuckets.map(({ status, items }) => (
            <div key={status} className="card p-4">
              <div className="flex items-baseline justify-between mb-2">
                <span className="label-text">{labelForStatus(status)}</span>
                <span className="text-[14px] font-bold">{items.length}</span>
              </div>
              <div className="space-y-1.5">
                {items.slice(0, 6).map((i) => (
                  <div key={i.id} className="text-[13px] flex items-center justify-between">
                    <span>{labelForType(i.type)}</span>
                    {i.posted_at && <span className="text-[--subtle] text-[11px]">{formatDate(i.posted_at)}</span>}
                  </div>
                ))}
                {!items.length && <div className="text-[12px] text-[--subtle]">Nothing here.</div>}
              </div>
            </div>
          ))}
        </div>

        {/* Monthly hours */}
        <SubHeader>Hours this month</SubHeader>
        {(() => {
          const delivered = Number(monthHours?.hours_delivered ?? 0);
          const target = Number(monthHours?.hours_target ?? 12);
          const pct = target > 0 ? (delivered / target) * 100 : 0;
          const over = pct > 100;
          const monthName = _now.toLocaleDateString("en-US", { month: "long", year: "numeric" });
          return (
            <div className="card p-4">
              <div className="flex items-baseline justify-between mb-2">
                <span className="font-semibold text-[14px]">{monthName}</span>
                <span className={`text-[13px] ${over ? "text-green-700 font-semibold" : "text-[--muted]"}`}>
                  {delivered.toFixed(2)} / {target.toFixed(2)} hrs
                  {over ? ` · +${(delivered - target).toFixed(2)} over` : ""}
                </span>
              </div>
              <div className="h-2 bg-[--border] rounded-full overflow-hidden relative">
                <div className="h-full bg-grad" style={{ width: `${Math.min(100, pct)}%` }} />
                {over && (
                  <div className="absolute top-0 left-0 h-full bg-green-500 opacity-70"
                    style={{ width: `${Math.min(100, ((delivered - target) / target) * 100)}%` }} />
                )}
              </div>
              <div className="text-[11px] text-[--subtle] mt-2">Resets on the 1st of each month.</div>
            </div>
          );
        })()}

        {/* Monthly deliverables */}
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
        ) : <Empty body="Deliverables tracker appears once your first month is set up." />}

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
      {delta && <div className={`text-[11px] mt-1 ${delta.startsWith("-") ? "text-red-700" : "text-green-700"}`}>{delta} vs prior</div>}
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
function labelForStatus(s: string) {
  return ({ in_production: "In production", scheduled: "Scheduled", awaiting_approval: "Awaiting approval" } as any)[s] ?? s;
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
