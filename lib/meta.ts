// Thin Meta Graph API client for the sync. Authenticates with a Business
// Manager System User token (does not expire) — see README "Meta sync".
// Every call surfaces Graph's own error message so the admin "Sync now"
// button tells you exactly what Meta objected to.
//
// Metric names verified against the Instagram Platform reference, Sept 2026:
//   account: reach, views, accounts_engaged, total_interactions (total_value);
//            follows_and_unfollows (+ breakdown follow_type). profile_views,
//            website_clicks and follower_count were removed in 2025.
//   media:   views (plays is gone), reach, saved, shares, likes, comments.
import { chunkRange } from "./meta-util";

const GRAPH = "https://graph.facebook.com/v23.0";

export class GraphError extends Error {
  code?: number;
  subcode?: number;
  type?: string;
  constructor(message: string, extra: { code?: number; subcode?: number; type?: string } = {}) {
    super(message);
    this.name = "GraphError";
    Object.assign(this, extra);
  }
}

function token(): string {
  const t = process.env.META_SYSTEM_USER_TOKEN;
  if (!t) throw new GraphError("META_SYSTEM_USER_TOKEN is not set in the environment");
  return t;
}

async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.error) {
      const e = json?.error ?? {};
      // Graph error messages never include the request URL, so the token can't leak here.
      throw new GraphError(e.message ?? `Graph API HTTP ${res.status}`, {
        code: e.code, subcode: e.error_subcode, type: e.type,
      });
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

export async function graphGet<T = any>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(`${GRAPH}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  url.searchParams.set("access_token", token());
  return fetchJson(url.toString());
}

// Follow `paging.next` (a complete URL, token included) until `stop` says
// we're past what we need or `maxPages` pages have been read.
export async function graphGetAll<T = any>(
  path: string,
  params: Record<string, string | number | undefined>,
  opts: { maxPages?: number; stop?: (item: T) => boolean } = {},
): Promise<T[]> {
  const maxPages = opts.maxPages ?? 10;
  const out: T[] = [];
  let page = await graphGet<{ data: T[]; paging?: { next?: string } }>(path, params);
  for (let i = 0; ; i++) {
    for (const item of page.data ?? []) {
      out.push(item);
      if (opts.stop?.(item)) return out;
    }
    if (i + 1 >= maxPages || !page.paging?.next) break;
    page = await fetchJson(page.paging.next);
  }
  return out;
}

export async function whoAmI(): Promise<{ id: string; name?: string }> {
  return graphGet("me", { fields: "id,name" });
}

// ── Business Manager asset discovery ────────────────────────────────────────

export type IgAsset = { id: string; username: string | null; page_id: string | null; page_name: string | null; via: "owned" | "client" };
export type AdAccountAsset = { id: string; name: string; via: "owned" | "client" };

export async function listBusinessAssets(businessId: string): Promise<{
  ig: IgAsset[]; adAccounts: AdAccountAsset[]; errors: string[];
}> {
  const errors: string[] = [];
  const settle = async <T,>(label: string, p: Promise<T[]>): Promise<T[]> => {
    try { return await p; } catch (e: any) { errors.push(`${label}: ${e?.message ?? e}`); return []; }
  };
  const pageFields = "id,name,instagram_business_account{id,username}";
  const [ownedIg, clientIg, ownedPages, clientPages, ownedAds, clientAds] = await Promise.all([
    settle("owned_instagram_accounts", graphGetAll<any>(`${businessId}/owned_instagram_accounts`, { fields: "id,username", limit: 100 })),
    settle("client_instagram_accounts", graphGetAll<any>(`${businessId}/client_instagram_accounts`, { fields: "id,username", limit: 100 })),
    settle("owned_pages", graphGetAll<any>(`${businessId}/owned_pages`, { fields: pageFields, limit: 100 })),
    settle("client_pages", graphGetAll<any>(`${businessId}/client_pages`, { fields: pageFields, limit: 100 })),
    settle("owned_ad_accounts", graphGetAll<any>(`${businessId}/owned_ad_accounts`, { fields: "id,name,account_id", limit: 100 })),
    settle("client_ad_accounts", graphGetAll<any>(`${businessId}/client_ad_accounts`, { fields: "id,name,account_id", limit: 100 })),
  ]);

  const ig = new Map<string, IgAsset>();
  const addIg = (a: any, via: "owned" | "client", page?: any) => {
    if (!a?.id) return;
    const prev = ig.get(a.id);
    ig.set(a.id, {
      id: a.id,
      username: a.username ?? prev?.username ?? null,
      page_id: page?.id ?? prev?.page_id ?? null,
      page_name: page?.name ?? prev?.page_name ?? null,
      via: prev?.via ?? via,
    });
  };
  ownedIg.forEach((a) => addIg(a, "owned"));
  clientIg.forEach((a) => addIg(a, "client"));
  ownedPages.forEach((p) => addIg(p.instagram_business_account, "owned", p));
  clientPages.forEach((p) => addIg(p.instagram_business_account, "client", p));

  const adAccounts: AdAccountAsset[] = [
    ...ownedAds.map((a) => ({ id: String(a.account_id ?? String(a.id).replace(/^act_/, "")), name: a.name ?? "", via: "owned" as const })),
    ...clientAds.map((a) => ({ id: String(a.account_id ?? String(a.id).replace(/^act_/, "")), name: a.name ?? "", via: "client" as const })),
  ];
  return { ig: [...ig.values()], adAccounts, errors };
}

// ── Account insights ────────────────────────────────────────────────────────

export const ACCOUNT_TOTAL_METRICS = ["reach", "views", "accounts_engaged", "total_interactions"] as const;
export type AccountTotals = Partial<Record<(typeof ACCOUNT_TOTAL_METRICS)[number], number>>;

// One total_value read. The docs don't state a since/until cap but the API
// has historically rejected windows over 30 days, so try the whole window
// first and only fall back to 30-day chunks (summed — approximate for
// unique-account metrics) if Graph refuses it. An empty data set means
// "unavailable" per the docs, not zero → undefined.
async function totalValue(
  igUserId: string, metric: string, sinceUnix: number, untilUnix: number, extra: Record<string, string> = {},
): Promise<{ value: number | undefined; raw: any }> {
  const read = async (since: number, until: number) => {
    const r = await graphGet<{ data: any[] }>(`${igUserId}/insights`, {
      metric, period: "day", metric_type: "total_value", since, until, ...extra,
    });
    const tv = r.data?.[0]?.total_value;
    return tv && tv.value != null ? { value: Number(tv.value), raw: tv } : { value: undefined, raw: tv };
  };
  try {
    return await read(sinceUnix, untilUnix);
  } catch (e) {
    const chunks = chunkRange(sinceUnix, untilUnix);
    if (chunks.length < 2) throw e;
    let sum = 0, any = false, raw: any = undefined;
    for (const c of chunks) {
      const part = await read(c.since, c.until);
      if (part.value != null) { sum += part.value; any = true; raw = part.raw; }
    }
    return { value: any ? sum : undefined, raw };
  }
}

// Each metric is requested on its own so one unsupported metric (Meta prunes
// them regularly) can't sink the whole batch.
export async function accountTotals(
  igUserId: string, sinceUnix: number, untilUnix: number,
): Promise<{ totals: AccountTotals; errors: Record<string, string> }> {
  const totals: AccountTotals = {};
  const errors: Record<string, string> = {};
  await Promise.all(ACCOUNT_TOTAL_METRICS.map(async (metric) => {
    try {
      const { value } = await totalValue(igUserId, metric, sinceUnix, untilUnix);
      if (value !== undefined) totals[metric] = value;
    } catch (e: any) {
      errors[metric] = e?.message ?? String(e);
    }
  }));
  return { totals, errors };
}

// Net followers gained = follows − unfollows, from follows_and_unfollows
// broken down by follow_type (FOLLOWER = follows, NON_FOLLOWER = unfollows).
// Returns undefined when Meta gives no breakdown (e.g. accounts < 100 followers).
export async function followersNet(igUserId: string, sinceUnix: number, untilUnix: number): Promise<number | undefined> {
  const { raw } = await totalValue(igUserId, "follows_and_unfollows", sinceUnix, untilUnix, { breakdown: "follow_type" });
  const results = raw?.breakdowns?.[0]?.results;
  if (!Array.isArray(results)) return undefined;
  let follows = 0, unfollows = 0;
  for (const row of results) {
    const dim = String(row?.dimension_values?.[0] ?? "");
    const v = Number(row?.value ?? 0);
    if (dim === "FOLLOWER") follows += v;
    else if (dim === "NON_FOLLOWER") unfollows += v;
  }
  return follows - unfollows;
}

// ── Media ───────────────────────────────────────────────────────────────────

export type MediaItem = {
  id: string; caption?: string; media_type: string; media_product_type?: string;
  permalink: string; thumbnail_url?: string; media_url?: string; timestamp: string;
};

const MEDIA_FIELDS = "id,caption,media_type,media_product_type,permalink,thumbnail_url,timestamp";

// The media edge supports since/until natively (time-based pagination); the
// timestamp `stop` is a belt-and-braces guard. Falls back to plain paging if
// Graph rejects the time params.
export async function listReelsInWindow(igUserId: string, sinceUnix: number, untilUnix: number): Promise<MediaItem[]> {
  const opts = { maxPages: 10, stop: (m: MediaItem) => Date.parse(m.timestamp) / 1000 < sinceUnix };
  let items: MediaItem[];
  try {
    items = await graphGetAll<MediaItem>(`${igUserId}/media`, { fields: MEDIA_FIELDS, limit: 50, since: sinceUnix, until: untilUnix }, opts);
  } catch {
    items = await graphGetAll<MediaItem>(`${igUserId}/media`, { fields: MEDIA_FIELDS, limit: 50 }, opts);
  }
  return items.filter((m) => {
    const ts = Date.parse(m.timestamp) / 1000;
    return m.media_product_type === "REELS" && ts >= sinceUnix && ts <= untilUnix;
  });
}

export type ReelInsights = { views: number; reach: number; saved: number; shares: number; likes: number; comments: number };

export async function reelInsights(mediaId: string): Promise<ReelInsights> {
  const r = await graphGet<{ data: any[] }>(`${mediaId}/insights`, { metric: "views,reach,saved,shares,likes,comments" });
  const raw: Record<string, number> = {};
  for (const d of r.data ?? []) raw[d.name] = Number(d.values?.[0]?.value ?? d.total_value?.value ?? 0);
  return {
    views: raw.views ?? 0, reach: raw.reach ?? 0, saved: raw.saved ?? 0,
    shares: raw.shares ?? 0, likes: raw.likes ?? 0, comments: raw.comments ?? 0,
  };
}

// ── Paid (Marketing API) ────────────────────────────────────────────────────

export async function adAccountTotals(
  adAccountId: string, start: string, end: string,
): Promise<{ spend: number; reach: number; roas: number | null; actions: Record<string, number> } | null> {
  const r = await graphGet<{ data: any[] }>(`act_${adAccountId}/insights`, {
    // Standard events (Lead, Purchase…) come back under `actions`; Contact,
    // Schedule, SubmitApplication etc. under `conversions`. Names don't collide.
    fields: "spend,reach,purchase_roas,actions,conversions",
    level: "account",
    time_range: JSON.stringify({ since: start, until: end }),
  });
  const d = r.data?.[0];
  if (!d) return null;
  const roasRaw = Array.isArray(d.purchase_roas) ? d.purchase_roas[0]?.value : undefined;
  return {
    spend: Number(d.spend ?? 0),
    reach: Number(d.reach ?? 0),
    roas: roasRaw != null ? Number(roasRaw) : null,
    actions: actionMap(d.actions, d.conversions),
  };
}

// Prototype-less, so a stored type like "constructor" can't resolve to a function.
function actionMap(...lists: any[]): Record<string, number> {
  const out: Record<string, number> = Object.create(null);
  for (const list of lists) {
    for (const a of Array.isArray(list) ? list : []) {
      if (a?.action_type) out[String(a.action_type)] = (out[String(a.action_type)] ?? 0) + Number(a.value ?? 0);
    }
  }
  return out;
}

// ── Lead events ─────────────────────────────────────────────────────────────
// A "lead" is counted from the ad account's ACTION events, never from a
// campaign's "results": results are whatever the campaign optimises for, which
// can be a proxy (e.g. a Contact event on a second page view), not a real lead.

const ACTION_LABELS: Record<string, string> = {
  lead: "Leads — Meta's standard Lead event (website + on-Facebook forms)",
  "onsite_conversion.lead_grouped": "On-Facebook leads (instant forms) — already included in “Leads”",
  "offsite_conversion.fb_pixel_lead": "Website leads (Pixel Lead event) — already included in “Leads”",
  contact_total: "Contacts (all)",
  contact_website: "Website contacts (Pixel Contact event)",
  schedule_total: "Appointments scheduled (all)",
  schedule_website: "Website appointments scheduled",
  submit_application_total: "Applications submitted (all)",
  submit_application_website: "Website applications submitted",
  complete_registration: "Registrations completed",
  "offsite_conversion.fb_pixel_complete_registration": "Website registrations completed",
  subscribe_total: "Subscriptions (all)",
  start_trial_total: "Trials started (all)",
  find_location_total: "Location searches (all)",
  "onsite_conversion.messaging_conversation_started_7d": "Messaging conversations started",
  "onsite_conversion.messaging_first_reply": "Messaging first replies",
  "offsite_conversion.fb_pixel_custom": "Website custom pixel events (all)",
  "offsite_conversion.fb_pixel_purchase": "Website purchases",
  purchase: "Purchases (all)",
};
const LEAD_LIKE = /(^|[._])(lead|contact|schedule|submit_application|complete_registration|subscribe|start_trial|find_location|messaging_conversation_started|messaging_first_reply|custom)([._]|$)/;

export type AdActionEvent = { type: string; label: string; count: number; suggested: boolean };

// Every action type the ad account recorded in the last 90 days, with counts,
// so the admin can pick what a real lead is for this client.
export async function listAdActionEvents(adAccountId: string, alwaysInclude: string[] = []): Promise<AdActionEvent[]> {
  const [ins, customs] = await Promise.all([
    graphGet<{ data: any[] }>(`act_${adAccountId}/insights`, { fields: "actions,conversions", level: "account", date_preset: "last_90d" }),
    graphGetAll<any>(`act_${adAccountId}/customconversions`, { fields: "id,name", limit: 100 }).catch(() => []),
  ]);
  const counts = actionMap(ins.data?.[0]?.actions, ins.data?.[0]?.conversions);
  const customName = new Map<string, string>(customs.map((c: any) => [String(c.id), String(c.name ?? c.id)]));
  for (const t of ["lead", ...alwaysInclude]) if (!(t in counts)) counts[t] = 0;
  const labelOf = (t: string) => {
    const m = t.match(/^offsite_conversion\.custom\.(\d+)$/);
    if (m) return `Custom conversion: ${customName.get(m[1]) ?? m[1]}`;
    return ACTION_LABELS[t] ?? t;
  };
  return Object.entries(counts)
    .map(([type, count]) => ({ type, label: labelOf(type), count, suggested: LEAD_LIKE.test(type) }))
    // Meta's standard Lead event first: a high-volume proxy (e.g. a Contact event
    // fired on a page view) must not sit above it and invite a mis-pick.
    .sort((a, b) => Number(b.type === "lead") - Number(a.type === "lead")
      || Number(b.suggested) - Number(a.suggested) || b.count - a.count || a.type.localeCompare(b.type));
}
