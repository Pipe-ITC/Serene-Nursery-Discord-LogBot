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
