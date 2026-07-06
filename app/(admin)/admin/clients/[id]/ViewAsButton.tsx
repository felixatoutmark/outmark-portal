"use client";
import { useState } from "react";

export default function ViewAsButton({ clientId }: { clientId: string }) {
  const [busy, setBusy] = useState(false);

  async function startPreview() {
    setBusy(true);
    const res = await fetch("/api/admin/view-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId }),
    });
    if (res.ok) {
      window.location.href = "/dashboard";
    } else {
      setBusy(false);
      alert("Could not start preview.");
    }
  }

  return (
    <button onClick={startPreview} disabled={busy} className="btn-ghost text-[13px] whitespace-nowrap">
      {busy ? "Opening…" : "👁 View as customer"}
    </button>
  );
}
