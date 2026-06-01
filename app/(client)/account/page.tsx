import { requireUser } from "@/lib/auth";
import AccountForm from "./AccountForm";

export const dynamic = "force-dynamic";

export default async function Account() {
  const u = await requireUser();
  return (
    <div className="space-y-8">
      <header><h1 className="section-title">Account</h1>
        <p className="text-[--muted]">Profile, password, data export.</p></header>
      <AccountForm user={u} />
    </div>
  );
}
