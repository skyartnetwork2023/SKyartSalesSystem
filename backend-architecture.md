# SkyartAPP Backend & Integration Blueprint,,

## 1. Platform Overview
- **Runtime:** React + Vite frontend hosted on Vercel calling Supabase (PostgreSQL + Auth + Storage) via the client created in [src/lib/supabase.ts](src/lib/supabase.ts).
- **State Providers:** Authentication, theming, and supervisor scoping are centralized in [src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx), [src/contexts/ThemeContext.tsx](src/contexts/ThemeContext.tsx), and [src/contexts/UserScopeContext.tsx](src/contexts/UserScopeContext.tsx), ensuring every component consumes the same session, theme, and impersonation data.
- **Domain Services:** Voucher, profile, and forecast persistence lives under [src/lib](src/lib), providing thin wrappers around Supabase RPCs so UI logic stays declarative.
- **Data Surfaces:** Dashboard, Voucher, Visualization, and ancillary modules consume those services to render analytics, edit financial data, and push forecasts back to Supabase.

```
Browser UI → Context Providers → Domain Services → Supabase Tables / Storage
```

## 2. Authentication & Profile Management
### Components & Services
- **AuthProvider** ([src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx)) initializes Supabase auth, exposes `signIn()`, `signUp()`, `signOut()`, and keeps the current `user` in React state. It listens to `supabase.auth.onAuthStateChange` so every tab stays in sync.
- **Login screen** ([src/components/Login.tsx](src/components/Login.tsx)) calls those context methods, handles signup profile creation, and shows marketing collateral while unauthenticated.
- **Profile service** ([src/lib/profileService.ts](src/lib/profileService.ts)) offers `getProfile`, `updateProfile`, `listProfiles`, role changes, avatar uploads via Supabase Storage, and `updateProfileSettings` (used for voucher column locks).

### Connectivity Flow
1. Visitor lands on [src/main.tsx](src/main.tsx), which mounts [src/App.tsx](src/App.tsx).
2. `App` wraps everything with Theme → Auth → UserScope providers so downstream components always see consistent contexts.
3. `AuthProvider` pulls the Supabase session; if present, `App` renders [src/components/Dashboard.tsx](src/components/Dashboard.tsx), otherwise [src/components/Login.tsx](src/components/Login.tsx).
4. On signup, `signUp()` also upserts a row in `profiles`, ensuring downstream analytics immediately have identity metadata.

## 3. User Scope & Supervisor Mode
- **UserScopeProvider** ([src/contexts/UserScopeContext.tsx](src/contexts/UserScopeContext.tsx)) bridges authenticated users to profile metadata, tracks whether the user is a supervisor, and (if so) loads the full roster via `listProfiles()` to allow impersonation.
- It exposes `scopeUserId`, `setScopeUserId`, and `scopedProfile`. Every analytics component reads `scopeUserId` to fetch data for either the owner or the supervised employee.
- Supervisors have `readOnly = true`; UI modules (Voucher, Opex, etc.) call `useUserScope()` to disable write paths if `readOnly` is set.

## 4. Voucher Data Lifecycle
### Storage Schema
- `vouchers` table stores JSON blobs keyed by year: `{ year, vouchers[], capex[], opex[], ... }`. Each Supabase row captures all sheets for one year.

### Service Layer
- [src/lib/voucherService.ts](src/lib/voucherService.ts) encapsulates CRUD:
  - `getVouchers()` fetches every row (ordered newest-first) so UI can filter by `user_id` and `data.year`.
  - `createVoucher()`, `updateVoucher()`, `deleteVoucher()` perform per-row mutations with Supabase policies safeguarding ownership.
  - `deleteVouchersByYear()` in [src/lib/deleteVouchersByYear.ts](src/lib/deleteVouchersByYear.ts) bulk-removes entries via Postgres JSON path filtering (`data->>year`).

### UI Orchestration
- **Voucher module** ([src/components/Voucher.tsx](src/components/Voucher.tsx))
  - Loads scoped vouchers via `getVouchers()`, derives available years, and keeps editable grids for plan months, pricing, and locks taken from profile settings.
  - Calls `createVoucher()` or `updateVoucher()` with `{ year, vouchers }` payloads; upon success it recalculates yearly totals.
  - Computes `YearlyTotal[]` and passes them into `computeForecast()` from [src/lib/forecastUtils.ts](src/lib/forecastUtils.ts). If the signed-in owner is editing, it auto-persists the forecast via `upsertForecast()`.
