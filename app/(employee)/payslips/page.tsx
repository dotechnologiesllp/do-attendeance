"use client";
import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { monthLabel, rupees } from "@/lib/format";
import type { PayrollRow } from "@/lib/payroll";
import { Empty, Sheet, Spinner } from "@/components/ui";
import { PayslipView } from "@/components/payslip-view";

type Slip = { month: string; net_paise: number; data: PayrollRow; employee_id: string };

export default function PayslipsPage() {
  const [slips, setSlips] = useState<Slip[] | null>(null);
  const [open, setOpen] = useState<Slip | null>(null);

  useEffect(() => {
    supabaseBrowser().from("payslips").select("month, net_paise, data, employee_id").order("month", { ascending: false })
      .then(({ data }) => setSlips((data as Slip[]) ?? []));
  }, []);

  return (
    <div className="pt-4">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Payslips</h1>
      {!slips ? <Spinner /> : slips.length === 0 ? (
        <Empty title="No payslips yet">Payslips appear here once your admin finalizes a month.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {slips.map((s) => (
            <li key={s.month}>
              <button onClick={() => setOpen(s)} className="flex w-full items-center justify-between py-4 text-left">
                <span className="font-medium">{monthLabel(s.month)}</span>
                <span className="tabular">{rupees(s.net_paise)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Sheet open={!!open} onClose={() => setOpen(null)} title={open ? monthLabel(open.month) : ""} sub="Payslip"
        footer={open && (
          <a href={`/api/payslip?month=${open.month}&employee=${open.employee_id}`} target="_blank" rel="noopener"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-4 text-[15px] font-medium text-accent-fg">
            <Download className="size-4" /> Download PDF
          </a>
        )}>
        {open && <PayslipView row={open.data} />}
      </Sheet>
    </div>
  );
}
