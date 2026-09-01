# Deployment Guide

This document outlines deploying SkyartAPP with Supabase as the backend and Vercel (or similar) as the frontend host.

## 1) Supabase Project Settings

- API / CORS (Allowed origins):
  - Add your production origin(s) and local dev origin(s), one per line. Example:
    - `https://skyart-app-skyart-networks-projects.vercel.app`
    - `http://localhost:5173`
  - Save changes — Supabase applies CORS settings shortly after saving.

- Authentication Settings:
  - Go to Authentication → Settings:
    - **Site URL**: `https://your-production-url` (optional but recommended)
    - **Redirect URLs**: Add production and local redirect URLs used in sign-in flows (e.g., `https://your-site.com`, `http://localhost:5173`)
  - Save changes.

- Row-level Security (RLS) and Policies:
  - Confirm `profiles` and `vouchers` tables have RLS enabled and policies that allow authenticated users to read/insert/update/delete their own rows.
  - Example inserts require `user_id` in the row and a policy like: `WITH CHECK (auth.uid() = user_id)`.

## 2) Database Migrations

- Ensure the SQL migrations in `supabase/migrations/` are applied to your Supabase database.
- You can run them via the Supabase SQL editor or using the Supabase CLI.
  - Using the SQL editor: copy the migration SQL and run it in the SQL editor.
  - Using Supabase CLI: follow Supabase docs to push migrations.

## 3) Environment Variables

- On Vercel (or your host) set these environment variables in the project settings:
  - `VITE_SUPABASE_URL` — value from Supabase Project → API → URL
  - `VITE_SUPABASE_ANON_KEY` — value from Supabase Project → API → anon/public key

- Locally, create a `.env` or `.env.local` containing:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- NEVER use the service role key in the client. The service role key must remain server-side only.

## 4) Build & Deploy

- Locally:
```
npm install
npm run dev
```
- For production deploy (Vercel): push branch to Git, or deploy through Vercel dashboard. Ensure env vars are set in the Vercel project.

## 5) Verification

- After deployment, perform these checks:
  - Open the site and sign up / sign in
  - Create a voucher and ensure it saves and then appears in the list
  - If authentication fails, open DevTools → Network → look for failing requests to `/auth/v1/token` or `/rest/v1/...`

## 6) Troubleshooting

- CORS / Preflight errors
  - Symptom: `Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header` or browser blocks `auth/v1/token` requests.
  - Fix: In Supabase Dashboard -> Project Settings -> API, add your frontend origin to Allowed CORS origins and save.

- Invalid keys or wrong project URL
  - Symptom: 401 or 403 responses from Supabase
  - Fix: Confirm `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` match the values in Supabase Project → API

- RLS permission denied on inserts
  - Symptom: INSERT returns permission error; client insert fails silently or with `permission denied`.
  - Fix: Ensure the `INSERT` includes `user_id` equal to `auth.uid()` (client must pass `user.id`), or adjust policies if you're using server-side writes.

- Auth redirect issues
  - Symptom: OAuth/sign-in redirect fails or not returning to site
  - Fix: Confirm Redirect URLs in Authentication settings include the exact URL used by the app.

## 7) Rollback

- If a deploy breaks, revert to the previous commit or deployment in Vercel and investigate logs. Update Supabase settings only when necessary and test on a staging preview URL first.

## 8) Links & Resources

- Supabase docs: https://supabase.com/docs
- Supabase Dashboard: https://app.supabase.com/
- Vercel docs: https://vercel.com/docs


---

If you'd like, I can add a short script or README snippet to automate applying the SQL migrations using the Supabase CLI.
