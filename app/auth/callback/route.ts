import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

// Handles email/magic-link/OAuth callback; exchanges code for session, then redirects.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const nextParam = url.searchParams.get("next") || "/";
  // Only allow same-origin redirects. `new URL(next, base)` ignores `base` when
  // `next` is absolute, so an attacker could send `?next=https://evil.com`.
  const safeNext = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  if (code) {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
  }
  return NextResponse.redirect(new URL(safeNext, url.origin));
}
