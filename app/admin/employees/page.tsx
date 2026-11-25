"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, Upload } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { downloadText, parseCsv, rupees, todayIn, toCsv } from "@/lib/format";
import { CSV_HEADERS, fromCsvRow, type EmployeeInput } from "@/lib/employee";
import { Badge, Button, ConfirmDialog, Empty, Input, Modal, PageHeader, Sheet, Spinner, Tabs, useToast } from "@/components/ui";
import { EmployeeForm, emptyEmployee, type OfficeLite } from "@/components/admin/employee-form";

type Emp = { id: string; full_name: string; employee_code: string | null; designation: string | null; department: string | null;
  email: string | null; phone: string | null; active: boolean; role: string; monthly_gross_paise: number; staff_type: string };

export default function EmployeesPage() {
  const toast = useToast();
  const [emps, setEmps] = useState<Emp[] | null>(null);
  const [offices, setOffices] = useState<OfficeLite[]>([]);
  const [managers, setManagers] = useState<{ id: string; name: string }[]>([]);
  const [vehicles, setVehicles] = useState<{ id: string; name: string }[]>([]);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmDel, setConfirmDel] = useState(false);
  useEffect(() => { setSel(new Set()); }, [tab, q]);

  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [e, o, v] = await Promise.all([
      sb.from("profiles").select("id, full_name, employee_code, designation, department, email, phone, active, role, monthly_gross_paise, staff_type").order("full_name"),
      sb.from("offices").select("id, name").eq("active", true).order("name"),
      sb.from("vehicle_types").select("id, name, rate_paise_per_km").eq("active", true).order("name"),
    ]);
    setManagers(((e.data as Emp[]) ?? []).filter((x) => x.role === "manager" && x.active).map((x) => ({ id: x.id, name: x.full_name })));
    setVehicles(((v.data as { id: string; name: string; rate_paise_per_km: number }[]) ?? []).map((x) => ({ id: x.id, name: `${x.name} · ₹${(x.rate_paise_per_km / 100).toFixed(2)}/km` })));
    setEmps((e.data as Emp[]) ?? []);
    setOffices((o.data as OfficeLite[]) ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const list = useMemo(() => (emps ?? []).filter((e) =>
    (tab === "active" ? e.active : !e.active) &&
    [e.full_name, e.employee_code, e.designation, e.department, e.email, e.phone].join(" ").toLowerCase().includes(q.toLowerCase()),
  ), [emps, q, tab]);

  const allSelected = list.length > 0 && list.every((e) => sel.has(e.id));
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <>
      <PageHeader title="Employees" sub={emps ? `${emps.filter((e) => e.active).length} active` : undefined} actions={
        <>
          <Button variant="outline" size="sm" onClick={() => setImporting(true)}><Upload className="size-4" />Import CSV</Button>
          <Button size="sm" onClick={() => setAdding(true)}><Plus className="size-4" />Add employee</Button>
        </>
      } />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ID, department" className="pl-9" />
        </div>
        <Tabs value={tab} onChange={setTab} items={[{ value: "active", label: "Active" }, { value: "inactive", label: "Deactivated" }]} />
        {sel.size > 0 && (
          <Button variant="danger" size="sm" onClick={() => setConfirmDel(true)}><Trash2 className="size-4" />Delete {sel.size} selected</Button>
        )}
      </div>

      {!emps ? <Spinner /> : list.length === 0 ? <Empty title="No employees found" /> : (
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th className="w-10"><input type="checkbox" aria-label="Select all" checked={allSelected} onChange={() => setSel(allSelected ? new Set() : new Set(list.map((e) => e.id)))} /></th><th>Name</th><th>ID</th><th className="hidden sm:table-cell">Designation</th><th className="hidden md:table-cell">Contact</th><th className="num">Gross / month</th></tr></thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.id} className="clickable">
                  <td><input type="checkbox" aria-label={`Select ${e.full_name}`} checked={sel.has(e.id)} onChange={() => toggle(e.id)} /></td>
                  <td><Link href={`/admin/employees/${e.id}`} className="font-medium hover:underline">{e.full_name}</Link>{e.role !== "employee" && <Badge className="ml-2">{e.role === "admin" ? "Admin" : "Manager"}</Badge>}{e.staff_type === "field" && <Badge className="ml-2 bg-blue-500/15 text-blue-700 dark:text-blue-300">Field</Badge>}</td>
                  <td className="text-muted">{e.employee_code ?? "—"}</td>
                  <td className="hidden text-muted sm:table-cell">{[e.designation, e.department].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="hidden text-muted md:table-cell">{e.email ?? e.phone ?? "—"}</td>
                  <td className="num">{rupees(e.monthly_gross_paise)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add employee" sub="Creates their login. There is no public sign-up.">
        <EmployeeForm mode="create" offices={offices} managers={managers} vehicles={vehicles} initial={emptyEmployee(todayIn(), offices)} submitLabel="Create employee"
          onSubmit={async (input) => {
            const res = await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
            const j = await res.json();
            if (!res.ok) return j.error ?? "Could not create employee";
            toast(`${input.full_name} added`); setAdding(false); load();
            return null;
          }} />
      </Sheet>

      <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)} danger confirmLabel={`Delete ${sel.size}`}
        title={`Permanently delete ${sel.size} employee${sel.size === 1 ? "" : "s"}?`}
        body="Their login and profile are removed and this cannot be undone. Anyone with finalized payslips or linked records is skipped; deactivate those instead."
        onConfirm={async () => {
          const res = await fetch("/api/employees", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [...sel] }) });
          const j = await res.json();
          if (!res.ok) { toast(j.error ?? "Could not delete", "error"); return; }
          const r = j.results as { name: string; ok: boolean; error?: string }[];
          const done = r.filter((x) => x.ok).length, failed = r.filter((x) => !x.ok);
          toast(`${done} deleted${failed.length ? `, ${failed.length} skipped: ${failed.slice(0, 3).map((f) => `${f.name} (${f.error})`).join("; ")}` : ""}`, failed.length ? "error" : undefined);
          setSel(new Set()); load();
        }} />

      <ImportCsv open={importing} onClose={() => setImporting(false)} offices={offices} onDone={load} />
    </>
  );
}

