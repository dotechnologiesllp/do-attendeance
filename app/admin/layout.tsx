import { redirect } from "next/navigation";
import { getMe, supabaseServer } from "@/lib/supabase/server";
import { AdminShell } from "@/components/admin/shell";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role !== "admin" || !me.active) redirect("/");
  const sb = await supabaseServer();
  const { data } = await sb.from("org_settings").select("company_name").eq("id", 1).maybeSingle();
  return <AdminShell name={me.full_name} company={data?.company_name ?? "Do Attendance"}>{children}</AdminShell>;
}
