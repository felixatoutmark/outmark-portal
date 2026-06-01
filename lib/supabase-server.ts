// Server-side Supabase client for Server Components, Route Handlers, and Server Actions.
// Uses the request's cookies — RLS sees the authenticated user.
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options as CookieOptions),
            );
          } catch {
            // Server Components can't write cookies — middleware refreshes them.
          }
        },
      },
    },
  );
}

// Service-role client — ONLY use in server-side code that explicitly needs to
// bypass RLS (e.g. invite acceptance, where the user isn't authenticated yet,
// or admin tasks like creating the auth user). Never import from client code.
import { createClient as createSbClient } from "@supabase/supabase-js";
export function createServiceClient() {
  return createSbClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
