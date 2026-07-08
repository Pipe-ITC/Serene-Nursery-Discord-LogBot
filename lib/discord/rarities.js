export const rarities = [
  { code: 'N', input: 'Normal', color: 'Green' },
  { code: 'R', input: 'Rare', color: 'Blue' },
  { code: 'SR', input: 'Super Rare', color: 'Purple' },
  { code: 'SSR', input: 'SS Rare', color: 'Gold' },
  { code: 'UR', input: 'Ultra Rare', color: 'Pink' },
];

export function rarityChoices(value = '') {
  const search = String(value).trim().toLowerCase();

  return rarities
    .filter(
      (rarity) =>
        !search ||
        rarity.code.toLowerCase().includes(search) ||
        rarity.input.toLowerCase().includes(search) ||
        rarity.color.toLowerCase().includes(search),
    )
    .map((rarity) => ({
      name: `${rarity.code} - ${rarity.input}`,
      value: rarity.code,
    }));
}
