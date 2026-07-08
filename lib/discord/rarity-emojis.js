export const RARITY_EMOJIS = {
  N: '<:N:1524529507942404186>',
  R: '<:R:1524529635256307852>',
  SR: '<:SR:1524529711823454389>',
  SSR: '<:SSR:1524529771227381941>',
  UR: '<:UR:1524529822653612255>',
};

export function rarityEmoji(rarity) {
  return RARITY_EMOJIS[rarity] ?? rarity;
}

export function rarityDisplay(rarity) {
  return rarity ? rarityEmoji(rarity) : 'all rarities';
}
