# Dink Support Bot

This bot powers `@DinkSupportBot` as a clean FAQ + live support platform for Dink services.

It is built with ES modules and runs on Node.js 24.

## Required environment variables

- `BOT_TOKEN`: Telegram bot token from BotFather.
- `SUPERADMIN_ID`: Telegram ID for the superadmin. Default is `8773629714`.
- `PLATFORM_URL`: Default `https://dinkcard.et`.
- `SUPPORT_URL`: Default `https://dinkcard.et/contact`.

Optional bootstrap:

- `SUPPORT_ADMIN_IDS`: Comma-separated Telegram IDs to preload support admins on first run.

Example:

```text
BOT_TOKEN=123456:telegram-token
SUPERADMIN_ID=8773629714
SUPPORT_ADMIN_IDS=111111111,222222222,333333333
PLATFORM_URL=https://dinkcard.et
SUPPORT_URL=https://dinkcard.et/contact
```

## What it does

### User side

- Shows a full FAQ menu first.
- Lets the user choose:
  - service
  - issue category
  - contact/login detail
  - issue explanation
- Opens a live support case only after that.
- Keeps the user in a normal chat flow after the case starts.
- Supports:
  - text
  - photos
  - documents
  - videos
  - voice notes
  - audio
  - stickers
  - captions

### Support admin side

- Each admin can handle live cases from the bot.
- Each open case shows:
  - ticket ID
  - user info
  - selected support path
  - contact/login detail
  - assigned admin
  - latest message
- Admin actions:
  - Reply
  - Case details
  - Hold
  - Solved
  - Cancel

### Superadmin side

- Add admin by Telegram ID
- Set or edit admin label
- Remove admin
- View all admins
- See which admin is handling which ticket
- View:
  - open tickets
  - queued tickets
  - solved tickets
  - cancelled tickets
  - closed tickets
  - all tickets
- Reassign tickets manually

## Persistence

The bot stores its data in:

`telegram-support-bot/data/support-state.json`

It saves:

- support admins
- tickets
- queue state
- active assignments
- temporary session flow state

So the bot can continue after restart.

## Discloud deployment

1. Put `index.js`, `package.json`, `discloud.config`, and this README in one project folder.
2. Zip the folder if needed.
3. Upload to Discloud.
4. Set the environment variables in the Discloud dashboard.
5. Start the app.

## Notes

- The superadmin is monitor/control only and does not need to reply directly to users.
- If all support admins are busy, new tickets stay queued automatically.
- When an admin becomes free, the next queued ticket is assigned automatically.
- Previous queued messages and media are replayed to the assigned admin.
