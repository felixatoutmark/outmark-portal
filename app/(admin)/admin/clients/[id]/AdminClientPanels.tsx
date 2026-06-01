"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

const TABS = ["Overview","Metrics","Content","Goals","Deliverables","Invoices","Requests","Feedback","Settings","Activity"] as const;

const MOOD_EMOJI: Record<number, string> = { 1: "😞", 2: "🙁", 3: "😐", 4: "🙂", 5: "😄" };
const MOOD_LABEL: Record<number, string> = { 1: "Unhappy", 2: "Disappointed", 3: "Neutral", 4: "Happy", 5: "Thrilled" };
type Tab = typeof TABS[number];

export default function AdminClientPanels(p: any) {
  const [tab, setTab] = useState<Tab>("Overview");
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

function Metrics({ client, metrics }: any) {
  const sb = createClient();
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0,10);
  const end   = new Date(today.getFullYear(), today.getMonth()+1, 0).toISOString().slice(0,10);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const obj: any = Object.fromEntries(f.entries());
    for (const k of ["organic_reach","paid_reach","profile_visits","website_clicks","followers_gained"]) {
      obj[k] = obj[k] === "" ? null : Number(obj[k]);
    }
    obj.paid_spend = obj.paid_spend === "" ? null : Number(obj.paid_spend);
    obj.roas       = obj.roas === ""       ? null : Number(obj.roas);
    obj.client_id = client.id;
    await sb.from("dashboard_metrics").upsert(obj, { onConflict: "client_id,period_start,period_end" });
    location.reload();
  }
  return (
    <div className="space-y-4">
      <form onSubmit={submit} className="card p-5 space-y-3">
        <h3 className="font-bold">Add / update period metrics</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Inp name="period_start" label="Period start" type="date" defaultValue={start} required />
          <Inp name="period_end"   label="Period end"   type="date" defaultValue={end} required />
          <Inp name="organic_reach"    label="Organic reach"    type="number" />
          <Inp name="paid_reach"       label="Paid reach"       type="number" />
          <Inp name="profile_visits"   label="Profile visits"   type="number" />
          <Inp name="website_clicks"   label="Website clicks"   type="number" />
          <Inp name="followers_gained" label="Followers gained" type="number" />
          <Inp name="paid_spend"       label="Paid spend ($)"   type="number" step="0.01" />
          <Inp name="roas"             label="ROAS (x)"         type="number" step="0.01" />
        </div>
        <button className="btn-primary">Save metrics</button>
      </form>
      <div className="card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[--warm]"><tr>
            <Th>Period</Th><Th>Organic</Th><Th>Paid</Th><Th>Visits</Th><Th>Clicks</Th><Th>Spend</Th><Th>ROAS</Th><Th>Followers</Th><Th></Th>
          </tr></thead>
          <tbody>
            {metrics.map((m: any) => <MetricRow key={m.id} m={m} />)}
            {!metrics.length && <tr><td colSpan={9} className="p-4 text-center text-[--muted]">No metrics yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Order matches the table header: Organic, Paid, Visits, Clicks, Spend, ROAS, Followers.
const METRIC_FIELDS: { key: string; label: string; step?: string }[] = [
  { key: "organic_reach",    label: "Organic reach" },
  { key: "paid_reach",       label: "Paid reach" },
  { key: "profile_visits",   label: "Profile visits" },
  { key: "website_clicks",   label: "Website clicks" },
  { key: "paid_spend",       label: "Paid spend ($)", step: "0.01" },
  { key: "roas",             label: "ROAS (x)", step: "0.01" },
  { key: "followers_gained", label: "Followers gained" },
];

function MetricRow({ m }: { m: any }) {
  const sb = createClient();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [periodStart, setPeriodStart] = useState<string>(m.period_start);
  const [periodEnd, setPeriodEnd] = useState<string>(m.period_end);
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(METRIC_FIELDS.map((f) => [f.key, m[f.key] == null ? "" : String(m[f.key])])),
  );

  async function save() {
    setBusy(true);
    try {
      const patch: any = { period_start: periodStart, period_end: periodEnd };
      for (const f of METRIC_FIELDS) patch[f.key] = vals[f.key] === "" ? null : Number(vals[f.key]);
      const { error } = await sb.from("dashboard_metrics").update(patch).eq("id", m.id);
      if (error) throw error;
      location.reload();
    } catch (err: any) {
      alert(err.message ?? "Save failed");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm("Delete this metrics row?")) return;
    setBusy(true);
    try {
      const { error } = await sb.from("dashboard_metrics").delete().eq("id", m.id);
      if (error) throw error;
      location.reload();
    } catch (err: any) {
      alert(err.message ?? "Delete failed");
    } finally { setBusy(false); }
  }

  if (!editing) {
    return (
      <tr className="border-t border-[--border]">
        <Td>{m.period_start} → {m.period_end}</Td>
        <Td>{m.organic_reach?.toLocaleString("en-US") ?? "—"}</Td>
        <Td>{m.paid_reach?.toLocaleString("en-US") ?? "—"}</Td>
        <Td>{m.profile_visits?.toLocaleString("en-US") ?? "—"}</Td>
        <Td>{m.website_clicks?.toLocaleString("en-US") ?? "—"}</Td>
        <Td>{m.paid_spend != null ? `$${m.paid_spend}` : "—"}</Td>
        <Td>{m.roas != null ? `${m.roas}x` : "—"}</Td>
        <Td>{m.followers_gained?.toLocaleString("en-US") ?? "—"}</Td>
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
    <tr className="border-t border-[--border] bg-[--warm]/50 align-top">
      <Td>
        <div className="flex flex-col gap-1">
          <input type="date" className="input !py-1 !text-[12px]" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          <input type="date" className="input !py-1 !text-[12px]" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
        </div>
      </Td>
      {METRIC_FIELDS.map((f) => (
        <Td key={f.key}>
          <input
            type="number"
            step={f.step ?? "1"}
            className="input !py-1 !text-[12px] !w-20"
            value={vals[f.key]}
            onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value }))}
          />
        </Td>
      ))}
      <Td className="text-right whitespace-nowrap">
        <button disabled={busy} className="btn-primary !py-1 !text-[11px]" onClick={save}>{busy ? "…" : "Save"}</button>
        <button disabled={busy} className="btn-ghost !py-1 !text-[11px] ml-1" onClick={() => setEditing(false)}>Cancel</button>
      </Td>
    </tr>
  );
}

