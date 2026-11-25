"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, CalendarCheck, IndianRupee, LayoutDashboard, LogOut, Map, MapPinned, Menu, PanelLeft, Plane, Settings, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";

// adminOnly items are hidden from managers (who see their own team only).
const ALL_NAV = [
  { href: "/admin/live", label: "Live Map", icon: Map },
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/employees", label: "Staff", icon: Users },
  { href: "/admin/sites", label: "Sites & Routes", icon: MapPinned },
  { href: "/admin/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/admin/leave", label: "Leave", icon: Plane },
  { href: "/admin/payroll", label: "Payroll", icon: IndianRupee, adminOnly: true },
  { href: "/admin/reports", label: "Reports", icon: BarChart3 },
  { href: "/admin/settings", label: "Settings", icon: Settings, adminOnly: true },
];

export function AdminShell({ name, role, company, children }: { name: string; role: "admin" | "manager" | "employee"; company: string; children: React.ReactNode }) {
  const NAV = ALL_NAV.filter((n) => role === "admin" || !n.adminOnly);
  const path = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [path]);
  useEffect(() => { try { setCollapsed(localStorage.getItem("sidebar") === "closed"); } catch {} }, []);
  const toggle = () => { const v = !collapsed; setCollapsed(v); try { localStorage.setItem("sidebar", v ? "closed" : "open"); } catch {} };

  const isActive = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  const sidebar = (
    <div className="flex h-full flex-col bg-softer px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="flex h-11 items-center justify-between px-2">
        <span className="truncate font-semibold tracking-tight">{company}</span>
        <button onClick={() => (mobileOpen ? setMobileOpen(false) : toggle())} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-soft hover:text-fg" aria-label="Close sidebar">
          <PanelLeft className="size-5" />
        </button>
      </div>
      <nav className="mt-3 flex-1 space-y-0.5">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href}
            className={cn("flex h-10 items-center gap-3 rounded-lg px-2.5 text-sm transition", isActive(n.href) ? "bg-soft font-medium" : "text-muted hover:bg-soft hover:text-fg")}>
            <n.icon className="size-[18px]" /> {n.label}
          </Link>
        ))}
      </nav>
      <div className="space-y-1 border-t border-line pt-3">
        <div className="flex items-center justify-between px-2.5 text-sm">
          <span className="truncate text-muted">{name}{role === "manager" && " · Manager"}</span>
          <ThemeToggle />
        </div>
        <button className="flex h-10 w-full items-center gap-3 rounded-lg px-2.5 text-sm text-muted hover:bg-soft hover:text-fg"
          onClick={async () => { await supabaseBrowser().auth.signOut(); router.replace("/login"); router.refresh(); }}>
          <LogOut className="size-[18px]" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <aside className={cn("sticky top-0 hidden h-dvh shrink-0 border-r border-line transition-[width] duration-200 lg:block", collapsed ? "w-0 overflow-hidden border-r-0" : "w-64")}>
        {sidebar}
      </aside>
      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className={cn("sticky top-0 z-30 flex h-14 items-center gap-2 bg-bg/90 px-3 backdrop-blur lg:px-6", !collapsed && "lg:hidden")}>
          <button onClick={() => setMobileOpen(true)} className="grid size-10 place-items-center rounded-lg hover:bg-soft lg:hidden" aria-label="Open menu"><Menu className="size-5" /></button>
          <button onClick={toggle} className="hidden size-10 place-items-center rounded-lg text-muted hover:bg-soft lg:grid" aria-label="Open sidebar"><PanelLeft className="size-5" /></button>
          <span className="font-semibold tracking-tight">{NAV.find((n) => isActive(n.href))?.label}</span>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:py-10">{children}</main>
      </div>
    </div>
  );
}
