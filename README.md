# Discord Ticket Bot

A Discord.js ticket bot with a password-protected dashboard for ticket panels, transcripts, users, and direct-message logs.

## Features

- Build custom ticket panels with buttons and Components V2 layouts.
- Create ticket transcripts and deliver them to ticket openers.
- Manage dashboard users and permissions.
- Log direct messages received by the bot.
- Track staff points and configure review/audit channels.

## Setup

1. Install Node.js 18 or newer.
2. Install dependencies:
   ```sh
   npm install
   ```
3. Create a `.env` file in the project root and set:
   ```dotenv
   DISCORD_TOKEN=your_discord_bot_token
   DASHBOARD_PASSWORD=use-a-unique-password
   ```
   Optional settings include `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SESSION_SECRET`, `DOMAIN_URL`, `GUILD_ID`, `POINTS_ADMIN_ROLE_IDS`, `HOST`, and `PORT`. `GUILD_ID` and `POINTS_ADMIN_ROLE_IDS` accept comma-separated Discord IDs. The dashboard listens on localhost by default.
4. Start the bot and dashboard:
   ```sh
   npm start
   ```

The dashboard creates and updates the local `config.json` file. Configure ticket panels, log channels, and transcript settings from the dashboard. Local configuration and generated data are excluded from version control.

## Staff points

The first configured support staff member or manager to send a message in a ticket automatically claims it. Closing a ticket saves its transcript and DMs the transcript file to the ticket opener. A member with `Manage Server`, `Manage Channels`, or server-owner permissions can approve or reject an award.

The `/points` command shows a staff member's total and promotion progress. Members with `Manage Server` can use `/promotion-msg` to post promotion thresholds. Configure the `POINTS_ADMIN_ROLE_IDS` environment variable with the role IDs allowed to use `/s-points` and `/reset`. Point decisions and manual balance changes are sent to the configured points log channel.

On startup, existing application commands are cleared and registered again in the servers listed in `GUILD_ID`, or globally when `GUILD_ID` is unset.

## Tests

Run the test suite with:

```sh
npm test
```


-# Note That I Used Copilot In The Dashboard + The Commitment.
