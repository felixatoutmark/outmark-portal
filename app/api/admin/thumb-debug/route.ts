// TEMPORARY diagnostic: reports what Instagram/TikTok strategies work from
// Vercel's egress IPs. Guarded by the tail of the service-role key (runtime
// env — never committed). Delete this route once diagnosis is done.
import { NextResponse, type NextRequest } from "next/server";
import { resolveThumbnail, downloadImage } from "@/lib/thumbnail";

export const dynamic = "force-dynamic";

async function probe(url: string, headers: Record<string, string>) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal, redirect: "follow" });
    const body = (await res.text()).slice(0, 400_000);
    return {
      status: res.status,
      finalUrl: res.url,
      bytes: body.length,
      hasOgImage: /property=["']og:image/.test(body),
      hasEmbeddedMediaImage: /EmbeddedMediaImage/.test(body),
      looksLikeLogin: /loginForm|\/accounts\/login/.test(body),
    };
  } catch (e: any) {
    return { error: String(e?.message ?? e) };
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: NextRequest) {
  const expected = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").slice(-24);
  if (!expected || req.headers.get("x-debug-key") !== expected) {
    return NextResponse.json({ error: "nope" }, { status: 404 });
  }
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const shortcode = url.match(/\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/)?.[1];

  const CRAWLER = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
  const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  const [crawler, browser, embed, resolved] = await Promise.all([
    probe(url, { "User-Agent": CRAWLER, Accept: "text/html" }),
    probe(url, { "User-Agent": BROWSER, Accept: "text/html" }),
    shortcode
      ? probe(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, { "User-Agent": BROWSER, Accept: "text/html" })
      : Promise.resolve(null),
    resolveThumbnail(url),
  ]);

  const download = resolved ? await downloadImage(resolved) : null;
  return NextResponse.json({
    crawler, browser, embed,
    resolvedThumbnail: resolved ? resolved.slice(0, 120) : null,
    downloadedImage: download ? { contentType: download.contentType, kb: Math.round(download.bytes.byteLength / 1024) } : null,
  });
}
