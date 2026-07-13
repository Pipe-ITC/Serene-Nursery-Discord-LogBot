export async function markWeeklyDone(sql, discordUserId) {
  await sql`
    insert into weekly_done_users (discord_user_id, done_at)
    values (${discordUserId}, now())
    on conflict (discord_user_id) do update set done_at = excluded.done_at
  `;
}

export async function resetWeeklyDoneUsers(sql) {
  return sql`delete from weekly_done_users`;
}
