"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Cal, { getCalApi } from "@calcom/embed-react";
import { createClient } from "@/lib/supabase-browser";
import type { StepId } from "@/lib/onboarding-config";

type Props = {
  stepNumber: number;
  stepInfo: { n: number; id: StepId; title: string; subtitle: string };
  allSteps: { n: number; id: StepId; title: string }[];
  completedSteps: number[];
  savedData: Record<string, any>;
  client: any;
  contentPreferences: any;
  filmingLogistics: any;
};

export default function OnboardingStepClient(p: Props) {
  const sb = createClient();
  const router = useRouter();
  const [data, setData] = useState<Record<string, any>>(p.savedData || {});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<NodeJS.Timeout | null>(null);

  // Auto-save with 600ms debounce
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void save(false), 600);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  async function save(markComplete: boolean) {
    setSaving(true);
    try {
      // Always upsert the step's data blob
      await sb.from("onboarding_progress").upsert({
        client_id: p.client.id,
        step_number: p.stepNumber,
        data,
        completed: markComplete ? true : undefined,
        completed_at: markComplete ? new Date().toISOString() : undefined,
      }, { onConflict: "client_id,step_number" });

      // Mirror structured fields into the canonical tables for steps that have them
      await mirrorToStructuredTables(sb, p.stepNumber, p.client.id, data);

      setSavedAt(new Date().toLocaleTimeString());
    } finally { setSaving(false); }
  }

  async function next() {
    await save(true);
    // Notify admin (fire-and-forget)
    void fetch("/api/onboarding/notify-admin", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: p.stepNumber, step_id: p.stepInfo.id }),
    }).catch(() => {});

    if (p.stepNumber >= p.allSteps.length) {
      // Mark client onboarding complete
      await fetch("/api/onboarding/complete", { method: "POST" });
      router.push("/dashboard");
    } else {
      router.push(`/onboarding/${p.stepNumber + 1}`);
    }
  }
  function back() { if (p.stepNumber > 1) router.push(`/onboarding/${p.stepNumber - 1}`); }

  const completedSet = useMemo(() => new Set(p.completedSteps), [p.completedSteps]);
  const pct = Math.round((completedSet.size / p.allSteps.length) * 100);

  return (
    <div>
      {/* Progress bar */}
      <div className="mb-8">
        <div className="flex justify-between text-[12px] text-[--muted] mb-2">
          <span>Step {p.stepNumber} of {p.allSteps.length}</span>
          <span>{pct}% complete</span>
        </div>
        <div className="h-1.5 bg-[--border] rounded-full overflow-hidden">
          <div className="h-full bg-grad transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex flex-wrap gap-1 mt-3">
          {p.allSteps.map(s => (
            <button key={s.n} onClick={() => router.push(`/onboarding/${s.n}`)}
              className={`text-[11px] px-2 py-1 rounded-pill border transition-colors
                ${s.n === p.stepNumber ? "border-[--orange] text-[--orange]" :
                  completedSet.has(s.n) ? "border-[--border] text-[--muted]" :
                  "border-[--border] text-[--subtle]"}`}>
              {completedSet.has(s.n) ? "✓ " : ""}{s.n}
            </button>
          ))}
        </div>
      </div>

      <h1 className="section-title mb-1">{p.stepInfo.title}</h1>
      <p className="text-[--muted] mb-8">{p.stepInfo.subtitle}</p>

      <div className="card p-7 space-y-5">
        {renderStepFields(p.stepInfo.id, data, setData, p)}
      </div>

      <div className="flex items-center justify-between mt-6">
        <button className="btn-ghost" onClick={back} disabled={p.stepNumber === 1}>← Back</button>
        <div className="text-[12px] text-[--muted]">
          {saving ? "Saving…" : savedAt ? `Saved at ${savedAt}` : "Auto-saves as you type"}
        </div>
        <button className="btn-primary" onClick={next}>
          {p.stepNumber === p.allSteps.length ? "Finish onboarding" : "Save & continue →"}
        </button>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Step field rendering (per-step). Kept inline for clarity — ~10 small forms.
// ────────────────────────────────────────────────────────────────────
function field(label: string, child: React.ReactNode, hint?: string) {
  return (
    <div>
      <label className="label-text mb-1 block">{label}</label>
      {child}
      {hint && <p className="text-[12px] text-[--muted] mt-1">{hint}</p>}
    </div>
  );
}

function renderStepFields(
  id: StepId,
  data: Record<string, any>,
  setData: (d: Record<string, any>) => void,
  p: Props,
) {
  const set = (patch: Record<string, any>) => setData({ ...data, ...patch });

  switch (id) {
    case "business":
      return <>
        {field("Business name", <input className="input" value={data.business_name ?? p.client?.business_name ?? ""} onChange={(e) => set({ business_name: e.target.value })} />)}
        {field("Primary contact name", <input className="input" value={data.primary_contact_name ?? p.client?.primary_contact_name ?? ""} onChange={(e) => set({ primary_contact_name: e.target.value })} />)}
        {field("Billing email", <input className="input" type="email" value={data.billing_email ?? p.client?.billing_email ?? ""} onChange={(e) => set({ billing_email: e.target.value })} />)}
        {field("Billing address", <textarea className="textarea" rows={2} value={data.billing_address ?? p.client?.billing_address ?? ""} onChange={(e) => set({ billing_address: e.target.value })} />)}
        {field("GST number (if applicable)", <input className="input" value={data.gst_number ?? p.client?.gst_number ?? ""} onChange={(e) => set({ gst_number: e.target.value })} />)}
        {field("Website URL", <input className="input" value={data.website_url ?? p.client?.website_url ?? ""} onChange={(e) => set({ website_url: e.target.value })} placeholder="https://" />)}
        {field("Industry", <input className="input" value={data.industry ?? p.client?.industry ?? ""} onChange={(e) => set({ industry: e.target.value })} />)}
      </>;

    case "brand_assets": {
      const colors: string[] = Array.isArray(data.colors) ? data.colors :
        // Backfill from old fields if present
        [data.color_primary, data.color_secondary].filter(Boolean);
      const setColors = (next: string[]) => set({ colors: next });
      const updateColor = (i: number, v: string) => {
        const c = [...colors]; c[i] = v; setColors(c);
      };
      const addColor = () => setColors([...colors, ""]);
      const removeColor = (i: number) => setColors(colors.filter((_, idx) => idx !== i));
      const ensureMin = colors.length === 0 ? [""] : colors;
      return <>
        <div>
          <label className="label-text mb-1 block">Brand colors (hex)</label>
          <div className="space-y-2">
            {ensureMin.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  placeholder={i === 0 ? "#FF4F00 (primary)" : i === 1 ? "#FFA27A (secondary)" : "#000000"}
                  value={c}
                  onChange={(e) => {
                    if (colors.length === 0) setColors([e.target.value]);
                    else updateColor(i, e.target.value);
                  }}
                />
                {colors.length > 1 && (
                  <button type="button" className="btn-ghost text-[12px]" onClick={() => removeColor(i)}>Remove</button>
                )}
              </div>
            ))}
            <button type="button" className="btn-ghost text-[12px]" onClick={addColor}>+ Add another color</button>
          </div>
          <p className="text-[12px] text-[--muted] mt-1">Add as many as you need — primary, secondary, accents, etc.</p>
        </div>
        {field("Brand fonts", <input className="input" value={data.fonts ?? ""} onChange={(e) => set({ fonts: e.target.value })} placeholder="e.g. Inter, Helvetica" />)}
        {field("Brand guidelines / asset library link", <input className="input" value={data.brand_link ?? ""} onChange={(e) => set({ brand_link: e.target.value })} placeholder="Drive / Dropbox / Notion link" />, "Logo and PDF uploads coming in Documents tab — paste a link for now.")}
      </>;
    }

    case "meta_access":
      return <>
        {field("Instagram handle", <input className="input" placeholder="@yourhandle" value={data.instagram_handle ?? ""} onChange={(e) => set({ instagram_handle: e.target.value })} />)}
        {field("Facebook Page URL", <input className="input" value={data.facebook_url ?? ""} onChange={(e) => set({ facebook_url: e.target.value })} />)}
        {field("Meta Business-Portfolio-ID", <input className="input" value={data.bm_id ?? ""} onChange={(e) => set({ bm_id: e.target.value })} />, "Found at business.facebook.com → Settings → Business Info.")}
        {field("Ad account ID (if running ads)", <input className="input" value={data.ad_account_id ?? ""} onChange={(e) => set({ ad_account_id: e.target.value })} />)}
        {field("Pixel ID", <input className="input" value={data.pixel_id ?? ""} onChange={(e) => set({ pixel_id: e.target.value })} />, "Meta Events Manager → Data Sources → your pixel.")}
        {field("Payment method for ads",
          <label className="flex items-center gap-2 text-[14px]">
            <input type="checkbox" checked={!!data.payment_ready} onChange={(e) => set({ payment_ready: e.target.checked })} />
            Payment method is set up and verified — we can run ads immediately
          </label>,
          "Leave unchecked if you still need to add a card or verify your account.")}
        <LoomPlaceholder label="How to find your Business-Portfolio-ID (1 min walkthrough)" />
      </>;

    case "tiktok_access":
      return <>
        {field("TikTok handle", <input className="input" placeholder="@yourhandle" value={data.tiktok_handle ?? ""} onChange={(e) => set({ tiktok_handle: e.target.value })} />)}
        {field("Access type", <select className="select" value={data.tiktok_access_type ?? ""} onChange={(e) => set({ tiktok_access_type: e.target.value })}>
          <option value="">— select —</option>
          <option value="business_account">Business account</option>
          <option value="creator_account">Creator account</option>
          <option value="not_yet">Not on TikTok yet</option>
        </select>)}
        <LoomPlaceholder label="Granting Outmark access to your TikTok account" />
      </>;

    case "content_prefs":
      return <>
        {field("Describe your dream customers",
          <textarea className="textarea" rows={5} value={data.dream_customers ?? ""} onChange={(e) => set({ dream_customers: e.target.value })}
            placeholder="Who are they? What are their interests outside of security systems — hobbies, lifestyle, the kind of homes/businesses they own, what they watch, where they hang out online? The more specific the better — this tells us which niches and content angles to lean into." />,
          "Examples: 'Homeowners 35–55 who just bought their first detached home, into renovations, golf, and BBQs. Watch HGTV.' or 'Small business owners running retail/restaurants, active in local Chamber of Commerce groups.'")}
        {field("Topics to avoid (one per line)",
          <textarea className="textarea" rows={4} value={data.blacklist ?? ""} onChange={(e) => set({ blacklist: e.target.value })}
            placeholder="Format: topic — reasoning (optional)" />)}
        {field("Compliance / legal notes",
          <textarea className="textarea" rows={2} value={data.compliance_notes ?? p.contentPreferences?.compliance_notes ?? ""} onChange={(e) => set({ compliance_notes: e.target.value })} />)}
      </>;

    case "talent":
      return <>
        {field("People who CAN appear on camera",
          <textarea className="textarea" rows={3} value={data.on_camera ?? ""} onChange={(e) => set({ on_camera: e.target.value })}
            placeholder="Name — role — pronunciation (one per line)" />)}
        {field("People who should NOT appear on camera",
          <textarea className="textarea" rows={2} value={data.off_camera ?? ""} onChange={(e) => set({ off_camera: e.target.value })} />)}
      </>;

    case "filming_logistics":
      return <>
        {field("Key production contact (name)", <input className="input" value={data.key_contact_name ?? p.filmingLogistics?.key_contact_name ?? ""} onChange={(e) => set({ key_contact_name: e.target.value })} />)}
        {field("Key production contact (phone)", <input className="input" value={data.key_contact_phone ?? p.filmingLogistics?.key_contact_phone ?? ""} onChange={(e) => set({ key_contact_phone: e.target.value })} />)}
        <div className="pt-3 border-t border-[--border]">
          <h3 className="font-semibold text-[15px] mb-1">Book your first shoot day <span className="text-[--muted] font-normal">(Optional)</span></h3>
          <p className="text-[13px] text-[--muted] mb-3">Skip this if you'd rather plan content first — we usually like to know what we're filming before locking a date. Otherwise pick a slot below and we'll confirm by email.</p>
          <CalEmbed />
        </div>
      </>;

    case "approval":
      return <>
        <div>
          <h3 className="font-semibold text-[15px] mb-1">Conversion Content / Ad Content</h3>
          <p className="text-[13px] text-[--muted] mb-3">Paid ads and conversion-focused creative.</p>
          <div className="space-y-4">
            {field("Approver name", <input className="input" value={data.ad_approver_name ?? ""} onChange={(e) => set({ ad_approver_name: e.target.value })} />)}
            {field("Approver email", <input className="input" type="email" value={data.ad_approver_email ?? ""} onChange={(e) => set({ ad_approver_email: e.target.value })} />)}
            {field("Turnaround commitment",
              <select className="select" value={data.ad_turnaround ?? ""} onChange={(e) => set({ ad_turnaround: e.target.value })}>
                <option value="">— select —</option>
                <option>Same day</option><option>24 hours</option><option>48 hours</option><option>72 hours</option>
              </select>)}
            {field("Escalation contact (if approver unavailable)",
              <input className="input" value={data.ad_escalation ?? ""} onChange={(e) => set({ ad_escalation: e.target.value })} placeholder="Name + email/phone" />)}
          </div>

          <label className="flex items-start gap-2 text-[14px] mt-4 leading-snug">
            <input type="checkbox" className="mt-1" checked={!!data.conversion_no_preapproval} onChange={(e) => set({ conversion_no_preapproval: e.target.checked })} />
            <span>
              I agree that reach content may be posted without pre-approval, and that I can select winning trial reels to be posted on our main channel.
            </span>
          </label>
        </div>
      </>;

    case "goals":
      return <>
        <p className="text-[13px] text-[--muted] -mt-2">
          Set your goal for this month. You can log a new goal every month — or change this one as you go — from the <strong>Goals</strong> tab in the portal.
        </p>
        {field("This month's KPI", <input className="input" value={data.primary_kpi ?? ""} onChange={(e) => set({ primary_kpi: e.target.value })} placeholder="e.g. Profile visits, website clicks, leads" />)}
        {field("This month's target", <input className="input" value={data.target_30 ?? ""} onChange={(e) => set({ target_30: e.target.value })} placeholder="e.g. 5,000 profile visits" />)}
        {field("Baseline metrics (current state)",
          <textarea className="textarea" rows={3} value={data.baseline ?? ""} onChange={(e) => set({ baseline: e.target.value })}
            placeholder="Current followers, monthly reach, website traffic, etc." />)}
      </>;

    case "contract":
      return <>
        <p className="text-[14px] leading-relaxed text-[--muted]">
          Your contract and first invoice were sent separately via PandaDoc to your billing email before onboarding.
          Future invoices will appear in your <strong>Billing</strong> tab here in the portal.
        </p>
        <p className="text-[14px] leading-relaxed text-[--muted] mt-3">
          By clicking <strong>Finish onboarding</strong> you confirm you've reviewed the steps above.
          You can edit any of these answers at any time from <strong>Content Settings</strong>.
        </p>
        <label className="flex items-center gap-2 text-[14px] mt-2">
          <input type="checkbox" checked={!!data.acknowledged} onChange={(e) => setData({ ...data, acknowledged: e.target.checked })} />
          I've received the contract and invoice by email.
        </label>
      </>;
  }
}

