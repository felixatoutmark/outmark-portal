// Cache a remote image into our public `thumbnails` bucket. IG/TikTok CDN
// URLs are signed and expire within days, so anything shown on the dashboard
// must be a copy we own. Shared by the admin winning-content route and the
// Meta sync.
import { createServiceClient } from "@/lib/supabase-server";
import { resolveThumbnail, downloadImage } from "@/lib/thumbnail";

const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
};
const BUCKET_MARKER = "/storage/v1/object/public/thumbnails/";

export function isCachedUrl(url: string | null | undefined): boolean {
  return !!url && url.includes(BUCKET_MARKER);
}

export async function uploadToBucket(
  clientId: string, month: string, position: number, bytes: Uint8Array, contentType: string,
): Promise<string | null> {
  const ext = EXT_BY_TYPE[contentType.split(";")[0].trim()] ?? "jpg";
  const path = `${clientId}/${month}-${position}-${Date.now()}.${ext}`;
  const svc = createServiceClient();
  const { error } = await svc.storage.from("thumbnails").upload(path, bytes, { contentType, upsert: true });
  if (error) return null;
  return svc.storage.from("thumbnails").getPublicUrl(path).data.publicUrl;
}

// Best-effort removal of an object we previously cached (by its public URL).
export async function removeCached(url: string | null | undefined): Promise<void> {
  if (!isCachedUrl(url)) return;
  const path = decodeURIComponent(url!.slice(url!.indexOf(BUCKET_MARKER) + BUCKET_MARKER.length));
  try { await createServiceClient().storage.from("thumbnails").remove([path]); } catch {}
}

// Resolve (unless `directImage`) + download + cache.
//   strict=false (admin route): fall back to the remote URL if caching fails —
//     better a temporary image than none, and the admin can re-save.
//   strict=true (sync): never store an expiring URL; return null instead so
//     the caller can try another source.
export async function cacheThumbnail(
  clientId: string, month: string, position: number, sourceUrl: string, directImage = false, strict = false,
): Promise<string | null> {
  const remote = directImage ? sourceUrl : await resolveThumbnail(sourceUrl);
  if (!remote) return null;
  const img = await downloadImage(remote);
  if (!img) return strict ? null : remote;
  const cached = await uploadToBucket(clientId, month, position, img.bytes, img.contentType);
  return cached ?? (strict ? null : remote);
}
