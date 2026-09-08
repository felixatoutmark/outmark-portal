// Daily Meta → portal sync, invoked by Vercel Cron (see vercel.json).
// Vercel sends `Authorization: Bearer $CRON_SECRET` on cron invocations.
import { NextResponse, type NextRequest } from "next/server";
import { syncAll } from "@/lib/meta-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await syncAll();

  // Make failures visible in Vercel's function logs / cron status, not only
  // in each client's admin tab.
  const failed = result.summaries.filter((s) => s.metrics === "error" && s.reels === "error");
  for (const e of result.errors) console.error("[meta-sync]", e);
  for (const s of result.summaries) {
    if (s.errors.length) console.warn(`[meta-sync] ${s.client_id} ${s.month}:`, s.errors.join(" | "));
  }
  if (result.skipped.length) console.warn("[meta-sync] out of time, skipped clients:", result.skipped.join(", "));

  const allFailed = result.ran > 0 && failed.length === result.summaries.length && result.summaries.length > 0;
  return NextResponse.json(
    { ok: !allFailed, ...result },
    { status: allFailed ? 502 : 200 },
  );
}
