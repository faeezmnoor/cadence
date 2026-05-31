# 04 — Data Model & API Design

## Postgres schema (Drizzle/SQL)

All tables: `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`. Soft-deletes via `deleted_at timestamptz null` only on `users`.

### `users`
| col | type | notes |
|---|---|---|
| id | uuid PK | from Supabase auth.users.id |
| email | text unique not null | |
| timezone | text not null default 'Asia/Kuala_Lumpur' | IANA |
| telegram_chat_id | bigint unique null | set after link |
| telegram_username | text null | |
| state | text not null default 'active' | `active` \| `paused` \| `delivery_broken` |
| distilled_prefs | jsonb null | ≤5 stable preference bullets |
| deleted_at | timestamptz null | |

Index: `idx_users_state_tz` on `(state, timezone)`.

### `telegram_link_tokens`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK users | |
| token | text unique | random 32-char |
| expires_at | timestamptz | now() + 10min |
| consumed_at | timestamptz null | |

### `digest_specs`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK users | |
| version | int not null | monotonic per user |
| spec | jsonb not null | the structured spec |
| is_current | bool not null default true | only one true per user |
| created_via | text | `chat_agent` \| `manual_edit` |

Index: `idx_digest_specs_user_current` on `(user_id, is_current)`.

`spec` JSONB shape (validated via Zod on write):
```json
{
  "schema_version": 1,
  "topics": ["palm oil", "EU deforestation regulation"],
  "entities": {
    "companies": ["Sime Darby Plantation", "IOI Corp"],
    "tickers": ["SDP.KL", "IOIB.KL"],
    "commodities": ["CPO=F", "ZC=F"]
  },
  "keywords_include": ["MPOB", "Ramadan demand"],
  "keywords_exclude": ["crypto", "bitcoin"],
  "data_addons": {
    "show_prices": true,
    "show_24h_change": true,
    "show_7d_change": false,
    "fx_pairs": ["MYR/USD"]
  },
  "rss_feeds": [
    {"url": "https://example.com/feed.xml", "label": "MPOB News"}
  ],
  "cadence": {
    "frequency": "daily",
    "delivery_time_local": "08:00",
    "days_of_week": [1,2,3,4,5]
  },
  "tone_preset": "executive_brief",
  "length_target": "short",
  "language": "en"
}
```

### `chat_threads`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| purpose | text | `initial_config` \| `reconfigure` |
| status | text | `active` \| `completed` |

### `chat_messages`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| thread_id | uuid FK chat_threads | |
| role | text | `user` \| `assistant` \| `tool` |
| content | jsonb | text + tool_calls structure |

Index: `idx_chat_messages_thread_created` on `(thread_id, created_at)`.

### `digest_runs`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| spec_id | uuid FK digest_specs | |
| status | text | `pending` \| `composing` \| `delivered` \| `failed` |
| run_date | date not null | unique with user_id (idempotency) |
| sources_bundle | jsonb | snapshot of fetched sources |
| composed_markdown | text | final message |
| telegram_message_id | bigint null | |
| cost_usd | numeric(10,5) | LLM + search cost |
| error | text null | |

Unique: `(user_id, run_date)`.
Index: `idx_digest_runs_user_created` on `(user_id, created_at desc)`.

### `feedback_events`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| digest_run_id | uuid FK digest_runs | |
| signal_type | text | `thumbs_up` \| `thumbs_down` \| `too_long` \| `more_depth` |

### `learning_log`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK | |
| source | text | `tune_command` \| `feedback_event` \| `distilled` |
| raw_text | text | what the user said / signal description |
| distilled_at | timestamptz null | non-null = already folded into distilled_prefs |

Index: `idx_learning_log_user_created` on `(user_id, created_at desc)`.

### `rss_items`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| spec_id | uuid FK | feed belongs to spec |
| feed_url | text | |
| guid | text | dedup |
| title | text | |
| url | text | |
| published_at | timestamptz | |
| summary | text | |

Unique: `(feed_url, guid)`.

### `source_cache`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| connector | text | `brave_search` \| `prices` \| `rss` |
| key | text | normalized query hash |
| payload | jsonb | results |
| expires_at | timestamptz | |

Unique: `(connector, key)`.

### `cost_events`
| col | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid FK null | null for shared cache hits |
| digest_run_id | uuid FK null | |
| kind | text | `llm_call` \| `search_api` \| `price_api` |
| provider | text | `anthropic` \| `openai` \| `brave` \| `yfinance` |
| input_tokens | int null | |
| output_tokens | int null | |
| cost_usd | numeric(10,5) | |

### RLS sketch
- `users`: row visible if `auth.uid() = id`.
- `digest_specs`, `digest_runs`, `learning_log`, `feedback_events`, `chat_threads`, `chat_messages`: row visible if `auth.uid() = user_id`.
- Service role bypasses (used by Inngest workers).

