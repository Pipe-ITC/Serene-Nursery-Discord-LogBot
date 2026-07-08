import { readdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import postgres from 'postgres';
import { getDatabaseUrl } from './env.mjs';

const migrationsDir = resolve(process.cwd(), 'db/migrations');
const sql = postgres(getDatabaseUrl(), { max: 1 });

try {
  await sql`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `;

  const appliedRows = await sql`select version from schema_migrations`;
  const applied = new Set(appliedRows.map((row) => row.version));
  const migrationFiles = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const version = basename(file, '.sql');
    if (applied.has(version)) {
      console.log(`skip ${version}`);
      continue;
    }

    const migrationSql = await readFile(join(migrationsDir, file), 'utf8');
    console.log(`apply ${version}`);
    await sql.unsafe(migrationSql);
  }

  console.log('migrations complete');
} finally {
  await sql.end();
}
