import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";
import Nav from "@/components/Nav";
import { redirect } from "next/navigation";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const u = await requireClient();
  const sb = await createClient();
  const { data: client } = await sb.from("clients")
    .select("business_name, status, onboarding_completed_at, content_upload_url")
    .eq("id", u.client_id!).single();

  // Force onboarding completion before any other client page is reachable
  // (handled per-page below via OnboardingGate, but layout passes status through)
  return (
    <>
      <Nav
        role="client"
        fullName={u.full_name}
        businessName={client?.business_name}
        uploadUrl={client?.content_upload_url}
        items={[
          { href: "/dashboard", label: "Dashboard" },
          { href: "/goals", label: "Goals" },
          { href: "/content-settings", label: "Content Settings" },
          { href: "/billing", label: "Billing" },
          { href: "/requests", label: "Ideas" },
          { href: "/feedback", label: "Feedback" },
          { href: "/account", label: "Account" },
        ]}
      />
      <main className="max-w-[1200px] mx-auto px-5 sm:px-8 py-8">{children}</main>
    </>
  );
}
