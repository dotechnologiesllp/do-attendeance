import { redirect } from "next/navigation";
import { getMe, getTimezone } from "@/lib/supabase/server";
import { AttendanceMonth } from "@/components/attendance-month";

export default async function HistoryPage() {
  const me = await getMe();
  if (!me) redirect("/login");
  const tz = await getTimezone();
  return (
    <div className="pt-4">
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">History</h1>
      <AttendanceMonth employeeId={me.id} tz={tz} />
    </div>
  );
}
