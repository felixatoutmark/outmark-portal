import { requireClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase-server";
import ContentSettingsForm from "./ContentSettingsForm";

export const dynamic = "force-dynamic";

export default async function ContentSettings() {
  const u = await requireClient();
  const sb = await createClient();
  const [{ data: prefs }, { data: filming }] = await Promise.all([
    sb.from("content_preferences").select("*").eq("client_id", u.client_id!).maybeSingle(),
    sb.from("filming_logistics").select("*").eq("client_id", u.client_id!).maybeSingle(),
  ]);
  return <ContentSettingsForm clientId={u.client_id!} prefs={prefs} filming={filming} />;
}
