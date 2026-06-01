import { requireAdmin } from "@/lib/auth";
import Nav from "@/components/Nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <Nav role="admin" items={[
        { href: "/admin", label: "Clients" },
        { href: "/admin/onboarding", label: "Onboarding tracker" },
        { href: "/admin/invite", label: "Invite client" },
      ]} />
      <main className="max-w-[1200px] mx-auto px-5 sm:px-8 py-8">{children}</main>
    </>
  );
}
