<!-- layer: knowledge · status: living · generated: drizzle (apps/web/server/db/schema.ts) @ 8afb459 · verified: 2026-10-06 -->
# Schema

Generated from drizzle (apps/web/server/db/schema.ts). Do not edit by hand: run `bun run scripts/gen-schema.ts <project-root>` and commit the result.

## Entity-relationship diagrams

### Diagram 1 of 3: account_deletions

```mermaid
erDiagram
  account_deletions {
    uuid id PK
    uuid user_id
    text email
    text reason
    timestamp created_at
  }
```

### Diagram 2 of 3: chat_messages, chat_threads, cost_events, digest_runs, digest_specs, feedback_eval_runs, feedback_events, language_interest_events, learning_log, pricing_snapshots, rss_items, telegram_link_tokens

```mermaid
erDiagram
  chat_messages {
    uuid id PK
    uuid thread_id FK
    text role
    jsonb content
    timestamp archived_at
    timestamp created_at
    timestamp updated_at
  }
  chat_threads {
    uuid id PK
    uuid user_id FK
    text purpose
    text status
    jsonb draft_spec
    text template_id
    uuid spec_id FK
    timestamp created_at
    timestamp updated_at
  }
  cost_events {
    uuid id PK
    uuid user_id FK
    uuid digest_run_id FK
    text kind
    text provider
    integer input_tokens
    integer output_tokens
    numeric cost_usd
    timestamp created_at
    timestamp updated_at
  }
  digest_runs {
    uuid id PK
    uuid user_id FK
    uuid spec_id FK
    text status
    date run_date
    timestamp delivery_minute_utc
    date delivery_calendar_day_local
    integer attempt_count
    text last_error
    jsonb sources_bundle
    text composed_markdown
    text short_id
    bigint telegram_message_id
    numeric cost_usd
    text error
    jsonb metadata
    timestamp created_at
    timestamp updated_at
  }
  digest_specs {
    uuid id PK
    uuid user_id FK
    integer version
    jsonb spec
    boolean is_current
    text status
    text name
    jsonb scheduling
    timestamp next_run_at
    timestamp paused_at
    timestamp archived_at
    text created_via
    boolean is_smoke
    boolean keyboard_enabled
    text tier
    text searcher
    text template_id
    timestamp created_at
    timestamp updated_at
  }
  feedback_eval_runs {
    uuid user_id PK, FK
    date window_end_date PK
    integer window_days
    integer briefs_delivered_count
    integer keyboard_taps_count
    numeric engagement_rate
    numeric positive_rate
    integer tune_commands_count
    boolean distilled_prefs_present
    timestamp last_brief_at
    timestamp last_tap_at
    timestamp computed_at
    timestamp created_at
    timestamp updated_at
  }
  feedback_events {
    uuid id PK
    uuid user_id FK
    uuid digest_run_id FK
    text signal_type
    text vote
    text telegram_callback_id
    text source
    timestamp created_at
    timestamp updated_at
  }
  language_interest_events {
    uuid id PK
    uuid user_id FK
    text language_code
    text email
    timestamp created_at
  }
  learning_log {
    uuid id PK
    uuid user_id FK
    text source
    text raw_text
    timestamp distilled_at
    timestamp consumed_at
    timestamp created_at
    timestamp updated_at
  }
  pricing_snapshots {
    uuid id PK
    text pack_id
    integer credits
    integer price_minor_usd
    integer price_minor_myr
    numeric fx_rate_usd_to_myr
    bigint cost_to_us_micro_per_credit
    timestamp active_from
    timestamp active_to
    timestamp created_at
    timestamp updated_at
  }
  rss_items {
    uuid id PK
    uuid spec_id FK
    text feed_url
    text guid
    text title
    text url
    timestamp published_at
    text summary
    timestamp created_at
    timestamp updated_at
  }
  telegram_link_tokens {
    uuid id PK
    uuid user_id FK
    text token UK
    timestamp expires_at
    timestamp consumed_at
    timestamp created_at
    timestamp updated_at
  }
  chat_messages }o--|| chat_threads : "thread_id"
  chat_threads }o--o| digest_specs : "spec_id"
  cost_events }o--o| digest_runs : "digest_run_id"
  digest_runs }o--|| digest_specs : "spec_id"
  feedback_events }o--|| digest_runs : "digest_run_id"
  rss_items }o--|| digest_specs : "spec_id"
```

### Diagram 3 of 3: chat_turn_event, rate_limits, source_cache, spec_extraction_event, transactions, users

