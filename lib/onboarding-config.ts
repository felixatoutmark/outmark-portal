// Onboarding step configuration. UI-driven; data lands in onboarding_progress.data
// (a flexible jsonb blob) PLUS structured tables (clients, content_preferences,
// filming_logistics) where the spec calls for it.
//
// To add/remove/reorder steps: edit STEPS. The schema doesn't need to change —
// onboarding_progress.step_number is the only structural reference.

export type StepId =
  | "business" | "brand_assets" | "meta_access" | "tiktok_access"
  | "content_prefs" | "talent" | "filming_logistics"
  | "approval" | "goals" | "contract";

export const STEPS: { id: StepId; n: number; title: string; subtitle: string }[] = [
  { n: 1,  id: "business",          title: "Business basics",         subtitle: "Who you are, what you do." },
  { n: 2,  id: "brand_assets",      title: "Brand assets",            subtitle: "Logo, colors, fonts, library." },
  { n: 3,  id: "meta_access",       title: "Meta access",             subtitle: "Business Manager, Instagram, Facebook." },
  { n: 4,  id: "tiktok_access",     title: "TikTok access",           subtitle: "Handle and account access." },
  { n: 5,  id: "content_prefs",     title: "Content preferences",     subtitle: "What we make, what we avoid." },
  { n: 6,  id: "talent",            title: "Talent & on-camera",      subtitle: "Who can/can't appear." },
  { n: 7,  id: "filming_logistics", title: "Filming logistics",       subtitle: "Production contact + first shoot day." },
  { n: 8,  id: "approval",          title: "Approval workflow",       subtitle: "Who signs off and how fast." },
  { n: 9,  id: "goals",             title: "Goals & KPIs",            subtitle: "Targets we're shooting for." },
  { n: 10, id: "contract",          title: "Contract acknowledgment", subtitle: "Sent separately via PandaDoc." },
];

export function stepByNumber(n: number) {
  return STEPS.find(s => s.n === n) ?? STEPS[0];
}
