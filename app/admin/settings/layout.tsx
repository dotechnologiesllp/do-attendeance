import { redirect } from "next/navigation";
import { getMe } from "@/lib/supabase/server";

/** Admins only: managers see attendance for their team, never pay or company settings. */
export default async function AdminOnly({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (me?.role !== "admin") redirect("/admin");
  return <>{children}</>;
}
