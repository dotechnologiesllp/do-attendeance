import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

type CookieToSet = { name: string; value: string; options?: Record<string, unknown> };

/** Supabase client acting as the signed-in user (RLS applies). */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list: CookieToSet[]) => {
        try {
          list.forEach(({ name, value, options }) => store.set(name, value, options as never));
        } catch {
          /* called from a Server Component: middleware refreshes the session instead */
        }
      },
    },
  });
}

/** Service-role client. Server only: used to create and block logins. */
export function supabaseAdmin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type Me = { id: string; role: "admin" | "manager" | "employee"; full_name: string; active: boolean };

export async function getMe(): Promise<Me | null> {
  const sb = await supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data } = await sb.from("profiles").select("id, role, full_name, active").eq("id", user.id).maybeSingle();
  return (data as Me) ?? null;
}

/** For API routes: an active admin or manager (managers are limited to their team by the database). */
export async function requireStaffViewer(): Promise<Me> {
  const me = await getMe();
  if (!me || !me.active || (me.role !== "admin" && me.role !== "manager")) throw new Response("Forbidden", { status: 403 });
  return me;
}

/** For API routes: the caller must be an active admin. */
export async function requireAdmin(): Promise<Me> {
  const me = await getMe();
  if (!me || me.role !== "admin" || !me.active) throw new Response("Forbidden", { status: 403 });
  return me;
}

export async function getTimezone(): Promise<string> {
  const sb = await supabaseServer();
  const { data } = await sb.from("org_settings").select("timezone").eq("id", 1).maybeSingle();
  return (data?.timezone as string) ?? "Asia/Kolkata";
}
