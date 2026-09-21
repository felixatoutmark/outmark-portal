// Pure helpers for the Meta sync — no I/O, so they can be unit-tested with
// plain `node lib/meta-util.ts` (Node 24 strips types natively).

export type MonthRange = { start: string; end: string; sinceUnix: number; untilUnix: number };

function pad(n: number) { return String(n).padStart(2, "0"); }

// "YYYY-MM-01" → { start, end (last day), sinceUnix (00:00 UTC day 1), untilUnix (23:59:59 UTC last day) }
export function monthRange(monthStart: string): MonthRange {
  const [y, m] = monthStart.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const start = `${y}-${pad(m)}-01`;
  const end = `${y}-${pad(m)}-${pad(last)}`;
  return {
    start, end,
    sinceUnix: Math.floor(Date.UTC(y, m - 1, 1) / 1000),
    untilUnix: Math.floor(Date.UTC(y, m - 1, last, 23, 59, 59) / 1000),
  };
}

export function currentMonthStart(now = new Date()): string {
  return `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-01`;
}

export function previousMonthStart(monthStart: string): string {
  const [y, m] = monthStart.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
}

// The Instagram insights API caps a since/until window at 30 days; a 31-day
// month therefore needs two calls whose totals we add up.
export function chunkRange(sinceUnix: number, untilUnix: number, maxDays = 30): Array<{ since: number; until: number }> {
  const step = maxDays * 86400;
  const out: Array<{ since: number; until: number }> = [];
  for (let s = sinceUnix; s <= untilUnix; s += step) {
    out.push({ since: s, until: Math.min(s + step - 1, untilUnix) });
  }
  return out;
}

export type ReelStats = {
  id: string;
  permalink: string;
  thumbnail_url: string | null;
  caption: string | null;
  timestamp: string;
  views: number;
  reach: number;
  saved: number;
  shares: number;
  likes: number;
  comments: number;
};

// Top N by views, ties broken by reach then likes.
export function pickTopReels(reels: ReelStats[], n = 3): ReelStats[] {
  return [...reels]
    .sort((a, b) => (b.views - a.views) || (b.reach - a.reach) || (b.likes - a.likes))
    .slice(0, n);
}

export function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return String(n);
}

// "182k views · 4.1k saves · 320 shares" — omits zero parts.
export function metricLabel(r: Pick<ReelStats, "views" | "saved" | "shares">): string {
  const parts: string[] = [];
  if (r.views > 0) parts.push(`${compact(r.views)} views`);
  if (r.saved > 0) parts.push(`${compact(r.saved)} saves`);
  if (r.shares > 0) parts.push(`${compact(r.shares)} shares`);
  return parts.join(" · ");
}

// First line of the caption, trimmed to a card-sized title.
export function titleFromCaption(caption: string | null, max = 60): string | null {
  if (!caption) return null;
  const line = caption.split("\n").map((s) => s.trim()).find(Boolean) ?? "";
  if (!line) return null;
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

// Run `fn` over `items` with at most `limit` in flight (keeps Graph rate
// limits happy). Results keep input order.
export async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

// First month the portal tracks for a client: the earliest of its creation
// month, its first data month, and `minBack` months ago — never more than
// `maxBack` months back (Meta's insights don't reach further anyway).
// All arguments/returns are "YYYY-MM-01" strings; nulls are ignored.
export function trackingWindowStart(
  createdAt: string | null | undefined, earliestDataMonth: string | null | undefined,
  currentStart: string, minBack = 5, maxBack = 23,
): string {
  const shift = (start: string, delta: number) => {
    const [y, m] = start.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-01`;
  };
  const candidates = [shift(currentStart, -minBack)];
  if (createdAt) candidates.push(`${String(createdAt).slice(0, 7)}-01`);
  if (earliestDataMonth) candidates.push(`${String(earliestDataMonth).slice(0, 7)}-01`);
  const earliest = candidates.sort()[0];
  const floor = shift(currentStart, -maxBack);
  return earliest < floor ? floor : earliest;
}

// Month starts from `fromStart` through `toStart` inclusive, newest first.
export function monthStartsBetween(fromStart: string, toStart: string): string[] {
  const out: string[] = [];
  for (let m = toStart; m >= fromStart; m = previousMonthStart(m)) out.push(m);
  return out;
}

// ── Lead event selection rules ──────────────────────────────────────────────
// Meta reports the same event under several types (an aggregate and its
// parts). Summing both would double count, so a child is dropped whenever its
// aggregate is selected.
const LEAD_CHILDREN: Record<string, string[]> = {
  lead: ["onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "leadgen_grouped", "onsite_web_lead"],
  complete_registration: ["offsite_conversion.fb_pixel_complete_registration"],
};

export function normalizeLeadTypes(input: string[]): { types: string[]; dropped: string[] } {
  const unique = [...new Set(input.map((t) => t.trim()).filter(Boolean))];
  const keep = new Set(unique);
  const dropped: string[] = [];
  for (const t of unique) {
    const children = [...(LEAD_CHILDREN[t] ?? [])];
    const total = t.match(/^(.+)_total$/);
    if (total) children.push(`${total[1]}_website`, `${total[1]}_mobile_app`, `${total[1]}_offline`);
    for (const c of children) if (keep.delete(c)) dropped.push(c);
  }
  return { types: unique.filter((t) => keep.has(t)), dropped };
}

// Overlaps we can't resolve automatically (a custom conversion's rule decides
// whether it matches an event that is also selected).
export function leadTypeWarnings(types: string[]): string[] {
  const customs = types.filter((t) => /^offsite_conversion\.custom\./.test(t));
  const out: string[] = [];
  if (customs.length && types.length > customs.length) {
    out.push("A custom conversion is combined with other events — if its rule is built on one of them (e.g. on the Lead event), those leads are counted twice.");
  }
  if (customs.length > 1) out.push("Several custom conversions are selected — make sure their rules don't match the same event.");
  return out;
}
