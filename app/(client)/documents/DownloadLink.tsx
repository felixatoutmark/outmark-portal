"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function DownloadLink({ path, filename }: { path: string; filename: string }) {
  const sb = createClient();
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      const { data } = await sb.storage.from("client-files").createSignedUrl(path, 60 * 5, { download: filename });
      if (data?.signedUrl) window.location.href = data.signedUrl;
    } finally { setBusy(false); }
  }
  return <button onClick={go} disabled={busy} className="btn-ghost !py-1.5 !text-[12px]">{busy ? "…" : "Download"}</button>;
}
