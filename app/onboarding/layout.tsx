import { requireClient } from "@/lib/auth";
import Nav from "@/components/Nav";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireClient();
  return (
    <>
      <Nav role="client" items={[{ href: "/onboarding", label: "Onboarding" }]} />
      <main className="max-w-[760px] mx-auto px-5 sm:px-8 py-10">{children}</main>
    </>
  );
}
