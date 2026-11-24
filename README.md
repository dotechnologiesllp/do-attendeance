# Do Attendance

Location-based attendance and payroll as a mobile-first web app you can install like a phone app (PWA). Employees check in and out from their phone, but only when they are inside the office radius. Every time, attendance and payroll rule runs inside the database.

**Stack:** Next.js 15 (App Router) · Tailwind CSS v4 · Supabase (Postgres, Auth, row-level security) · pdf-lib · ExcelJS · Leaflet with OpenStreetMap (no map API key needed).

---

## 1. Set up (about 15 minutes)

1. **Create a Supabase project** at supabase.com. Pick the Mumbai region (`ap-south-1`) for users in India.
2. **Create the database.** In the Supabase dashboard, open **SQL Editor**. Run the whole of `supabase/migrations/20261124000000_do_attendance.sql`.
   - Or, with the Supabase CLI: `supabase link --project-ref <ref>` and then `supabase db push`.
3. **Load the demo data (optional, recommended).** Run `supabase/seed.sql` in the SQL Editor. It adds:
   - 1 office: Bengaluru HQ on MG Road, with a 100 m radius
   - 1 admin and 5 employees
   - Last month and this month of attendance, with lunch breaks, overtime, late marks, approved and pending leave, one forgotten check-out and one flagged punch
4. **Configure Auth:** go to **Authentication → Sign In / Providers**.
   - Turn **off** "Allow new users to sign up". Admins create every account; there is no public sign-up.
   - Email + password works out of the box.
   - *Optional, phone OTP:* enable the Phone provider and connect an SMS provider (Twilio, MessageBird, Textlocal …).
   - *Optional, email OTP:* edit the "Magic Link" email template so it includes `{{ .Token }}`.
5. **Environment:** `cp .env.example .env.local` and fill in the project URL, the anon key and the service-role key. The service-role key is server-only; it is used to create employee logins.
6. **Run it:**
   ```bash
   npm install
   npm run dev          # http://localhost:3000
   ```
7. **Deploy:** push to GitHub, import the repo into Vercel (or any Node host) and add the same three environment variables.
   - **Geolocation only works over HTTPS** (and on `localhost`).

### Demo logins (after `seed.sql`)

| Role | Email | Password |
|---|---|---|
| Admin | admin@doattendance.app | Admin@1234 |
| Employee | priya@ / rahul@ / ananya@ / arif@ / kavya@doattendance.app | Employee@1234 |

The demo office is on MG Road, Bengaluru. To try punching from where you are, open **Settings → Offices → Bengaluru HQ** and tap **Use my current location**.

Before giving the app to anyone, change these demo passwords or delete the demo users.

---

## 2. How it works

### Punching (server-enforced geofence)
- The phone watches its GPS position with high accuracy. The big button is enabled only when the phone is inside an assigned office's radius *and* GPS accuracy is better than the radius.
- The button calls the `punch()` database function. **The server checks everything again**: the distance (haversine to every assigned office), accuracy against the radius, active account, and a 20-second double-tap guard. It also stamps **server time** (`now()`), never the phone's clock.
- Each punch stores latitude, longitude, accuracy, distance and office, for audit.
- **Fake-GPS detection.** Browsers don't expose mock-location detection, so the server flags likely spoofing:
  - exactly the same coordinates as the previous punch (real GPS always jitters)
  - impossibly perfect accuracy (< 1 m)
  - impossible travel speed since the last punch
  - an explicit mock flag, when a WebView provides one

  Flagged punches go to **Attendance → Needs review**.

### Days and sessions
- A day is a list of sessions (in → out pairs), with no limit on how many.
- Worked time is the sum of completed sessions. Break time is the gaps between them.
- **Status** is worked out per day: present, half day, absent, leave or half-day leave, holiday, or weekly off.
  - Thresholds, grace minutes and shift times are all in Settings.
  - A day with some work but less than the half-day threshold counts as absent.
- **Late:** the first check-in after shift start plus grace. You can choose to deduct after N late marks a month.
- **Forgotten check-out:** after the cut-off (default 23:59), the open session is closed at the employee's shift end and marked *Auto-closed – needs review*.
  - This runs every 15 minutes if `pg_cron` is enabled. It also runs on every punch, dashboard load and payroll run, so it works without cron too.
- **Admin edits** go through `admin_save_session` / `admin_delete_session`, and a reason is mandatory.
  - A trigger writes every change, including device punches, to `audit_log`: who, when, why, and old → new values.