## tRPC router surface

```ts
appRouter = router({
  auth: router({
    me: publicProcedure.query(...),     // returns current user or null
  }),

  digestSpec: router({
    getCurrent: protectedProcedure.query(),
    listVersions: protectedProcedure.query(),
    updateRaw: protectedProcedure
      .input(z.object({ spec: digestSpecSchema }))
      .mutation(),
  }),

  chat: router({
    startThread: protectedProcedure
      .input(z.object({ purpose: z.enum(["initial_config","reconfigure"]) }))
      .mutation(),
    sendMessage: protectedProcedure
      .input(z.object({ threadId: z.string().uuid(), text: z.string() }))
      // returns stream via experimental tRPC subscription or AI SDK route
      .mutation(),
    getThread: protectedProcedure.input(z.object({ threadId: z.string() })).query(),
  }),

  telegram: router({
    createLinkToken: protectedProcedure.mutation(),
    linkStatus: protectedProcedure.query(),
    unlink: protectedProcedure.mutation(),
  }),

  digest: router({
    sampleNow: protectedProcedure.mutation(),  // rate-limited 3/day
    listRuns: protectedProcedure.query(),
  }),

  settings: router({
    pause: protectedProcedure.mutation(),
    resume: protectedProcedure.mutation(),
    deleteAccount: protectedProcedure.mutation(),
    setTimezone: protectedProcedure.input(z.object({tz:z.string()})).mutation(),
  }),

  admin: router({
    listRecentRuns: adminProcedure.input(z.object({limit:z.number().default(100)})).query(),
    replayRun: adminProcedure.input(z.object({runId:z.string()})).mutation(),
    userCostThisMonth: adminProcedure.query(),
  }),
});
```

## Public HTTP routes (non-tRPC)

| Route | Method | Purpose |
|---|---|---|
| `/api/auth/callback` | GET | Supabase magic link callback |
| `/api/telegram/webhook` | POST | grammY entry; verifies secret token |
| `/api/inngest` | GET/POST | Inngest function registry |
| `/api/llm/chat` | POST | AI SDK streaming endpoint for `/chat` UI |

## Inngest event surface

| Event | Trigger | Handler |
|---|---|---|
| `cron/minute.tick` | every minute | scan users due, fan-out `digest.run` |
| `digest.run` | per user due | compose + deliver |
| `digest.sample_now` | user-triggered | same handler, bypass schedule check |
| `learning.distill` | weekly per user | fold raw log into distilled_prefs |
| `rss.poll.tick` | hourly | refresh all rss feeds |
| `source_cache.gc` | daily | delete expired cache rows |

## Config-agent tool surface (LLM tools)

The configuration agent (GPT-4o-mini) calls these tools during chat:

| Tool | Args | Behavior |
|---|---|---|
| `propose_spec` | full `DigestSpec` | shows preview card to user in UI; not yet persisted |
| `update_spec_field` | path, value | partial update of in-progress draft |
| `ask_user` | question text | passes through; UI renders as agent message |
| `confirm_and_save` | (none) | persists draft as new `digest_specs` version |
| `add_rss_feed` | url, label | validates URL + parseability, appends to draft |

## Composer LLM contract

**System prompt template** (rendered server-side):
```
You are Cadence, a daily market intelligence brief generator.

USER PROFILE
- Tone preset: {{tone_preset}}
- Length target: {{length_target}}
- Language: {{language}}

LEARNED PREFERENCES (stable)
{{distilled_prefs}}

RECENT FEEDBACK (most recent first)
{{last_5_raw_notes}}

DIGEST SPEC
{{spec_yaml}}

SOURCES (already fetched and deduped)
{{sources_bundle}}

INSTRUCTIONS
1. Produce a single Telegram-safe Markdown message ≤ 3800 chars.
2. Lead with a 1-sentence headline.
3. Group by section per the spec's topic order.
4. For prices, include 24h change with arrow and percentage.
5. Cite sources inline as [n] with a "Sources" footer mapping n → URL.
6. Skip sections with zero high-signal items rather than padding.
7. Apply the recent feedback aggressively (drop topics the user said to drop, etc).
```

**Output:** plain Markdown string. No tool calls. Streaming optional.

## Data lifecycle / retention

| Data | Retention |
|---|---|
| `digest_runs.sources_bundle` | 30 days (then null out, keep row) |
| `digest_runs.composed_markdown` | 90 days |
| `chat_messages` | indefinite while user active |
| `learning_log` raw | 180 days then archived |
| `source_cache` | TTL on row |
| `rss_items` | 7 days |
| Deleted users | hard delete within 24h of `deleteAccount` call |

## Migrations strategy

- Drizzle Kit `generate` → commit `.sql` migration files.
- Apply to Supabase via `pnpm db:migrate` (uses service role).
- One migration per logical change; never edit an applied migration.
