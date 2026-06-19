# Deploy

## Vercel (T-003)

Cadence ships on Vercel. The web app lives in `apps/web` inside a pnpm
workspace. The root-level `vercel.json` tells Vercel to install from the
workspace root and build only the web app.

### One-time setup (Faeez)

1. Push this repo to GitHub (`github.com/<you>/cadence` — private).
2. `vercel.com` → Add New → Project → import the repo.
3. **Root directory**: `apps/web`
4. **Framework preset**: Next.js (auto-detected).
5. **Region**: Singapore (`sin1`) — set under Project → Settings → Functions.
6. Build/install commands: leave default; `vercel.json` overrides them.
7. Add env vars from `apps/web/.env.example` once the values exist.
8. First deploy will fail until env vars are populated — that's expected.

### Autodeploy contract

- Push to `main` → production deploy at `cadence.app` (or vercel.app subdomain).
- Open PR against `main` → preview deploy with unique URL.
- Vercel auto-comments preview URLs on PRs once GitHub app is installed.

## Supabase (T-004, T-005)

1. `supabase.com` → New Project, region **Singapore (`ap-southeast-1`)**.
2. Set a strong DB password — save to Vercel env as `SUPABASE_DB_PASSWORD`.
3. Project Settings → API → copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only)
4. Settings → Database → Connection string → URI (session-pooler) → `DATABASE_URL`.
5. Auth → Providers → enable Email; disable "Confirm email" (we use magic link).
6. Auth → Email Templates → swap SMTP for Resend (T-005):
   - Settings → Auth → SMTP Settings → enter Resend SMTP host/port/user/pass.
7. Add the Vercel preview/prod URLs to Auth → URL Configuration → Site URL + Redirect URLs.

## Resend (T-005)

1. `resend.com` → API Keys → create one, paste into `RESEND_API_KEY`.
2. Add domain (later) for branded magic-link sender.

## Inngest (T-007)

1. `inngest.com` → Create app — production app `cadence-prod`.
2. Copy `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` to Vercel env.
3. Inngest cloud will auto-discover functions via `/api/inngest`.

## Axiom + Sentry (T-008)

- Axiom: `axiom.co` → create dataset `cadence-web` → copy `AXIOM_TOKEN` + `AXIOM_DATASET`.
- Sentry: `sentry.io` → create project (Next.js) → copy DSN to `NEXT_PUBLIC_SENTRY_DSN`.

## Fly.io prices service (T-206, Phase 2)

Deferred to Phase 2. Notes in `services/prices/README.md`.
