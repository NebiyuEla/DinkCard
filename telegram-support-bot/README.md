# Dink Support Telegram Bot

This bot is configured for `@DinkSupportBot` and can be hosted on Discloud.

## Required environment variables

- `BOT_TOKEN`: Telegram bot token from BotFather.
- `SUPERADMIN_ID`: Telegram chat ID for the monitoring superadmin. Default is `8773629714`.
- `SUPPORT_ADMIN_IDS`: Comma-separated list of up to 3 Telegram chat IDs for live support admins.
- `PLATFORM_URL`: Default `https://dinkcard.et`.
- `SUPPORT_URL`: Default `https://dinkcard.et/contact`.

Example:

```text
SUPERADMIN_ID=8773629714
SUPPORT_ADMIN_IDS=111111111,222222222,333333333
```

## Discloud setup

1. Put `index.js`, `package.json`, `discloud.config`, and this README in one zip file.
2. Upload the zip to Discloud.
3. Add the required environment variables in the Discloud app dashboard.
4. Start the app.

## How the support flow works

- Users browse FAQ categories first.
- If they still need help, the bot opens a live support ticket.
- The superadmin receives the new ticket first and assigns one of the support admins.
- The assigned support admin can chat live with the user.
- The support admin has `Reply to user`, `Hold`, `Solved`, `Cancel ticket`, and `Stop reply mode` buttons.
- The superadmin keeps receiving ticket updates for monitoring and control.
