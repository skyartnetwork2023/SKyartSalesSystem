SkyartAPP

**Deployment Checklist**
- **Environment Vars**: Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your hosting platform (Vercel) and locally (`.env` for development).
- **Supabase CORS**: Add frontend origin(s) to Supabase "Allowed CORS origins" (e.g., `https://skyart-app-skyart-networks-projects.vercel.app`, `http://localhost:5173`).
- **Auth Settings**: In Supabase Auth settings add the app URL to **Redirect URLs** and set the **Site URL** to your frontend origin.
- **RLS & Policies**: Ensure row-level security policies are applied (profiles & vouchers) and migrations have been run in your project.
- **DB Migrations**: Run SQL migrations or apply schema changes so `profiles` and `vouchers` tables exist with expected columns.
- **Secrets**: Never expose the service role key in the client; only use the anon/public key in frontend env.
- **Build & Start**: Install deps and start the app:
	- `npm install`
	- `npm run dev` (development)
	- `npm run build` and `npm run preview` (production test)
- **Verify Auth Flow**: After deploying, test sign up/sign in, then test creating and fetching vouchers to confirm CORS and redirects are correct.
- **Troubleshooting**: If login fetch fails with CORS, re-check Supabase Allowed origins and Auth redirect URLs; check browser DevTools (Network/Console) for failing preflight requests.

**Local Setup**
- **Create `.env`**: Add a `.env` file at the project root (or `.env.local`) with your Supabase values:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

- **Install & Run**:
	- `npm install`
	- `npm run dev`

- **Test**: Open `http://localhost:5173` (or the port shown by Vite). Sign up / sign in, then try creating a voucher to verify auth and DB access.

Note: If you get CORS/preflight errors during local dev, ensure the `http://localhost:5173` origin is added to your Supabase project's Allowed CORS origins (Supabase Dashboard → Project Settings → API).

**Installable PWA**
- The app now ships with a web manifest (via `vite-plugin-pwa`) and an auto-updating service worker so users can "Install" it from Chromium browsers or add it to mobile home screens.
- After pulling changes, run `npm install` to pick up the new dependency and then `npm run build` once; Vite will emit the service worker and manifest automatically.
- Use `npm run preview` (or deploy to Vercel) and open the site in Chrome → you should see the "Install app" option in the omnibox/menu after the service worker finishes installing.
- Replace `public/skyart-icon.svg` with 192px/512px PNGs later if you want platform-specific icons; keep the filenames identical or update the manifest in `vite.config.ts`.
