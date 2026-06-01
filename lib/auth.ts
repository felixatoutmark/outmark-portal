// Helpers for fetching the current user + role inside server components.
import { createClient } from "./supabase-server";
import { redirect } from "next/navigation";

export type CurrentUser = {
  id: string;
  email: string;
  role: "admin" | "client";
  client_id: string | null;
  full_name: string | null;
};

export async function getCurrentUser(): Promise<CurrentUser | null> {
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

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role !== "admin") redirect("/dashboard");
  return u;
}

export async function requireClient(): Promise<CurrentUser> {
  const u = await requireUser();
  if (u.role !== "client") redirect("/admin");
  return u;
}
