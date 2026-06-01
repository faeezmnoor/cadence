# services/prices — yfinance Fly.io service (DEFERRED to Phase 2.5)

Status: deferred. Composer ships without live prices for the initial wedge.

## Why deferred
RSS + Brave news + Claude synthesis gives Faeez a meaningful brief already.
Prices are a +1, not the wedge. Adding a separate runtime (Python on Fly)
before validating digest demand is gold-plating.

## What this will do (eventually)
- FastAPI service on Fly.io, single region (sin)
- Endpoints:
  - `GET /price?ticker=AAPL` -> single
  - `POST /prices` with `["AAPL","CPO=F","SDP.KL"]` -> batch
- Returns: `{ticker, price, currency, change_24h, change_7d, fetched_at}`
- 5-minute Supabase cache via `source_cache` table (connector="prices")
- Auth: shared bearer token in env

## What composer does without it
`generateDigest` checks for `PRICES_SERVICE_URL`. If missing it skips the
prices block entirely and notes "(prices unavailable this round)" if the
user spec asked for prices.

## Tickets to file when picking this back up
- Scaffold FastAPI service in `services/prices/`
- Add `fly.toml`, deploy to fly.io
- Add `PRICES_SERVICE_URL` + `PRICES_SERVICE_TOKEN` env vars
- Wire `apps/web/server/sources/prices.ts` to call live service
- Update T-208 composer to include prices block when service responds OK
