"use client";
import { useState } from "react";

// Sticky banner shown to an admin while previewing the portal as a client.
export default function PreviewBanner({ clientId, businessName }: { clientId: string; businessName?: string | null }) {
  const [busy, setBusy] = useState(false);

  async function exitPreview() {
    setBusy(true);
    await fetch("/api/admin/view-as", { method: "DELETE" });
    window.location.href = `/admin/clients/${clientId}`;
  }

  return (
    <div className="sticky top-0 z-50 bg-amber-400 text-black text-[13px] px-4 py-2 flex items-center justify-center gap-3 shadow">
      <span className="font-semibold">
        Previewing as {businessName || "customer"} — this is what they see.
      </span>
      <button
        onClick={exitPreview}
        disabled={busy}
        className="underline font-semibold hover:no-underline disabled:opacity-60"
      >
        {busy ? "Exiting…" : "Exit preview"}
      </button>
    </div>
  );
}
