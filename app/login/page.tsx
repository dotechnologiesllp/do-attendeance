"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { friendlyError } from "@/lib/errors";
import { Button, Field, Input } from "@/components/ui";
import { MapPin } from "lucide-react";

function normalise(id: string): { email: string } | { phone: string } {
  const v = id.trim();
  if (v.includes("@")) return { email: v.toLowerCase() };
  const digits = v.replace(/[^\d+]/g, "");
  if (/^\d{10}$/.test(digits)) return { phone: "+91" + digits };   // Indian mobile without country code
  return { phone: digits.startsWith("+") ? digits : "+" + digits };
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"password" | "otp">("password");
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const sb = supabaseBrowser();
    const who = normalise(id);
    try {
      if (mode === "password") {
        const { error } = "email" in who
          ? await sb.auth.signInWithPassword({ email: who.email, password })
          : await sb.auth.signInWithPassword({ phone: who.phone, password });
        if (error) throw error;
      } else if (!sent) {
        // shouldCreateUser: false → there is no public sign-up; only accounts an admin created can sign in.
        const options = { shouldCreateUser: false };
        const { error } = "email" in who
          ? await sb.auth.signInWithOtp({ email: who.email, options })
          : await sb.auth.signInWithOtp({ phone: who.phone, options });
        if (error) throw error;
        setSent(true); setBusy(false);
        return;
      } else {
        const { error } = "email" in who
          ? await sb.auth.verifyOtp({ email: who.email, token: code.trim(), type: "email" })
          : await sb.auth.verifyOtp({ phone: who.phone, token: code.trim(), type: "sms" });
        if (error) throw error;
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-accent text-accent-fg">
            <MapPin className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Do Attendance</h1>
          <p className="mt-1 text-sm text-muted">Sign in with the account your admin created.</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <Field label="Email or phone">
            <Input value={id} onChange={(e) => { setId(e.target.value); setSent(false); }} autoComplete="username"
              inputMode="email" placeholder="you@company.com or 98XXXXXXXX" required autoFocus />
          </Field>
          {mode === "password" ? (
            <Field label="Password">
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            </Field>
          ) : sent ? (
            <Field label="One-time code" hint="Check your SMS or email for the 6-digit code.">
              <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={8} required />
            </Field>
          ) : null}

          {error && <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{error}</p>}

          <Button type="submit" className="w-full" loading={busy}>
            {mode === "password" ? "Sign in" : sent ? "Verify and sign in" : "Send code"}
          </Button>
        </form>

        <button type="button" className="mt-6 w-full text-center text-sm text-muted hover:text-fg"
          onClick={() => { setMode(mode === "password" ? "otp" : "password"); setSent(false); setError(null); }}>
          {mode === "password" ? "Sign in with a one-time code instead" : "Use password instead"}
        </button>
      </div>
    </main>
  );
}
