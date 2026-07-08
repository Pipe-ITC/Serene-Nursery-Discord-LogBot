import postgres from 'postgres';
import { getDatabaseUrl } from './env.mjs';

const sql = postgres(getDatabaseUrl(), { max: 1 });

try {
  const [database] = await sql`
    select current_database() as database_name, current_user as role_name, version() as version
  `;
  const migrations = await sql`
    select version, applied_at
    from schema_migrations
    order by applied_at, version
  `;
  const [counts] = await sql`
    select
      (select count(*)::int from app_users) as users,
      (select count(*)::int from flowers) as flowers,
      (select count(*)::int from flower_logs) as logs,
      (select count(*)::int from flower_pins) as pins
  `;

  console.log(JSON.stringify({ database, migrations, counts }, null, 2));
} finally {
  await sql.end();
}
