// Meta → portal sync. For one client and one calendar month:
//   • account insights → dashboard_metrics (organic reach, followers gained)
//   • ad-account insights → the same row's paid_reach / paid_spend / roas
//   • the month's reels ranked by views → winning_content #1–#3, with
//     thumbnails cached into our bucket
// Each month is either LIVE (source = 'meta', refreshed by the daily cron) or
// a MANUAL OVERRIDE (source = 'manual'): the sync never touches an overridden
// month unless the admin explicitly resumes it (`force*`). On live rows we
// only write the fields we actually fetched, so a partial Meta failure never
// blanks yesterday's good numbers; profile_visits / website_clicks are never
// written (Meta removed them from the API) and stay hand-editable.
import { createServiceClient } from "./supabase-server";
import * as meta from "./meta";
import {
  monthRange, currentMonthStart, previousMonthStart, pickTopReels, metricLabel,
  titleFromCaption, mapWithConcurrency, trackingWindowStart, monthStartsBetween, type ReelStats,
} from "./meta-util";
import { cacheThumbnail, isCachedUrl, removeCached } from "./thumbnail-cache";

export type MetaConnection = {
  id: string; client_id: string; ig_user_id: string; ig_username: string | null;
  page_id: string | null; ad_account_id: string | null; sync_enabled: boolean;
  // Action types that count as a lead for this client. Undefined until
  // migration 0015 is applied — leads are then simply not synced.
  lead_action_types?: string[] | null;
};

export type SyncOptions = {
  // "paid" = only the ad-account call (paid numbers + leads) — used to recount leads.
  parts?: "all" | "metrics" | "reels" | "paid";
  forceMetrics?: boolean; // resume sync on a manually-overridden month (replaces manual numbers)
  forceReels?: boolean;   // same, for the month's top-3 reels
};

export type SyncSummary = {
  client_id: string;
  month: string;
  metrics: "written" | "kept-manual" | "no-data" | "error" | "not-run";
  paid: "written" | "none" | "error";
  reels: number | "kept-manual" | "skipped" | "error" | "not-run";
  errors: string[];
};

const MAX_REELS_PER_MONTH = 60;
const INSIGHTS_CONCURRENCY = 6;
const msg = (e: any) => e?.message ?? String(e);

