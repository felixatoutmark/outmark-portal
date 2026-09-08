// Meta → portal sync. For one client and one calendar month:
//   • account insights → dashboard_metrics (organic reach, followers gained)
//   • ad-account insights → the same row's paid_reach / paid_spend / roas
//   • the month's reels ranked by views → winning_content #1–#3, with
//     thumbnails cached into our bucket
// Rules: a month that has ANY hand-entered row (source = 'manual') is left
// alone; on our own rows we only write the fields we actually fetched, so a
// partial Meta failure never blanks yesterday's good numbers.
import { createServiceClient } from "./supabase-server";
import * as meta from "./meta";
import {
  monthRange, currentMonthStart, previousMonthStart, pickTopReels, metricLabel,
  titleFromCaption, mapWithConcurrency, type ReelStats,
} from "./meta-util";
import { cacheThumbnail, isCachedUrl, removeCached } from "./thumbnail-cache";

export type MetaConnection = {
  id: string; client_id: string; ig_user_id: string; ig_username: string | null;
  page_id: string | null; ad_account_id: string | null; sync_enabled: boolean;
};

export type SyncSummary = {
  client_id: string;
  month: string;
  metrics: "written" | "kept-manual" | "no-data" | "error";
  paid: "written" | "none" | "error";
  reels: number | "kept-manual" | "skipped" | "error";
  errors: string[];
};

const MAX_REELS_PER_MONTH = 60;
const INSIGHTS_CONCURRENCY = 6;
const msg = (e: any) => e?.message ?? String(e);

export async function syncClientMonth(conn: MetaConnection, monthStart: string): Promise<SyncSummary> {
  const svc = createServiceClient();
  const range = monthRange(monthStart);
  const summary: SyncSummary = {
    client_id: conn.client_id, month: monthStart,
    metrics: "no-data", paid: "none", reels: 0, errors: [],
  };

  // Pull everything in parallel; each part degrades independently.
  const [totalsRes, followersRes, adsRes, reelsRes] = await Promise.allSettled([
    meta.accountTotals(conn.ig_user_id, range.sinceUnix, range.untilUnix),
    meta.followersNet(conn.ig_user_id, range.sinceUnix, range.untilUnix),
    conn.ad_account_id ? meta.adAccountTotals(conn.ad_account_id, range.start, range.end) : Promise.resolve(null),
    meta.listReelsInWindow(conn.ig_user_id, range.sinceUnix, range.untilUnix),
  ]);

  // ── Build a patch containing ONLY what was fetched successfully ──────────
  const patch: Record<string, number | null> = {};
  if (totalsRes.status === "fulfilled") {
    const { totals, errors } = totalsRes.value;
    if (totals.reach !== undefined) patch.organic_reach = totals.reach;
    for (const [m, err] of Object.entries(errors)) summary.errors.push(`${m}: ${err}`);
  } else summary.errors.push(`account insights: ${msg(totalsRes.reason)}`);

  if (followersRes.status === "fulfilled") {
    if (followersRes.value !== undefined) patch.followers_gained = followersRes.value;
  } else summary.errors.push(`follows_and_unfollows: ${msg(followersRes.reason)}`);

  if (adsRes.status === "fulfilled") {
    if (adsRes.value) {
      patch.paid_reach = adsRes.value.reach;
      patch.paid_spend = adsRes.value.spend;
      patch.roas = adsRes.value.roas;
      summary.paid = "written";
    }
  } else { summary.paid = "error"; summary.errors.push(`ads: ${msg(adsRes.reason)}`); }

  // ── dashboard_metrics ────────────────────────────────────────────────────
  // The client dashboard shows "any row whose period_end falls in the month",
  // so that is the predicate for "does this month already have manual data".
  const { data: monthRows, error: selErr } = await svc.from("dashboard_metrics")
    .select("id, period_start, period_end, source")
    .eq("client_id", conn.client_id)
    .gte("period_end", range.start).lte("period_end", range.end);
  if (selErr) {
    summary.metrics = "error";
    summary.errors.push(`dashboard_metrics read: ${selErr.message}`);
  } else if ((monthRows ?? []).some((r) => r.source === "manual")) {
    summary.metrics = "kept-manual";
  } else if (Object.keys(patch).length === 0) {
    summary.metrics = summary.errors.length ? "error" : "no-data";
  } else {
    const mine = (monthRows ?? []).find((r) => r.period_start === range.start && r.period_end === range.end);
    const res = mine
      ? await svc.from("dashboard_metrics").update({ ...patch, source: "meta" }).eq("id", mine.id)
      : await svc.from("dashboard_metrics").insert({
          client_id: conn.client_id, period_start: range.start, period_end: range.end, ...patch, source: "meta",
        });
    if (res.error) { summary.metrics = "error"; summary.errors.push(`dashboard_metrics: ${res.error.message}`); }
    else summary.metrics = "written";
  }

  // ── winning_content (top 3 reels) ────────────────────────────────────────
  if (reelsRes.status === "rejected") {
    summary.reels = "error";
    summary.errors.push(`media: ${msg(reelsRes.reason)}`);
  } else {
    const { data: existing, error: rErr } = await svc.from("winning_content")
      .select("id, position, url, thumbnail_url, source")
      .eq("client_id", conn.client_id).eq("month", range.start);
    if (rErr) {
      summary.reels = "error";
      summary.errors.push(`winning_content read: ${rErr.message}`);
    } else if ((existing ?? []).some((r) => r.source === "manual")) {
      summary.reels = "kept-manual";
    } else if (reelsRes.value.length === 0 && (existing ?? []).length > 0) {
      // Don't wipe a month on an empty listing — could be a transient Graph hiccup.
      summary.reels = "skipped";
      summary.errors.push("Meta returned no reels for the month; kept the existing top 3");
    } else {
      const media = reelsRes.value.slice(0, MAX_REELS_PER_MONTH);
      if (reelsRes.value.length > MAX_REELS_PER_MONTH) {
        summary.errors.push(`ranked only the ${MAX_REELS_PER_MONTH} most recent of ${reelsRes.value.length} reels`);
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
        // A reel with unknown stats can't be ranked honestly; keep yesterday's top 3.
        summary.reels = "skipped";
        summary.errors.push(`${failed} reel insight call(s) failed — kept the previous top 3`);
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

  await svc.from("meta_connections").update({
    last_synced_at: new Date().toISOString(),
    last_sync_error: summary.errors.length ? summary.errors.join(" | ").slice(0, 2000) : null,
  }).eq("id", conn.id);

  return summary;
}

// Current + previous month, so late-arriving numbers settle and the
// dashboard's month-over-month deltas have both sides.
export async function syncClient(conn: MetaConnection): Promise<SyncSummary[]> {
  const cur = currentMonthStart();
  return [
    await syncClientMonth(conn, previousMonthStart(cur)),
    await syncClientMonth(conn, cur),
  ];
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
    try { summaries.push(...(await syncClient(conn as MetaConnection))); ran++; }
    catch (e: any) { errors.push(`${conn.client_id}: ${msg(e)}`); }
  }
  return { ran, summaries, errors, skipped };
}
