import { getSql } from '../db/client.js';
import { rarityEmoji } from '../discord/rarity-emojis.js';

export function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchFlowerChoices(value, limit = 25, choiceValue = 'id') {
  const search = normalizeSearchText(value);
  const sql = getSql();

  const flowers = search
    ? await sql`
        select id, name, rarity, quest_points
        from flowers
        where normalized_name like ${`${search}%`}
           or normalized_name like ${`% ${search}%`}
           or normalized_name like ${`%${search}%`}
        order by
          case
            when normalized_name = ${search} then 0
            when normalized_name like ${`${search}%`} then 1
            when normalized_name like ${`% ${search}%`} then 2
            else 3
          end,
          name
        limit ${limit}
      `
    : await sql`
        select id, name, rarity, quest_points
        from flowers
        order by name
        limit ${limit}
      `;

  return flowers.map((flower) => ({
    name: `${flower.name} (${rarityEmoji(flower.rarity)}, ${flower.quest_points} pts)`.slice(0, 100),
    value: choiceValue === 'name' ? flower.name : flower.id,
  }));
}
