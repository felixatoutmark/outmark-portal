// Admin endpoint: start/stop previewing the portal as a specific client.
// POST { client_id } → sets the view-as cookie. DELETE → clears it.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { VIEW_AS_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const clientId = (body.client_id || "").trim();
  if (!clientId) return NextResponse.json({ success: false, error: "client_id required" }, { status: 400 });

  // Make sure the client actually exists before entering preview.
  const { data: client } = await supabase.from("clients").select("id").eq("id", clientId).single();
  if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });

  const res = NextResponse.json({ success: true });
  res.cookies.set(VIEW_AS_COOKIE, clientId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(VIEW_AS_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
