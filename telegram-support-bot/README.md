# Dink Support Telegram Bot

This bot is configured for `@DinkDevBot` and can be hosted on Discloud.

## Required environment variables

- `BOT_TOKEN`: Telegram bot token from BotFather.
- `ADMIN_CHAT_ID`: Telegram chat ID where live support requests should be sent.
- `PLATFORM_URL`: Default `https://dinkcard.et`.
- `SUPPORT_URL`: Default `https://dinkcard.et/contact`.

## Discloud setup

1. Put `index.js`, `package.json`, `discloud.config`, and this README in one zip file.
2. Upload the zip to Discloud.
3. Add the required environment variables in the Discloud app dashboard.
4. Start the app.

## Admin reply command

From the admin chat, reply to users with:

```text
/reply USER_TELEGRAM_ID your message here
```

Example:

```text
/reply 123456789 Please send the payment reference shown in your Dink Card dashboard.
```
