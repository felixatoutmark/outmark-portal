// Best-effort thumbnail resolution for pasted content links (IG / TikTok /
// YouTube / anything with og:image). Runs server-side at save time; returns
// null when nothing could be resolved so the UI can fall back to a placeholder.

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAX_HTML_BYTES = 512 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Refuse to fetch anything that points at localhost / private ranges — the
// URL is admin-supplied, but there's no reason to ever hit internal hosts.
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h === "::1" || h === "0.0.0.0") return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

function allowedUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (isBlockedHost(u.hostname)) return null;
    return u;
  } catch {
    return null;
  }
}

// Fetch with a deadline that covers the BODY read too (plain fetch timeouts
// stop at the headers), and a byte cap so a huge response can't buffer.
async function fetchBytes(
  url: string,
  init: RequestInit | undefined,
  ms: number,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  if (!allowedUrl(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, redirect: "follow" });
    if (!res.ok || !res.body) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > maxBytes) return null;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        ctrl.abort();
        return null;
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      bytes.set(c, off);
      off += c.byteLength;
    }
    return { bytes, contentType: res.headers.get("content-type") ?? "" };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string, init?: RequestInit, ms = 6000): Promise<string | null> {
  const r = await fetchBytes(url, init, ms, MAX_HTML_BYTES);
  return r ? new TextDecoder("utf-8", { fatal: false }).decode(r.bytes) : null;
}

function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\.|^m\./, "");
  const id =
    host === "youtu.be" ? u.pathname.slice(1).split("/")[0]
    : host === "youtube.com" && u.pathname === "/watch" ? u.searchParams.get("v") ?? ""
    : host === "youtube.com" && /^\/(shorts|embed)\//.test(u.pathname) ? u.pathname.split("/")[2] ?? ""
    : "";
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#38;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

export async function resolveThumbnail(rawUrl: string): Promise<string | null> {
  const u = allowedUrl(rawUrl);
  if (!u) return null;
  const host = u.hostname.replace(/^www\./, "");

  // YouTube thumbnails are deterministic — no fetch needed.
  const yt = youtubeId(u);
  if (yt) return `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`;

  // TikTok has an unauthenticated oEmbed endpoint.
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const text = await fetchText(`https://www.tiktok.com/oembed?url=${encodeURIComponent(rawUrl)}`);
    if (text) {
      try {
        const j = JSON.parse(text);
        if (j?.thumbnail_url) return String(j.thumbnail_url);
      } catch {}
    }
  }

  // Instagram + everything else: fetch the page and pull og:image.
  const html = await fetchText(rawUrl, {
    headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
  });
  if (html) {
    const m =
      html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i);
    if (m?.[1]?.startsWith("http")) return decodeEntities(m[1]);
  }
  return null;
}

// Download the resolved image so it can be cached in our own storage —
// IG/TikTok image URLs are signed and expire within days.
export async function downloadImage(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const r = await fetchBytes(
    url,
    { headers: { "User-Agent": BROWSER_UA, Accept: "image/*" } },
    8000,
    MAX_IMAGE_BYTES,
  );
  if (!r) return null;
  if (!r.contentType.startsWith("image/")) return null;
  return r;
}