function ImportCsv({ open, onClose, offices, onDone }: { open: boolean; onClose: () => void; offices: OfficeLite[]; onDone: () => void }) {
  const [rows, setRows] = useState<(EmployeeInput | string)[] | null>(null);
  const [results, setResults] = useState<{ row: number; name: string; error?: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  useEffect(() => { if (open) { setRows(null); setResults(null); setFileError(null); } }, [open]);

  async function onFile(f: File) {
    setFileError(null);
    const text = await f.text();
    const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/)[0] ?? "";
    const delim = !firstLine.includes(",") && firstLine.includes(";") ? ";" : !firstLine.includes(",") && firstLine.includes("\t") ? "\t" : ",";
    const cells = parseCsv(text, delim);
    if (cells.length < 2) { setRows(null); setFileError("The file has no data rows. Fill in the template and try again."); return; }
    const head = cells[0].map((h) => h.trim().toLowerCase());
    const missing = ["name", "password"].filter((h) => !head.includes(h));
    if (missing.length || !(head.includes("email") || head.includes("phone"))) {
      setRows(null);
      setFileError(`The first row must be the column names. Missing: ${[...missing, ...(head.includes("email") || head.includes("phone") ? [] : ["email or phone"])].join(", ")}. Use "Download template" and keep its first row.`);
      return;
    }
    const byName = new Map(offices.map((o) => [o.name.toLowerCase(), o.id]));
    setRows(cells.slice(1).map((c) => {
      const rec: Record<string, string> = {};
      head.forEach((h, i) => (rec[h] = c[i] ?? ""));
      const r = fromCsvRow(rec, byName, offices.length === 1 ? offices[0].id : undefined);
      if (typeof r !== "string" && !r.password) return "password column is empty";
      return r;
    }));
  }

  const valid = (rows ?? []).filter((r): r is EmployeeInput => typeof r !== "string");

  return (
    <Modal open={open} onClose={onClose} title="Import employees from CSV" wide footer={
      results ? <Button onClick={onClose}>Done</Button> : <>
        <Button variant="ghost" onClick={() => downloadText("employees-template.csv",
          toCsv([...CSV_HEADERS], [["Asha Nair", "EMP010", "asha@company.com", "9876543210", "Designer", "Design", "2026-04-01", "09:00", "18:00", "30000", "yes", offices[0]?.name ?? "Head office", "Welcome@123"]]))}>
          Download template
        </Button>
        <Button disabled={!valid.length} loading={busy} onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/employees/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: valid }) });
          const j = await res.json(); setBusy(false);
          setResults(j.results ?? [{ row: 0, name: "", error: j.error }]); onDone();
        }}>Import {valid.length || ""} employee{valid.length === 1 ? "" : "s"}</Button>
      </>
    }>
      {results ? (
        <ul className="space-y-1 text-sm">
          <li className="mb-2 font-medium">{results.filter((r) => !r.error).length} created, {results.filter((r) => r.error).length} failed</li>
          {results.filter((r) => r.error).map((r) => <li key={r.row} className="text-rose-600">Row {r.row} ({r.name}): {r.error}</li>)}
        </ul>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">Columns: {CSV_HEADERS.join(", ")}. Salary in rupees. Separate several offices with “;”.</p>
          <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
            className="block w-full text-sm file:mr-3 file:h-10 file:rounded-xl file:border-0 file:bg-soft file:px-4 file:font-medium" />
          {fileError && <p className="mt-3 text-sm text-rose-600">{fileError}</p>}
          {rows && (
            <ul className="mt-4 max-h-72 space-y-1 overflow-y-auto text-sm">
              {rows.map((r, i) => (
                <li key={i} className={typeof r === "string" ? "text-rose-600" : ""}>
                  Row {i + 2}: {typeof r === "string" ? r : `${r.full_name} · ${r.email ?? r.phone} · ${rupees(r.monthly_gross_paise)}`}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
