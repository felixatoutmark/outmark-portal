"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { trackingWindowStart, normalizeLeadTypes, leadTypeWarnings } from "@/lib/meta-util";

const TABS = ["Overview","Metrics","Meta","Content","Goals","Deliverables","Invoices","Requests","Feedback","Settings","Activity"] as const;

const MOOD_EMOJI: Record<number, string> = { 1: "😞", 2: "🙁", 3: "😐", 4: "🙂", 5: "😄" };
const MOOD_LABEL: Record<number, string> = { 1: "Unhappy", 2: "Disappointed", 3: "Neutral", 4: "Happy", 5: "Thrilled" };
type Tab = typeof TABS[number];

function tabFromHash(): Tab {
  if (typeof window === "undefined") return "Overview";
  const h = decodeURIComponent(window.location.hash.replace(/^#/, ""));
  return (TABS as readonly string[]).includes(h) ? (h as Tab) : "Overview";
}

export default function AdminClientPanels(p: any) {
  const [tab, setTabState] = useState<Tab>("Overview");
  // On mount + on hashchange (back/forward) sync the tab from URL.
  useEffect(() => {
    setTabState(tabFromHash());
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  function setTab(t: Tab) {
    setTabState(t);
    // Replace (not push) so the browser back button doesn't accumulate hash history.
    history.replaceState(null, "", `#${t}`);
  }
  return (
    <>
      <nav className="flex gap-1 overflow-x-auto border-b border-[--border]">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors
              ${tab === t ? "border-[--orange] text-[--fg]" : "border-transparent text-[--muted] hover:text-[--fg]"}`}>
            {t}
          </button>
        ))}
      </nav>
      <div className="pt-6">
        {tab === "Overview"     && <Overview {...p} />}
        {tab === "Metrics"      && <Metrics  {...p} />}
        {tab === "Meta"         && <MetaPanel {...p} />}
        {tab === "Content"      && <Content  {...p} />}
        {tab === "Goals"        && <Goals    {...p} />}
        {tab === "Deliverables" && <Deliverables {...p} />}
        {tab === "Invoices"     && <Documents {...p} />}
        {tab === "Requests"     && <Requests  {...p} />}
        {tab === "Feedback"     && <Feedback  {...p} />}
        {tab === "Settings"     && <Settings  {...p} />}
        {tab === "Activity"     && <Activity  {...p} />}
      </div>
    </>
  );
}

function Overview({ client, prefs, filming, progress }: any) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card title="Client info">
        <KV k="Business" v={client.business_name} />
        <KV k="Contact" v={client.primary_contact_name} />
        <KV k="Email" v={client.billing_email} />
        <KV k="Industry" v={client.industry} />
        <KV k="Website" v={client.website_url} />
        <KV k="Plan" v={`${client.plan_name ?? "—"} · $${client.monthly_fee ?? 0}/mo`} />
      </Card>
      <Card title="Onboarding progress">
        <div className="text-[14px]">
          {progress?.length ? `${progress.filter((p:any)=>p.completed).length} / 10 steps complete` : "Not started"}
        </div>
        <div className="flex gap-1 mt-2">
          {Array.from({ length: 10 }).map((_, i) => {
            const done = progress?.some((p: any) => p.step_number === i+1 && p.completed);
            return <div key={i} className={`h-1.5 flex-1 rounded-full ${done ? "bg-grad" : "bg-[--border]"}`} />;
          })}
        </div>
      </Card>
      <Card title="Content preferences (read-only summary)">
        <KV k="Voice" v={prefs?.brand_voice_notes} />
        <KV k="Frequency" v={prefs?.posting_frequency} />
        <KV k="Approval" v={prefs?.approval_mode} />
      </Card>
      <Card title="Filming logistics (read-only summary)">
        <KV k="Address" v={filming?.primary_address} />
        <KV k="Days/times" v={filming?.best_days_times} />
        <KV k="Contact" v={filming?.key_contact_name} />
      </Card>
    </div>
  );
}

// ── Metrics tab: one row per calendar month ─────────────────────────────────
// A month is from META (source = 'meta' — "Live" while the daily sync still
// refreshes it, i.e. current + previous month; final once it's closed), a
// MANUAL OVERRIDE (any hand-entered row → sync paused for that month, your
// numbers are the truth) or empty. Profile visits / website clicks are never
// provided by Meta, so they stay hand-editable even on a Meta month.
type MetricField = { key: string; label: string; short: string; step?: string; fromMeta: boolean; paid?: boolean; leads?: boolean };
const METRIC_FIELDS: MetricField[] = [
  { key: "organic_reach",    label: "Organic reach",    short: "Organic",   fromMeta: true },
  { key: "paid_reach",       label: "Paid reach",       short: "Paid",      fromMeta: true, paid: true },
  { key: "profile_visits",   label: "Profile visits",   short: "Visits",    fromMeta: false },
  { key: "website_clicks",   label: "Website clicks",   short: "Clicks",    fromMeta: false },
  { key: "paid_spend",       label: "Paid spend ($)",   short: "Spend",     step: "0.01", fromMeta: true, paid: true },
  { key: "roas",             label: "ROAS (x)",         short: "ROAS",      step: "0.01", fromMeta: true, paid: true },
  // Counted from the ad account's Lead action events — see the Meta tab.
  { key: "leads",            label: "Leads",            short: "Leads",     fromMeta: true, paid: true, leads: true },
  { key: "followers_gained", label: "Followers gained", short: "Followers", fromMeta: true },
];

const pad2 = (n: number) => String(n).padStart(2, "0");
// UTC, so the month list agrees with the API and the daily cron.
const utcMonthKey = (d = new Date()) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
function shiftMonthKey(key: string, delta: number) {
  const [y, m] = key.split("-").map(Number);
  return utcMonthKey(new Date(Date.UTC(y, m - 1 + delta, 1)));
}
function monthBounds(key: string) {
  const [y, m] = key.split("-").map(Number);
  return { start: `${key}-01`, end: `${key}-${pad2(new Date(Date.UTC(y, m, 0)).getUTCDate())}` };
}
function monthLabelOf(key: string) {
  const [y, m] = key.split("-").map(Number);
  return { month: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }), year: String(y) };
}

function Metrics({ client, metrics, metaConn, leadsReady }: any) {
  const connected = !!metaConn;
  // The leads column only exists once migration 0015 has run.
  const fields = METRIC_FIELDS.filter((f) => !f.leads || leadsReady);
  const nowKey = utcMonthKey();
  const [earlier, setEarlier] = useState(0);

  // Same window the daily backfill uses; "Show earlier months" extends it.
  const dataMonths = (metrics ?? []).map((r: any) => String(r.period_end).slice(0, 7)).sort();
  const floor = shiftMonthKey(nowKey, -47);
  let from = shiftMonthKey(trackingWindowStart(client.created_at, dataMonths[0] ?? null, `${nowKey}-01`).slice(0, 7), -earlier);
  if (from < floor) from = floor;
  const keys: string[] = [];
  for (let k = nowKey; k >= from; k = shiftMonthKey(k, -1)) keys.push(k);
  const hiddenOlder = dataMonths.length > 0 && dataMonths[0] < from;

  const last = metaConn?.last_synced_at ? new Date(metaConn.last_synced_at) : null;
  const stale = connected && metaConn.sync_enabled && (!last || Date.now() - last.getTime() > 36 * 3600 * 1000);
  const trouble = connected && (!!metaConn.last_sync_error || stale);

  return (
    <div className="space-y-4">
      <div className="card p-4 text-[13px] flex items-start gap-3">
        <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
          !connected || !metaConn.sync_enabled ? "bg-[--subtle]" : trouble ? "bg-amber-500" : "bg-green-600"}`} />
        <div className="text-[--muted]">
          {connected ? (
            <>
              <b className="text-[--fg]">Meta connected{metaConn.ig_username ? ` · @${metaConn.ig_username}` : ""}.</b>{" "}
              {metaConn.sync_enabled
                ? "The current and previous month refresh from Meta every day, and empty earlier months fill in automatically a couple per day. Closed months are final."
                : "Daily auto-sync is switched off for this client (Meta tab) — use a month's Sync button to pull it on demand."}{" "}
              Override a month manually and its sync pauses — your numbers are the truth until you resume it.
              Profile visits and website clicks aren't available from Meta, so you can always fill those in by hand.
              <div className={`mt-1 text-[12px] ${trouble ? "text-amber-700" : "text-[--subtle]"}`}>
                Last full sync: {last ? last.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never"}
                {stale && " — nothing in the last 36 hours, check the Meta tab."}
                {!stale && metaConn.last_sync_error && " — finished with warnings, see the Meta tab."}
              </div>
            </>
          ) : (
            <>
              <b className="text-[--fg]">Meta not connected</b> — every month is entered by hand. Connect the
              client's Instagram in the <b>Meta</b> tab to sync months automatically.
            </>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="bg-[--warm]"><tr>
            <Th>Month</Th><Th>Status</Th>{fields.map((f) => <Th key={f.key}>{f.short}</Th>)}<Th></Th>
          </tr></thead>
          <tbody>
            {keys.map((k) => {
              const monthRows = (metrics ?? []).filter((r: any) => String(r.period_end).startsWith(k));
              const stamp = monthRows.map((r: any) => `${r.id}:${r.updated_at}`).join("|");
              return (
                <MonthRow key={`${k}-${stamp}`} client={client} monthKey={k} nowKey={nowKey}
                  monthRows={monthRows} metaConn={metaConn ?? null} fields={fields} />
              );
            })}
          </tbody>
        </table>
      </div>
      {!leadsReady && (
        <div className="text-[12px] text-amber-700">
          Leads column hidden — run <code>supabase/migrations/0015_leads.sql</code> in the Supabase SQL editor to enable it.
        </div>
      )}
      <button className="btn-ghost text-[12px]" onClick={() => setEarlier((n) => n + 6)} disabled={from <= floor}>
        Show earlier months{hiddenOlder ? " (there is older data)" : ""}
      </button>
    </div>
  );
}

function MonthRow({ client, monthKey, nowKey, monthRows, metaConn, fields }: any) {
  const sb = createClient();
  const connected = !!metaConn;
  const hasAdAccount = !!metaConn?.ad_account_id;
  const hasLeadEvents = Array.isArray(metaConn?.lead_action_types) && metaConn.lead_action_types.length > 0;
  const FIELDS: MetricField[] = fields;
  const b = monthBounds(monthKey);
  // Same pick as the client dashboard: the full-month row if there is one, else
  // the latest period_end (rows arrive sorted that way).
  const row = monthRows.find((r: any) => r.period_start === b.start && r.period_end === b.end) ?? monthRows[0] ?? null;
  // Any hand-entered row pauses the month's sync, so that is what "manual" means here too.
  const status: "meta" | "manual" | "empty" =
    !row ? "empty" : monthRows.some((r: any) => r.source !== "meta") ? "manual" : "meta";
  // Only the current + previous month are refreshed by the daily sync.
  const auto = connected && metaConn.sync_enabled && monthKey >= shiftMonthKey(nowKey, -1);

  const initialVals = () =>
    Object.fromEntries(FIELDS.map((f) => [f.key, row?.[f.key] == null ? "" : String(row[f.key])]));
  const [editing, setEditing] = useState(false);
  const [override, setOverrideState] = useState(false); // Meta month: unlock the Meta-provided fields
  const [busy, setBusy] = useState<null | "save" | "sync" | "delete">(null);
  const [vals, setVals] = useState<Record<string, string>>(initialVals);
  const { month, year } = monthLabelOf(monthKey);
  const label = `${month} ${year}`;

  // While connected, Meta owns these fields on a Meta month (paid ones only with an ad account).
  const metaOwned = (f: MetricField) =>
    connected && f.fromMeta && (!f.paid || hasAdAccount) && (!f.leads || hasLeadEvents);
  const locked = (f: MetricField) => status === "meta" && !override && metaOwned(f);
  function setOverride(on: boolean) {
    setOverrideState(on);
    if (!on) setVals(initialVals()); // drop abandoned edits to Meta's numbers
  }
  function openEdit() { setVals(initialVals()); setOverrideState(false); setEditing(true); }
  function cancelEdit() { setVals(initialVals()); setOverrideState(false); setEditing(false); }

  async function syncFromMeta(force: boolean) {
    if (force && !window.confirm(
      `Resume Meta sync for ${label}?\n\nYour manual numbers for this month are replaced with Meta's ` +
      `(profile visits and website clicks are kept).` +
      (auto ? " The month then keeps updating every day." : " It's a closed month, so Meta's numbers are final."))) return;
    setBusy("sync");
    try {
      const res = await fetch("/api/admin/meta", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_month", client_id: client.id, month: monthKey, parts: "metrics", force }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) throw new Error(j?.error ?? `HTTP ${res.status}`);
      const s = j.summary;
      if (s.metrics !== "written") {
        const why =
          s.metrics === "no-data" ? `Meta returned no data for ${label} — it may be older than Meta keeps, or the account had no activity.`
          : s.metrics === "kept-manual" ? `${label} is manually overridden.`
          : `Meta reported a problem:\n${(s.errors ?? []).slice(0, 4).join("\n")}`;
        alert(`${why}\n\nNothing was changed.`);
        return;
      }
      if (s.errors?.length) alert(`Synced ${label}, with warnings:\n${s.errors.slice(0, 4).join("\n")}`);
      location.reload();
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    } finally { setBusy(null); }
  }

  async function save() {
    // A Meta month stays Meta's unless the admin explicitly overrides it.
    const manualSave = status !== "meta" || override || !connected;
    if (status === "meta" && connected && override && !window.confirm(
      `Override ${label} manually?\n\nMeta sync pauses for this month and your numbers become the truth until you resume sync.`)) return;
    setBusy("save");
    try {
      const patch: any = { period_start: b.start, period_end: b.end };
      for (const f of FIELDS) {
        if (!(manualSave || !metaOwned(f))) continue;
        const n = vals[f.key] === "" ? null : Number(vals[f.key]);
        patch[f.key] = n != null && !f.step ? Math.round(n) : n; // count columns are integers
      }
      if (manualSave) patch.source = "manual";
      if (row) {
        const { data, error } = await sb.from("dashboard_metrics").update(patch).eq("id", row.id).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("This month changed since the page loaded — reload and try again.");
      } else {
        // Upsert: if the daily sync created the month meanwhile, the manual entry still wins.
        const { error } = await sb.from("dashboard_metrics")
          .upsert({ client_id: client.id, ...patch }, { onConflict: "client_id,period_start,period_end" });
        if (error) throw error;
      }
      // One row per month: older partial-period rows would shadow this one.
      const extras = monthRows.filter((r: any) => r.id !== row?.id).map((r: any) => r.id);
      if (manualSave && row && extras.length) await sb.from("dashboard_metrics").delete().in("id", extras);
      location.reload();
    } catch (err: any) {
      alert(`Save failed: ${err.message ?? err}`);
    } finally { setBusy(null); }
  }

  async function clearMonth() {
    if (!row || !window.confirm(`Clear all numbers for ${label}?` +
      (connected ? "\n\nThe month goes back to empty — sync it from Meta again whenever you like." : ""))) return;
    setBusy("delete");
    try {
      const { error } = await sb.from("dashboard_metrics").delete().in("id", monthRows.map((r: any) => r.id));
      if (error) throw error;
      location.reload();
    } catch (err: any) {
      alert(`Delete failed: ${err.message ?? err}`);
    } finally { setBusy(null); }
  }

  const fmt = (f: MetricField) => {
    const v = row?.[f.key];
    if (v == null) return "—";
    if (f.key === "paid_spend") return `$${Number(v).toLocaleString("en-US")}`;
    if (f.key === "roas") return `${v}x`;
    return Number(v).toLocaleString("en-US");
  };
  const updated = row?.updated_at
    ? new Date(row.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : null;

  const monthCell = (
    <Td className="whitespace-nowrap">
      <span className="font-semibold">{month}</span> <span className="text-[--subtle] text-[11px]">{year}</span>
    </Td>
  );
  const badge = (dot: string, text: string, tone: string, sub?: string | null) => (
    <div>
      <span className={`inline-flex items-center gap-1.5 font-medium ${tone}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />{text}
      </span>
      {sub && <div className="text-[11px] text-[--subtle]">{sub}</div>}
    </div>
  );
  const statusCell = (
    <Td className="whitespace-nowrap">
      {status === "meta" && auto && badge("bg-green-600", "Live · Meta", "text-green-700", updated && `updated ${updated}`)}
      {status === "meta" && !auto && connected && metaConn.sync_enabled &&
        badge("bg-sky-600", "From Meta · final", "text-sky-700", "closed month")}
      {status === "meta" && !auto && !(connected && metaConn.sync_enabled) &&
        badge("bg-[--subtle]", "From Meta", "text-[--muted]", connected ? "auto-sync is off" : "Meta disconnected")}
      {status === "manual" && badge("bg-amber-500", "Manual override", "text-amber-700", connected ? "sync paused" : null)}
      {status === "empty" && <span className="text-[--subtle]">No data</span>}
    </Td>
  );

  if (!editing) {
    return (
      <tr className="border-t border-[--border]">
        {monthCell}
        {statusCell}
        {FIELDS.map((f) => <Td key={f.key}>{fmt(f)}</Td>)}
        <Td className="text-right whitespace-nowrap">
          {connected && status === "meta" && (
            <button disabled={busy !== null} className="btn-ghost !py-1 !text-[11px]" onClick={() => syncFromMeta(false)}>
              {busy === "sync" ? "Syncing…" : "Sync now"}
            </button>
          )}
          {connected && status === "empty" && (
            <button disabled={busy !== null} className="btn-primary !py-1 !text-[11px]" onClick={() => syncFromMeta(false)}>
              {busy === "sync" ? "Syncing…" : "Sync from Meta"}
            </button>
          )}
          {connected && status === "manual" && (
            <button disabled={busy !== null} className="btn-ghost !py-1 !text-[11px]" onClick={() => syncFromMeta(true)}>
              {busy === "sync" ? "Syncing…" : "Resume sync"}
            </button>
          )}
          <button disabled={busy !== null} className="btn-ghost !py-1 !text-[11px] ml-1" onClick={openEdit}>
            {status === "empty" ? "Enter manually" : "Edit"}
          </button>
        </Td>
      </tr>
    );
  }

  return (
    <>
      <tr className="border-t border-[--border] bg-[--warm]/50 align-top">
        {monthCell}
        {statusCell}
        {FIELDS.map((f) => (
          <Td key={f.key}>
            <input
              type="number"
              step={f.step ?? "1"}
              disabled={locked(f)}
              title={locked(f) ? "Provided by Meta — tick “Override Meta numbers” to edit" : undefined}
              className="input !py-1 !text-[12px] !w-20 disabled:opacity-50 disabled:cursor-not-allowed"
              value={vals[f.key]}
              onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
            />
          </Td>
        ))}
        <Td className="text-right whitespace-nowrap">
          <button disabled={busy !== null} className="btn-primary !py-1 !text-[11px]" onClick={save}>{busy === "save" ? "…" : "Save"}</button>
          <button disabled={busy !== null} className="btn-ghost !py-1 !text-[11px] ml-1" onClick={cancelEdit}>Cancel</button>
        </Td>
      </tr>
      <tr className="bg-[--warm]/50">
        <td colSpan={FIELDS.length + 3} className="px-3 pb-3 text-[12px] text-[--muted]">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {status === "meta" && connected ? (
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                <span>
                  <b className="text-[--fg]">Override Meta numbers</b> — pauses sync for {label}; your numbers become the truth.
                  Unticked, you're only editing the fields Meta doesn't provide and the month stays Meta's.
                </span>
              </label>
            ) : status === "meta" ? (
              <span>Meta isn't connected any more — saving turns {label} into a manual month.</span>
            ) : status === "manual" ? (
              <span>Manual override{connected ? " — Meta sync is paused for this month. Use “Resume sync” to hand it back to Meta." : "."}</span>
            ) : (
              <span>Entering {label} by hand{connected ? " marks it as a manual override — Meta sync won't touch it." : "."}</span>
            )}
            {row && (
              <button disabled={busy !== null} onClick={clearMonth}
                className="text-[11px] px-2 py-1 rounded-pill border border-red-200 text-red-700 hover:bg-red-50">
                {busy === "delete" ? "…" : "Clear month"}
              </button>
            )}
          </div>
        </td>
      </tr>
    </>
  );
}

const AD_EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
  "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
};

function WinningReels({ client, winning, topAds, metaConn }: any) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonthState] = useState(defaultMonth);
  // Survive the location.reload() after save/remove (the tab itself survives
  // via the URL hash; the picked month lives in sessionStorage).
  useEffect(() => {
    const saved = sessionStorage.getItem(`wr-month-${client.id}`);
    if (saved && /^\d{4}-\d{2}$/.test(saved)) setMonthState(saved);
  }, [client.id]);
  function setMonth(m: string) {
    setMonthState(m);
    try { sessionStorage.setItem(`wr-month-${client.id}`, m); } catch {}
  }
  const monthValid = /^\d{4}-\d{2}$/.test(month);
  const [busy, setBusy] = useState<number | null>(null);
  const [adBusy, setAdBusy] = useState(false);
  const [reelSync, setReelSync] = useState(false);
  const sb = createClient();
  const rows = monthValid ? (winning ?? []).filter((w: any) => String(w.month).startsWith(month)) : [];
  const rowFor = (pos: number) => rows.find((w: any) => w.position === pos);
  const adRow = monthValid ? (topAds ?? []).find((a: any) => String(a.month).startsWith(month)) : undefined;
  const monthsWithData: string[] = Array.from(
    new Set([...(winning ?? []), ...(topAds ?? [])].map((w: any) => String(w.month).slice(0, 7))),
  ).sort().reverse() as string[];

  function storagePathFromUrl(url: string): string | null {
    const marker = "/storage/v1/object/public/thumbnails/";
    const i = url.indexOf(marker);
    return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length));
  }

  async function save(e: React.FormEvent, position: number) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const url = String(f.get("url") ?? "").trim();
    if (!monthValid) { alert("Pick a month first."); return; }
    if (!/^https?:\/\//i.test(url)) { alert("Paste the full link, starting with https://"); return; }
    // Optional uploaded image → data URL (takes precedence over auto-fetch).
    const file = f.get("thumbnail_file") as File | null;
    let thumbnail_data = "";
    if (file && file.size > 0) {
      if (file.size > 5 * 1024 * 1024) { alert("Image must be under 5 MB."); return; }
      if (!file.type.startsWith("image/")) { alert("That file isn't an image."); return; }
      thumbnail_data = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
    }
    setBusy(position);
    try {
      const res = await fetch("/api/admin/winning-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: client.id,
          month,
          position,
          url,
          title: String(f.get("title") ?? "").trim(),
          metric_label: String(f.get("metric_label") ?? "").trim(),
          // Blank = auto-fetch. Only sent when the admin pasted an override.
          thumbnail_url: String(f.get("thumbnail_url") ?? "").trim(),
          thumbnail_data,
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        alert(j?.error ?? "Save failed");
        return;
      }
      if (j && !j.thumbnail_resolved) {
        alert("Saved — but no thumbnail could be pulled from that link. To add one: upload an image (or paste an image URL) in the same slot and press Update.");
      }
      location.reload();
    } catch {
      alert("Save failed — network error.");
    } finally {
      setBusy(null);
    }
  }

  // Reels for the month are LIVE (all rows from Meta), MANUAL (any hand-picked
  // row → sync paused for the month) or empty.
  const reelsStatus: "live" | "manual" | "empty" =
    !rows.length ? "empty" : rows.every((w: any) => w.source === "meta") ? "live" : "manual";
  // The daily sync only refreshes the current + previous month.
  const reelsAuto = !!metaConn?.sync_enabled && monthValid && month >= shiftMonthKey(utcMonthKey(), -1);

  async function syncReels(force: boolean) {
    if (force && !confirm(`Resume Meta sync for ${month}?\n\nYour hand-picked reels for this month are replaced with Meta's top 3 by views, and the month goes back to updating automatically.`)) return;
    setReelSync(true);
    try {
      const res = await fetch("/api/admin/meta", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync_month", client_id: client.id, month, parts: "reels", force }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) throw new Error(j?.error ?? `HTTP ${res.status}`);
      const s = j.summary;
      if (typeof s.reels !== "number") {
        alert(`Reels weren't updated (${s.reels}).\n${(s.errors ?? []).slice(0, 4).join("\n")}`);
        return;
      }
      if (s.reels === 0) { alert(`Meta found no reels posted in ${month}.`); return; }
      location.reload();
    } catch (err: any) {
      alert(`Sync failed: ${err.message}`);
    } finally { setReelSync(false); }
  }

  // Top-performing-ad upload goes browser → storage directly: Vercel API
  // routes cap request bodies at ~4.5 MB, far too small for ad videos.
  async function saveAd(e: React.FormEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    if (!monthValid) { alert("Pick a month first."); return; }
    const file = f.get("ad_file") as File | null;
    const title = String(f.get("ad_title") ?? "").trim() || null;
    const metric_label = String(f.get("ad_metric") ?? "").trim() || null;
    const hasNewFile = !!(file && file.size > 0);
    if (!hasNewFile && !adRow) { alert("Choose a photo or video first."); return; }
    setAdBusy(true);
    try {
      let media_url = adRow?.media_url;
      let media_type = adRow?.media_type;
      if (hasNewFile) {
        media_type = file!.type.startsWith("video/") ? "video" : file!.type.startsWith("image/") ? "image" : null;
        if (!media_type) { alert("That file isn't a photo or video."); return; }
        if (/heic|heif/i.test(file!.type)) {
          alert("iPhone HEIC photos don't display in most browsers — please export it as JPG or PNG first.");
          return;
        }
        if (file!.size > 50 * 1024 * 1024) { alert("Keep it under 50 MB (Supabase file limit)."); return; }
        const ext = AD_EXT_BY_TYPE[file!.type] ?? (file!.name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${client.id}/ad-${month}-${Date.now()}.${ext}`;
        const { error: upErr } = await sb.storage.from("thumbnails").upload(path, file!, {
          contentType: file!.type, upsert: true,
        });
        if (upErr) {
          const hint = /row-level security|policy/i.test(upErr.message)
            ? " (Has the 0013 migration been run in the Supabase SQL editor?)" : "";
          alert(`Upload failed: ${upErr.message}${hint}`);
          return;
        }
        media_url = sb.storage.from("thumbnails").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await sb.from("top_ad").upsert(
        { client_id: client.id, month: `${month}-01`, media_url, media_type, title, metric_label },
        { onConflict: "client_id,month" },
      );
      if (error) { alert(`Save failed: ${error.message}`); return; }
      // Best-effort cleanup of the replaced file so old creative doesn't stay
      // publicly reachable in the bucket forever.
      if (hasNewFile && adRow?.media_url && adRow.media_url !== media_url) {
        const old = storagePathFromUrl(adRow.media_url);
        if (old) await sb.storage.from("thumbnails").remove([old]).then(() => {}, () => {});
      }
      location.reload();
    } catch (err: any) {
      alert(`Save failed: ${err?.message ?? "network error"}`);
    } finally {
      setAdBusy(false);
    }
  }

  async function removeAd() {
    if (!adRow || !confirm(`Remove the top performing ad for ${month}?`)) return;
    const { error } = await sb.from("top_ad").delete().eq("id", adRow.id);
    if (error) { alert(`Delete failed: ${error.message}`); return; }
    // Best-effort: also delete the media file so it stops being reachable.
    const old = storagePathFromUrl(adRow.media_url ?? "");
    if (old) await sb.storage.from("thumbnails").remove([old]).then(() => {}, () => {});
    location.reload();
  }

  async function remove(id: string, pos: number) {
    if (!confirm(`Remove winning reel #${pos} for ${month}?`)) return;
    try {
      const res = await fetch("/api/admin/winning-content", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        alert(j?.error ?? "Delete failed");
        return;
      }
      location.reload();
    } catch {
      alert("Delete failed — network error.");
    }
  }

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-bold">Top performing content</h3>
          <p className="text-[12px] text-[--muted]">
            The month's best performers, shown as one row on the client dashboard:
            three reels (paste links — thumbnails are pulled automatically) plus one
            top ad (upload a photo or video).
          </p>
        </div>
        <div>
          <label className="label-text mb-1 block">Month</label>
          <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
        </div>
      </div>

      {monthsWithData.length > 0 && (
        <div className="flex gap-1.5 flex-wrap items-center text-[12px] text-[--muted]">
          <span>Months with content:</span>
          {monthsWithData.map((m) => (
            <button key={m} type="button" onClick={() => setMonth(m)}
              className={`px-2 py-0.5 rounded-full border transition-colors ${m === month
                ? "border-[--orange] text-[--fg] font-semibold"
                : "border-[--border] hover:border-[--subtle]"}`}>
              {m}
            </button>
          ))}
        </div>
      )}

      {metaConn && monthValid && (
        <div className="flex items-center justify-between gap-3 flex-wrap text-[12px] border border-[--border] rounded-lg px-3 py-2">
          {reelsStatus === "live" && (
            <span className="inline-flex items-center gap-1.5 text-green-700 font-medium">
              <span className={`w-1.5 h-1.5 rounded-full ${reelsAuto ? "bg-green-600" : "bg-sky-600"}`} />
              {reelsAuto ? "Live · top 3 by views from Meta, refreshed daily"
                : metaConn.sync_enabled ? "From Meta · top 3 by views — closed month, press Sync now to re-rank"
                : "From Meta · top 3 by views — auto-sync is off"}
            </span>
          )}
          {reelsStatus === "manual" && (
            <span className="inline-flex items-center gap-1.5 text-amber-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />Manual picks — Meta sync is paused for this month
            </span>
          )}
          {reelsStatus === "empty" && <span className="text-[--muted]">No reels for this month yet.</span>}
          <button type="button" className="btn-ghost !py-1 !text-[11px]" disabled={reelSync || adBusy || busy !== null}
            onClick={() => syncReels(reelsStatus === "manual")}>
            {reelSync ? "Syncing…" : reelsStatus === "manual" ? "Resume sync" : reelsStatus === "live" ? "Sync now" : "Sync from Meta"}
          </button>
        </div>
      )}

      {[1, 2, 3].map((pos) => {
        const row = rowFor(pos);
        return (
          <form key={`${month}-${pos}-${row?.id ?? "new"}`} onSubmit={(e) => save(e, pos)}
            className="border border-[--border] rounded-lg p-4 flex gap-4 items-start">
            {row?.thumbnail_url ? (
              <a href={row.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={row.thumbnail_url} alt={`#${pos} thumbnail`} referrerPolicy="no-referrer"
                  className="w-[72px] h-[96px] object-cover rounded-md border border-[--border]" />
              </a>
            ) : (
              <div className="shrink-0 w-[72px] h-[96px] rounded-md bg-[--warm] border border-[--border] flex items-center justify-center text-[--subtle] text-[20px]">
                {row ? "▶" : `#${pos}`}
              </div>
            )}
            <div className="flex-1 space-y-2">
              <Inp name="url" label={`#${pos} link`} defaultValue={row?.url ?? ""} placeholder="https://www.instagram.com/reel/…" required />
              <div className="grid grid-cols-2 gap-3">
                <Inp name="title" label="Title (optional)" defaultValue={row?.title ?? ""} placeholder="Hook that carried it" />
                <Inp name="metric_label" label="Performance (optional)" defaultValue={row?.metric_label ?? ""} placeholder="182k views · 4.1k saves" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Inp name="thumbnail_url" label="Custom image URL (optional)"
                  placeholder={row?.thumbnail_url ? "Auto-fetched — paste a URL to replace" : "https://…/screenshot.jpg"} />
                <Inp name="thumbnail_file" label="Or upload an image (optional)" type="file" accept="image/*" />
              </div>
              <div className="flex gap-2">
                <button className="btn-primary text-[13px]" disabled={busy === pos || !monthValid || adBusy || reelSync}>
                  {busy === pos ? "Saving…" : row ? "Update" : "Save"}
                </button>
                {row && (
                  <button type="button" onClick={() => remove(row.id, pos)} className="btn-ghost text-[13px]" disabled={adBusy}>
                    Remove
                  </button>
                )}
              </div>
            </div>
          </form>
        );
      })}

      <div className="border-t border-[--border] pt-4 space-y-3">
        <div>
          <h4 className="font-bold text-[14px]">Top performing ad</h4>
          <p className="text-[12px] text-[--muted]">
            Upload a photo or video of the month's best ad. Shows next to the reels on the
            client dashboard. One per month; uploading again replaces it.
          </p>
        </div>
        <form key={`ad-${month}-${adRow?.id ?? "new"}`} onSubmit={saveAd} className="border border-[--border] rounded-lg p-4 flex gap-4 items-start">
          {adRow ? (
            adRow.media_type === "video" ? (
              <video src={adRow.media_url} className="shrink-0 w-[72px] h-[96px] object-cover rounded-md border border-[--border] bg-black" muted playsInline preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={adRow.media_url} alt="Top ad" className="shrink-0 w-[72px] h-[96px] object-cover rounded-md border border-[--border]" />
            )
          ) : (
            <div className="shrink-0 w-[72px] h-[96px] rounded-md bg-[--warm] border border-[--border] flex items-center justify-center text-[--subtle] text-[18px]">AD</div>
          )}
          <div className="flex-1 space-y-2">
            <Inp name="ad_file" type="file" accept="image/*,video/mp4,video/quicktime,video/webm"
              label={adRow ? "Replace photo / video (optional)" : "Photo or video (max 50 MB)"} />
            <div className="grid grid-cols-2 gap-3">
              <Inp name="ad_title" label="Title (optional)" defaultValue={adRow?.title ?? ""} placeholder="Spring promo ad" />
              <Inp name="ad_metric" label="Performance (optional)" defaultValue={adRow?.metric_label ?? ""} placeholder="3.2x ROAS · $1.2k spend" />
            </div>
            <div className="flex gap-2">
              <button className="btn-primary text-[13px]" disabled={adBusy || !monthValid || busy !== null}>
                {adBusy ? "Uploading… (keep this page open)" : adRow ? "Update ad" : "Save ad"}
              </button>
              {adRow && (
                <button type="button" onClick={removeAd} className="btn-ghost text-[13px]" disabled={adBusy}>Remove</button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function Content({ client, prefs, progress, winning, topAds, metaConn }: any) {
  // Pull onboarding blobs for content-related steps. Content prefs (5),
  // talent (6), and approval workflow (8) all feed creative direction.
  const stepData = (n: number) => (progress ?? []).find((r: any) => r.step_number === n)?.data ?? {};
  const step5 = stepData(5);
  const step6 = stepData(6);
  const step8 = stepData(8);
  const step9 = stepData(9);
  const sb = createClient();
  async function saveUploadUrl(e: React.FormEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const url = String(f.get("content_upload_url") ?? "").trim() || null;
    if (url && !/^https?:\/\//i.test(url)) {
      alert("URL must start with http:// or https://");
      return;
    }
    await sb.from("clients").update({ content_upload_url: url }).eq("id", client.id);
    location.reload();
  }
  return (
    <div className="space-y-4">
      <WinningReels client={client} winning={winning} topAds={topAds} metaConn={metaConn} />

      <form onSubmit={saveUploadUrl} className="card p-5 space-y-3">
        <h3 className="font-bold">Content upload link</h3>
        <p className="text-[12px] text-[--muted] -mt-1">
          Paste the Frame.io / Dropbox / Drive / WeTransfer link. Renders as a big orange
          "Upload content" button on the client dashboard. Leave blank to hide the button.
        </p>
        <Inp name="content_upload_url" label="URL" defaultValue={client.content_upload_url ?? ""} />
        <button className="btn-primary">Save upload link</button>
      </form>

      <div className="card p-5 space-y-4">
        <div>
          <h3 className="font-bold">Content brief (from onboarding)</h3>
          <p className="text-[12px] text-[--muted]">Read-only mirror — edit upstream from onboarding answers / Content Settings.</p>
        </div>

        <div className="label-text border-b border-[--border] pb-1">Content preferences</div>
        <ReadField label="Dream customers" value={prefs?.dream_customers ?? step5.dream_customers} />
        <ReadField label="Topics to avoid" value={prefs?.topics_to_avoid ?? step5.blacklist} />
        <ReadField label="Compliance / legal notes" value={prefs?.compliance_notes ?? step5.compliance_notes} />
        <div className="grid grid-cols-2 gap-3">
          <ReadField label="Approval mode (Conversion Content)" value={prefs?.approval_mode} compact />
          <ReadField label="Posting frequency" value={prefs?.posting_frequency} compact />
        </div>

        <div className="label-text border-b border-[--border] pb-1 pt-2">Talent &amp; on-camera</div>
        <ReadField label="People who CAN appear on camera" value={step6.on_camera} />
        <ReadField label="People who should NOT appear on camera" value={step6.off_camera} />

        <div className="label-text border-b border-[--border] pb-1 pt-2">Approval workflow — Conversion / Ad content</div>
        <div className="grid grid-cols-2 gap-3">
          <ReadField label="Approver name" value={step8.ad_approver_name} compact />
          <ReadField label="Approver email" value={step8.ad_approver_email} compact />
          <ReadField label="Turnaround" value={step8.ad_turnaround} compact />
          <ReadField
            label="Agreed to no pre-approval"
            value={step8.conversion_no_preapproval === undefined ? null : (step8.conversion_no_preapproval ? "Yes" : "No")}
            compact
          />
        </div>
        <ReadField label="Escalation contact" value={step8.ad_escalation} />

        <div className="label-text border-b border-[--border] pb-1 pt-2">Goals &amp; KPIs</div>
        <div className="grid grid-cols-2 gap-3">
          <ReadField label="Primary KPI" value={step9.primary_kpi} compact />
          <ReadField label="30-day target" value={step9.target_30} compact />
          <ReadField label="60-day target" value={step9.target_60} compact />
          <ReadField label="90-day target" value={step9.target_90} compact />
        </div>
        <ReadField label="Baseline metrics" value={step9.baseline} />
      </div>
    </div>
  );
}


function Goals({ client, goals }: any) {
  const sb = createClient();
  async function update(id: string, patch: any) {
    await sb.from("monthly_goals").update(patch).eq("id", id);
    location.reload();
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const monthInput = String(f.get("month") || "");
    if (!monthInput) return alert("Pick a month.");
    await sb.from("monthly_goals").upsert({
      client_id: client.id,
      month: `${monthInput}-01`,
      kpi_label: String(f.get("kpi_label") || ""),
      target_value: String(f.get("target_value") || "") || null,
      current_value: String(f.get("current_value") || "") || null,
      status: String(f.get("status") || "on_track"),
      notes: String(f.get("notes") || "") || null,
    }, { onConflict: "client_id,month" });
    location.reload();
  }
  async function remove(id: string) {
    if (!confirm("Delete this monthly goal?")) return;
    await sb.from("monthly_goals").delete().eq("id", id);
    location.reload();
  }
  const tm = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; })();
  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card p-5 space-y-3">
        <h3 className="font-bold">Add / update monthly goal</h3>
        <p className="text-[12px] text-[--muted] -mt-1">Re-saving the same month overwrites it.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Inp name="month" label="Month" type="month" defaultValue={tm} required />
          <Inp name="kpi_label" label="KPI" required />
          <Inp name="target_value" label="Target" />
          <Inp name="current_value" label="Current" />
          <Sel name="status" label="Status" options={[
            ["on_track","On track"],["at_risk","At risk"],["achieved","Achieved"],["missed","Missed"],
          ]} />
        </div>
        <div>
          <label className="label-text mb-1 block">Notes</label>
          <textarea name="notes" rows={2} className="textarea" />
        </div>
        <button className="btn-primary">Save goal</button>
      </form>

      <div className="card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[--warm]"><tr>
            <Th>Month</Th><Th>KPI</Th><Th>Target</Th><Th>Current</Th><Th>Status</Th><Th></Th>
          </tr></thead>
          <tbody>{(goals ?? []).map((g: any) => (
            <tr key={g.id} className="border-t border-[--border] align-top">
              <Td>{(() => { const [y,m] = String(g.month).slice(0,7).split("-").map(Number); return new Date(y,(m||1)-1,1).toLocaleDateString(undefined, { month: "short", year: "numeric" }); })()}</Td>
              <Td>{g.kpi_label}</Td>
              <Td>{g.target_value ?? "—"}</Td>
              <Td>
                <input className="input !py-1 !text-[12px] !w-28" defaultValue={g.current_value ?? ""}
                  onBlur={(e) => e.target.value !== (g.current_value ?? "") && update(g.id, { current_value: e.target.value || null })} />
              </Td>
              <Td>
                <select className="select !py-1 !text-[12px]" defaultValue={g.status}
                  onChange={(e) => update(g.id, { status: e.target.value })}>
                  {["on_track","at_risk","achieved","missed"].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </Td>
              <Td><button onClick={() => remove(g.id)} className="text-[11px] text-red-700 hover:underline">Delete</button></Td>
            </tr>
          ))}{!goals?.length && <tr><td colSpan={6} className="p-4 text-center text-[--muted]">No monthly goals yet.</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

const DELIVERABLE_TYPES: [string, string][] = [
  ["reach_reel", "Reach Reel"],
  ["conversion_content", "Conversion"],
  ["paid_ad", "Paid ad"],
];

function monthKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}
function monthLabel(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function shiftMonth(iso: string, delta: number) {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + delta);
  return monthKey(d);
}

function MonthlyHours({ client, hours }: { client: any; hours: any[] }) {
  const sb = createClient();
  const [selectedMonth, setSelectedMonth] = useState<string>(monthKey());
  const current = hours.find((h) => h.month === selectedMonth);
  const [delivered, setDelivered] = useState<string>(current ? String(current.hours_delivered) : "0");
  const [target, setTarget] = useState<string>(current ? String(current.hours_target) : "12");
  const [busy, setBusy] = useState(false);

  // When month changes, refresh inputs from existing row (or defaults).
  function switchMonth(m: string) {
    setSelectedMonth(m);
    const row = hours.find((h) => h.month === m);
    setDelivered(row ? String(row.hours_delivered) : "0");
    setTarget(row ? String(row.hours_target) : "12");
  }

  async function save() {
    setBusy(true);
    try {
      const { error } = await sb.from("monthly_hours").upsert({
        client_id: client.id,
        month: selectedMonth,
        hours_delivered: Number(delivered || 0),
        hours_target: Number(target || 12),
      }, { onConflict: "client_id,month" });
      if (error) throw error;
      location.reload();
    } catch (err: any) {
      alert(err.message ?? "Save failed");
    } finally { setBusy(false); }
  }

  const dNum = Number(delivered || 0);
  const tNum = Number(target || 12);
  const pct = tNum > 0 ? (dNum / tNum) * 100 : 0;
  const over = pct > 100;
  const max = Math.max(24, tNum * 2);
  const isCurrentMonth = selectedMonth === monthKey();

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-baseline justify-between">
        <h3 className="font-bold">Monthly hours</h3>
        <span className="text-[12px] text-[--muted]">resets on the 1st</span>
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-ghost !py-1 !text-[12px]"
          onClick={() => switchMonth(shiftMonth(selectedMonth, -1))}
          aria-label="Previous month"
        >←</button>
        <input
          type="month"
          className="input !py-1 !text-[13px]"
          value={selectedMonth.slice(0, 7)}
          onChange={(e) => e.target.value && switchMonth(`${e.target.value}-01`)}
        />
        <button
          type="button"
          className="btn-ghost !py-1 !text-[12px]"
          onClick={() => switchMonth(shiftMonth(selectedMonth, 1))}
          aria-label="Next month"
        >→</button>
        {!isCurrentMonth && (
          <button
            type="button"
            className="btn-ghost !py-1 !text-[12px]"
            onClick={() => switchMonth(monthKey())}
          >Today</button>
        )}
        <span className="ml-auto text-[13px] font-semibold">{monthLabel(selectedMonth)}</span>
      </div>

      <div>
        <div className="flex justify-between text-[13px] mb-1">
          <span className="font-semibold">{dNum.toFixed(2)} hrs delivered</span>
          <span className={over ? "text-green-700 font-semibold" : "text-[--muted]"}>
            of {tNum} target{over ? ` · +${(dNum - tNum).toFixed(2)} over` : ""}
          </span>
        </div>
        <div className="h-2 bg-[--border] rounded-full overflow-hidden relative">
          <div className="h-full bg-grad" style={{ width: `${Math.min(100, pct)}%` }} />
          {over && (
            <div className="absolute top-0 left-0 h-full bg-green-500 opacity-70"
              style={{ width: `${Math.min(100, ((dNum - tNum) / tNum) * 100)}%` }} />
          )}
        </div>
      </div>

      <div>
        <label className="label-text mb-1 block">Hours delivered</label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={max}
            step={0.25}
            value={dNum}
            onChange={(e) => setDelivered(e.target.value)}
            className="flex-1"
          />
          <input
            type="number"
            min={0}
            step={0.25}
            value={delivered}
            onChange={(e) => setDelivered(e.target.value)}
            className="input !py-1 !text-[13px] !w-24"
          />
        </div>
      </div>

      <div className="flex items-end gap-3">
        <div>
          <label className="label-text mb-1 block">Target (hrs)</label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="input !py-1 !text-[13px] !w-24"
          />
        </div>
        <button disabled={busy} className="btn-primary" onClick={save}>
          {busy ? "…" : current ? "Update" : "Save"} {monthLabel(selectedMonth)}
        </button>
      </div>

      {hours.length > 0 && (
        <div className="pt-4 border-t border-[--border]">
          <h4 className="font-semibold text-[13px] mb-2">History</h4>
          <div className="space-y-1">
            {hours.map((h) => (
              <HoursHistoryRow key={h.id} h={h} onLoad={() => switchMonth(h.month)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function HoursHistoryRow({ h, onLoad }: { h: any; onLoad: () => void }) {
  const sb = createClient();
  const [busy, setBusy] = useState(false);
  const p = h.hours_target > 0 ? (h.hours_delivered / h.hours_target) * 100 : 0;
  const o = p > 100;

  async function remove() {
    if (!window.confirm(`Delete hours for ${monthLabel(h.month)}?`)) return;
    setBusy(true);
    try {
      const { error } = await sb.from("monthly_hours").delete().eq("id", h.id);
      if (error) throw error;
      location.reload();
    } catch (err: any) {
      alert(err.message ?? "Delete failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-3 text-[12px] py-1">
      <span className="w-28 text-[--muted]">{monthLabel(h.month)}</span>
      <div className="flex-1 h-1.5 bg-[--border] rounded-full overflow-hidden">
        <div className={`h-full ${o ? "bg-green-500" : "bg-grad"}`} style={{ width: `${Math.min(100, p)}%` }} />
      </div>
      <span className="w-28 text-right">{Number(h.hours_delivered).toFixed(2)} / {Number(h.hours_target).toFixed(2)} hrs</span>
      <button className="btn-ghost !py-0.5 !text-[10px]" onClick={onLoad}>Edit</button>
      <button
        disabled={busy}
        onClick={remove}
        className="text-[10px] px-2 py-0.5 rounded-pill border border-red-200 text-red-700 hover:bg-red-50"
      >Delete</button>
    </div>
  );
}

function Deliverables({ client, deliverables, hours }: any) {
  const sb = createClient();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const obj: any = Object.fromEntries(f.entries());
    obj.contracted_count = Number(obj.contracted_count || 0);
    obj.delivered_count  = Number(obj.delivered_count  || 0);
    obj.client_id = client.id;
    await sb.from("deliverables").upsert(obj, { onConflict: "client_id,period_start,period_end,content_type" });
    location.reload();
  }
  return (
    <div className="space-y-4">
      <MonthlyHours client={client} hours={hours ?? []} />
      <form onSubmit={submit} className="card p-5 space-y-3">
        <h3 className="font-bold">Add / update deliverable</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Inp name="period_start" label="Period start" type="date" required />
          <Inp name="period_end"   label="Period end"   type="date" required />
          <Sel name="content_type" label="Content type" options={DELIVERABLE_TYPES} required />
          <Inp name="contracted_count" label="Contracted" type="number" required />
          <Inp name="delivered_count"  label="Delivered"  type="number" required />
        </div>
        <button className="btn-primary">Save</button>
        <p className="text-[12px] text-[--muted]">Adding the same period + type updates the existing row.</p>
      </form>
      <div className="card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[--warm]"><tr>
            <Th>Period start</Th><Th>Period end</Th><Th>Type</Th><Th>Delivered</Th><Th>Contracted</Th><Th></Th>
          </tr></thead>
          <tbody>
            {deliverables.map((d: any) => <DeliverableRow key={d.id} d={d} />)}
            {!deliverables.length && <tr><td colSpan={6} className="p-4 text-center text-[--muted]">No deliverables.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DeliverableRow({ d }: { d: any }) {
  const sb = createClient();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [periodStart, setPeriodStart] = useState<string>(d.period_start);
  const [periodEnd, setPeriodEnd] = useState<string>(d.period_end);
  const [contentType, setContentType] = useState<string>(d.content_type);
  const [delivered, setDelivered] = useState<string>(String(d.delivered_count ?? 0));
  const [contracted, setContracted] = useState<string>(String(d.contracted_count ?? 0));

  async function save() {
    setBusy(true);
    try {
      const { error } = await sb.from("deliverables").update({
        period_start: periodStart,
        period_end: periodEnd,
        content_type: contentType,
        delivered_count: Number(delivered || 0),
        contracted_count: Number(contracted || 0),
      }).eq("id", d.id);
      if (error) throw error;
      location.reload();
    } catch (err: any) {
      alert(err.message ?? "Save failed");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm("Delete this deliverable row?")) return;
    setBusy(true);
    try {
      const { error } = await sb.from("deliverables").delete().eq("id", d.id);
      if (error) throw error;
      location.reload();
    } catch (err: any) {
      alert(err.message ?? "Delete failed");
    } finally { setBusy(false); }
  }

  if (!editing) {
    return (
      <tr className="border-t border-[--border]">
        <Td>{d.period_start}</Td>
        <Td>{d.period_end}</Td>
        <Td>{DELIVERABLE_TYPES.find(([v]) => v === d.content_type)?.[1] ?? d.content_type}</Td>
        <Td>{d.delivered_count}</Td>
        <Td>{d.contracted_count}</Td>
        <Td className="text-right whitespace-nowrap">
          <button className="btn-ghost !py-1 !text-[11px]" onClick={() => setEditing(true)}>Edit</button>
          <button
            disabled={busy}
            onClick={remove}
            className="ml-1 text-[11px] px-2 py-1 rounded-pill border border-red-200 text-red-700 hover:bg-red-50"
          >Delete</button>
        </Td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-[--border] bg-[--warm]/50">
      <Td><input type="date" className="input !py-1 !text-[12px]" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></Td>
      <Td><input type="date" className="input !py-1 !text-[12px]" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></Td>
      <Td>
        <select className="select !py-1 !text-[12px]" value={contentType} onChange={(e) => setContentType(e.target.value)}>
          {DELIVERABLE_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Td>
      <Td><input type="number" className="input !py-1 !text-[12px] !w-20" value={delivered} onChange={(e) => setDelivered(e.target.value)} /></Td>
      <Td><input type="number" className="input !py-1 !text-[12px] !w-20" value={contracted} onChange={(e) => setContracted(e.target.value)} /></Td>
      <Td className="text-right whitespace-nowrap">
        <button disabled={busy} className="btn-primary !py-1 !text-[11px]" onClick={save}>{busy ? "…" : "Save"}</button>
        <button disabled={busy} className="btn-ghost !py-1 !text-[11px] ml-1" onClick={() => setEditing(false)}>Cancel</button>
      </Td>
    </tr>
  );
}

function Documents({ client, documents }: any) {
  const sb = createClient();
  const [uploading, setUploading] = useState(false);
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `clients/${client.id}/invoice/${Date.now()}-${file.name}`;
      const { error } = await sb.storage.from("client-files").upload(path, file, { upsert: false });
      if (error) throw error;
      await sb.from("documents").insert({
        client_id: client.id, type: "invoice", file_url: path, filename: file.name, size_bytes: file.size,
      });
      location.reload();
    } catch (err: any) { alert(err.message); }
    finally { setUploading(false); }
  }
  const [removing, setRemoving] = useState<string | null>(null);
  async function removeInvoice(d: any) {
    if (!window.confirm(`Remove "${d.filename}"?\n\nIt disappears from the client's Billing page and the file is deleted.`)) return;
    setRemoving(d.id);
    try {
      // Row first, so the client stops seeing it even if the file cleanup fails.
      const { error } = await sb.from("documents").delete().eq("id", d.id);
      if (error) throw error;
      if (d.file_url) await sb.storage.from("client-files").remove([d.file_url]).then(() => {}, () => {});
      location.reload();
    } catch (err: any) {
      alert(`Remove failed: ${err.message ?? err}`);
    } finally { setRemoving(null); }
  }
  const invoices = (documents ?? []).filter((d: any) => d.type === "invoice");
  return (
    <div className="space-y-4">
      <div className="card p-5 flex items-center gap-3">
        <span className="text-[13px] font-semibold">Upload invoice:</span>
        <input type="file" onChange={onFile} disabled={uploading} className="text-[13px]" />
        {uploading && <span className="text-[12px] text-[--muted]">Uploading…</span>}
      </div>
      <div className="card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[--warm]"><tr><Th>Filename</Th><Th>Uploaded</Th><Th></Th></tr></thead>
          <tbody>{invoices.map((d: any) => (
            <tr key={d.id} className="border-t border-[--border]">
              <Td>{d.filename}</Td>
              <Td>{new Date(d.uploaded_at).toLocaleDateString()}</Td>
              <Td className="text-right">
                <button
                  disabled={removing !== null}
                  onClick={() => removeInvoice(d)}
                  className="text-[11px] px-2 py-1 rounded-pill border border-red-200 text-red-700 hover:bg-red-50"
                >{removing === d.id ? "Removing…" : "Remove"}</button>
              </Td>
            </tr>
          ))}{!invoices.length && <tr><td colSpan={3} className="p-4 text-center text-[--muted]">No invoices uploaded yet.</td></tr>}</tbody>
        </table>
      </div>
    </div>
  );
}

function Requests({ requests }: any) {
  const sb = createClient();
  async function respond(id: string, response: string, status: string) {
    await sb.from("requests").update({ admin_response: response, status }).eq("id", id);
    location.reload();
  }
  return (
    <div className="space-y-3">
      {requests.map((r: any) => (
        <div key={r.id} className="card p-5">
          <div className="flex justify-between mb-2">
            <span className="label-text">{r.category} · {r.status}</span>
            <span className="text-[12px] text-[--muted]">{new Date(r.created_at).toLocaleString()}</span>
          </div>
          <p className="text-[14px] whitespace-pre-wrap">{r.message}</p>
          <ResponseRow request={r} onSave={respond} />
        </div>
      ))}
      {!requests.length && <div className="card p-6 text-center text-[--muted]">No requests.</div>}
    </div>
  );
}
function ResponseRow({ request, onSave }: any) {
  const [resp, setResp] = useState(request.admin_response || "");
  const [status, setStatus] = useState(request.status);
  return (
    <div className="mt-3 pt-3 border-t border-[--border]">
      <textarea className="textarea" rows={2} value={resp} onChange={(e) => setResp(e.target.value)} placeholder="Reply…" />
      <div className="flex items-center gap-3 mt-2">
        <select className="select !w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          {["open","in_progress","resolved","closed"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => onSave(request.id, resp, status)} className="btn-primary !py-1.5 !text-[12px]">Save</button>
      </div>
    </div>
  );
}

function Settings({ client, progress, prefs, filming }: any) {
  const sb = createClient();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const obj: any = Object.fromEntries(f.entries());
    if (obj.monthly_fee !== "") obj.monthly_fee = Number(obj.monthly_fee); else obj.monthly_fee = null;
    await sb.from("clients").update(obj).eq("id", client.id);
    location.reload();
  }
  return (
    <div className="space-y-6">
    <form onSubmit={submit} className="card p-5 space-y-3 max-w-[640px]">
      <h3 className="font-bold">Edit client fields</h3>
      <Inp name="business_name" label="Business name" defaultValue={client.business_name} />
      <Inp name="primary_contact_name" label="Primary contact" defaultValue={client.primary_contact_name ?? ""} />
      <Inp name="billing_email" label="Billing email" defaultValue={client.billing_email ?? ""} />
      <Inp name="industry" label="Industry" defaultValue={client.industry ?? ""} />
      <Inp name="website_url" label="Website" defaultValue={client.website_url ?? ""} />
      <Sel name="status" label="Status" defaultValue={client.status}
        options={[["onboarding","onboarding"],["active","active"],["paused","paused"],["churned","churned"]]} />
      <Inp name="plan_name" label="Plan" defaultValue={client.plan_name ?? ""} />
      <Inp name="monthly_fee" label="Monthly fee" type="number" step="0.01" defaultValue={client.monthly_fee ?? ""} />
      <button className="btn-primary">Save</button>
    </form>

    <OnboardingDataPanel progress={progress ?? []} prefs={prefs} filming={filming} />
    </div>
  );
}

const STEP_LABELS: Record<number, string> = {
  1: "Business basics",
  2: "Brand assets",
  3: "Meta access",
  4: "TikTok access",
  5: "Content preferences",
  6: "Talent & on-camera",
  7: "Filming logistics",
  8: "Approval workflow",
  9: "Goals & KPIs",
  10: "Contract acknowledgment",
};

function OnboardingDataPanel({ progress, prefs, filming }: { progress: any[]; prefs: any; filming: any }) {
  // Index step data by step number for stable display order.
  const byStep = new Map<number, any>();
  for (const row of progress) byStep.set(row.step_number, row);
  const steps = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <div className="card p-5 space-y-4">
      <div>
        <h3 className="font-bold">Onboarding answers</h3>
        <p className="text-[12px] text-[--muted]">Everything the client filled in during onboarding. Read-only — edit upstream from the relevant tab if needed.</p>
      </div>
      {steps.map((n) => {
        const row = byStep.get(n);
        const data: Record<string, any> = row?.data ?? {};
        const entries = Object.entries(data).filter(([, v]) =>
          v !== "" && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)
        );
        return (
          <details key={n} className="border border-[--border] rounded-md" open={n <= 3}>
            <summary className="cursor-pointer px-3 py-2 text-[13px] flex items-center justify-between">
              <span><strong>Step {n}.</strong> {STEP_LABELS[n]}</span>
              <span className={`text-[11px] uppercase tracking-wider ${row?.completed ? "text-green-700" : "text-[--subtle]"}`}>
                {row?.completed ? "✓ done" : "incomplete"}
              </span>
            </summary>
            <div className="px-3 pb-3 pt-1 text-[13px] space-y-1.5 border-t border-[--border]">
              {entries.length === 0 ? (
                <div className="text-[--subtle]">No data captured.</div>
              ) : entries.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[180px_1fr] gap-3">
                  <div className="text-[--muted] text-[12px] uppercase tracking-wider">{k.replace(/_/g, " ")}</div>
                  <div className="whitespace-pre-wrap break-words">
                    {typeof v === "boolean" ? (v ? "Yes" : "No") :
                     Array.isArray(v) ? v.filter(Boolean).join(", ") :
                     typeof v === "object" ? <pre className="text-[12px]">{JSON.stringify(v, null, 2)}</pre> :
                     String(v)}
                  </div>
                </div>
              ))}
            </div>
          </details>
        );
      })}

      <div className="pt-2 border-t border-[--border] grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="font-semibold text-[13px] mb-1">Mirrored: content_preferences</h4>
          <pre className="text-[11px] bg-[--warm] p-2 rounded-md overflow-auto max-h-[260px]">
            {prefs ? JSON.stringify(prefs, null, 2) : "—"}
          </pre>
        </div>
        <div>
          <h4 className="font-semibold text-[13px] mb-1">Mirrored: filming_logistics</h4>
          <pre className="text-[11px] bg-[--warm] p-2 rounded-md overflow-auto max-h-[260px]">
            {filming ? JSON.stringify(filming, null, 2) : "—"}
          </pre>
        </div>
      </div>
    </div>
  );
}

function Notes({ client, notes }: any) {
  const sb = createClient();
  const [val, setVal] = useState("");
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!val.trim()) return;
    const { data: { user } } = await sb.auth.getUser();
    await sb.from("admin_notes").insert({ client_id: client.id, note: val, created_by: user?.id });
    setVal(""); location.reload();
  }
  return (
    <div className="space-y-3">
      <form onSubmit={add} className="card p-4">
        <textarea className="textarea" rows={3} value={val} onChange={(e) => setVal(e.target.value)}
          placeholder="Internal note (never visible to client)" />
        <button className="btn-primary mt-2 !py-1.5 !text-[12px]">Add note</button>
      </form>
      {notes.map((n: any) => (
        <div key={n.id} className="card p-4">
          <p className="text-[14px] whitespace-pre-wrap">{n.note}</p>
          <div className="text-[11px] text-[--subtle] mt-2">{new Date(n.created_at).toLocaleString()}</div>
        </div>
      ))}
      {!notes.length && <div className="card p-6 text-center text-[--muted]">No notes.</div>}
    </div>
  );
}

function Activity({ client }: any) {
  const sb = createClient();
  // We don't preload to keep parent server-component simple; fetch on demand
  const [rows, setRows] = useState<any[] | null>(null);
  if (!rows) {
    sb.from("activity_log").select("*").eq("client_id", client.id)
      .order("created_at", { ascending: false }).limit(100)
      .then(({ data }) => setRows(data || []));
    return <div className="text-[--muted] text-[14px]">Loading…</div>;
  }
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-[--warm]"><tr><Th>When</Th><Th>Event</Th><Th>Description</Th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-[--border]">
              <Td>{new Date(r.created_at).toLocaleString()}</Td>
              <Td className="font-mono text-[12px]">{r.event_type}</Td>
              <Td>{r.description}</Td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={3} className="p-4 text-center text-[--muted]">No activity.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ── small helpers ────────────────────────────────────────────────────
function Feedback({ feedback }: any) {
  const list: any[] = feedback ?? [];
  const withMood = list.filter((f) => f.mood_score != null);
  const avg = withMood.length
    ? withMood.reduce((s, f) => s + f.mood_score, 0) / withMood.length
    : null;
  const latestMood = withMood[0];
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const f of withMood) counts[f.mood_score]++;
  const max = Math.max(1, ...Object.values(counts));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card title="Average mood">
          {avg != null ? (
            <div className="flex items-center gap-3">
              <span className="text-[32px]">{MOOD_EMOJI[Math.round(avg)]}</span>
              <div>
                <div className="text-[18px] font-bold">{avg.toFixed(1)} / 5</div>
                <div className="text-[12px] text-[--muted]">{withMood.length} check-in{withMood.length === 1 ? "" : "s"}</div>
              </div>
            </div>
          ) : <div className="text-[--muted] text-[14px]">No mood data yet.</div>}
        </Card>
        <Card title="Latest mood">
          {latestMood ? (
            <div className="flex items-center gap-3">
              <span className="text-[32px]">{MOOD_EMOJI[latestMood.mood_score]}</span>
              <div>
                <div className="text-[14px] font-semibold">{MOOD_LABEL[latestMood.mood_score]}</div>
                <div className="text-[12px] text-[--muted]">{new Date(latestMood.created_at).toLocaleDateString("en-US")}</div>
              </div>
            </div>
          ) : <div className="text-[--muted] text-[14px]">No mood data yet.</div>}
        </Card>
        <Card title="Distribution">
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((s) => (
              <div key={s} className="flex items-center gap-2 text-[12px]">
                <span className="w-5">{MOOD_EMOJI[s]}</span>
                <div className="flex-1 h-2 rounded-full bg-[--border] overflow-hidden">
                  <div className="h-full bg-[--orange]" style={{ width: `${(counts[s] / max) * 100}%` }} />
                </div>
                <span className="text-[--muted] w-5 text-right">{counts[s]}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title={`All feedback (${list.length})`}>
        {list.length ? (
          <div className="space-y-2">
            {list.map((f) => (
              <div key={f.id} className="border border-[--border] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  {f.mood_score != null && (
                    <>
                      <span className="text-[20px]">{MOOD_EMOJI[f.mood_score]}</span>
                      <span className="text-[12px] text-[--muted]">{MOOD_LABEL[f.mood_score]}</span>
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
        ) : <div className="text-[--muted] text-[14px]">No feedback yet.</div>}
      </Card>
    </div>
  );
}

function MetaPanel({ client, metaConn }: any) {
  const [assets, setAssets] = useState<any>(null);
  const [assetsErr, setAssetsErr] = useState<string | null>(null);
  const [env, setEnv] = useState<any>(null);
  const [busy, setBusy] = useState<"save" | "sync" | "disconnect" | null>(null);
  const [igId, setIgId] = useState<string>(metaConn?.ig_user_id ?? "");
  const [adId, setAdId] = useState<string>(metaConn?.ad_account_id ?? "");
  const [enabled, setEnabled] = useState<boolean>(metaConn?.sync_enabled ?? true);

  useEffect(() => {
    fetch("/api/admin/meta?action=assets")
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        setEnv(j?.env ?? null);
        if (!r.ok || !j?.success) { setAssetsErr(j?.error ?? `HTTP ${r.status}`); return; }
        setAssets(j);
      })
      .catch((e) => setAssetsErr(String(e?.message ?? e)));
  }, []);

  async function post(body: any) {
    const res = await fetch("/api/admin/meta", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: client.id, ...body }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok || !j?.success) throw new Error(j?.error ?? `HTTP ${res.status}`);
    return j;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!/^\d{5,}$/.test(igId.trim())) { alert("Pick an Instagram account (or paste its numeric id)."); return; }
    const picked = (assets?.ig ?? []).find((a: any) => a.id === igId.trim());
    const unchanged = metaConn && metaConn.ig_user_id === igId.trim();
    setBusy("save");
    try {
      await post({
        action: "save", ig_user_id: igId.trim(),
        ig_username: picked?.username ?? (unchanged ? metaConn.ig_username : null),
        page_id: picked?.page_id ?? (unchanged ? metaConn.page_id : null),
        ad_account_id: adId.trim(), sync_enabled: enabled,
      });
      location.reload();
    } catch (err: any) { alert(`Save failed: ${err.message}`); }
    finally { setBusy(null); }
  }

  async function syncNow() {
    setBusy("sync");
    try {
      const j = await post({ action: "sync" });
      const lines = (j.summaries ?? []).map((s: any) =>
        `${s.month.slice(0, 7)}: metrics ${s.metrics} · paid ${s.paid} · reels ${s.reels}` +
        (s.errors?.length ? `\n   ⚠ ${s.errors.slice(0, 3).join("\n   ⚠ ")}` : ""));
      alert(`Sync finished\n\n${lines.join("\n")}`);
      location.reload();
    } catch (err: any) { alert(`Sync failed: ${err.message}`); }
    finally { setBusy(null); }
  }

  async function disconnect() {
    if (!confirm("Disconnect Meta for this client? Already-synced data stays; it just stops updating.")) return;
    setBusy("disconnect");
    try { await post({ action: "disconnect" }); location.reload(); }
    catch (err: any) { alert(`Failed: ${err.message}`); }
    finally { setBusy(null); }
  }

  const igOptions: any[] = assets?.ig ?? [];
  const adOptions: any[] = assets?.adAccounts ?? [];
  const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "never";
  const missingEnv = env ? [!env.token && "META_SYSTEM_USER_TOKEN", !env.business && "META_BUSINESS_ID", !env.cron && "CRON_SECRET"].filter(Boolean) : [];

  return (
    <div className="space-y-4">
      <Card title="Meta sync status">
        <KV k="Connection" v={metaConn ? `Connected · @${metaConn.ig_username ?? metaConn.ig_user_id}` : "Not connected"} />
        <KV k="Ad account" v={metaConn?.ad_account_id ?? "— (no paid numbers)"} />
        <KV k="Auto-sync" v={metaConn ? (metaConn.sync_enabled ? "On · daily, ~6am Toronto" : "Paused") : "—"} />
        <KV k="Last synced" v={fmt(metaConn?.last_synced_at ?? null)} />
        {metaConn?.last_sync_error && (
          <div className="mt-2 text-[12px] text-red-700 whitespace-pre-wrap">Last sync warnings: {metaConn.last_sync_error}</div>
        )}
        {missingEnv.length > 0 && (
          <div className="mt-2 text-[12px] text-amber-700">
            Not set in Vercel → Settings → Environment Variables: {missingEnv.join(", ")}. See README → "Meta sync".
          </div>
        )}
        {metaConn && (
          <div className="flex gap-2 mt-3">
            <button onClick={syncNow} disabled={busy !== null} className="btn-primary text-[13px]">
              {busy === "sync" ? "Syncing… (can take up to a minute)" : "Sync now"}
            </button>
            <button onClick={disconnect} disabled={busy !== null} className="btn-ghost text-[13px]">Disconnect</button>
          </div>
        )}
      </Card>

      <form onSubmit={save} className="card p-5 space-y-3">
        <h3 className="font-bold">{metaConn ? "Change connection" : "Connect Instagram + ads"}</h3>
        <p className="text-[12px] text-[--muted]">
          The lists show the accounts your Business Manager owns or has partner access to. If a client
          is missing, have them share their Page, Instagram account and ad account with your Business
          Manager first — then reload this tab.
        </p>
        {assetsErr && <div className="text-[12px] text-red-700">Couldn't load accounts from Meta: {assetsErr}</div>}
        {assets?.errors?.length > 0 && <div className="text-[12px] text-amber-700">Partial list — {assets.errors.join(" · ")}</div>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="label-text mb-1 block">Instagram account</label>
            {igOptions.length ? (
              <select className="input" value={igId} onChange={(e) => setIgId(e.target.value)}>
                <option value="">— pick —</option>
                {igId && !igOptions.some((a: any) => a.id === igId) && (
                  <option value={igId}>@{metaConn?.ig_username ?? igId} (saved — not in the current list)</option>
                )}
                {igOptions.map((a: any) => (
                  <option key={a.id} value={a.id}>@{a.username ?? a.id}{a.page_name ? ` · ${a.page_name}` : ""} ({a.via})</option>
                ))}
              </select>
            ) : (
              <input className="input" value={igId} onChange={(e) => setIgId(e.target.value)} placeholder="Numeric Instagram account id (17841…)" />
            )}
          </div>
          <div>
            <label className="label-text mb-1 block">Ad account (optional — for paid numbers)</label>
            {adOptions.length ? (
              <select className="input" value={adId} onChange={(e) => setAdId(e.target.value)}>
                <option value="">— none —</option>
                {adId && !adOptions.some((a: any) => a.id === adId) && (
                  <option value={adId}>{adId} (saved — not in the current list)</option>
                )}
                {adOptions.map((a: any) => <option key={a.id} value={a.id}>{a.name} · {a.id} ({a.via})</option>)}
              </select>
            ) : (
              <input className="input" value={adId} onChange={(e) => setAdId(e.target.value)} placeholder="Numeric ad account id (without act_)" />
            )}
          </div>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Auto-sync daily
        </label>
        <button className="btn-primary text-[13px]" disabled={busy !== null}>
          {busy === "save" ? "Saving…" : metaConn ? "Update connection" : "Connect"}
        </button>
      </form>

      {metaConn?.ad_account_id && <LeadEventsCard client={client} metaConn={metaConn} />}

      <Card title="What gets synced">
        <ul className="text-[13px] space-y-1 list-disc pl-4 text-[--muted]">
          <li><b className="text-[--fg]">Metrics tab</b> — organic reach and followers gained (net follows − unfollows); plus paid reach / spend / ROAS when an ad account is set. One row per calendar month; each run refreshes the current and previous month.</li>
          <li><b className="text-[--fg]">Leads</b> — counted from the ad account's Lead <i>events</i> (configurable above), never from a campaign's “results”, which can be a proxy like a second page view.</li>
          <li><b className="text-[--fg]">Top 3 winning reels</b> — the month's reels ranked by views, thumbnails cached.</li>
          <li><b className="text-[--fg]">Still manual:</b> profile visits and website clicks — Meta removed those from the API in 2025 — plus hours, goals, deliverables and the top ad.</li>
          <li><b className="text-[--fg]">Live vs. manual, per month:</b> in the Metrics tab every month is either from Meta or a <i>Manual override</i> (sync paused, your numbers are the truth). “Resume sync” hands a month back to Meta. The daily run refreshes the current and previous month (<i>Live</i>) and fills in empty earlier months a couple per day; closed months are final, and top-3 reels for older months are pulled on demand in the Content tab.</li>
          <li>Numbers can differ slightly from the Instagram app — Meta's API and its app compute a few metrics differently.</li>
        </ul>
      </Card>
    </div>
  );
}

function LeadEventsCard({ client, metaConn }: any) {
  const ready = Array.isArray(metaConn.lead_action_types);
  const [events, setEvents] = useState<any[] | null>(null);
  const [picked, setPicked] = useState<string[]>(ready ? metaConn.lead_action_types : []);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<null | "load" | "save">(null);
  // Rows ticked or unticked this session stay visible, so unticking can be undone.
  const [touched, setTouched] = useState<string[]>([]);

  async function load() {
    setBusy("load");
    try {
      const res = await fetch(`/api/admin/meta?action=lead_events&client_id=${client.id}`);
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) throw new Error(j?.error ?? `HTTP ${res.status}`);
      setEvents(j.events);
      setPicked(j.selected ?? []);
    } catch (err: any) { alert(`Couldn't load events from Meta: ${err.message}`); }
    finally { setBusy(null); }
  }

  async function save() {
    setBusy("save");
    try {
      const res = await fetch("/api/admin/meta", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_lead_events", client_id: client.id, lead_action_types: picked }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) throw new Error(j?.error ?? `HTTP ${res.status}`);
      const notes = [
        j.dropped?.length ? `Left out (already included in a selected total): ${j.dropped.join(", ")}.` : "",
        j.recounted ? `Recounted ${j.recounted} Meta-synced month${j.recounted === 1 ? "" : "s"} with the new definition.` : "",
        j.blanked ? `${j.blanked} month${j.blanked === 1 ? "" : "s"} couldn't be recounted (no ad data, or out of time) — their leads were cleared, press “Sync now” on them in the Metrics tab.` : "",
      ].filter(Boolean);
      alert(["Saved.", ...notes].join("\n\n"));
      location.reload();
    } catch (err: any) { alert(`Save failed: ${err.message}`); }
    finally { setBusy(null); }
  }

  const toggle = (t: string) => {
    setTouched((x) => (x.includes(t) ? x : [...x, t]));
    setPicked((p) => (p.includes(t) ? p.filter((x) => x !== t) : [...p, t]));
  };
  const visible = (events ?? []).filter((e) => showAll || e.suggested || picked.includes(e.type) || touched.includes(e.type));
  // Same rules the server applies on save.
  const pickedDropped = normalizeLeadTypes(picked).dropped;
  const pickedWarnings = leadTypeWarnings(picked);
  const savedWarnings = ready ? leadTypeWarnings(metaConn.lead_action_types) : [];
  const saved: string[] = ready ? metaConn.lead_action_types : [];
  const unchanged = picked.length === saved.length && picked.every((t) => saved.includes(t));

  return (
    <div className="card p-5 space-y-3">
      <div>
        <h3 className="font-bold">What counts as a lead</h3>
        <p className="text-[12px] text-[--muted]">
          Leads are counted from the ad account's <b>events</b> — never from a campaign's “results”. A campaign can
          optimise for a proxy (for example a Contact event fired on a second page view), and that number isn't leads.
          Pick the event(s) that are a real lead for this client; the monthly total is their sum. Untick everything
          to enter leads by hand instead (phone calls, CRM…).
        </p>
      </div>
      {!ready ? (
        <div className="text-[12px] text-amber-700">Run <code>supabase/migrations/0015_leads.sql</code> in the Supabase SQL editor to enable leads.</div>
      ) : (
        <>
          <div className="text-[13px]">
            <span className="text-[--muted]">Currently counting: </span>
            {metaConn.lead_action_types.length
              ? metaConn.lead_action_types.map((t: string) => <code key={t} className="mr-1.5">{t}</code>)
              : <span className="text-amber-700">nothing — leads are entered by hand</span>}
          </div>
          {!events && savedWarnings.map((w) => <div key={w} className="text-[12px] text-amber-700">{w}</div>)}
          {!events ? (
            <button type="button" className="btn-ghost text-[13px]" onClick={load} disabled={busy !== null}>
              {busy === "load" ? "Loading from Meta…" : "Review this account's events"}
            </button>
          ) : (
            <>
              <div className="border border-[--border] rounded-lg divide-y divide-[--border]">
                {visible.map((e) => (
                  <label key={e.type} className="flex items-center gap-3 px-3 py-2 text-[13px] cursor-pointer">
                    <input type="checkbox" checked={picked.includes(e.type)} disabled={busy !== null} onChange={() => toggle(e.type)} />
                    <span className="flex-1 min-w-0">
                      <span className="block">{e.label}</span>
                      {e.label !== e.type && <code className="text-[11px] text-[--subtle]">{e.type}</code>}
                    </span>
                    <span className="text-[--muted] whitespace-nowrap">{Number(e.count).toLocaleString("en-US")} <span className="text-[11px]">last 90 days</span></span>
                  </label>
                ))}
                {!visible.length && <div className="px-3 py-2 text-[13px] text-[--muted]">No lead-like events recorded in the last 90 days.</div>}
              </div>
              {pickedDropped.length > 0 && (
                <div className="text-[12px] text-amber-700">
                  Already included in a total you picked, so it will be left out to avoid counting twice: {pickedDropped.join(", ")}.
                </div>
              )}
              {pickedWarnings.map((w) => <div key={w} className="text-[12px] text-amber-700">{w}</div>)}
              <div className="flex items-center gap-3 flex-wrap">
                <button type="button" className="btn-primary text-[13px]" onClick={save} disabled={busy !== null}>
                  {busy === "save" ? "Saving + recounting months… (up to a minute)" : unchanged ? "Recount leads for all months" : "Save lead events"}
                </button>
                <label className="flex items-center gap-2 text-[12px] text-[--muted]">
                  <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show every event type
                </label>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Card({ title, children }: any) { return <div className="card p-5"><h3 className="font-bold mb-3">{title}</h3>{children}</div>; }
function KV({ k, v }: { k: string; v: any }) { return <div className="flex justify-between py-1.5 border-b border-[--border] last:border-0 text-[14px]"><span className="text-[--muted]">{k}</span><span className="text-right">{v ?? "—"}</span></div>; }
function Th({ children }: any) { return <th className="px-3 py-2 text-left font-semibold text-[--muted] uppercase text-[11px] tracking-wider">{children}</th>; }
function Td({ children, className }: any) { return <td className={`px-3 py-2 ${className ?? ""}`}>{children}</td>; }
function Inp({ name, label, ...rest }: any) {
  return <div><label className="label-text mb-1 block">{label}</label><input className="input" name={name} {...rest} /></div>;
}
function ReadField({ label, value, compact }: { label: string; value: any; compact?: boolean }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div>
      <div className="label-text mb-1">{label}</div>
      {empty ? (
        <div className="text-[13px] text-[--subtle]">— not provided —</div>
      ) : compact ? (
        <div className="text-[14px]">{String(value)}</div>
      ) : (
        <div className="text-[14px] whitespace-pre-wrap bg-[--warm] rounded-md p-3 border border-[--border]">{String(value)}</div>
      )}
    </div>
  );
}
function Sel({ name, label, options, ...rest }: any) {
  return (
    <div><label className="label-text mb-1 block">{label}</label>
      <select className="select" name={name} {...rest}>
        {options.map(([v, l]: [string, string]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
