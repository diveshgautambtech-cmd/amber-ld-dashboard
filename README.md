# Amber L&D Training Intelligence Portal

**Live web app — Next.js + Supabase + Vercel. No SharePoint, no HTML file, no manual hosting.**

## What this is

A full web application that replaces your HTML dashboard entirely. 35 SPOCs log in from any browser, upload their monthly training data, and your admin dashboard updates live. Everything stored permanently in a real database.

**Live URL after deploy:** `https://amber-ld-dashboard.vercel.app`

---

## Step 1 — Supabase (Free database, 5 minutes)

1. Go to **supabase.com** → Create free account → New Project
   - Name: `amber-ld`
   - Region: **Southeast Asia (Singapore)** — closest to India
2. Go to **Settings → API** → copy:
   - `Project URL` → this is `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → this is `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → this is `SUPABASE_SERVICE_ROLE_KEY`
3. Go to **SQL Editor** → paste and run `supabase-schema.sql` → Run
4. Then run `seed-spocs.sql` → Run (loads all 35 SPOCs)

---

## Step 2 — GitHub (Free code hosting, 5 minutes)

1. Create account at **github.com** (free)
2. Click **+** → New repository → Name: `amber-ld-dashboard` → Public → Create
3. Copy the `.env.local.example` file to `.env.local` and fill in your Supabase values
4. In terminal (in this folder):

```bash
git init
git add .
git commit -m "Initial Amber LD Dashboard"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/amber-ld-dashboard.git
git push -u origin main
```

---

## Step 3 — Vercel (Free hosting, 5 minutes)

1. Go to **vercel.com** → Sign up with GitHub (use same account)
2. Click **New Project** → Import `amber-ld-dashboard` from GitHub
3. Under **Environment Variables** → Add all three:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   ```
4. Click **Deploy** → Wait 2 minutes
5. ✅ Your portal is live at `https://amber-ld-dashboard.vercel.app`

Share this URL with all 35 SPOCs. Done.

---

## Credentials

| Role | Login | Password |
|------|-------|----------|
| Admin | `ADMIN` | `Amber@Admin2026` |
| SPOC (example) | `ILS2654` | `Indu@ILS2654` |

All SPOC credentials are in `seed-spocs.sql`. Password format: First4Letters@EmpCode

---

## Pages

| URL | Who can access | What it does |
|-----|----------------|--------------|
| `/login` | Everyone | Login screen |
| `/dashboard` | All | Coverage analytics — live from database |
| `/dashboard/manhours` | All | Manhours by branch, grade, month |
| `/dashboard/trends` | All | Training intensity bands |
| `/esg` | All | GRI 404-1, 404-2, 403-5, BRSR P5, P1 |
| `/library` | All (admin can edit) | Training content links library |
| `/tni` | All | TNI nominee finder with Excel upload |
| `/upload` | All (window 25th-5th) | Upload Training MIS + Employee Master |
| `/admin` | Admin only | Session log, SPOC directory, password reset |

---

## Future updates

Any time you want to update the app:
```bash
git add .
git commit -m "Describe what changed"
git push
```
Vercel auto-deploys in ~2 minutes. No manual steps needed ever.