```mermaid
erDiagram
  chat_turn_event {
    uuid id PK
    uuid user_id
    uuid thread_id
    integer turn_idx
    text role
    integer char_count
    integer tool_call_count
    boolean saved_spec
    timestamp created_at
  }
  rate_limits {
    uuid user_id PK
    text scope PK
    integer count
    timestamp window_start
    timestamp updated_at
  }
  source_cache {
    uuid id PK
    text connector
    text key
    jsonb payload
    timestamp expires_at
    timestamp created_at
    timestamp updated_at
  }
  spec_extraction_event {
    uuid id PK
    uuid user_id
    uuid thread_id
    integer turn_idx
    jsonb raw_extracted
    jsonb applied_slots
    jsonb proposed_slots
    jsonb dropped_slots
    integer latency_ms
    bigint cost_micro_usd
    text status
    text error
    timestamp created_at
  }
  transactions {
    uuid id PK
    uuid user_id FK
    text type
    integer credits_delta
    integer balance_after
    integer amount_minor
    text currency
    numeric fx_rate_to_usd
    text stripe_session_id
    uuid pricing_snapshot_id FK
    uuid digest_run_id FK
    bigint cost_to_us_micro_usd
    jsonb metadata
    timestamp created_at
    timestamp updated_at
  }
  users {
    uuid id PK
    text email UK
    text timezone
    bigint telegram_chat_id UK
    text telegram_username
    text state
    jsonb distilled_prefs
    integer credits_balance
    bigint cost_to_us_micro_usd
    text country_code
    text auto_topup_pack_id
    integer auto_topup_threshold_credits
    timestamp trial_credits_granted_at
    timestamp last_sample_dry_run_at
    timestamp deleted_at
    timestamp created_at
    timestamp updated_at
  }
  transactions }o--|| users : "user_id"
```

## Tables

### account_deletions

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| user_id | uuid | no | - | - |
| email | text | no | - | - |
| reason | text | yes | - | - |
| created_at | timestamp | no | - | - |

### chat_messages

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| thread_id | uuid | no | FK | chat_threads.id |
| role | text | no | - | - |
| content | jsonb | no | - | - |
| archived_at | timestamp | yes | - | - |
| created_at | timestamp | no | - | - |
| updated_at | timestamp | no | - | - |

### chat_threads

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| user_id | uuid | no | FK | users.id |
| purpose | text | no | - | - |
| status | text | no | - | - |
| draft_spec | jsonb | yes | - | - |
| template_id | text | yes | - | - |
| spec_id | uuid | yes | FK | digest_specs.id |
| created_at | timestamp | no | - | - |
| updated_at | timestamp | no | - | - |

### chat_turn_event

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| user_id | uuid | no | - | - |
| thread_id | uuid | no | - | - |
| turn_idx | integer | no | - | - |
| role | text | no | - | - |
| char_count | integer | no | - | - |
| tool_call_count | integer | no | - | - |
| saved_spec | boolean | no | - | - |
| created_at | timestamp | no | - | - |

### cost_events

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| user_id | uuid | yes | FK | users.id |
| digest_run_id | uuid | yes | FK | digest_runs.id |
| kind | text | no | - | - |
| provider | text | no | - | - |
| input_tokens | integer | yes | - | - |
| output_tokens | integer | yes | - | - |
| cost_usd | numeric | no | - | - |
| created_at | timestamp | no | - | - |
| updated_at | timestamp | no | - | - |

### digest_runs

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| user_id | uuid | no | FK | users.id |
| spec_id | uuid | no | FK | digest_specs.id |
| status | text | no | - | - |
| run_date | date | no | - | - |
| delivery_minute_utc | timestamp | yes | - | - |
| delivery_calendar_day_local | date | yes | - | - |
| attempt_count | integer | no | - | - |
| last_error | text | yes | - | - |
| sources_bundle | jsonb | yes | - | - |
| composed_markdown | text | yes | - | - |
| short_id | text | yes | - | - |
| telegram_message_id | bigint | yes | - | - |
| cost_usd | numeric | yes | - | - |
| error | text | yes | - | - |
| metadata | jsonb | no | - | - |
| created_at | timestamp | no | - | - |
| updated_at | timestamp | no | - | - |

### digest_specs

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| user_id | uuid | no | FK | users.id |
| version | integer | no | - | - |
| spec | jsonb | no | - | - |
| is_current | boolean | yes | - | - |
| status | text | no | - | - |
| name | text | no | - | - |
| scheduling | jsonb | no | - | - |
| next_run_at | timestamp | yes | - | - |
| paused_at | timestamp | yes | - | - |
| archived_at | timestamp | yes | - | - |
| created_via | text | no | - | - |
| is_smoke | boolean | no | - | - |
| keyboard_enabled | boolean | no | - | - |
| tier | text | no | - | - |
| searcher | text | no | - | - |
| template_id | text | yes | - | - |
| created_at | timestamp | no | - | - |
| updated_at | timestamp | no | - | - |

### feedback_eval_runs

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| user_id | uuid | no | PK, FK | users.id |
| window_end_date | date | no | PK | - |
| window_days | integer | no | - | - |
| briefs_delivered_count | integer | no | - | - |
| keyboard_taps_count | integer | no | - | - |
| engagement_rate | numeric | yes | - | - |
| positive_rate | numeric | yes | - | - |
| tune_commands_count | integer | no | - | - |
| distilled_prefs_present | boolean | no | - | - |
| last_brief_at | timestamp | yes | - | - |
| last_tap_at | timestamp | yes | - | - |
| computed_at | timestamp | no | - | - |
| created_at | timestamp | no | - | - |
| updated_at | timestamp | no | - | - |

