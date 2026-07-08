import postgres from 'postgres';

let sql;

export function getSql() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required.');
  }

  sql ??= postgres(process.env.DATABASE_URL, {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  return sql;
}

export async function closeSql() {
  if (sql) {
    await sql.end();
    sql = undefined;
  }
}
