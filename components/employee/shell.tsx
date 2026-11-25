"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarDays, Clock, FileText, LogOut, Plane } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { cn } from "@/components/ui";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/", label: "Today", icon: Clock },
  { href: "/history", label: "History", icon: CalendarDays },
  { href: "/leave", label: "Leave", icon: Plane },
  { href: "/payslips", label: "Payslips", icon: FileText },
];

export function EmployeeShell({ name, children }: { name: string; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const isActive = (href: string) => path === href || (href === "/" && path === "/field");
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="sticky top-0 z-30 flex items-center justify-between bg-bg/90 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <span className="font-semibold tracking-tight">Do Attendance</span>
        <nav className="hidden items-center gap-1 sm:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href}
              className={cn("rounded-lg px-3 py-1.5 text-sm transition", isActive(n.href) ? "bg-soft font-medium" : "text-muted hover:text-fg")}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="relative">
          <button onClick={() => setMenu(!menu)} className="grid size-9 place-items-center rounded-full bg-soft text-xs font-semibold" aria-label="Account menu">
            {initials}
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-line bg-bg p-2 shadow-xl">
                <div className="px-2 py-1.5 text-sm font-medium">{name}</div>
                <div className="flex items-center justify-between px-2 py-1.5 text-sm text-muted">Theme <ThemeToggle /></div>
                <button className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-soft"
                  onClick={async () => { await supabaseBrowser().auth.signOut(); router.replace("/login"); router.refresh(); }}>
                  <LogOut className="size-4" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <main className="flex-1 px-5 pb-28 sm:pb-10">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {NAV.map((n) => {
            const active = isActive(n.href);
            return (
              <Link key={n.href} href={n.href} className={cn("flex h-16 flex-col items-center justify-center gap-1 text-[11px]", active ? "text-fg" : "text-muted")}>
                <n.icon className={cn("size-5", active && "stroke-[2.25]")} />
                {n.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
