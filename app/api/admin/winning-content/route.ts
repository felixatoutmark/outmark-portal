// Admin endpoint: upsert / delete a client's "Top 3 winning reels" entries.
// POST resolves a thumbnail server-side (og:image / oEmbed), downloads it and
// caches it in the public `thumbnails` bucket — IG/TikTok image URLs are
// signed and expire, so we must serve our own copy. Rows saved here are
// source = 'manual' and the Meta sync leaves them alone.
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { cacheThumbnail, uploadToBucket } from "@/lib/thumbnail-cache";

async function requireAdminSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return { supabase, error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  return { supabase, error: null };
}

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const { supabase, error } = await requireAdminSession();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const clientId = String(body.client_id ?? "").trim();
  const url = String(body.url ?? "").trim();
  const position = Number(body.position);
  // Accept "2026-08" or "2026-08-01"; store as first-of-month.
  const monthRaw = String(body.month ?? "").trim();
  const month = /^\d{4}-\d{2}$/.test(monthRaw) ? `${monthRaw}-01` : monthRaw;

  if (!clientId) return NextResponse.json({ success: false, error: "client_id required" }, { status: 400 });
  if (!/^https?:\/\//i.test(url)) return NextResponse.json({ success: false, error: "url must start with http(s)://" }, { status: 400 });
  if (![1, 2, 3].includes(position)) return NextResponse.json({ success: false, error: "position must be 1–3" }, { status: 400 });
  if (!/^\d{4}-\d{2}-01$/.test(month)) return NextResponse.json({ success: false, error: "month must be YYYY-MM" }, { status: 400 });

  // Existing row (if any) — used to keep a good thumbnail when re-resolution
  // fails on an unchanged link (IG login walls etc. are flaky).
  const { data: existing } = await supabase
    .from("winning_content")
    .select("id, url, thumbnail_url")
    .eq("client_id", clientId).eq("month", month).eq("position", position)
    .maybeSingle();

  // Precedence: uploaded image file > pasted image URL > keep existing > auto-resolve.
  const thumbData = String(body.thumbnail_data ?? "");
  const dataMatch = thumbData.match(/^data:(image\/(?:jpeg|jpg|png|webp|gif|avif));base64,(.+)$/);
  const manualThumb = String(body.thumbnail_url ?? "").trim();
  let thumbnail_url: string | null;
  if (dataMatch) {
    const bytes = new Uint8Array(Buffer.from(dataMatch[2], "base64"));
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ success: false, error: "Image must be under 5 MB" }, { status: 400 });
    }
    thumbnail_url = await uploadToBucket(clientId, month, position, bytes, dataMatch[1]);
    if (!thumbnail_url) return NextResponse.json({ success: false, error: "Image upload failed" }, { status: 500 });
  } else if (/^https?:\/\//i.test(manualThumb)) {
    // Cache the admin-supplied image too; fall back to hotlinking it.
    thumbnail_url = (await cacheThumbnail(clientId, month, position, manualThumb, true)) ?? manualThumb;
  } else if (existing && existing.url === url && existing.thumbnail_url) {
    thumbnail_url = existing.thumbnail_url; // unchanged link → keep cached thumb
  } else {
    thumbnail_url = await cacheThumbnail(clientId, month, position, url);
    if (!thumbnail_url && existing && existing.url === url) thumbnail_url = existing.thumbnail_url;
  }

  const row: Record<string, unknown> = {
    client_id: clientId,
    month,
    position,
    url,
    thumbnail_url,
    title: String(body.title ?? "").trim() || null,
    metric_label: String(body.metric_label ?? "").trim() || null,
    source: "manual",
  };
  let { data, error: dbErr } = await supabase
    .from("winning_content").upsert(row, { onConflict: "client_id,month,position" }).select().single();
  if (dbErr && /source/.test(dbErr.message)) {
    // DB predates migration 0014 (no `source` column yet) — save without the flag.
    delete row.source;
    ({ data, error: dbErr } = await supabase
      .from("winning_content").upsert(row, { onConflict: "client_id,month,position" }).select().single());
  }
  if (dbErr) return NextResponse.json({ success: false, error: dbErr.message }, { status: 500 });

  return NextResponse.json({ success: true, row: data, thumbnail_resolved: !!thumbnail_url });
}

export async function DELETE(req: NextRequest) {
  const { supabase, error } = await requireAdminSession();
  if (error) return error;

  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "").trim();
  if (!id) return NextResponse.json({ success: false, error: "id required" }, { status: 400 });

  const { error: dbErr } = await supabase.from("winning_content").delete().eq("id", id);
  if (dbErr) return NextResponse.json({ success: false, error: dbErr.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