function Content({ client, content, prefs, progress }: any) {
  // Pull onboarding blobs for content-related steps. Content prefs (5),
  // talent (6), and approval workflow (8) all feed creative direction.
  const stepData = (n: number) => (progress ?? []).find((r: any) => r.step_number === n)?.data ?? {};
  const step5 = stepData(5);
  const step6 = stepData(6);
  const step8 = stepData(8);
  const step9 = stepData(9);
  const sb = createClient();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const f = new FormData(e.currentTarget as HTMLFormElement);
    const obj: any = Object.fromEntries(f.entries());
    for (const k of ["views","saves","shares","profile_visits","link_clicks"])
      obj[k] = obj[k] === "" ? null : Number(obj[k]);
    if (!obj.posted_at) delete obj.posted_at;
    obj.client_id = client.id;
    await sb.from("content_items").insert(obj);
    location.reload();
  }
  async function update(id: string, patch: any) {
    await sb.from("content_items").update(patch).eq("id", id);
    location.reload();
  }
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
      <form onSubmit={saveUploadUrl} className="card p-5 space-y-3">
        <h3 className="font-bold">Content upload link</h3>
        <p className="text-[12px] text-[--muted] -mt-1">
          Paste the Frame.io / Dropbox / Drive / WeTransfer link. Renders as a big orange
          "Upload content" button on the client dashboard. Leave blank to hide the button.
        </p>
        <Inp name="content_upload_url" label="URL" defaultValue={client.content_upload_url ?? ""} />
        <button className="btn-primary">Save upload link</button>
      </form>

      <form onSubmit={submit} className="card p-5 space-y-3">
        <h3 className="font-bold">Add content item</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Sel name="type" label="Type" options={[["reach_reel","Reach Reel"],["conversion_content","Conversion"],["paid_ad","Paid ad"]]} required />
          <Sel name="status" label="Status" options={[["in_production","In production"],["scheduled","Scheduled"],["awaiting_approval","Awaiting approval"],["published","Published"]]} required />
          <Inp name="instagram_url" label="Instagram URL" />
          <Inp name="thumbnail_url" label="Thumbnail URL" />
          <Inp name="views" label="Views" type="number" />
          <Inp name="saves" label="Saves" type="number" />
          <Inp name="shares" label="Shares" type="number" />
          <Inp name="profile_visits" label="Profile visits" type="number" />
          <Inp name="link_clicks" label="Link clicks" type="number" />
          <Inp name="posted_at" label="Posted at" type="datetime-local" />
        </div>
        <button className="btn-primary">Add item</button>
      </form>
      <div className="card overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-[--warm]"><tr>
            <Th>Type</Th><Th>Status</Th><Th>Views</Th><Th>Saves</Th><Th>Shares</Th>
            <Th>Visits</Th><Th>Clicks</Th><Th>Posted</Th><Th>IG link</Th><Th></Th>
          </tr></thead>
          <tbody>
            {content.map((i: any) => <ContentRow key={i.id} item={i} onUpdate={update} />)}
            {!content.length && <tr><td colSpan={10} className="p-4 text-center text-[--muted]">No content yet.</td></tr>}
          </tbody>
        </table>
      </div>

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

