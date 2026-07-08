# Serene Nursery Discord LogBot

Discord bot for logging and searching Cosy Florist flower collections in a private Discord server.

## Postgres Deployment

The Postgres deployment is configured for the Neon project:

- Project name: `Serene Nursery Discord LogBot`
- Project ID: `proud-poetry-28654304`
- Branch ID: `br-broad-meadow-ab00zdy6`
- Database: `neondb`
- Role: `neondb_owner`
- Region: `aws-eu-west-2`

For local development, set `DATABASE_URL` in `.env.local`. The local file is intentionally ignored by Git.

For Vercel deployment, add `DATABASE_URL` as an environment variable for Production, Preview, and Development.

## Discord Interaction Endpoint

Milestone 3 adds a Vercel Function at:

```text
/api/interactions
```

Configure the Discord app interaction endpoint URL to the deployed Vercel URL plus `/api/interactions`.

Required environment variable:

```text
DISCORD_PUBLIC_KEY
```

The endpoint verifies Discord Ed25519 request signatures before handling interactions. It currently supports Discord PING verification and returns safe placeholder responses for future slash commands, autocomplete, components, and modals.

## Discord Command Registration

Milestone 4 adds guild slash command registration for the private Discord server.

Required environment variables:

```text
DISCORD_APPLICATION_ID
DISCORD_BOT_TOKEN
DISCORD_GUILD_ID
```

Register or update commands:

```sh
npm run discord:register
```

The command registration script writes guild commands, so updates should usually appear in Discord immediately.

## Autocomplete

Milestone 5 adds autocomplete for:

- flower options: backed by the Neon `flowers` table
- rarity options: `N`, `R`, `SR`, `SSR`, `UR`

Flower autocomplete returns up to 25 choices and searches by normalized flower name, prioritizing exact and prefix-style matches.

## Database Migrations

Install dependencies:

```sh
npm install
```

Apply pending migrations:

```sh
npm run db:migrate
```

Check the connected database and applied migrations:

```sh
npm run db:status
```

Import or update the initial flower catalogue:

```sh
npm run db:seed:flowers
```

The flower import reads `Initial Flowers.csv`, normalizes the app rarity names to `N`, `R`, `SR`, `SSR`, and `UR`, and upserts records by normalized flower name.

Milestone 1 creates the core database structure:

- `app_users`
- `flowers`
- `flower_logs`
- `flower_pins`
- `admin_approval_requests`
- `schema_migrations`
