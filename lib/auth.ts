// Helpers for fetching the current user + role inside server components.
import { createClient } from "./supabase-server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

// Cookie set by /api/admin/view-as. Only honored when the real signed-in
// user is an admin — harmless if a client sets it themselves.
export const VIEW_AS_COOKIE = "om_view_as";

export type CurrentUser = {
  id: string;
  email: string;
  role: "admin" | "client";
  client_id: string | null;
  full_name: string | null;
  // True when an admin is previewing the portal as a client ("View as customer").
  impersonating?: boolean;
};

// The real authenticated user, ignoring any view-as preview cookie.
export async function getRealUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("users")
    .select("id, role, client_id, full_name, email")
    .eq("id", user.id)
    .single();
  if (!data) return null;
  return data as CurrentUser;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const u = await getRealUser();
  if (!u) return null;
  // Admin previewing as a client: present as that client so the client
  // pages render exactly what the customer sees. Admin RLS policies allow
  // the underlying reads.
  if (u.role === "admin") {
    const store = await cookies();
    const viewAs = store.get(VIEW_AS_COOKIE)?.value;
    if (viewAs) return { ...u, role: "client", client_id: viewAs, impersonating: true };
  }
  return u;
}

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<CurrentUser> {
  // Checks the REAL role so admin pages stay reachable during a preview.
  const u = await getRealUser();
  if (!u) redirect("/login");
  if (u.role !== "admin") redirect("/dashboard");
  return u;
}

export async function requireClient(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role !== "client") redirect("/admin");
  return u;
}