function LoomPlaceholder({ label }: { label: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[--border] bg-[--warm] p-4 text-[13px] text-[--muted]">
      <strong className="text-[--fg]">📹 {label}</strong>
      <div className="mt-1">Loom walkthrough — TODO:BLOCKED record videos and paste embed URLs.</div>
    </div>
  );
}

function CalEmbed() {
  useEffect(() => {
    (async () => {
      const cal = await getCalApi();
      cal("ui", { theme: "light", styles: { branding: { brandColor: "#FF4F00" } } });
    })();
  }, []);
  const link = process.env.NEXT_PUBLIC_CAL_LINK || "outmark/shoot-day";
  return (
    <div className="rounded-card overflow-hidden border border-[--border]">
      <Cal calLink={link} style={{ width: "100%", height: 600, overflow: "scroll" }} />
    </div>
  );
}

// Mirror selected step.data fields into structured tables so the dashboard / admin
// can read them without parsing jsonb. Idempotent upsert.
async function mirrorToStructuredTables(
  sb: ReturnType<typeof createClient>,
  step: number,
  clientId: string,
  data: Record<string, any>,
) {
  if (step === 1) {
    const patch: Record<string, any> = {};
    for (const k of ["business_name", "primary_contact_name", "billing_email", "billing_address", "gst_number", "website_url", "industry"]) {
      if (k in data) patch[k] = data[k];
    }
    if (Object.keys(patch).length) await sb.from("clients").update(patch).eq("id", clientId);
  }
  if (step === 5) {
    await sb.from("content_preferences").upsert({
      client_id: clientId,
      compliance_notes: data.compliance_notes ?? null,
      dream_customers: data.dream_customers ?? null,
      topics_to_avoid: data.blacklist ?? null,
    }, { onConflict: "client_id" });
  }
  if (step === 7) {
    await sb.from("filming_logistics").upsert({
      client_id: clientId,
      key_contact_name: data.key_contact_name ?? null,
      key_contact_phone: data.key_contact_phone ?? null,
    }, { onConflict: "client_id" });
  }
  if (step === 9) {
    // Seed the current month's goal row from the onboarding answer.
    if ((data.primary_kpi ?? "").trim()) {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      await sb.from("monthly_goals").upsert({
        client_id: clientId,
        month,
        kpi_label: data.primary_kpi,
        target_value: data.target_30 ?? null,
        notes: data.baseline ?? null,
      }, { onConflict: "client_id,month" });
    }
  }
}