export async function syncClientMonth(
  conn: MetaConnection, monthStart: string, opts: SyncOptions = {},
): Promise<SyncSummary> {
  const svc = createServiceClient();
  const range = monthRange(monthStart);
  const parts = opts.parts ?? "all";
  const doIg = parts === "all" || parts === "metrics";
  const doMetrics = parts !== "reels";
  const doReels = parts === "all" || parts === "reels";
  const forceMetrics = !!opts.forceMetrics && parts !== "paid";
  const summary: SyncSummary = {
    client_id: conn.client_id, month: monthStart,
    metrics: doMetrics ? "no-data" : "not-run", paid: "none",
    reels: doReels ? 0 : "not-run", errors: [],
  };

  // Pull everything in parallel; each part degrades independently.
  const [totalsRes, followersRes, adsRes, reelsRes] = await Promise.allSettled([
    doIg ? meta.accountTotals(conn.ig_user_id, range.sinceUnix, range.untilUnix) : Promise.resolve(null),
    doIg ? meta.followersNet(conn.ig_user_id, range.sinceUnix, range.untilUnix) : Promise.resolve(undefined),
    doMetrics && conn.ad_account_id ? meta.adAccountTotals(conn.ad_account_id, range.start, range.end) : Promise.resolve(undefined),
    doReels ? meta.listReelsInWindow(conn.ig_user_id, range.sinceUnix, range.untilUnix) : Promise.resolve([]),
  ]);

  if (doMetrics) {
    // ── What did Meta actually give us? ───────────────────────────────────
    const fetched: Record<string, number | null> = {};
    if (totalsRes.status === "fulfilled" && totalsRes.value) {
      const { totals, errors } = totalsRes.value;
      if (totals.reach !== undefined) fetched.organic_reach = totals.reach;
      for (const [m, err] of Object.entries(errors)) summary.errors.push(`${m}: ${err}`);
    } else if (totalsRes.status === "rejected") summary.errors.push(`account insights: ${msg(totalsRes.reason)}`);

    if (followersRes.status === "fulfilled") {
      if (followersRes.value !== undefined) fetched.followers_gained = followersRes.value;
    } else summary.errors.push(`follows_and_unfollows: ${msg(followersRes.reason)}`);

    const leadTypes = Array.isArray(conn.lead_action_types) ? conn.lead_action_types : [];
    // "none" = no ad account · "empty" = Meta answered with no delivery that month.
    let ads: "none" | "data" | "empty" | "error" = "none";
    if (adsRes.status === "fulfilled") {
      if (adsRes.value) {
        fetched.paid_reach = adsRes.value.reach;
        fetched.paid_spend = adsRes.value.spend;
        fetched.roas = adsRes.value.roas;
        // Leads = the configured ACTION events. Never the campaign's "results",
        // which can be a proxy event rather than a real lead.
        if (leadTypes.length) {
          fetched.leads = leadTypes.reduce((n, t) => n + (adsRes.value!.actions[t] ?? 0), 0);
        }
        ads = "data";
      } else if (adsRes.value === null) ads = "empty";
    } else { ads = "error"; summary.paid = "error"; summary.errors.push(`ads: ${msg(adsRes.reason)}`); }

    // An empty ads answer alone is not "data" — it must never create or flip a month.
    const gotData = fetched.organic_reach !== undefined || fetched.followers_gained !== undefined || ads === "data";

    // The client dashboard shows "the row whose period_end falls in the month"
    // (latest first), so that is also the predicate for "this month's rows".
    const { data: monthRows, error: selErr } = await svc.from("dashboard_metrics")
      .select("id, period_start, period_end, source")
      .eq("client_id", conn.client_id)
      .gte("period_end", range.start).lte("period_end", range.end)
      .order("period_end", { ascending: false });
    const rows = monthRows ?? [];
    const hasManual = rows.some((r) => r.source !== "meta");
    const takeover = hasManual && forceMetrics;

    if (selErr) {
      summary.metrics = "error";
      summary.errors.push(`dashboard_metrics read: ${selErr.message}`);
    } else if (hasManual && !forceMetrics) {
      summary.metrics = "kept-manual";
    } else if (!gotData) {
      // Nothing usable from Meta — never create, flip or blank a month on that basis.
      summary.metrics = summary.errors.length ? "error" : "no-data";
    } else if (takeover && fetched.organic_reach === undefined) {
      summary.metrics = "error";
      summary.errors.push("Meta didn't return organic reach for this month — kept your manual numbers");
    } else {
      // Live row / new row: write only what was fetched, so a partial failure
      // never blanks good numbers. Taking over a manual month is different: every
      // Meta-owned field must end up Meta's (or empty), never a leftover hand-typed value.
      const patch: Record<string, number | null> = { ...fetched };
      if (takeover) {
        if (patch.followers_gained === undefined) patch.followers_gained = null;
        if (conn.ad_account_id && ads !== "data") {
          patch.paid_reach = ads === "empty" ? 0 : null;
          patch.paid_spend = ads === "empty" ? 0 : null;
          patch.roas = null;
          if (leadTypes.length) patch.leads = ads === "empty" ? 0 : null;
        }
      }
      const canonical = rows.find((r) => r.period_start === range.start && r.period_end === range.end);
      const target = canonical ?? rows[0] ?? null;
      if (target) {
        let q = svc.from("dashboard_metrics")
          .update({ ...patch, source: "meta", period_start: range.start, period_end: range.end })
          .eq("id", target.id);
        // Not forced → only ever write a row that is still Meta's (the admin may
        // have overridden it between our read and this write).
        if (!forceMetrics) q = q.eq("source", "meta");
        const { data: updated, error } = await q.select("id");
        if (error) { summary.metrics = "error"; summary.errors.push(`dashboard_metrics: ${error.message}`); }
        else if (!updated?.length) summary.metrics = "kept-manual";
        else summary.metrics = "written";
      } else {
        const { error } = await svc.from("dashboard_metrics").insert({
          client_id: conn.client_id, period_start: range.start, period_end: range.end, ...patch, source: "meta",
        });
        // A row that appeared since our read (unique violation) means someone else wrote the month.
        if (error) { summary.metrics = "error"; summary.errors.push(`dashboard_metrics: ${error.message}`); }
        else summary.metrics = "written";
      }
      if (summary.metrics === "written" && ads === "data") summary.paid = "written";
      // Resuming sync = one row per month. Extra rows for the same month would
      // shadow this one or keep pausing the daily sync.
      if (summary.metrics === "written" && takeover && target) {
        const extras = rows.filter((r) => r.id !== target.id).map((r) => r.id);
        if (extras.length) {
          const { error } = await svc.from("dashboard_metrics").delete().in("id", extras);
          if (error) summary.errors.push(`couldn't remove ${extras.length} older row(s) for this month: ${error.message}`);
        }
      }
    }
  }

  if (doReels) {
    // ── winning_content (top 3 reels) ──────────────────────────────────────
    if (reelsRes.status === "rejected") {
      summary.reels = "error";
      summary.errors.push(`media: ${msg(reelsRes.reason)}`);
    } else {
      const listed = reelsRes.value ?? [];
      const { data: existing, error: rErr } = await svc.from("winning_content")
        .select("id, position, url, thumbnail_url, source")
        .eq("client_id", conn.client_id).eq("month", range.start);
      if (rErr) {
        summary.reels = "error";
        summary.errors.push(`winning_content read: ${rErr.message}`);
      } else if ((existing ?? []).some((r) => r.source === "manual") && !opts.forceReels) {
        summary.reels = "kept-manual";
      } else if (listed.length === 0 && (existing ?? []).length > 0) {
        // Don't wipe a month on an empty listing — could be a transient Graph hiccup.
        summary.reels = "skipped";
        summary.errors.push("Meta returned no reels for the month; kept the existing top 3");
      } else {
        const media = listed.slice(0, MAX_REELS_PER_MONTH);
        if (listed.length > MAX_REELS_PER_MONTH) {
          summary.errors.push(`ranked only the ${MAX_REELS_PER_MONTH} most recent of ${listed.length} reels`);
        }
        let failed = 0;
        const stats = await mapWithConcurrency(media, INSIGHTS_CONCURRENCY, async (m): Promise<ReelStats | null> => {
          try {
            const ins = await meta.reelInsights(m.id);
            return {
              id: m.id, permalink: m.permalink, thumbnail_url: m.thumbnail_url ?? null,
              caption: m.caption ?? null, timestamp: m.timestamp, ...ins,
            };
          } catch (e) {
            failed++;
            summary.errors.push(`reel ${m.id}: ${msg(e)}`);
            return null;
          }
        });

        if (failed > 0) {
          // A reel with unknown stats can't be ranked honestly; keep the current top 3.
          summary.reels = "skipped";
          summary.errors.push(`${failed} reel insight call(s) failed — kept the previous top 3`);
        } else if (!opts.forceReels && await monthHasManualReels(svc, conn.client_id, range.start)) {
          // The admin hand-picked a reel while we were fetching insights — theirs wins.
          summary.reels = "kept-manual";
        } else {
          const top = pickTopReels(stats.filter((s): s is ReelStats => !!s), 3);
          const rows = existing ?? [];
          const byUrl = new Map(rows.map((r) => [r.url, r]));
          const oldCached = rows.map((r) => r.thumbnail_url).filter(isCachedUrl) as string[];

          // Rows beyond the new top-N are stale (positions 1..N get overwritten by the upserts).
          const stale = rows.filter((r) => r.position > top.length);
          for (const r of stale) {
            const { error } = await svc.from("winning_content").delete().eq("id", r.id);
            if (error) summary.errors.push(`winning_content delete #${r.position}: ${error.message}`);
          }

          let written = 0;
          const keptThumbs = new Set<string>();
          for (let i = 0; i < top.length; i++) {
            const r = top[i];
            const position = i + 1;
            // Same reel already cached (at any position)? Reuse — no re-download, no bucket growth.
            const prev = byUrl.get(r.permalink);
            let thumb: string | null = prev && isCachedUrl(prev.thumbnail_url) ? prev.thumbnail_url : null;
            if (!thumb) {
              thumb =
                (r.thumbnail_url ? await cacheThumbnail(conn.client_id, range.start, position, r.thumbnail_url, true, true) : null) ??
                (await cacheThumbnail(conn.client_id, range.start, position, r.permalink, false, true));
            }
            const { error } = await svc.from("winning_content").upsert(
              {
                client_id: conn.client_id, month: range.start, position,
                url: r.permalink, thumbnail_url: thumb,
                title: titleFromCaption(r.caption), metric_label: metricLabel(r) || null,
                source: "meta",
              },
              { onConflict: "client_id,month,position" },
            );
            if (error) summary.errors.push(`winning_content #${position}: ${error.message}`);
            else { written++; if (thumb) keptThumbs.add(thumb); }
          }
          // Delete cached files no row references any more (only when every write succeeded).
          if (written === top.length) {
            for (const u of oldCached) if (!keptThumbs.has(u)) await removeCached(u);
          }
          summary.reels = written;
        }
      }
    }
  }

  return summary;
}

