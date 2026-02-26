# Tea Sales Control App

Mobile-friendly lifecycle control app for tea lots using Next.js + Supabase.

## Monorepo layout

- `apps/web`: Next.js application (UI + API routes)
- `supabase/migrations`: Postgres schema + RLS policies
- `supabase/seed.sql`: starter data
- `docs`: operator and import docs

## Local development (Supabase Cloud + local app)

1. Create a Supabase project.
2. Run SQL from `supabase/migrations/0001_init.sql` in Supabase SQL editor.
3. Run SQL from `supabase/seed.sql` for sample data.
4. Copy `apps/web/.env.example` to `apps/web/.env.local` and fill values.
   - Keep `DEV_AUTH_BYPASS=true` for local testing without bearer tokens.
   - Set `DEV_AUTH_BYPASS=false` when wiring real Supabase Auth.
5. Install dependencies:
   - `pnpm install`
6. Start app:
   - `pnpm dev`
7. Open `http://localhost:3000`.

## Tests

- Unit + integration: `pnpm test`
- E2E smoke: `pnpm test:e2e`

## Phase 1 implemented

- Lots, auction track, private deals, dispatch advice, sync runs schema
- RLS role model (`admin`, `operator`)
- XLSX import endpoint with dry-run and commit
- Bulk actions for sampling, private sell pending dispatch, reserve, status update
- Dashboard metrics API
- Dispatch advice list + CSV export
- Mobile-friendly lots workflow UI

## Notes

- PDF dispatch advice generation is planned for Phase 2.
- Supabase Auth login wiring is scaffolded and should be connected to production auth flows.
