import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { getDatabaseUrl } from './env.mjs';

const rarityMap = new Map([
  ['normal', 'N'],
  ['n', 'N'],
  ['rare', 'R'],
  ['r', 'R'],
  ['super rare', 'SR'],
  ['sr', 'SR'],
  ['ss rare', 'SSR'],
  ['ssr', 'SSR'],
  ['ultra rare', 'UR'],
  ['ur', 'UR'],
]);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      row.push(value);
      value = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        i += 1;
      }
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
      continue;
    }

    value += char;
  }

  if (value.length > 0 || row.length > 0) {
    row.push(value);
    rows.push(row);
  }

  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''));
}

function normalizeFlowerName(name) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseQuestPoints(value, rowNumber) {
  const trimmed = value.trim();
  if (trimmed === '') {
    return 0;
  }

  const points = Number(trimmed);
  if (!Number.isInteger(points) || points < 0) {
    throw new Error(`Invalid quest points "${value}" on CSV row ${rowNumber}.`);
  }

  return points;
}

function parseRarity(value, rowNumber) {
  const rarity = rarityMap.get(value.trim().toLowerCase());
  if (!rarity) {
    throw new Error(`Invalid rarity "${value}" on CSV row ${rowNumber}.`);
  }

  return rarity;
}

function getColumnIndex(headers, names) {
  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase());
  for (const name of names) {
    const index = normalizedHeaders.indexOf(name);
    if (index >= 0) {
      return index;
    }
  }

  throw new Error(`Missing required CSV column. Expected one of: ${names.join(', ')}`);
}

const inputPath = resolve(process.cwd(), process.argv[2] ?? 'Initial Flowers.csv');
const text = (await readFile(inputPath, 'utf8')).replace(/^\uFEFF/, '');
const rows = parseCsv(text);
const headers = rows.shift();

if (!headers) {
  throw new Error('CSV file is empty.');
}

const rarityIndex = getColumnIndex(headers, ['rarity']);
const questPointsIndex = getColumnIndex(headers, ['quest points', 'quest_points']);
const nameIndex = getColumnIndex(headers, ['flower names', 'flower name', 'name']);

const flowers = rows.map((cells, index) => {
  const rowNumber = index + 2;
  const name = (cells[nameIndex] ?? '').trim().replace(/\s+/g, ' ');
  if (!name) {
    throw new Error(`Missing flower name on CSV row ${rowNumber}.`);
  }

  const normalizedName = normalizeFlowerName(name);
  if (!normalizedName) {
    throw new Error(`Invalid flower name "${name}" on CSV row ${rowNumber}.`);
  }

  return {
    name,
    normalizedName,
    rarity: parseRarity(cells[rarityIndex] ?? '', rowNumber),
    questPoints: parseQuestPoints(cells[questPointsIndex] ?? '', rowNumber),
  };
});

const duplicate = flowers.find(
  (flower, index) =>
    flowers.findIndex((candidate) => candidate.normalizedName === flower.normalizedName) !== index,
);
if (duplicate) {
  throw new Error(`Duplicate flower name after normalization: ${duplicate.name}`);
}

const sql = postgres(getDatabaseUrl(), { max: 1 });

try {
  let inserted = 0;
  let updated = 0;

  await sql.begin(async (transaction) => {
    for (const flower of flowers) {
      const [result] = await transaction`
        insert into flowers (name, normalized_name, rarity, quest_points)
        values (${flower.name}, ${flower.normalizedName}, ${flower.rarity}, ${flower.questPoints})
        on conflict (normalized_name) do update set
          name = excluded.name,
          rarity = excluded.rarity,
          quest_points = excluded.quest_points
        returning (xmax = 0) as inserted
      `;

      if (result.inserted) {
        inserted += 1;
      } else {
        updated += 1;
      }
    }
  });

  const [count] = await sql`select count(*)::int as flowers from flowers`;
  console.log(
    JSON.stringify(
      {
        source: inputPath,
        rows: flowers.length,
        inserted,
        updated,
        totalFlowers: count.flowers,
      },
      null,
      2,
    ),
  );
} finally {
  await sql.end();
}
