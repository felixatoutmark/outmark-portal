import { requireClient } from "@/lib/auth";
import Nav from "@/components/Nav";
import PreviewBanner from "@/components/PreviewBanner";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const u = await requireClient();
  return (
    <>
      {u.impersonating && <PreviewBanner clientId={u.client_id!} />}
      <Nav role="client" items={[{ href: "/onboarding", label: "Onboarding" }]} />
      <main className="max-w-[760px] mx-auto px-5 sm:px-8 py-10">{children}</main>
    </>
  );
}