### Leave
- Leave types have a yearly quota and a paid/unpaid flag.
- Days are counted only on working days; holidays and weekly offs inside the range are skipped.
- On approval, each day is split into paid and unpaid against the remaining balance. Days beyond the balance become loss of pay automatically.

### Payroll (all in `payroll_row()` / `compute_payroll()`)
```
Per-day rate   = Monthly gross ÷ basis days   (working days | calendar days | fixed 26/30)
Hourly rate    = Per-day rate ÷ standard daily hours
LOP days       = absent + unpaid leave + half days × 0.5 + days before joining/after exit + late-mark deductions
LOP deduction  = LOP days × per-day rate          (rounded to the paisa)
OT pay         = OT hours × hourly rate × multiplier
Net            = Gross − LOP + OT + allowances + bonus/incentive − fixed deductions − advance/fine
               → rounded to the nearest rupee (setting)
```
- Money is stored as integer **paise**. Rates are carried at full precision and each amount is rounded once.
- **OT** is the time beyond the standard daily hours on a working day. Work on a holiday or weekly off counts entirely as OT (toggle). You can also count OT only in 15, 30 or 60-minute blocks.
- **Finalize** saves every payslip as a snapshot and locks the month. Triggers then refuse punch edits, leave days and adjustments in that month until an admin unlocks it, giving a reason. Employees see only finalized payslips.
- **Exports:** payroll as CSV or Excel (`/api/payroll/export`), and payslips as PDF with your company name and logo (`/api/payslip`). Admins can download a draft PDF before finalizing.

### Security
- Row-level security is on for every table. Employees can read only their own rows. Attendance can't be written directly: only through the database functions, each of which checks the caller.
- Admin pages check the role on the server; every admin database function checks it again.

---

## 3. Acceptance checks

`supabase/tests/acceptance.sql` runs the checks below against a real Postgres database, all inside one transaction that is rolled back at the end. To run it locally on plain Postgres:

```bash
createdb da_test
psql -d da_test -f supabase/tests/supabase_stub.sql      # stands in for Supabase's auth schema and roles
psql -d da_test -f supabase/migrations/20261124000000_do_attendance.sql
psql -d da_test -v ON_ERROR_STOP=1 -f supabase/tests/acceptance.sql
```

Output:
```
PASS 1  Outside the radius (≈240 m) refused; inside (≈22 m) checked in at server time
PASS 2  09:00–13:00 + 13:45–18:30 → worked 8h 45m, break 45m, OT 45m, status present
PASS 3  ₹26,000 / 26 days, 1 absent + 1 unpaid leave, 3h OT @1.5× → LOP ₹2,000.00, OT ₹562.50, net ₹24,562.50 → ₹24,563
PASS 4  Finalized month refuses punch edits and adjustments; works again after an explicit unlock
PASS 5  Every punch and edit is in the audit log with who, when, reason and old → new values
PASS  Security: employees see only their own rows and cannot run payroll or write sessions directly
PASS  Leave: 2 casual days with 1 day of balance → 1 paid + 1 loss of pay
PASS  Forgotten check-out auto-closed at shift end (18:00) and marked for review
PASS  4h35m day → half day; 09:25 arrival → late by 25 min; 45m OT in 30-min blocks → 30m
```

---

## 4. Project map

```
app/
  (employee)/        Today (check-in button), History, Leave, Payslips  — phone-first
  admin/             Dashboard, Employees, Attendance, Leave, Payroll, Reports, Settings
  api/employees      create logins (service role), CSV import, deactivate / reset password
  api/payslip        payslip PDF
  api/payroll/export payroll .xlsx
  login/             email or phone + password, or one-time code
components/          UI kit (shadcn-style), attendance calendar, payslip breakdown, map picker
lib/                 formatting, geolocation, payroll formula text, PDF builder, validation
supabase/
  migrations/        schema, RLS, every calculation
  seed.sql           demo data
  tests/             acceptance checks + Supabase stub for plain Postgres
public/              service worker, icons
```

## 5. Notes and limits
- **Phone OTP** needs an SMS provider configured in Supabase. Email + password works without one.
- **Mock-location detection on the web is heuristic.** Browsers don't expose Android's "mock location" flag. For stronger guarantees, wrap the PWA in a native shell (Capacitor or TWA) and pass `p_mocked` from the native API; the server already records and flags it.
- **Per-day status rule:** a working day with some work but less than the half-day threshold counts as absent.
- **Joining and exit dates:** working days before joining or after exit count as loss of pay, which pro-rates the month.
- **Changing settings** (thresholds, holidays) recalculates open months. Finalized months keep the payslips exactly as they were saved.