async function monthHasManualReels(svc: ReturnType<typeof createServiceClient>, clientId: string, month: string) {
  const { data } = await svc.from("winning_content").select("source").eq("client_id", clientId).eq("month", month);
  return (data ?? []).some((r) => r.source !== "meta");
}

// The connection's "last synced / last error" reflects full runs only (cron or
// the Meta tab's Sync now) — pulling one old month on demand must not mask or
// fake the health of the daily sync.
async function recordStatus(conn: MetaConnection, summaries: SyncSummary[]) {
  const errors = summaries.flatMap((s) => s.errors.map((e) => `${s.month.slice(0, 7)} ${e}`));
  await createServiceClient().from("meta_connections").update({
    last_synced_at: new Date().toISOString(),
    last_sync_error: errors.length ? errors.join(" | ").slice(0, 2000) : null,
  }).eq("id", conn.id);
}

// Earlier months with no numbers at all get filled in a few per run (metrics
// only — they're closed, so one pull is final). The pick rotates by day so a
// month Meta has nothing for can't block the ones behind it.
async function backfillEmptyMonths(conn: MetaConnection, max: number, deadline: number): Promise<SyncSummary[]> {
  const svc = createServiceClient();
  const cur = currentMonthStart();
  const [{ data: client }, { data: rows }] = await Promise.all([
    svc.from("clients").select("created_at").eq("id", conn.client_id).maybeSingle(),
    svc.from("dashboard_metrics").select("period_end").eq("client_id", conn.client_id),
  ]);
  const have = new Set((rows ?? []).map((r) => String(r.period_end).slice(0, 7)));
  const earliest = [...have].sort()[0] ?? null;
  const from = trackingWindowStart(client?.created_at ?? null, earliest, cur);
  const closed = monthStartsBetween(from, previousMonthStart(previousMonthStart(cur)));
  const empty = closed.filter((m) => !have.has(m.slice(0, 7)));
  const out: SyncSummary[] = [];
  const day = Math.floor(Date.now() / 86_400_000);
  for (let i = 0; i < Math.min(max, empty.length); i++) {
    if (Date.now() > deadline) break;
    out.push(await syncClientMonth(conn, empty[(day + i) % empty.length], { parts: "metrics" }));
  }
  return out;
}

