"use client";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "./ui";

type Mode = "light" | "dark" | "system";

export function applyTheme(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle({ className }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("system");
  useEffect(() => {
    try { setMode((localStorage.getItem("theme") as Mode) || "system"); } catch {}
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const h = () => { try { if ((localStorage.getItem("theme") || "system") === "system") applyTheme("system"); } catch {} };
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  const set = (m: Mode) => {
    setMode(m);
    try { localStorage.setItem("theme", m); } catch {}
    applyTheme(m);
  };
  const items: { m: Mode; icon: typeof Sun; label: string }[] = [
    { m: "light", icon: Sun, label: "Light" }, { m: "dark", icon: Moon, label: "Dark" }, { m: "system", icon: Monitor, label: "System" },
  ];
  return (
    <div className={cn("inline-flex rounded-lg bg-soft p-0.5", className)} role="radiogroup" aria-label="Theme">
      {items.map(({ m, icon: Icon, label }) => (
        <button key={m} type="button" role="radio" aria-checked={mode === m} aria-label={label} title={label}
          onClick={() => set(m)}
          className={cn("grid size-7 place-items-center rounded-md transition", mode === m ? "bg-bg shadow-sm" : "text-muted hover:text-fg")}>
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