const CONTENT_STATUS = ["in_production", "scheduled", "awaiting_approval", "published"];
const CONTENT_TYPES: [string, string][] = [
  ["reach_reel", "Reach Reel"],
  ["conversion_content", "Conversion"],
  ["paid_ad", "Paid ad"],
];

function ContentRow({ item, onUpdate }: { item: any; onUpdate: (id: string, patch: any) => Promise<void> }) {
  const sb = createClient();
  const [busy, setBusy] = useState(false);

  // Per-field local state so user can type without instant DB churn.
  const [views, setViews] = useState<string>(item.views != null ? String(item.views) : "");
  const [saves, setSaves] = useState<string>(item.saves != null ? String(item.saves) : "");
  const [shares, setShares] = useState<string>(item.shares != null ? String(item.shares) : "");
  const [profileVisits, setProfileVisits] = useState<string>(item.profile_visits != null ? String(item.profile_visits) : "");
  const [linkClicks, setLinkClicks] = useState<string>(item.link_clicks != null ? String(item.link_clicks) : "");
  const [ig, setIg] = useState<string>(item.instagram_url ?? "");

  // Save a numeric field if it actually changed.
  function saveNum(field: string, raw: string, original: number | null) {
    const newVal = raw === "" ? null : Number(raw);
    if (newVal === original) return;
    if (newVal != null && Number.isNaN(newVal)) return;
    onUpdate(item.id, { [field]: newVal });
  }
  function saveText(field: string, raw: string, original: string | null) {
    const trimmed = raw.trim();
    const newVal = trimmed === "" ? null : trimmed;
    if (newVal === (original ?? null)) return;
    if (newVal && !/^https?:\/\//i.test(newVal)) {
      alert("Instagram URL must start with http(s)://");
      return;
    }
    onUpdate(item.id, { [field]: newVal });
  }

  async function remove() {
    if (!window.confirm(`Delete this ${item.type} item?`)) return;
    setBusy(true);
    try {
      const { error } = await sb.from("content_items").delete().eq("id", item.id);
      if (error) throw error;
      location.reload();
    } catch (err: any) {
      alert(err.message ?? "Delete failed");
    } finally { setBusy(false); }
  }

  const num = "input !py-1 !text-[12px] !w-20";
  const numHandlers = (set: (v: string) => void, val: string, field: string, original: number | null) => ({
    value: val,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(e.target.value),
    onBlur: () => saveNum(field, val, original),
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); },
  });

  return (
    <tr className="border-t border-[--border] align-middle">
      <Td>
        <select
          className="select !py-1 !text-[12px]"
          defaultValue={item.type}
          onChange={(e) => onUpdate(item.id, { type: e.target.value })}
        >
          {CONTENT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Td>
      <Td>
        <select
          className="select !py-1 !text-[12px]"
          defaultValue={item.status}
          onChange={(e) => onUpdate(item.id, { status: e.target.value })}
        >
          {CONTENT_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </Td>
      <Td><input type="number" className={num} {...numHandlers(setViews, views, "views", item.views)} /></Td>
      <Td><input type="number" className={num} {...numHandlers(setSaves, saves, "saves", item.saves)} /></Td>
      <Td><input type="number" className={num} {...numHandlers(setShares, shares, "shares", item.shares)} /></Td>
      <Td><input type="number" className={num} {...numHandlers(setProfileVisits, profileVisits, "profile_visits", item.profile_visits)} /></Td>
      <Td><input type="number" className={num} {...numHandlers(setLinkClicks, linkClicks, "link_clicks", item.link_clicks)} /></Td>
      <Td>
        <input
          type="date"
          className="input !py-1 !text-[12px]"
          defaultValue={item.posted_at ? String(item.posted_at).slice(0, 10) : ""}
          onChange={(e) => onUpdate(item.id, { posted_at: e.target.value ? `${e.target.value}T12:00:00` : null })}
        />
      </Td>
      <Td>
        <input
          type="url"
          className="input !py-1 !text-[12px] !w-32"
          value={ig}
          placeholder="https://…"
          onChange={(e) => setIg(e.target.value)}
          onBlur={() => saveText("instagram_url", ig, item.instagram_url)}
          onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }}
        />
      </Td>
      <Td className="text-right">
        <button
          disabled={busy}
          onClick={remove}
          className="text-[11px] px-2 py-1 rounded-pill border border-red-200 text-red-700 hover:bg-red-50"
        >Delete</button>
      </Td>
    </tr>
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
          <thead className="bg-[--warm]"><tr><Th>Filename</Th><Th>Uploaded</Th></tr></thead>
          <tbody>{invoices.map((d: any) => (
            <tr key={d.id} className="border-t border-[--border]">
              <Td>{d.filename}</Td>
              <Td>{new Date(d.uploaded_at).toLocaleDateString()}</Td>
            </tr>
          ))}{!invoices.length && <tr><td colSpan={2} className="p-4 text-center text-[--muted]">No invoices uploaded yet.</td></tr>}</tbody>
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
