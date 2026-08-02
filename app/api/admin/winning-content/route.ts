// Admin endpoint: upsert / delete a client's "Top 3 winning reels" entries.
// POST resolves a thumbnail server-side (og:image / oEmbed), downloads it and
// caches it in the public `thumbnails` bucket — IG/TikTok image URLs are
// signed and expire, so we must serve our own copy.
import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase-server";
import { resolveThumbnail, downloadImage } from "@/lib/thumbnail";

async function requireAdminSession() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, error: NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 }) };
  const { data: me } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "admin") return { supabase, error: NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 }) };
  return { supabase, error: null };
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
};

// Resolve + download + cache. Falls back to the remote URL if caching fails,
// and to null if nothing could be resolved at all.
async function cacheThumbnail(clientId: string, month: string, position: number, sourceUrl: string): Promise<string | null> {
  const remote = await resolveThumbnail(sourceUrl);
  if (!remote) return null;
  const img = await downloadImage(remote);
  if (!img) return remote; // better a temporary remote URL than nothing
  const ext = EXT_BY_TYPE[img.contentType.split(";")[0].trim()] ?? "jpg";
  const path = `${clientId}/${month}-${position}-${Date.now()}.${ext}`;
  const svc = createServiceClient();
  const { error } = await svc.storage.from("thumbnails").upload(path, img.bytes, {
    contentType: img.contentType,
    upsert: true,
  });
  if (error) return remote;
  return svc.storage.from("thumbnails").getPublicUrl(path).data.publicUrl;
}

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

  const manualThumb = String(body.thumbnail_url ?? "").trim();
  let thumbnail_url: string | null;
  if (/^https?:\/\//i.test(manualThumb)) {
    thumbnail_url = manualThumb;
  } else if (existing && existing.url === url && existing.thumbnail_url) {
    thumbnail_url = existing.thumbnail_url; // unchanged link → keep cached thumb
  } else {
    thumbnail_url = await cacheThumbnail(clientId, month, position, url);
    if (!thumbnail_url && existing && existing.url === url) thumbnail_url = existing.thumbnail_url;
  }

  const { data, error: dbErr } = await supabase
    .from("winning_content")
    .upsert(
      {
        client_id: clientId,
        month,
        position,
        url,
        thumbnail_url,
        title: String(body.title ?? "").trim() || null,
        metric_label: String(body.metric_label ?? "").trim() || null,
      },
      { onConflict: "client_id,month,position" },
    )
    .select()
    .single();
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