- **DashboardContent** ([src/components/DashboardContent.tsx](src/components/DashboardContent.tsx)) pulls vouchers for the scoped user/year, aggregates totals (voucher sales, capex, opex, loans, investments), and feeds visualization widgets including the monthly prediction line chart.

## 5. Forecasting & Analytics Stack
- **Forecast persistence** lives in [src/lib/forecastService.ts](src/lib/forecastService.ts) with `upsertForecast()` and `getForecastsByUser()` targeting the `forecasts` table. Each record tracks `value`, `method`, `note`, and optional `source` (e.g., `voucher`).
- **Algorithm helpers** ([src/lib/forecastUtils.ts](src/lib/forecastUtils.ts)) expose `computeForecast()` and `generateFutureForecasts()` using linear regression or growth-rate fallbacks.
- **Visualization module** ([src/components/Visualization.tsx](src/components/Visualization.tsx))
  - Joins Supabase vouchers + forecasts for the scoped user.
  - Builds yearly totals for capex/opex/investments, plus voucher plan mixes and vendor concentration.
  - Compares `actual` vs `predicted` per year by merging stored forecasts with auto-generated future projections.
- **Dashboard monthly predictor** ([src/components/charts/MonthlyForecastSection.tsx](src/components/charts/MonthlyForecastSection.tsx)) simply fits a line through the current year’s twelve monthly points and surfaces per-month deviations to give short-term pacing insight.

## 6. Ancillary Components & Utilities
- **RealtimeDateBar** ([src/components/RealtimeDateBar.tsx](src/components/RealtimeDateBar.tsx)) shows timestamp info across login and dashboard views.
- **Sidebar + Section Modules** ([src/components/Sidebar.tsx](src/components/Sidebar.tsx) plus Opex/Capex/Investment/etc.) retrieve or edit their respective slices of the yearly JSON payload, all sharing the same voucher service contract.
- **ThemeProvider** ([src/contexts/ThemeContext.tsx](src/contexts/ThemeContext.tsx)) synchronizes Tailwind’s `dark` class and local storage, ensuring each chart auto-colors itself via `useTheme()`.

## 7. Supabase Connectivity Summary
| Concern | Source Files | Supabase Touchpoints |
| --- | --- | --- |
| Auth | [src/contexts/AuthContext.tsx](src/contexts/AuthContext.tsx), [src/components/Login.tsx](src/components/Login.tsx) | `supabase.auth.*`, `profiles` upsert |
| Profiles & Roles | [src/lib/profileService.ts](src/lib/profileService.ts), [src/contexts/UserScopeContext.tsx](src/contexts/UserScopeContext.tsx) | `profiles` table, `avatars` storage bucket |
| Voucher Sheets | [src/lib/voucherService.ts](src/lib/voucherService.ts), [src/components/Voucher.tsx](src/components/Voucher.tsx), [src/components/DashboardContent.tsx](src/components/DashboardContent.tsx) | `vouchers` table |
| Forecasts | [src/lib/forecastService.ts](src/lib/forecastService.ts), [src/components/Voucher.tsx](src/components/Voucher.tsx), [src/components/Visualization.tsx](src/components/Visualization.tsx) | `forecasts` table |
| Cleanup | [src/lib/deleteVouchersByYear.ts](src/lib/deleteVouchersByYear.ts) | `vouchers` table (JSON filter) |

## 8. How Everything Connects
1. **Auth bootstraps** the Supabase user and profile, providing identity + role.
2. **UserScope** chooses which user’s data is active (self or subordinate) and exposes `readOnly` to guard writes.
3. **Data modules** (Voucher, Capex, etc.) load the scoped year’s `vouchers` row, edit it locally, then persist through the service layer.
4. **Analytics surfaces** (DashboardContent, Visualization) subscribe to the same data and derive KPIs, forecasts, and projections.
5. **Forecast service** closes the loop by storing machine-assisted predictions back into Supabase so historical vs predicted views stay auditable.

Use this document as the backbone for a Word handover: copy the sections into Word, add branding, and append any ERDs or Supabase schema screenshots as needed.
