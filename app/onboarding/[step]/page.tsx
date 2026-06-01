import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { requireClient } from "@/lib/auth";
import { STEPS, stepByNumber } from "@/lib/onboarding-config";
import OnboardingStepClient from "./OnboardingStepClient";

export default async function OnboardingStepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  const n = parseInt(step, 10);
  if (!n || n < 1 || n > STEPS.length) notFound();
  const u = await requireClient();
  const sb = await createClient();

  const [{ data: rows }, { data: client }, { data: prefs }, { data: filming }] = await Promise.all([
    sb.from("onboarding_progress").select("*").eq("client_id", u.client_id!),
    sb.from("clients").select("*").eq("id", u.client_id!).single(),
    sb.from("content_preferences").select("*").eq("client_id", u.client_id!).maybeSingle(),
    sb.from("filming_logistics").select("*").eq("client_id", u.client_id!).maybeSingle(),
  ]);

  const stepInfo = stepByNumber(n);
  const saved = (rows ?? []).find(r => r.step_number === n);
  const completedSet = new Set((rows ?? []).filter(r => r.completed).map(r => r.step_number));

  return (
    <OnboardingStepClient
      stepNumber={n}
      stepInfo={stepInfo}
      allSteps={STEPS}
      completedSteps={Array.from(completedSet)}
      savedData={saved?.data ?? {}}
      client={client}
      contentPreferences={prefs}
      filmingLogistics={filming}
    />
  );
}
