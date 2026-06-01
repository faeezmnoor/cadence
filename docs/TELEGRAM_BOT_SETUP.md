# Telegram bot setup (T-201)

This is a one-time manual step you do in BotFather.

## 1. Create the bot
1. Open Telegram, search `@BotFather`, send `/newbot`
2. Pick a display name (e.g. "Cadence Brief")
3. Pick a unique username (must end in `bot`, e.g. `cadence_brief_bot`)
4. BotFather replies with an HTTP API token. Copy it.

## 2. Configure the bot
In BotFather, with your bot selected:
- `/setdescription` — "Custom market-research digests delivered on your schedule."
- `/setabouttext` — "Cadence — self-learning brief in your language."
- `/setcommands` — paste:
  ```
  start - Link your Cadence account
  status - See your current digest schedule
  pause - Pause deliveries
  resume - Resume deliveries
  ```
- `/setprivacy` — keep **Enabled** (privacy mode on; bot only sees commands / mentions in groups, which is fine because we're DM-only)

## 3. Set local env
Paste into `apps/web/.env.local`:
```
TELEGRAM_BOT_TOKEN=<paste token from BotFather>
BOT_USERNAME=<bot username without @, e.g. cadence_brief_bot>
```

## 4. Register the webhook (after first Vercel deploy)
The webhook URL pattern is:
```
${NEXT_PUBLIC_APP_URL}/api/telegram/webhook?secret=${TELEGRAM_WEBHOOK_SECRET}
```

Curl to register (replace placeholders):
```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://YOUR_APP/api/telegram/webhook?secret=YOUR_SECRET" \
  -d "secret_token=YOUR_SECRET" \
  -d 'allowed_updates=["message"]'
```

To verify:
```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

## 5. Deep link format
The web app generates `/start <token>` deep links like:
```
https://t.me/<BOT_USERNAME>?start=<12-char-token>
```
User clicks → Telegram opens chat → user taps "Start" → Telegram sends `/start <token>` → our webhook resolves the token and links the chat.