### feedback_events

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| user_id | uuid | no | FK | users.id |
| digest_run_id | uuid | no | FK | digest_runs.id |
| signal_type | text | yes | - | - |
| vote | text | yes | - | - |
| telegram_callback_id | text | yes | - | - |
| source | text | no | - | - |
| created_at | timestamp | no | - | - |
| updated_at | timestamp | no | - | - |

### language_interest_events

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| user_id | uuid | no | FK | users.id |
| language_code | text | no | - | - |
| email | text | yes | - | - |
| created_at | timestamp | no | - | - |

### learning_log

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| user_id | uuid | no | FK | users.id |
| source | text | no | - | - |
| raw_text | text | no | - | - |
| distilled_at | timestamp | yes | - | - |
| consumed_at | timestamp | yes | - | - |
| created_at | timestamp | no | - | - |
| updated_at | timestamp | no | - | - |

### pricing_snapshots

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| pack_id | text | no | - | - |
| credits | integer | no | - | - |
| price_minor_usd | integer | no | - | - |
| price_minor_myr | integer | no | - | - |
| fx_rate_usd_to_myr | numeric | no | - | - |
| cost_to_us_micro_per_credit | bigint | no | - | - |
| active_from | timestamp | no | - | - |
| active_to | timestamp | yes | - | - |
| created_at | timestamp | no | - | - |
| updated_at | timestamp | no | - | - |

### rate_limits

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| user_id | uuid | no | PK | - |
| scope | text | no | PK | - |
| count | integer | no | - | - |
| window_start | timestamp | no | - | - |
| updated_at | timestamp | no | - | - |

### rss_items

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| spec_id | uuid | no | FK | digest_specs.id |
| feed_url | text | no | - | - |
| guid | text | no | - | - |
| title | text | no | - | - |
| url | text | no | - | - |
| published_at | timestamp | yes | - | - |
| summary | text | yes | - | - |
| created_at | timestamp | no | - | - |
| updated_at | timestamp | no | - | - |

### source_cache

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| connector | text | no | - | - |
| key | text | no | - | - |
| payload | jsonb | no | - | - |
| expires_at | timestamp | no | - | - |
| created_at | timestamp | no | - | - |
| updated_at | timestamp | no | - | - |

### spec_extraction_event

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| user_id | uuid | no | - | - |
| thread_id | uuid | no | - | - |
| turn_idx | integer | no | - | - |
| raw_extracted | jsonb | no | - | - |
| applied_slots | jsonb | no | - | - |
| proposed_slots | jsonb | no | - | - |
| dropped_slots | jsonb | no | - | - |
| latency_ms | integer | yes | - | - |
| cost_micro_usd | bigint | yes | - | - |
| status | text | no | - | - |
| error | text | yes | - | - |
| created_at | timestamp | no | - | - |

### telegram_link_tokens

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| user_id | uuid | no | FK | users.id |
| token | text | no | UNIQUE | - |
| expires_at | timestamp | no | - | - |
| consumed_at | timestamp | yes | - | - |
| created_at | timestamp | no | - | - |
| updated_at | timestamp | no | - | - |

### transactions

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| user_id | uuid | no | FK | users.id |
| type | text | no | - | - |
| credits_delta | integer | no | - | - |
| balance_after | integer | no | - | - |
| amount_minor | integer | yes | - | - |
| currency | text | yes | - | - |
| fx_rate_to_usd | numeric | yes | - | - |
| stripe_session_id | text | yes | - | - |
| pricing_snapshot_id | uuid | yes | FK | pricing_snapshots.id |
| digest_run_id | uuid | yes | FK | digest_runs.id |
| cost_to_us_micro_usd | bigint | yes | - | - |
| metadata | jsonb | no | - | - |
| created_at | timestamp | no | - | - |
| updated_at | timestamp | no | - | - |

### users

| Column | Type | Nullable | Keys | References |
| --- | --- | --- | --- | --- |
| id | uuid | no | PK | - |
| email | text | no | UNIQUE | - |
| timezone | text | no | - | - |
| telegram_chat_id | bigint | yes | UNIQUE | - |
| telegram_username | text | yes | - | - |
| state | text | no | - | - |
| distilled_prefs | jsonb | yes | - | - |
| credits_balance | integer | no | - | - |
| cost_to_us_micro_usd | bigint | no | - | - |
| country_code | text | yes | - | - |
| auto_topup_pack_id | text | yes | - | - |
| auto_topup_threshold_credits | integer | yes | - | - |
| trial_credits_granted_at | timestamp | yes | - | - |
| last_sample_dry_run_at | timestamp | yes | - | - |
| deleted_at | timestamp | yes | - | - |
| created_at | timestamp | no | - | - |
| updated_at | timestamp | no | - | - |

## Policies and roles

none found in schema files
