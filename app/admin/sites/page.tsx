"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { dateLabel, downloadText, parseCsv, toCsv } from "@/lib/format";
import { Badge, Button, cn, ConfirmDialog, Empty, Field, Input, Modal, PageHeader, Select, Spinner, Switch, Tabs, useToast } from "@/components/ui";

const MapPicker = dynamic(() => import("@/components/admin/map-picker").then((m) => m.MapPicker), {
  ssr: false, loading: () => <div className="h-72 animate-pulse rounded-xl bg-soft" />,
});

type Site = { id: string; name: string; category: string | null; address: string | null; lat: number; lng: number; radius_m: number; contact: string | null; active: boolean };
type Staff = { id: string; full_name: string };
type Plan = { id: string; employee_id: string; name: string; plan_date: string | null; weekdays: number[] | null; active: boolean; beat_plan_sites: { seq: number; site_id: string }[] };
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Address → coordinates with OpenStreetMap's Nominatim (free; keep to about 1 request a second). */
async function geocode(q: string): Promise<{ lat: number; lng: number; label: string }[]> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=in&q=${encodeURIComponent(q)}`, { headers: { "Accept-Language": "en" } });
  if (!r.ok) return [];
  const j = (await r.json()) as { lat: string; lon: string; display_name: string }[];
  return j.map((x) => ({ lat: Number(x.lat), lng: Number(x.lon), label: x.display_name }));
}

export default function SitesPage() {
  const [tab, setTab] = useState<"sites" | "plans">("sites");
  const [sites, setSites] = useState<Site[] | null>(null);
  const [radius, setRadius] = useState(150);
  const load = useCallback(async () => {
    const sb = supabaseBrowser();
    const [s, st] = await Promise.all([sb.from("sites").select("*").order("name"), sb.from("org_settings").select("default_site_radius_m").eq("id", 1).single()]);
    setSites((s.data as Site[]) ?? []);
    if (st.data?.default_site_radius_m) setRadius(st.data.default_site_radius_m);
  }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <>
      <PageHeader title="Sites & Routes" sub="Customers, shops and project sites, and the order each person visits them." />
      <Tabs value={tab} onChange={setTab} items={[{ value: "sites", label: `Sites${sites ? ` · ${sites.length}` : ""}` }, { value: "plans", label: "Beat plans" }]} />
      <div className="mt-6">
        {!sites ? <Spinner /> : tab === "sites" ? <Sites sites={sites} defaultRadius={radius} reload={load} /> : <Plans sites={sites} />}
      </div>
    </>
  );
}

function Sites({ sites, defaultRadius, reload }: { sites: Site[]; defaultRadius: number; reload: () => void }) {
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Partial<Site> | null>(null);
  const [importing, setImporting] = useState(false);
  const list = sites.filter((s) => [s.name, s.category, s.address].join(" ").toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search sites" className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImporting(true)}><Upload className="size-4" />Import CSV</Button>
          <Button size="sm" onClick={() => setEdit({ radius_m: defaultRadius, active: true, lat: 12.9716, lng: 77.5946 })}><Plus className="size-4" />Add site</Button>
        </div>
      </div>
      {list.length === 0 ? <Empty title="No sites" /> : (
        <div className="scroll-x">
          <table className="data">
            <thead><tr><th>Site</th><th className="hidden sm:table-cell">Category</th><th className="hidden md:table-cell">Address</th><th className="num">Radius</th><th /></tr></thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id} className="clickable" onClick={() => setEdit(s)}>
                  <td className="font-medium">{s.name} {!s.active && <Badge>Inactive</Badge>}</td>
                  <td className="hidden text-muted sm:table-cell">{s.category ?? "—"}</td>
                  <td className="hidden text-muted md:table-cell">{s.address ?? "—"}</td>
                  <td className="num">{s.radius_m} m</td>
                  <td className="w-10"><Pencil className="size-4 text-muted" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <SiteEditor site={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />
      <ImportSites open={importing} onClose={() => setImporting(false)} defaultRadius={defaultRadius} onDone={reload} />
    </>
  );
}

function SiteEditor({ site, onClose, onSaved }: { site: Partial<Site> | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [s, setS] = useState<Partial<Site>>({});
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<{ lat: number; lng: number; label: string }[]>([]);
  const [del, setDel] = useState(false);
  useEffect(() => { if (site) { setS(site); setHits([]); } }, [site]);

  async function save() {
    if (!s.name?.trim()) { toast("Name the site", "error"); return; }
    setBusy(true);
    const row = { name: s.name.trim(), category: s.category || null, address: s.address || null, contact: s.contact || null,
      lat: s.lat, lng: s.lng, radius_m: s.radius_m, active: s.active ?? true };
    const sb = supabaseBrowser();
    const { error } = s.id ? await sb.from("sites").update(row).eq("id", s.id) : await sb.from("sites").insert(row);
    setBusy(false);
    if (error) toast(friendlyError(error), "error"); else { toast("Site saved"); onSaved(); }
  }

  return (
    <Modal open={!!site} onClose={onClose} title={s.id ? "Edit site" : "Add site"} wide footer={
      <>
        {s.id && <Button variant="ghost" className="mr-auto text-rose-600" onClick={() => setDel(true)}><Trash2 className="size-4" />Delete</Button>}
        <Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save site</Button>
      </>
    }>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><Input value={s.name ?? ""} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="Sri Lakshmi Traders" /></Field>
          <Field label="Category"><Input value={s.category ?? ""} onChange={(e) => setS({ ...s, category: e.target.value })} placeholder="Retailer, Distributor, Project site" /></Field>
        </div>
        <Field label="Address" hint="Search to drop the pin, or tap the map.">
          <div className="flex gap-2">
            <Input value={s.address ?? ""} onChange={(e) => setS({ ...s, address: e.target.value })} placeholder="4th Block, Jayanagar, Bengaluru" />
            <Button type="button" variant="secondary" onClick={async () => { if (s.address) setHits(await geocode(s.address)); }}>Find</Button>
          </div>
        </Field>
        {hits.length > 0 && (
          <ul className="rounded-xl border border-line text-sm">
            {hits.map((h, i) => (
              <li key={i}><button className="w-full px-3 py-2 text-left hover:bg-soft" onClick={() => { setS({ ...s, lat: h.lat, lng: h.lng }); setHits([]); }}>{h.label}</button></li>
            ))}
          </ul>
        )}
        {s.lat != null && s.lng != null && <MapPicker lat={s.lat} lng={s.lng} radius={s.radius_m ?? 150} onChange={(lat, lng) => setS((x) => ({ ...x, lat, lng }))} />}
        <Field label={`Radius: ${s.radius_m ?? 150} m`} hint="Visit in / out works only inside this circle.">
          <input type="range" min={25} max={1000} step={5} value={s.radius_m ?? 150} onChange={(e) => setS({ ...s, radius_m: Number(e.target.value) })} className="w-full accent-[var(--accent)]" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Contact"><Input value={s.contact ?? ""} onChange={(e) => setS({ ...s, contact: e.target.value })} placeholder="Owner name, phone" /></Field>
          <div className="pt-6"><Switch checked={s.active ?? true} onChange={(v) => setS({ ...s, active: v })} label="Active" /></div>
        </div>
      </div>
      <ConfirmDialog open={del} onClose={() => setDel(false)} title="Delete this site?" danger confirmLabel="Delete"
        body="It is removed from beat plans. Past visits keep their history but lose the link to the site. Prefer switching it to inactive."
        onConfirm={async () => {
          const { error } = await supabaseBrowser().from("sites").delete().eq("id", s.id!);
          if (error) toast(friendlyError(error), "error"); else { toast("Site deleted"); onSaved(); }
        }} />
    </Modal>
  );
}

function ImportSites({ open, onClose, defaultRadius, onDone }: { open: boolean; onClose: () => void; defaultRadius: number; onDone: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<(Partial<Site> & { _err?: string })[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  useEffect(() => { if (open) { setRows(null); setProgress(""); } }, [open]);
  const HEAD = ["name", "category", "address", "lat", "lng", "radius_m", "contact"];

  async function onFile(f: File) {
    const cells = parseCsv(await f.text());
    const head = (cells[0] ?? []).map((h) => h.trim().toLowerCase());
    setRows(cells.slice(1).map((c) => {
      const r: Record<string, string> = {}; head.forEach((h, i) => (r[h] = (c[i] ?? "").trim()));
      const lat = r.lat ? Number(r.lat) : undefined, lng = r.lng ? Number(r.lng) : undefined;
      const out: Partial<Site> & { _err?: string } = { name: r.name, category: r.category || null, address: r.address || null, contact: r.contact || null,
        lat, lng, radius_m: r.radius_m ? Number(r.radius_m) : defaultRadius, active: true };
      if (!r.name) out._err = "name is empty";
      else if ((lat == null || lng == null) && !r.address) out._err = "needs lat/lng or an address";
      else if (lat != null && (Number.isNaN(lat) || Number.isNaN(lng))) out._err = "lat/lng are not numbers";
      return out;
    }));
  }

  async function run() {
    if (!rows) return;
    setBusy(true);
    const ready: Partial<Site>[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r._err) continue;
      if (r.lat == null || r.lng == null) {
        setProgress(`Finding ${r.name} (${i + 1}/${rows.length})…`);
        const hit = (await geocode(r.address!))[0];
        await new Promise((res) => setTimeout(res, 1100));   // Nominatim fair use: 1 request a second
        if (!hit) { r._err = "address not found"; continue; }
        r.lat = hit.lat; r.lng = hit.lng;
      }
      const { _err, ...clean } = r; void _err;
      ready.push(clean);
    }
    const { error } = ready.length ? await supabaseBrowser().from("sites").insert(ready) : { error: null };
    setBusy(false); setProgress("");
    if (error) toast(friendlyError(error), "error");
    else { toast(`${ready.length} site(s) imported${rows.some((r) => r._err) ? ", some skipped" : ""}`); setRows([...rows]); onDone(); }
  }

  const ok = (rows ?? []).filter((r) => !r._err).length;
  return (
    <Modal open={open} onClose={onClose} title="Import sites from CSV" wide footer={
      <>
        <Button variant="ghost" onClick={() => downloadText("sites-template.csv", toCsv(HEAD, [["Sri Lakshmi Traders", "Retailer", "4th Block, Jayanagar, Bengaluru", "", "", "150", "Ravi 98450 00000"], ["Hebbal Agencies", "Distributor", "", "13.0358", "77.5970", "200", ""]]))}>Template</Button>
        <Button onClick={run} loading={busy} disabled={!ok}>Import {ok || ""}</Button>
      </>
    }>
      <p className="mb-3 text-sm text-muted">Columns: {HEAD.join(", ")}. Rows without lat/lng are found from the address (about one per second).</p>
      <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        className="block w-full text-sm file:mr-3 file:h-10 file:rounded-xl file:border-0 file:bg-soft file:px-4 file:font-medium" />
      {progress && <p className="mt-3 text-sm">{progress}</p>}
      {rows && (
        <ul className="mt-4 max-h-72 space-y-1 overflow-y-auto text-sm">
          {rows.map((r, i) => <li key={i} className={r._err ? "text-rose-600" : ""}>Row {i + 2}: {r.name || "—"} {r._err ? `· ${r._err}` : `· ${r.lat != null ? `${r.lat?.toFixed(4)}, ${r.lng?.toFixed(4)}` : "address lookup"} · ${r.radius_m} m`}</li>)}
        </ul>
      )}
    </Modal>
  );
}

function Plans({ sites }: { sites: Site[] }) {
  const toast = useToast();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [emp, setEmp] = useState("");
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [edit, setEdit] = useState<Partial<Plan> & { sites?: string[] } | null>(null);
  const byId = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);

  useEffect(() => {
    supabaseBrowser().from("profiles").select("id, full_name").eq("staff_type", "field").eq("active", true).order("full_name")
      .then(({ data }) => { setStaff((data as Staff[]) ?? []); if (data?.[0]) setEmp((e) => e || data[0].id); });
  }, []);
  const load = useCallback(async () => {
    if (!emp) return;
    setPlans(null);
    const { data } = await supabaseBrowser().from("beat_plans").select("id, employee_id, name, plan_date, weekdays, active, beat_plan_sites(seq, site_id)")
      .eq("employee_id", emp).order("plan_date", { ascending: false, nullsFirst: true }).order("created_at");
    setPlans(((data as Plan[]) ?? []).map((p) => ({ ...p, beat_plan_sites: [...p.beat_plan_sites].sort((a, b) => a.seq - b.seq) })));
  }, [emp]);
  useEffect(() => { load(); }, [load]);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Field label="Staff member" className="w-64">
          <Select value={emp} onChange={(e) => setEmp(e.target.value)}>{staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}</Select>
        </Field>
        <Button size="sm" onClick={() => setEdit({ employee_id: emp, name: "Weekly beat", weekdays: [1, 2, 3, 4, 5, 6], sites: [] })} disabled={!emp}><Plus className="size-4" />New beat plan</Button>
      </div>
      <p className="mb-4 text-sm text-muted">A plan for a specific date wins over the weekly plan. Without any plan, staff can pick sites from the list in the app (all visits count as unplanned).</p>
      {!plans ? <Spinner /> : plans.length === 0 ? <Empty title="No beat plans for this person" /> : (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((p) => (
            <div key={p.id} className="rounded-2xl border border-line p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-sm text-muted">{p.plan_date ? `On ${dateLabel(p.plan_date)}` : `Every ${(p.weekdays ?? []).map((d) => DOW[d]).join(", ")}`}{!p.active && " · inactive"}</div>
                </div>
                <div className="flex">
                  <Button variant="ghost" size="icon" aria-label="Edit plan" onClick={() => setEdit({ ...p, sites: p.beat_plan_sites.map((x) => x.site_id) })}><Pencil className="size-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Delete plan" onClick={async () => {
                    const { error } = await supabaseBrowser().from("beat_plans").delete().eq("id", p.id);
                    if (error) toast(friendlyError(error), "error"); else load();
                  }}><Trash2 className="size-4" /></Button>
                </div>
              </div>
              <ol className="space-y-1 text-sm">
                {p.beat_plan_sites.map((x) => (
                  <li key={x.seq} className="flex gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-soft text-xs tabular">{x.seq}</span>{byId.get(x.site_id)?.name ?? "Deleted site"}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}
      <PlanEditor plan={edit} sites={sites} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />
    </>
  );
}

function PlanEditor({ plan, sites, onClose, onSaved }: { plan: (Partial<Plan> & { sites?: string[] }) | null; sites: Site[]; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [p, setP] = useState<Partial<Plan> & { sites: string[] }>({ sites: [] });
  const [mode, setMode] = useState<"weekly" | "date">("weekly");
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState("");
  useEffect(() => { if (plan) { setP({ ...plan, sites: plan.sites ?? [] }); setMode(plan.plan_date ? "date" : "weekly"); setAdd(""); } }, [plan]);
  const byId = new Map(sites.map((s) => [s.id, s]));
  const move = (i: number, d: number) => { const a = [...p.sites]; [a[i], a[i + d]] = [a[i + d], a[i]]; setP({ ...p, sites: a }); };

  return (
    <Modal open={!!plan} onClose={onClose} title={p.id ? "Edit beat plan" : "New beat plan"} wide footer={
      <><Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={busy} onClick={async () => {
          setBusy(true);
          const { error } = await supabaseBrowser().rpc("save_beat_plan", { p_id: p.id ?? null, p_employee: p.employee_id, p_name: p.name ?? "",
            p_date: mode === "date" ? p.plan_date : null, p_weekdays: mode === "weekly" ? p.weekdays ?? [] : null, p_sites: p.sites });
          setBusy(false);
          if (error) toast(friendlyError(error), "error"); else { toast("Beat plan saved"); onSaved(); }
        }}>Save plan</Button></>
    }>
      <div className="space-y-4">
        <Field label="Name"><Input value={p.name ?? ""} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
        <Tabs value={mode} onChange={setMode} items={[{ value: "weekly", label: "Repeats weekly" }, { value: "date", label: "One date" }]} />
        {mode === "weekly" ? (
          <div className="flex flex-wrap gap-2">
            {DOW.map((d, i) => {
              const on = (p.weekdays ?? []).includes(i);
              return <button key={d} type="button" onClick={() => setP({ ...p, weekdays: on ? (p.weekdays ?? []).filter((x) => x !== i) : [...(p.weekdays ?? []), i].sort() })}
                className={cn("h-10 w-14 rounded-xl border text-sm", on ? "border-fg bg-accent text-accent-fg" : "border-line hover:bg-soft")}>{d}</button>;
            })}
          </div>
        ) : (
          <Field label="Date"><Input type="date" value={p.plan_date ?? ""} onChange={(e) => setP({ ...p, plan_date: e.target.value })} /></Field>
        )}
        <div>
          <div className="mb-2 text-sm font-medium">Sites, in visiting order</div>
          <ol className="space-y-1.5">
            {p.sites.map((id, i) => (
              <li key={id + i} className="flex items-center gap-2 rounded-xl bg-soft py-1.5 pr-1.5 pl-3 text-sm">
                <span className="w-5 tabular text-muted">{i + 1}</span>
                <span className="flex-1">{byId.get(id)?.name ?? "Deleted site"}</span>
                <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="size-4" /></Button>
                <Button variant="ghost" size="icon" disabled={i === p.sites.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="size-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => setP({ ...p, sites: p.sites.filter((_, j) => j !== i) })} aria-label="Remove"><X className="size-4" /></Button>
              </li>
            ))}
          </ol>
          <div className="mt-2 flex gap-2">
            <Select value={add} onChange={(e) => setAdd(e.target.value)}>
              <option value="">Add a site…</option>
              {sites.filter((s) => s.active && !p.sites.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}{s.address ? ` · ${s.address}` : ""}</option>)}
            </Select>
            <Button variant="secondary" disabled={!add} onClick={() => { setP({ ...p, sites: [...p.sites, add] }); setAdd(""); }}>Add</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