// Previous + current month (numbers that still move; the dashboard's deltas
// need both), then a small backfill of empty earlier months.
export async function syncClient(
  conn: MetaConnection, opts: { backfill?: number; deadline?: number } = {},
): Promise<SyncSummary[]> {
  const cur = currentMonthStart();
  const out = [
    await syncClientMonth(conn, previousMonthStart(cur)),
    await syncClientMonth(conn, cur),
  ];
  if (opts.backfill) out.push(...(await backfillEmptyMonths(conn, opts.backfill, opts.deadline ?? Date.now() + 20_000)));
  await recordStatus(conn, out);
  return out;
}

export type SyncAllResult = { ran: number; summaries: SyncSummary[]; errors: string[]; skipped: string[] };

// Clients are processed least-recently-synced first, and we stop starting new
// clients once the time budget is nearly spent (Vercel Hobby kills the
// function at 60 s), so a long tail rotates through over successive days
// instead of the same clients always being cut off.
export async function syncAll(budgetMs = 50_000): Promise<SyncAllResult> {
  const started = Date.now();
  const svc = createServiceClient();
  const { data: conns, error } = await svc.from("meta_connections").select("*")
    .eq("sync_enabled", true)
    .order("last_synced_at", { ascending: true, nullsFirst: true });
  if (error) return { ran: 0, summaries: [], errors: [error.message], skipped: [] };

  const summaries: SyncSummary[] = [];
  const errors: string[] = [];
  const skipped: string[] = [];
  let ran = 0;
  for (const conn of conns ?? []) {
    // Leave ~25 s for the client we're about to start (two months of calls).
    if (ran > 0 && Date.now() - started > budgetMs - 25_000) { skipped.push(conn.client_id); continue; }
    try { summaries.push(...(await syncClient(conn as MetaConnection, { backfill: 2, deadline: started + budgetMs }))); ran++; }
    catch (e: any) { errors.push(`${conn.client_id}: ${msg(e)}`); }
  }
  return { ran, summaries, errors, skipped };
}
