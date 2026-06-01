"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

type Item = { href: string; label: string };

export default function Nav({
  items, role, fullName, businessName, uploadUrl,
}: { items: Item[]; role: "admin" | "client"; fullName?: string | null; businessName?: string | null; uploadUrl?: string | null }) {
  const pathname = usePathname();
  const supabase = createClient();
  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }
  return (
    <header className="sticky top-0 z-50 border-b backdrop-blur" style={{ background: "rgba(250,250,248,0.92)", borderColor: "var(--border)" }}>
      <div className="max-w-[1200px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between">
        <Link href={role === "admin" ? "/admin" : "/dashboard"} className="flex items-center gap-1.5 font-bold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/outmark-logo.svg" alt="Outmark" className="h-5 w-auto" />
          {role === "admin" && <span className="text-[--orange] text-[14px]">/admin</span>}
        </Link>
        <nav className="hidden md:flex items-center gap-7">
          {items.map((it) => {
            const active = pathname === it.href || pathname?.startsWith(it.href + "/");
            return (
              <Link key={it.href} href={it.href}
                className={`text-[13px] font-medium transition-colors ${active ? "text-[--fg]" : "text-[--muted] hover:text-[--fg]"}`}>
                {it.label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-3">
          {businessName && <span className="hidden lg:inline text-[13px] text-[--muted]">{businessName}</span>}
          {uploadUrl && (
            <a href={uploadUrl} target="_blank" rel="noopener noreferrer" className="btn-primary !py-1.5 !text-[12px]">
              Upload content ↗
            </a>
          )}
          <button onClick={signOut} className="btn-ghost !py-1.5 !text-[12px]">Sign out</button>
        </div>
      </div>
      <nav className="md:hidden border-t" style={{ borderColor: "var(--border)" }}>
        <div className="max-w-[1200px] mx-auto px-3 py-2 flex gap-1 overflow-x-auto items-center">
          {uploadUrl && (
            <a href={uploadUrl} target="_blank" rel="noopener noreferrer" className="btn-primary !py-1 !text-[11px] !px-3 whitespace-nowrap">
              Upload ↗
            </a>
          )}
          {items.map((it) => {
            const active = pathname === it.href || pathname?.startsWith(it.href + "/");
            return (
              <Link key={it.href} href={it.href}
                className={`whitespace-nowrap text-[12px] font-medium px-3 py-1.5 rounded-pill ${active ? "bg-[--fg] text-white" : "text-[--muted]"}`}>
                {it.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
