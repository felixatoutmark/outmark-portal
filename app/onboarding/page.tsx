// Onboarding entry — fetches saved progress, sends user to first incomplete step.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { requireClient } from "@/lib/auth";
import { STEPS } from "@/lib/onboarding-config";

export default async function OnboardingIndex() {
  const u = await requireClient();
  const sb = await createClient();
  const { data: rows } = await sb
    .from("onboarding_progress")
    .select("step_number, completed")
    .eq("client_id", u.client_id!);

  const done = new Set((rows ?? []).filter(r => r.completed).map(r => r.step_number));
  const next = STEPS.find(s => !done.has(s.n))?.n ?? STEPS[STEPS.length - 1].n;
  redirect(`/onboarding/${next}`);
}
