import { redirect } from "next/navigation";
import { getMe } from "@/lib/supabase/server";
import { EmployeeShell } from "@/components/employee/shell";

export default async function EmployeeLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  if (me.role === "admin" || me.role === "manager") redirect("/admin");
  return <EmployeeShell name={me.full_name}>{children}</EmployeeShell>;
}
